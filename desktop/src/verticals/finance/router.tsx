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
      { path: "/sectors/legacy", lazy: async () => ({ Component: (await import("@/pages/Sectors")).Sectors }) },
      { path: "/sectors/legacy/:key", lazy: async () => ({ Component: (await import("@/pages/SectorDetail")).SectorDetail }) },
      { path: "/sectors/:key", lazy: async () => ({ Component: (await import("@/pages/IndustryCenter")).IndustryCenter }) },
      { path: "/portfolio", lazy: async () => ({ Component: (await import("@/pages/Portfolio")).Portfolio }) },
      // 旧版「个股研究」链接保留兼容，但产品里只有一个研究页。
      { path: "/stock-data", element: <Navigate replace to="/research" /> },
      { path: "/debate", element: <Navigate replace to="/" /> },
      { path: "/backtest", element: <Navigate replace to="/" /> },
      { path: "/watchlist", lazy: async () => ({ Component: (await import("@/pages/Watchlist")).Watchlist }) },
      { path: "/research", lazy: async () => ({ Component: (await import("@/pages/CompanyWiki")).CompanyWiki }) },
      { path: "/research/legacy", lazy: async () => ({ Component: (await import("@/pages/Research")).Research }) },
      { path: "/my-reports", lazy: async () => ({ Component: (await import("@/pages/UploadedReports")).UploadedReports }) },
      { path: "/my-reports/read/:id", lazy: async () => ({ Component: (await import("@/pages/ReportReader")).ReportReader }) },
      { path: "/my-reports/legacy", lazy: async () => ({ Component: (await import("@/pages/MyReports")).MyReports }) },
      { path: "/my-research", lazy: async () => ({ Component: (await import("@/pages/MyResearch")).MyResearch }) },
      { path: "/my-research/material", lazy: async () => ({ Component: (await import("@/pages/ResearchMaterial")).ResearchMaterial }) },
      { path: "/my-research/topics/:topicHex", lazy: async () => ({ Component: (await import("@/pages/TopicWorkspace")).TopicWorkspace }) },
      { path: "/notes", element: <Navigate replace to="/my-research?tab=notes" /> },
      { path: "/notes/legacy", lazy: async () => ({ Component: (await import("@/pages/Notes")).Notes }) },
      { path: "/settings", element: <ModelSettings /> },
    ],
  },
]);
