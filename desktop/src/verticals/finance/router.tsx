import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { RouteErrorPage } from "../../core/components/RouteErrorPage";
import { Layout } from "@/components/layout/Layout";
import { Home } from "@/pages/Home";
import { ModelSettings } from "./dsh/NativeDsh";
import { legacyRedirect } from "./lib/routes";

/** 旧地址按 lib/routes.ts 的对照表跳到新入口；认不出的回到对话首页。 */
function LegacyRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={legacyRedirect(pathname, search) ?? "/"} replace />;
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <p role="status" className="p-6 text-sm text-muted-foreground">正在打开研究工作台…</p>,
    children: [
      { path: "/", element: <Home /> },
      { path: "/feed", lazy: async () => ({ Component: (await import("@/pages/Feed")).Feed }) },
      { path: "/tracking", lazy: async () => ({ Component: (await import("@/pages/Tracking")).Tracking }) },
      { path: "/insights", element: <Navigate to="/tracking" replace /> },
      { path: "/insights/topics/:topicHex", lazy: async () => ({ Component: (await import("@/pages/TopicWorkspace")).TopicWorkspace }) },
      { path: "/insights/*", element: <Navigate to="/tracking" replace /> },
      { path: "/watch", lazy: async () => ({ Component: (await import("@/pages/Watch")).Watch }) },
      { path: "/watch/:symbol", lazy: async () => ({ Component: (await import("@/pages/CompanyWiki")).CompanyWiki }) },
      { path: "/chains/:chainId", lazy: async () => ({ Component: (await import("@/pages/ChainPage")).Chain }) },
      { path: "/my-reports", lazy: async () => ({ Component: (await import("@/pages/UploadedReports")).UploadedReports }) },
      { path: "/my-reports/read/:id", lazy: async () => ({ Component: (await import("@/pages/ReportReader")).ReportReader }) },
      { path: "/evidence", lazy: async () => ({ Component: (await import("@/pages/EvidenceDeepLink")).EvidenceDeepLink }) },
      { path: "/settings", element: <ModelSettings /> },
      { path: "/signals", element: <LegacyRedirect /> },
      { path: "/signals/*", element: <LegacyRedirect /> },
      { path: "/sectors", element: <LegacyRedirect /> },
      { path: "/sectors/*", element: <LegacyRedirect /> },
      // 旧入口重定向（N3）。
      { path: "/watchlist", element: <LegacyRedirect /> },
      { path: "/research", element: <LegacyRedirect /> },
      { path: "/daily-review", element: <LegacyRedirect /> },
      { path: "/intel", element: <LegacyRedirect /> },
      { path: "/intel/:tab", element: <LegacyRedirect /> },
      { path: "/my-research", element: <LegacyRedirect /> },
      { path: "/my-research/topics/:topicHex", element: <LegacyRedirect /> },
      { path: "/my-research/*", element: <LegacyRedirect /> },
    ],
  },
]);
