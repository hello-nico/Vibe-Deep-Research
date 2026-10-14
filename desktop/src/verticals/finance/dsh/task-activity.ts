import { useEffect, useState } from 'react';
import { activeTaskKind, loadReportTasks } from '../lib/reportTasks';
import { companyResearchRunning } from '../lib/researchTasks';
import { aShareQualified, symbolFromCompanySlug } from '../lib/research';
import type { ResearchSessions } from './research-session';

/** 某个研究页此刻在做什么：公司研究读任务记录，图文报告读报告任务绑定。 */
export function useSlugTaskActivity(slug: string, sessions: ResearchSessions | null, subscribe = true) {
  const [activity, setActivity] = useState<{ slug: string; kind: 'research' | 'report' | null; ready: boolean }>({ slug: '', kind: null, ready: false });
  useEffect(() => {
    if (!slug || !sessions) return;
    let active = true;
    let sequence = 0;
    const load = () => {
      const mine = ++sequence;
      const code = symbolFromCompanySlug(slug);
      const symbol = code ? aShareQualified(code) : null;
      void Promise.all([loadReportTasks(), symbol ? companyResearchRunning(symbol) : Promise.resolve(false)]).then(([store, researching]) => {
        const kind = researching ? 'research' : activeTaskKind(store, slug, id => sessions.taskRunning(id));
        if (active && mine === sequence) setActivity({ slug, kind, ready: true });
      }).catch(() => {
        if (active && mine === sequence) setActivity({ slug, kind: null, ready: false });
      });
    };
    load();
    const unsubscribe = subscribe ? sessions.subscribeSessionList(load) : () => {};
    const timer = window.setInterval(load, 4000);
    return () => { active = false; unsubscribe(); window.clearInterval(timer); };
  }, [slug, sessions, subscribe]);
  if (!sessions) return { slug, kind: null, ready: true };
  return activity.slug === slug ? activity : { slug, kind: null, ready: false };
}
