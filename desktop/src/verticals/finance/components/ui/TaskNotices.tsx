import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, CircleAlert, FileText, X } from 'lucide-react';
import { ResearchSessionContext } from '../../dsh/research-session';
import {
  dismissNotice, dropTrack, listNotices, listTracks, noticeFromOutcome, pushNotice, resolveTrack,
  subscribeNotices, subscribeTracks, type TaskNotice,
} from '../../lib/taskNotices';
import '../refresh-confirm.css';
import { invalidateObjectStatuses } from '../../lib/objectStatus';
import { invalidatePendingItems } from '../../lib/pendingResearch';

const POLL_MS = 5_000;
const AUTO_MS = 8_000;

function iconFor(variant: TaskNotice['variant']) {
  if (variant === 'report-success') return <FileText aria-hidden="true" size={17} />;
  if (variant === 'refresh-wrote') return <Check aria-hidden="true" size={17} />;
  return <CircleAlert aria-hidden="true" size={17} />;
}

function NoticeCard({ notice }: { notice: TaskNotice }) {
  const navigate = useNavigate();
  const hover = useRef(false);
  const onDismiss = () => dismissNotice(notice.id);
  useEffect(() => {
    if (notice.sticky) return;
    let left = AUTO_MS;
    let last = Date.now();
    const timer = window.setInterval(() => {
      if (hover.current) { last = Date.now(); return; }
      left -= Date.now() - last;
      last = Date.now();
      if (left <= 0) dismissNotice(notice.id);
    }, 200);
    return () => window.clearInterval(timer);
  }, [notice.id, notice.sticky]);
  const warn = notice.variant === 'report-fail' || notice.variant === 'refresh-fail' || notice.variant === 'research-fail' || notice.variant === 'research-invalid';
  const go = () => {
    if (notice.variant === 'report-fail' || notice.variant === 'research-fail') return;
    onDismiss();
    navigate(notice.href);
  };
  return <div
    className="task-notice"
    role={warn ? 'alert' : 'status'}
    aria-live={warn ? undefined : 'polite'}
    onMouseEnter={() => { hover.current = true; }}
    onMouseLeave={() => { hover.current = false; }}
    onClick={go}
  >
    <span className={`task-notice-icon${warn ? ' is-warn' : ''}`}>{iconFor(notice.variant)}</span>
    <div>
      <strong>{notice.title}</strong>
      <p>{notice.detail}</p>
      {(notice.variant === 'report-fail' || notice.variant === 'research-fail') && <button type="button" className="task-notice-link" onClick={event => {
        event.stopPropagation();
        onDismiss();
        navigate('/my-research?tab=tasks');
      }}>查看任务记录</button>}
    </div>
    <button type="button" aria-label="关闭提醒" onClick={event => { event.stopPropagation(); onDismiss(); }}><X size={16} /></button>
  </div>;
}

export function TaskNotices() {
  const sessions = useContext(ResearchSessionContext);
  const location = useLocation();
  const [, setTick] = useState(0);
  useEffect(() => subscribeNotices(() => setTick(value => value + 1)), []);
  useEffect(() => subscribeTracks(() => setTick(value => value + 1)), []);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const href = location.pathname + location.search;
      for (const task of listTracks()) {
        try {
          const outcome = await resolveTrack(task, sessions ? {
            findReportTask: slug => sessions.findReportTask(slug),
            sessionState: id => sessions.sessionState(id),
          } : undefined);
          if (!active) return;
          if (outcome.status === 'running') continue;
          dropTrack(task.id);
          if (task.kind === 'research') { invalidateObjectStatuses([task.object.slug]); invalidatePendingItems(); }
          if (outcome.status === 'unchanged') continue;
          const notice = noticeFromOutcome(task, outcome, href);
          if (notice) pushNotice(notice);
        } catch { /* 下一轮再读 */ }
      }
    };
    const start = () => { if (document.visibilityState === 'visible') void poll(); };
    start();
    const timer = window.setInterval(start, POLL_MS);
    document.addEventListener('visibilitychange', start);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', start); };
  }, [sessions, location.pathname, location.search]);
  const notices = listNotices();
  if (!notices.length) return null;
  return <div className="task-notice-stack">
    {notices.map(notice => <NoticeCard key={notice.id} notice={notice} />)}
  </div>;
}
