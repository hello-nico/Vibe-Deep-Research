# 本机取数迁往 Backend 实施

状态：2026-10-14 Claude 写定。依据：清点 `.local/local-fetch-migration/summary.md`（pi1）与用户决定「内测只保留原型用到的取数，动态页大盘分段拿掉」。执行方在 worktree 中实施，不提交、不重建、不运行 `scripts/start`，不读 `.env` 与密钥。

## 1. 目标

本机不再运行任何 Python 取数。产品需要的三类数据改由 Backend 提供：A 股实时报价、关注公司公告、关注公司新闻。原型没有的取数一律停调，对应页面分段删除。

## 2. 冻结决定

R1 **保留的三类能力**，接口按能力命名，不出现数据源名；数据源由 Backend provider 决定，可替换。
  - `GET /api/v1/market/quotes?symbols=600519.SH,000001.SZ`（最多 100 只）→ `{quotes: [{symbol, name, price, change, change_pct, open, high, low, prev_close, limit_up, limit_down, volume, amount, market_cap, as_of}], missing: [symbol]}`。字段取不到给 `null`，不编造。Backend 侧按代码做 3 秒共享缓存，多个用户同时轮询只打一次源。
  - `GET /api/v1/feed/announcements?symbols=...&limit=20` → `{items: [{symbol, title, published_at, url, document_id}]}`，按时间倒序。已入库的公告带 `document_id`，未入库的为 `null`；是否边列边入库由 Backend 决定，不阻塞返回。
  - `GET /api/v1/feed/news?symbols=...&limit=20` → `{items: [{symbol, title, source, published_at, url}]}`。复用雷达已有的公司新闻 provider，不另起一套。
  - 三个接口都是公共数据，不按用户隔离，但仍校验访问令牌（与其他接口一致）。失败时整体返回明确错误；部分代码失败放进 `missing` 或省略，不让整页失败。
R2 **停调并删除**，不保留开关，不做兼容：
  - 动态页「大盘」分段整块：宽基与全球指数、交易日历、涨停与情绪、三个涨停池、板块资金流、成交额榜、行业涨跌家数、龙虎榜、题材归因。
  - 「投资资讯」（RSS）与「事件概率」两个子分段。
  - 清点里 39 个无人调用的端点；`signals` 页面查询。
  - 问助手快照同步去掉这些字段。
R3 **前端调用路径**：页面经宿主研究代理 `/finance-research` 访问 R1 接口（自动带服务器地址与令牌）；`research.mjs` 的转发白名单加入这三个路径。自选页轮询间隔保持 3 秒，交易时段外不轮询。
R4 **删除本机取数链**：
  - `/finance-api/fetch` 路由；`orchestrator` 里的端点执行（`fetchEndpoint`、`runFetchProcess`）与登记表 `datasources/`。
  - `.agents/skills/data-access/scripts/` 及其 Python 依赖；`scripts/setup` 中对应的 Python 安装步骤。
  - `doctor.ts` 的网络探针改为测 Backend 连接（复用 `/finance-backend-connection/test`）。
  - 本机数据服务里与取数无关的部分（Client 选择、页面查询中仍在用的部分）保留。
R5 不做：大盘分段的新设计；云端网络实测（用户部署后自测，国内数据源要求服务器在国内或可访问国内接口）。

## 3. 范围与顺序

三段。A 现在开始；B 与 claude2 正在做的 0.2.1 前端完善改同一批文件（`Intel.tsx`、问助手快照），等那份合入主目录后再开始；C 等 A、B 合入后再做：

| 段 | 执行方 | worktree | 内容 |
|---|---|---|---|
| A | pi1 | `/Users/apple/ts/src/Stock-Research/.worktrees/pi1`（detached，主目录 HEAD） | Backend R1 三个接口、provider 接线、缓存、测试 |
| B | cursor | Vibe 主目录（2026-10-15 改：对着用户热更新工作台 5930 验证；0.2.1 已提交 7d21c313） | `desktop/src/verticals/finance/`：`api.ts` 改调 R1、`Feed.tsx` 删大盘分段、`Intel.tsx` 删两个子分段、删除 `DailyReview.tsx` 等仅大盘用的组件与样式、问助手快照；`desktop/dsh/finance-ui/research.mjs` 白名单；测试。接口按 R1 契约编码，A 未合入前用测试替身 |
| C | pi1 | Vibe worktree（A、B 合入后基于新 HEAD） | R4 删除与 doctor 改造；`verify-docs`、`verify-invariants`、README 与契约中对取数链的描述同步改写 |

