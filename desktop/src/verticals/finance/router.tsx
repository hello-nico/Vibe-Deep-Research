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
      { path: "/insights", lazy: async () => ({ Component: (await import("@/pages/MyResearch")).MyResearch }) },
      { path: "/insights/topics/:topicHex", lazy: async () => ({ Component: (await import("@/pages/TopicWorkspace")).TopicWorkspace }) },
      { path: "/insights/*", element: <Navigate to="/insights" replace /> },
      { path: "/watch", lazy: async () => ({ Component: (await import("@/pages/Watch")).Watch }) },
      { path: "/watch/:symbol", lazy: async () => ({ Component: (await import("@/pages/CompanyWiki")).CompanyWiki }) },
      { path: "/my-reports", lazy: async () => ({ Component: (await import("@/pages/UploadedReports")).UploadedReports }) },
      { path: "/my-reports/read/:id", lazy: async () => ({ Component: (await import("@/pages/ReportReader")).ReportReader }) },
      { path: "/evidence", lazy: async () => ({ Component: (await import("@/pages/EvidenceDeepLink")).EvidenceDeepLink }) },
      { path: "/settings", element: <ModelSettings /> },
      // 行业研究与产业研究从导航撤下，路由保留（个股页行业链接仍可进入）。
      { path: "/signals", lazy: async () => ({ Component: (await import("@/pages/Signals")).Signals }) },
      { path: "/signals/:tab", lazy: async () => ({ Component: (await import("@/pages/Signals")).Signals }) },
      { path: "/sectors", lazy: async () => ({ Component: (await import("@/pages/IndustryCenter")).IndustryCenter }) },
      { path: "/sectors/profiles", lazy: async () => ({ Component: (await import("@/pages/IndustryProfiles")).IndustryProfiles }) },
      { path: "/sectors/profiles/:key", lazy: async () => ({ Component: (await import("@/pages/IndustryProfiles")).IndustryProfiles }) },
      { path: "/sectors/:key", lazy: async () => ({ Component: (await import("@/pages/IndustryCenter")).IndustryCenter }) },
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
