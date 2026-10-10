import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigation } from "react-router-dom";
import { Activity, FileText, Lightbulb, MessagesSquare, Settings, Star } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { ConversationWorkspace } from "./ConversationWorkspace";
import { FinanceAssistantSurface } from './FinanceAssistantSurface';
import { AssistantSlotProvider } from "./assistantSlot";
import { AiPageProvider } from "../../../../core/ai/pageContext";
import { EvidenceProvider } from '../EvidenceCard';
import { FinanceAiDock } from "@/components/ui/FinanceAiDock";
import { useDarkMode } from "@/hooks/useDarkMode";
import { NativeDshHost } from "../../dsh/NativeDsh";
import { TaskNotices } from "../ui/TaskNotices";
import { WikiDrawer } from '../WikiDrawer';
import { loadPendingItems, pendingCount } from '../../lib/pendingResearch';

/** 六个两字入口：按用户与 Agent 的关系收敛（对话 / 动态 / 洞悉 / 关注 / 资料 / 设置）。 */
const NAV = [
  { to: "/", icon: MessagesSquare, label: "对话", match: (p: string) => p === "/" },
  { to: "/feed", icon: Activity, label: "动态", match: (p: string) => p === "/feed" || p.startsWith("/feed/") },
  { to: "/insights", icon: Lightbulb, label: "洞悉", match: (p: string) => p === "/insights" || p.startsWith("/insights/") },
  { to: "/watch", icon: Star, label: "关注", match: (p: string) => p === "/watch" || p.startsWith("/watch/") },
  { to: "/my-reports", icon: FileText, label: "资料", match: (p: string) => p === "/my-reports" || p.startsWith("/my-reports/") },
  { to: "/settings", icon: Settings, label: "设置", match: (p: string) => p === "/settings" },
];

export function Layout() {
  const { pathname } = useLocation();
  const [pendingNavCount, setPendingNavCount] = useState<number>();
  useEffect(() => {
    let active = true;
    const read = () => { if (document.visibilityState === 'visible') void loadPendingItems().then(items => { if (active) setPendingNavCount(pendingCount(items)); }).catch(() => { if (active) setPendingNavCount(undefined); }); };
    read();
    const timer = window.setInterval(read, 30_000);
    document.addEventListener('visibilitychange', read);
    window.addEventListener('finance-pending-changed', read);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', read); window.removeEventListener('finance-pending-changed', read); };
  }, [pathname]);
  const navigation = useNavigation();
  useDarkMode();
  const mainRef = useRef<HTMLElement | null>(null);
  const [assistantHost, setAssistantHost] = useState<HTMLElement | null>(null);

  return (
    <AiPageProvider>
      <EvidenceProvider>
      <AssistantSlotProvider onHost={setAssistantHost}>
      <a className="workspace-skip" href="#workspace-main" onClick={e => {
        e.preventDefault();
        requestAnimationFrame(() => mainRef.current?.focus());
      }}>跳到内容</a>
      <div className="workspace-shell">
        <aside aria-label="产品侧栏" className="workspace-rail">
          <Link to="/" aria-label="Vibe Finance 对话" className="workspace-rail-brand"><BrandMark className="h-7 w-7" /></Link>
          <nav aria-label="工作台导航" className="workspace-rail-nav">
            {NAV.map(({ to, icon: Icon, label, match }) => {
              const active = match(pathname);
              return <Link key={to} to={to} aria-label={label} aria-current={active ? "page" : undefined} className="workspace-nav-link relative">
                <Icon aria-hidden="true" /><span>{label}</span>
                {to === '/insights' && pendingNavCount ? <span className="workspace-nav-badge" aria-label={`${pendingNavCount} 项待处理`}>{pendingNavCount}</span> : null}
              </Link>;
            })}
          </nav>
          <div className="workspace-rail-foot">
            <div id="dsh-status" data-testid="ai-runtime-badge" className="px-1 text-center text-[10px] leading-3 text-[var(--text-3)] empty:hidden" />
            <div id="dsh-settings" aria-label="模型设置座位" className="workspace-dsh-seat" />
          </div>
        </aside>
        <div className="workspace-stage">
          <main ref={mainRef} id="workspace-main" tabIndex={-1} className="workspace-surface relative">
            <div className="workspace-assistant-fallback absolute right-5 top-4 z-10 empty:hidden">
              <FinanceAiDock triggerHost={assistantHost} showTrigger={pathname !== "/" && !pathname.startsWith("/insights/topics/")} renderPanel={(content, close) => <FinanceAssistantSurface close={close}>{content}</FinanceAssistantSurface>} />
            </div>
            <ConversationWorkspace active={pathname === "/"}>
              <div key={pathname} className="workspace-page-enter">
                {navigation.state !== "idle" && <p role="status" className="mb-3 text-sm text-muted-foreground">正在打开页面…</p>}
                <Outlet />
              </div>
            </ConversationWorkspace>
          </main>
        </div>
        <NativeDshHost />
      </div>
      <TaskNotices />
      <WikiDrawer />
      </AssistantSlotProvider>
      </EvidenceProvider>
    </AiPageProvider>
  );
}
