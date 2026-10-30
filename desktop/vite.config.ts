import { fileURLToPath } from "node:url";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { dshDevelopment, readTrustedRemote } from "./dsh-dev";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const dsh = dshDevelopment(repoRoot);
// 上游 #34：仅用户显式开启时监听所有网卡；这不是多用户登录或公网部署方案。
const lan = process.env.VRA_LAN === "1";
// 经 tailscale serve 从手机访问：只放行配置里那一个 ts.net 主机名，见 dsh-dev.ts readTrustedRemote。
const remote = readTrustedRemote(path.resolve(here, ".."));

export default defineConfig({
  define: { "process.versions.node": '"0.0.0"', "process.execArgv": "[]", "process.env.CORDIS_SHARED": "undefined" },
  plugins: [dsh.plugin, react(), {
    name: "vra-lan-origin-guard",
    configureServer(server) {
      if (!lan) return;
      // 在转到 DSH 之前拒绝跨站浏览器请求。
      // 不能无条件改 Origin：非安全 HTTP 上浏览器可能不发送 Sec-Fetch-Site。
      server.middlewares.use((req, res, next) => {
        const origin = req.headers.origin;
        const site = req.headers["sec-fetch-site"];
        const sameOrigin = `${server.config.server.https ? "https" : "http"}://${req.headers.host}`;
        if ((origin !== undefined && origin !== sameOrigin)
          || (site !== undefined && site !== "same-origin" && site !== "none")) {
          res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "forbidden_origin", message: "请从工作台自身页面发起请求。" }));
          return;
        }
        next();
      });
    },
  }],
  // 🔴 `@` 指向**垂类包**而不是 src:上游 UI 里写的是 `@/components`、`@/lib`、`@/data`,
  //    我们把它整套放进 verticals/finance/,别名这么指,上游代码一行都不用改。
  resolve: { alias: [
    { find: "@", replacement: path.resolve(here, "src/verticals/finance") },
  ], dedupe: ["react", "react-dom"] },
  optimizeDeps: { noDiscovery: true, include: [] },
  build: { outDir: "dsh/finance-ui/lib" },
  preview: { host: "127.0.0.1", port: 5930, strictPort: true },
  server: {
    // 🔴 必须写死 IPv4:默认 localhost 在本机解析成 [::1],而后端绑的是 127.0.0.1,对不上会 502
    host: lan ? "0.0.0.0" : "127.0.0.1",
    port: 5930,
    // 启动器和 README 都只打开 5930；被占用时必须明确失败，不能静默漂到 5931 让用户看到旧页面。
    strictPort: true,
    ...(remote ? { allowedHosts: [new URL(remote.origin).hostname] } : {}),
  },
});
