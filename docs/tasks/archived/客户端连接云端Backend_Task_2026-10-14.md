# 客户端连接云端 Backend

状态：2026-10-14 Claude 写定（todo §1.5 内测首发第 4 步）。执行方在 worktree 中实施，不提交、不重建、不运行 `scripts/start`，不读 `.env` 与密钥。
实施仓库：Vibe（`desktop/dsh/finance-ui/`）与 Stock（`dsh/src/`）。Backend 侧令牌校验由 [Backend 按用户隔离](Backend按用户隔离_Task_2026-10-14.md) R1 完成（请求头 `Authorization: Bearer <token>`）。

## 1. 目标

本机所有发往 Backend 的请求从同一处读取「Backend 地址 + 访问令牌」，自动带上令牌与客户端版本；令牌只在宿主进程里，页面拿不到。设置页可以填写、测试、清除。没有填写时沿用现在的本机地址，行为不变。

## 2. 现状（Claude 核实）

- 页面经宿主代理访问 Backend：`desktop/src/verticals/finance/lib/research.ts` `researchRead` → `/finance-research` → `desktop/dsh/finance-ui/research.mjs:105` 前缀路由转发。
- 宿主侧各自读 `STOCK_RESEARCH_BACKEND_URL`：`finance-ui/research.mjs:53`、`maintenance.mjs:7`、`host-state.mjs:951`；Stock 插件 `dsh/src/backend.ts:11`；启动时由 `orchestrator/src/dsh_paths.ts:33,59` 注入环境变量。
- 都不带令牌，也不带客户端版本。

## 3. 冻结决定

R1 **唯一配置源**：`DSH_HOME/research/backend-connection.json`（权限 0600）：`{"url": "...", "token": "..."}`。读取优先级：该文件 > 环境变量 `STOCK_RESEARCH_BACKEND_URL`（开发用）> 默认 `http://127.0.0.1:8700/api/v1`。令牌只来自该文件。两个插件共用同一个读取函数的同一种规则（各自实现，规则与测试一致；不跨仓 import）。
R2 **请求头**：有令牌时加 `Authorization: Bearer <token>`；所有请求加 `X-Vibe-Client-Version: <产品版本>`（取 Vibe `orchestrator/src/version.ts` 的产品版本，经宿主环境传给两个插件）。日志与错误信息里令牌一律打码。
R3 **宿主接口**（`finance-ui` 注册）：
  - `GET /finance-backend-connection` → `{url, has_token, status}`，不返回令牌。
  - `PUT /finance-backend-connection` body `{url, token?}`：校验 URL 为 http/https 绝对地址；`token` 缺省表示保留原令牌，空字符串表示清除；写文件后立即生效（各调用方每次请求读取，或配置变化时刷新缓存）。
  - `POST /finance-backend-connection/test` → 用当前配置调用 Backend `GET /health` 与一个需要身份的只读接口，返回 `ok` / `unreachable` / `unauthorized` 三种之一。
R4 **失败语义**：401 时页面显示「Backend 拒绝了访问令牌，请在设置里检查」；不可达时沿用现有「研究暂不可用」。任何调用方都不得在失败时悄悄回落到另一个地址。
R5 不做：设置页界面（交给 claude2，接口按 R3）；Backend 侧版本拦截（另立）；Desktop 打包。

## 4. 范围

单线，pi1，在 `/Users/apple/ts/src/Stock-Research/.worktrees/pi1` 与新建的 `/Users/apple/ts/src/Vibe-Deep-Research/.worktrees/pi1`（均 detached，基于各自主目录 HEAD）：
- Vibe：`desktop/dsh/finance-ui/research.mjs`、`maintenance.mjs`、`host-state.mjs` 中的地址读取改为共用函数；新增连接配置模块与 R3 路由；`orchestrator/src/dsh_paths.ts` 传入产品版本；测试。
- Stock：`dsh/src/backend.ts` 与请求封装；测试。

测试至少覆盖：三级优先级；令牌头与版本头；PUT 保留 / 清除令牌；GET 不泄露令牌；401 文案；无配置时行为与现在一致。

## 5. 验收

1. 门禁：Vibe `cd desktop && npx tsc --noEmit && npm test`；Stock `cd dsh && pnpm test`；两仓 `git diff --check`。
2. Claude 审阅后合入主目录；用户重建后在设置页（claude2 完成后）填本机地址与测试令牌，测试连接三种结果各验一次。

## 6. Out of Scope

R5 所列；令牌发放流程。

## 7. Stop Conditions

- Stock 插件拿不到 `DSH_HOME` 或产品版本 → 停下报告。
- 需要改 R1–R3 → 停下报告。

## 8. 回滚

删除连接配置模块与路由，还原地址读取；删除 `backend-connection.json` 即回到环境变量与默认地址。

## 9. 当前交接

1. 状态与结论：已在 worktree 实施，未提交、未重建。Vibe `/Users/apple/ts/src/Vibe-Deep-Research/.worktrees/pi1`（detached `c9366766`），Stock `/Users/apple/ts/src/Stock-Research/.worktrees/pi1`（detached `80f5771`）。连接文件优先于环境变量，令牌只来自文件，请求带版本头。
2. 改动文件：Vibe `desktop/dsh/finance-ui/backend-connection.mjs`（新）、`research.mjs`、`maintenance.mjs`、`host-state.mjs`、`server.mjs`、`orchestrator/src/dsh_paths.ts`、`desktop/src/verticals/finance/lib/researchSymbol.ts`、`companyPage.ts`、
   `pages/CompanyPage.tsx`、`desktop/test/backend_connection.test.ts`（新）、`access_lifecycle.test.ts`、`company_page.test.ts`。Stock `dsh/src/backend.ts`、`dsh/src/research-backend.mjs`、`dsh/test/backend-connection.test.mjs`（新）、
   `dsh/test/research-host.test.mjs`。
3. 证据：Vibe `tsc --noEmit` 通过，`npm test` 447 passed、0 failed。Stock `pnpm test` 316 passed、0 failed。两仓 `git diff --check` 无输出。未运行 `scripts/start`。
4. 与规格的偏差及理由：GET 的 `status` 规格未给枚举，返回地址来源 `file` / `environment` / `default`。身份探测用只读 `GET /notes`。空白令牌按清除处理。缺 `VIBE_CLIENT_VERSION` 时版本头写 `unknown`，不省略。损坏的连接文件不回落到环境变量。
   - Claude 合入补修：地址留空表示用本机（删除已存连接）；连接接口加入开发代理前缀；提示里「Backend」改为「服务器」。与 claude2 的设置页联调契约对齐（测试接口返回 `{status}`）。合入后 Vibe 450 passed、Stock 316 passed。
5. 未覆盖的缺口：设置页界面、Backend 版本拦截另立。未做真实连接三种结果。
6. 下一步谁做什么：Claude 审阅后合入主目录；claude2 做设置页；用户重建后验测试连接。
