# 客户端与 Backend 版本校验

状态：2026-10-14 Claude 写定，用户同意（todo §1.5 架构边界「客户端版本与 Backend 接口版本可校验，不兼容时提示更新」）。待 pi3 实施；执行方只跑自动检查，不提交、不 push、不重建、不重启，不读 `.env` 与密钥。
实施仓库：Stock-Research（`backend/`）与 Vibe-Deep-Research（`desktop/`）。

## 1. 目标

内测用户的安装包和云端 Backend 会各自升级。两边接口对不上时，用户看到一句明确的提示（「请更新客户端」或「服务器版本过旧」），而不是页面各处零散报错或静默空白。

## 2. 现状（Claude 核实）

- Backend `GET /api/v1/health`（`backend/app/api/v1/health.py`）返回 `{ok, service, version, store_mode, revision_pinned_read}`；`version` 是 `app/__init__.py` 的 `__version__ = "0.1.0"`，从未随接口变化维护，不能用来判断兼容。
- 客户端所有 Backend 调用经宿主：`desktop/dsh/finance-ui/backend-connection.mjs`（`resolveBackend`、`backendHeaders`、`testConnection` 先探 `/health` 再探身份接口，返回 `ok | unreachable | unauthorized`）与 `research.mjs` 的 `/finance-research` 代理（401 时改写为 `TOKEN_REJECTED` 一句话）。
- 设置 →「连接」：`desktop/src/verticals/finance/components/ConnectionPanel.tsx` 的 `OUTCOME_TEXT` 把上面三种结果映射为中文。
- 页面里 401 的中文提示：`lib/researchSymbol.ts:22`、`lib/companyPage.ts:163`。
- 公司研究由宿主任务启动（`/finance-research-tasks`，见 `lib/companyPageServices.ts:58` 与 `dsh/finance-ui/host-state.mjs`）；Stock 研究插件经自己的 `dsh/src/backend.js` 直连 Backend。

## 3. 冻结决定

R1 **Backend 声明接口版本**：`app/__init__.py` 增加 `API_VERSION = 1`、`MIN_CLIENT_API = 1`；`/health` 增加字段 `api: {version, min_client}`，其余字段不变。
  规则写进代码注释与契约：删除或改变客户端在用的接口或字段时 `API_VERSION` 加一（只新增不算）；服务器不再支持旧客户端时提高 `MIN_CLIENT_API`。
R2 **客户端声明并判断**：`backend-connection.mjs` 增加 `CLIENT_API = 1`、`MIN_SERVER_API = 1` 与纯函数 `compatibility(health)` → `ok | server_outdated | client_outdated`。`health.api` 缺失视为版本 0，即 `server_outdated`；`api.version < MIN_SERVER_API` → `server_outdated`；`CLIENT_API < api.min_client` → `client_outdated`。
R3 **连接测试**：`testConnection` 在 `/health` 可达且令牌通过后再判断兼容，结果增加 `server_outdated`、`client_outdated`；`ConnectionPanel` 文案分别为「服务器版本过旧，请联系管理员更新」「客户端需要更新，请安装新版本」。
R4 **页面请求与研究启动**：宿主按当前连接地址缓存兼容结果 10 分钟，连接保存时清空。
  不兼容时 `/finance-research` 代理不转发，返回 426 与 R3 的同一句话；宿主启动公司研究前同样检查，不兼容时不启动并返回同一句。
  `researchSymbol.ts`、`companyPage.ts` 对 426 像 401 一样显示服务端给的那句话。
R5 不做：全局横幅（需要在 `dsh/client.tsx` 注册，等 cursor 的 0.2.1 前端完善合入后另做）、触发自动更新；
  Stock 研究插件自己的检查（插件只在宿主启动的研究里运行，宿主已先行检查）、`__version__` 的含义调整。

## 4. 范围

