import { useEffect, useState } from 'react';
import { activeTaskKind, latestResearch, loadReportTasks, type LatestResearch } from '../lib/reportTasks';
import type { ResearchSessions } from './research-session';

export function useSlugTaskActivity(slug: string, sessions: ResearchSessions | null, subscribe = true) {
  const [activity, setActivity] = useState<{ slug: string; kind: 'research' | 'report' | null; ready: boolean; research?: LatestResearch | null }>({ slug: '', kind: null, ready: false });
  useEffect(() => {
    if (!slug || !sessions) return;
    let active = true;
    let sequence = 0;
    const load = () => {
      const mine = ++sequence;
      void loadReportTasks().then(store => {
        const running = (id: string) => sessions.taskRunning(id);
        if (active && mine === sequence) setActivity({ slug, kind: activeTaskKind(store, slug, running), ready: true, research: latestResearch(store, slug, running) });
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
