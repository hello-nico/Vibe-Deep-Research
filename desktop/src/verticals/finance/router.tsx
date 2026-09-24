import { createBrowserRouter, Navigate } from "react-router-dom";
import { RouteErrorPage } from "../../core/components/RouteErrorPage";
import { Layout } from "@/components/layout/Layout";
import { Home } from "@/pages/Home";
import { ModelSettings } from "./dsh/NativeDsh";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <p role="status" className="p-6 text-sm text-muted-foreground">正在打开研究工作台…</p>,
    children: [
      { path: "/", element: <Home /> },
      { path: "/daily-review", lazy: async () => ({ Component: (await import("@/pages/DailyReview")).DailyReview }) },
      { path: "/intel", lazy: async () => ({ Component: (await import("@/pages/Intel")).Intel }) },
      { path: "/intel/:tab", lazy: async () => ({ Component: (await import("@/pages/Intel")).Intel }) },
      { path: "/signals", lazy: async () => ({ Component: (await import("@/pages/Signals")).Signals }) },
      { path: "/signals/:tab", lazy: async () => ({ Component: (await import("@/pages/Signals")).Signals }) },
      { path: "/sectors", lazy: async () => ({ Component: (await import("@/pages/IndustryCenter")).IndustryCenter }) },
      { path: "/sectors/profiles", lazy: async () => ({ Component: (await import("@/pages/IndustryProfiles")).IndustryProfiles }) },
      { path: "/sectors/profiles/:key", lazy: async () => ({ Component: (await import("@/pages/IndustryProfiles")).IndustryProfiles }) },
      { path: "/sectors/:key", lazy: async () => ({ Component: (await import("@/pages/IndustryCenter")).IndustryCenter }) },
      { path: "/watchlist", lazy: async () => ({ Component: (await import("@/pages/Watchlist")).Watchlist }) },
      { path: "/research", lazy: async () => ({ Component: (await import("@/pages/CompanyWiki")).CompanyWiki }) },
      { path: "/my-reports", lazy: async () => ({ Component: (await import("@/pages/UploadedReports")).UploadedReports }) },
      { path: "/my-reports/read/:id", lazy: async () => ({ Component: (await import("@/pages/ReportReader")).ReportReader }) },
      { path: "/evidence", lazy: async () => ({ Component: (await import("@/pages/EvidenceDeepLink")).EvidenceDeepLink }) },
      { path: "/my-research", lazy: async () => ({ Component: (await import("@/pages/MyResearch")).MyResearch }) },
      { path: "/my-research/topics/:topicHex", lazy: async () => ({ Component: (await import("@/pages/TopicWorkspace")).TopicWorkspace }) },
      { path: "/my-research/*", element: <Navigate to="/my-research" replace /> },
      { path: "/settings", element: <ModelSettings /> },
    ],
  },
]);