单线，pi3，两个 worktree：
- Stock：`/Users/apple/ts/src/Stock-Research/.worktrees/pi3`，先 `git checkout -f --detach 1cae4fc`（现有改动均已在主目录提交，可丢弃）。改 `backend/app/__init__.py`、`backend/app/api/v1/health.py`、对应测试。
- Vibe：`git -C /Users/apple/ts/src/Vibe-Deep-Research worktree add --detach .worktrees/pi3 fe4ea3ec`，在 worktree 的 `desktop` 里自己 `npm ci`。
  改 `desktop/dsh/finance-ui/backend-connection.mjs`、`research.mjs`、宿主研究启动处、`components/ConnectionPanel.tsx`（只改 `OUTCOME_TEXT` 与结果类型）、`lib/researchSymbol.ts`、`lib/companyPage.ts`（只改错误文案分支）、测试；
  `docs/contracts/system-ownership.md` 补一段「接口版本」。

并行：cursor 在 `.worktrees/claude2` 改设置弹窗（可能移动 `ConnectionPanel`）。`ConnectionPanel.tsx` 只做最小改动，冲突由 Claude 合并。

## 5. 验收

1. 门禁：Stock `cd backend && uv run pytest`（按约定剔除）、`uvx ruff check` 新改文件；Vibe `cd desktop && npx tsc --noEmit && npm test`、`node scripts/verify-docs.mjs`、`node scripts/verify-invariants.mjs`；两边 `git diff --check`。证据等级：契约测试。
2. 新增测试要点：`compatibility` 的四种输入（缺 `api`、服务器过旧、客户端过旧、兼容）；`testConnection` 返回新结果；代理在不兼容时返回 426 且不转发；缓存在连接保存后失效；`/health` 含 `api` 字段。
3. 用户验收（由用户重建与重启后执行）：设置 →「连接」→「测试连接」显示「已连接」；把客户端 `MIN_SERVER_API` 临时改成 2 再测，显示「服务器版本过旧」（此步可由 Claude 在审阅时用测试替身代做）。

## 6. Out of Scope

R5 所列。

## 7. Stop Conditions

- 宿主研究启动有多个入口、无法在一处检查 → 列出入口停下。
- 需要改 Stock 研究插件或 DSH 补丁 → 停下报告。

## 8. 回滚

还原两仓对应文件；`/health` 新增字段对旧客户端无影响。

## 9. 当前交接

1. 状态与结论：2026-10-14 pi3 已在两个 worktree 实施接口版本校验；Claude 审阅后合入两仓主目录（提示文案收为 `researchSymbol.ts` 两个常量），未提交。§7 未触发：公司研究启动与中断续跑都走同一兼容检查。
2. 改动文件：Stock 的 `__init__.py`、`health.py`、`test_api.py`。Vibe 的 `backend-connection.mjs`、`research.mjs`、`host-state.mjs`、`ConnectionPanel.tsx`、`researchSymbol.ts`、`companyPage.ts`、相关测试和 `system-ownership.md`。
3. 证据：Stock `test_health` 通过，`/health` 含 `api.version=1`、`min_client=1`。全量 pytest 1334 passed，另有 6 failed / 2 errors，是对正在运行的测试库死锁或外键冲突，与本次字段无关。Vibe `tsc`、`verify-docs`、`verify-invariants`、`git diff --check` 通过。`npm test` 467 pass；失败是 5173 端口占用和后台评审超时，不是版本断言。
4. 与规格的偏差及理由：`ConnectionPanel` 的结果识别函数也放行了两个新状态，否则新文案不会显示。研究任务测试把 `/health` 打桩成兼容，避免打到尚未重建的本机 Backend。中断续跑同样不启动不兼容的研究，但不向页面返回那句话。
5. 未覆盖的缺口：全局横幅另做。用户重建后的「测试连接」真机验收未做。
6. 下一步谁做什么：Claude 审阅两仓 worktree 后合入。用户重建并重启后，在设置里测连接，并把 `MIN_SERVER_API` 临时改成 2 看过旧提示。
