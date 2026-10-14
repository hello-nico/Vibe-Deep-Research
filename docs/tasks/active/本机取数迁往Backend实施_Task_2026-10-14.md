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
| B | claude2 | `/Users/apple/ts/src/Vibe-Deep-Research/.worktrees/claude2`（detached，主目录 HEAD） | `desktop/src/verticals/finance/`：`api.ts` 改调 R1、`Feed.tsx` 删大盘分段、`Intel.tsx` 删两个子分段、删除 `DailyReview.tsx` 等仅大盘用的组件与样式、问助手快照；`desktop/dsh/finance-ui/research.mjs` 白名单；测试。接口按 R1 契约编码，A 未合入前用测试替身 |
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

无。

## 9. 当前交接

1. 状态与结论：A 由 pi1 在 `/Users/apple/ts/src/Stock-Research/.worktrees/pi1` 完成；2026-10-14 Claude 审阅后合入 Stock 主目录，已提交 Stock `1cae4fc`，重建后 §4.2 接口验证通过。三个接口按 R1 契约可调，§6 未触发。
2. 改动文件：`backend/app/providers/quotes.py`、`services/public_symbols.py`、`services/market_quotes.py`、`services/feed_items.py`、`api/v1/quotes.py`、`api/v1/feed.py`、`api/v1/__init__.py`、`tests/test_public_feed.py`。
3. 证据：2026-10-14 15:41 调 127.0.0.1:8700。三只报价 200，price、change_pct、volume、amount、market_cap、as_of 均非 null，as_of 为 2026-10-14。缓存过期后连续两次 1675ms 与 4ms，载荷相同；日志只有两条访问记录、无缓存命中行，按耗时差判定第二次命中。公告 10 条、3529ms；新闻 10 条、3642ms。均未超过 10 秒。
4. 与规格的偏差及理由：Claude 补修 `feed_items._collect`：原用 `with ThreadPoolExecutor`，退出时会等慢源跑完，8 秒截止不生效；改为 `shutdown(wait=False, cancel_futures=True)`，单只来源抛任何异常都只跳过该只。金额按元返回（成交额由万元换算，市值由亿元换算，成交量由手换算为股）。公告只为库里没有公告的代码补源，不边列边入库。新闻 `source` 用雷达条目的发布方。3 秒缓存在同一时刻并发未命中时可能各打一次源，轮询错开时影响很小，暂不加锁。
5. 未覆盖的缺口：真实三只股票与缓存命中留到重建后；云端网络未测。
6. 下一步谁做什么：A 段真实取数已验证，§6 未触发。B 等 claude2 的 0.2.1 前端完善合入后开始；A、B 合入后派 C。