## 4. 验收

1. 门禁：A：`cd backend && uv run pytest`（按约定剔除）、`uvx ruff check` 新改文件。B、C：`cd desktop && npx tsc --noEmit && npm test`、`node scripts/verify-docs.mjs`、`node scripts/verify-invariants.mjs`。各自 `git diff --check`。
2. A 合入、用户重建 Backend 后，执行方只调接口验证：茅台、宁德时代、神火三只的报价字段齐全且 `as_of` 为当天；公告、新闻各返回非空列表；连续两次报价请求间隔小于 3 秒时第二次命中缓存。
3. C 完成后：`rg -n "runFetchProcess|registry.json|python3?\b" orchestrator desktop scripts` 只剩与取数无关的命中；用户重启后在浏览器验收自选报价跳动、个股页现价、动态页资讯与公告。

## 5. Out of Scope

R5 所列。

## 6. Stop Conditions

- A：报价源无法在 3 秒缓存下稳定返回，或公告列表只能靠逐只同步抓取导致单次请求超过 10 秒 → 停下报告。
- B：发现原型范围内的页面还依赖 R2 要删的数据 → 停下报告。
- C：`.agents/skills/data-access` 被模型面技能或研究插件引用 → 列出引用停下报告。

## 7. 回滚

各段还原对应文件；Backend 接口为新增，删除即回滚。C 段删除前本机取数链在主目录 Git 历史中可恢复。

## 8. 补充

- 2026-10-15 Claude 决定（§6 B 触发项）：自选页 PE 列保留，R1 报价新增可空字段 `pe_ttm`（只新增，`API_VERSION` 不变）。报价源给不出时返回 null，前端显示缺口；源完全没有该数时由 pi2 停下报告，再改为删列。
- 2026-10-15 已实现：pi1 接腾讯行情第 39 字段（PE TTM）为 `pe_ttm`，合入 Stock 主目录（`providers/quotes.py`、`tests/test_public_feed.py`，25 通过）；Claude 在 Vibe `lib/api.ts` 映射该字段并改 `quote_snapshot` 测试。

## 9. 当前交接

1. 状态与结论：C 段在 detached worktree `.worktrees/pi1-c`（基线 ceaec9c4）完成，未提交、未重启。§6 C 未触发：模型面技能与研究插件无 data-access 引用。已删 `/fetch`、取数执行、datasources、data-access/scripts 与 setup 的 Python 安装；doctor `--net` 复用 Backend `testConnection`。Client 选择保留。
2. 改动文件：删 `datasources/`、data-access 技能、registry/page_queries/session 及对应测试、`scripts/{gen_catalog,health}.py`。改 service/api/doctor/plugin/productConfig、setup、CI、README 与契约。未改 runtime 与 `dsh_paths.ts`。
3. 证据：动手前 rg 无研究插件引用。desktop `tsc --noEmit` 通过；`npm test` 471 过、1 失败（`#34 LAN 默认为关`，与本段无关）。`verify-docs`、`verify-invariants`、`git diff --check` 通过。`rg runFetchProcess|registry.json` 在 orchestrator/desktop/scripts 无命中；`python3?` 仅剩配置字段与无关测试。
4. 与规格的偏差及理由：前端已不再调页面查询，故连同只服务取数的 `review`/`signals` 与 `/page`、`/endpoints` 一并删除。data-access 整目录删除（脚本去掉后 SKILL 无落点）。doctor 直接 import `testConnection`，不 HTTP 打工作台。productConfig 仍留 python 字段以免牵动 init 契约。
5. 未覆盖的缺口：用户浏览器验收自选报价、个股现价、动态资讯与公告。orchestrator `ui_adapter.test.ts` 仍按 B 已删的 localService 取数辅助断言，非本段引入。Checklist「取数迁往 Backend」待实施条未改。
6. 下一步谁做什么：Claude 审 worktree 后合入；用户重启工作台做 §4 第 3 项浏览器验收。pi1 停下，不提交。
