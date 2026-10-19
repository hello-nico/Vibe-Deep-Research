# DeepSeek 检索接入 Backend

状态：2026-10-19 Claude 写定。用户确认「DeepSeek 默认、Exa 补充，不再补测」（Stock `docs/human-checklist.md`「外部检索」）。依据：[检索对比](../../evals/DeepSeek检索对比_2026-10-19/README.md)。执行方在 worktree 中实施，不提交、不重建、不重启，不读 `.env` 与密钥。

## 1. 目标

Backend `search_external` 新增 `deepseek.web` provider 并设为默认；DeepSeek 失败、空结果或低匹配时由 Exa 接替。模型工具、Topic 卡片语义与网页读取不变。

## 2. 现状（Claude 核实）

- `backend/app/services/external_search.py`：`search_external()` 按 `_runtime_provider()` 选一个 provider，先 `cache.consume_budget(provider)` 再调 `_exa_search` / `_tavily_search` / `_eastmoney_news`；
  每条结果规范成 `{title, publisher, published_at, url, snippet}` 写入卡片缓存（`snapshot_hash` 覆盖这 5 个字段）；`_http_url_allowed()` 过滤主机。纯公司新闻问句（代码 + 新闻类词）在 `exa.web`/`tavily.web`/`auto` 下改走 `eastmoney.news`。
- `backend/app/settings.py:97–131`：`_SEARCH_BUDGETS`（Exa/Tavily 每小时 8、每日 20）与 `_SEARCH_PROVIDER_ALIASES`（空值默认 `exa.web`）；`external_search_provider()` 的报错文案列出可选值。
- `backend/app/providers/rate_limit.py:112–113` 有 `exa_api`、`tavily_api` 限流键；`get_limiter(source, client)`。
- 测试 `backend/tests/test_external_search.py`（mock client，无真实网络）；文档 `docs/provider-source-map.md:48–49、75–76`、`docs/architecture.md:98、188` 写着 Exa 默认；`.env.example:29–38` 列出密钥与预算变量。
- DeepSeek Search：`POST https://api.deepseek.com/v1/tools/search`，Bearer；入参 `query`（≤128 字）、`count`、`need_content`；
  返回 `results[]`：`title`、`url`、`snippet`、`summary`（600–800 字）、`site_name`、`date`（UTC RFC 3339）、`authority`（0–4）、`rerank_score`（0–3，≥1.5 高质量）。402 余额不足、429 限流（账号级 5 QPS）、408/5xx 可重试。¥0.005/次，空结果不计费。

## 3. 冻结决定

R1 provider 标识 `deepseek.web`；别名 `deepseek` → `deepseek.web`；**空值默认改为 `deepseek.web`**；`auto` 顺序改为 DeepSeek → Exa → Tavily（按密钥是否存在）。密钥变量 `STOCK_RESEARCH_DEEPSEEK_API_KEY`（服务端，与模型密钥分开）。
R2 请求：`query` 超过 128 字时截到 128 字；`count=limit`；`need_content=false`。限流键 `deepseek_api`，不超过 4 QPS。预算默认每小时 60、每日 400（变量 `STOCK_RESEARCH_SEARCH_{HOURLY,DAILY}_DEEPSEEK`）。
R3 规范化：`snippet` 取 `summary`，为空用 `snippet`，截到 `SNIPPET_MAX`；`publisher` 取 `site_name`，为空用主机名；`published_at` 取 `date`；沿用 `_http_url_allowed()`。丢弃 `rerank_score < 1.0` 的结果；剩余按 `rerank_score` 降序。卡片字段与 `snapshot_hash` 不变，`authority`、`rerank_score` 不进卡片。
R4 Exa 接替：默认 `deepseek.web` 下，以下任一情况在**同一次调用内**改调 Exa 并返回 Exa 结果，`provider` 如实写 `exa.web`：DeepSeek 请求失败（含 402、429、超时、5xx、结构错误）；过滤后为空；过滤后没有一条 `rerank_score ≥ 1.5`。DeepSeek 预算耗尽时也改调 Exa。Exa 未配置密钥或也失败时，返回 DeepSeek 原错误或空结果，不再试 Tavily。接替时两家各自记预算。不做两家结果合并。
R5 公司新闻路由：`deepseek.web` 下纯公司新闻问句同样走 `eastmoney.news`（与现行 Exa 行为一致）。
R6 不改：DSH 插件 `search_external` 工具定义与每轮 3 次限制、Topic 卡片与附着、`fetch_source_url` / 网页读取、Vibe 前端。

## 4. 范围

codex1。worktree：`cd /Users/apple/ts/src/Stock-Research && git worktree add --detach .worktrees/codex1 HEAD`。
  只改：`backend/app/services/external_search.py`、`backend/app/settings.py`、`backend/app/providers/rate_limit.py`、`backend/tests/test_external_search.py`、`.env.example`、`docs/provider-source-map.md`、`docs/architecture.md`（只改外部检索相关句）。Stock 主目录有他人未提交改动，不碰。

## 5. 验收

1. 门禁：`cd backend && uv run pytest tests/test_external_search.py` 与全量 `uv run pytest`（按仓库约定剔除项）；`uvx ruff check` 改动文件；`git diff --check`。
2. 新增 mock 测试至少覆盖：默认走 DeepSeek 且字段映射正确；`rerank_score<1.0` 被丢弃并按分排序；DeepSeek 402 / 空结果 / 全部低于 1.5 三种情况各自接替 Exa 且 `provider=exa.web`；Exa 无密钥时返回 DeepSeek 原错误；DeepSeek 预算耗尽接替 Exa；公司新闻问句仍走东财；`auto` 顺序；超长 query 截断。
3. 真实接口（执行方，只调 Backend 函数，不经产品）：用执行环境已有 `DEEPSEEK_API_KEY` 临时作为 `STOCK_RESEARCH_DEEPSEEK_API_KEY` 传给子进程，跑 [检索对比](../../evals/DeepSeek检索对比_2026-10-19/README.md) 第 1、7、11、17 题，记录每题 `provider`、条数、首条标题；不打印密钥。
4. 用户：在 Backend 配置 `STOCK_RESEARCH_DEEPSEEK_API_KEY` 后重建，产品里问一个需要外部检索的问题。

## 6. Out of Scope

开放 DSH 原生 `web_search`/`web_fetch`；DeepSeek Fetch；按语言路由；结果合并或重排两家；改模型提示词。

## 7. Stop Conditions

- 现有测试依赖「空值默认 Exa」且改默认会改变非检索模块行为 → 停下列出。
- DeepSeek 返回结构与 §2 不符 → 停下报告原始字段名（不含密钥）。

## 8. 回滚

还原 §4 所列文件；`STOCK_RESEARCH_EXTERNAL_SEARCH_PROVIDER=exa.web` 可在不回滚代码时恢复旧默认。

## 9. 当前交接

1. 状态与结论：2026-10-19 Claude 审阅修订后已合入 Stock 主目录（未提交，含 docker-compose 与 test_settings 两处补充），待用户配置密钥、重建并验收。codex1 已在 Stock detached `.worktrees/codex1`（HEAD `d2ac5e9c5041e6f016dfbb979a0fac56cce4d2db`）完成 R1–R6 实施及 §5.1–3 执行。检索单测、lint、真实四题通过；全量测试与协议门禁未全绿，见下。未触发 §7，按范围停下。
2. 改动文件：仅 §4 七项：`backend/app/services/external_search.py`、`backend/app/settings.py`、`backend/app/providers/rate_limit.py`、`backend/tests/test_external_search.py`、`.env.example`、`docs/provider-source-map.md`、`docs/architecture.md`。
   DeepSeek 默认及 auto 选择顺序、60/400 预算、4 QPS 限流、128 字请求截断、summary 字段映射、分数过滤排序、Exa 单次接替与独立预算均已实现。卡片/hash、公司新闻路由、DSH 与网页读取边界保留；无两家合并或语言路由。
3. 证据：在 worktree/backend 复用主目录现有虚拟环境，`PATH=/Users/apple/ts/src/Stock-Research/backend/.venv/bin:$PATH uv run --no-project pytest tests/test_external_search.py -q`：43 passed。新增 mock 覆盖字段、过滤排序、402/429/5xx/超时/结构错误/空/低匹配接替、原错保留、预算、auto、新闻及长 query。
   最终源码 `uv run --no-project pytest -q --tb=no`（同上 PATH）：1352 passed、20 failed、13 skipped，59.84 秒；未自行剔除用例，沿用仓库 skip 规则。首次全量同为 1352/20/13。
   20 项失败：`test_report_quality.py` 17 项均为 Chromium 离线检查进程失败；`test_research_links.py::test_wiki_research_link_http_confirm_and_nbs_catalog` 缺 GBRAIN_ROOT；`test_research_topics.py::test_wiki_tracking_http_upsert_and_cas` 快照存储不可用；`test_settings.py::test_external_search_provider_defaults_to_exa` 仍断言旧默认。
   `uvx ruff check` 四个改动 Python 文件通过；`git diff --check` 通过。为 lint 做了授权文件内导入/UTC/类型写法整理、删除无用 last_err；ValueError 与 URL 拒绝语义保留，针对性注明 lint 例外。
   `node scripts/verify-protocol.mjs --sibling /Users/apple/ts/src/Vibe-Deep-Research` 失败：worktree 冻结的 `docs/task-protocol.md` 与当前 Vibe 不同（收尾三问/四问）；该文件不在范围，未同步。范围断言通过：detached、恰好七个变更文件、无未跟踪文件；Stock 主目录状态与开工一致。
   真实函数验证只将执行环境 `DEEPSEEK_API_KEY` 临时映射到子进程 `STOCK_RESEARCH_DEEPSEEK_API_KEY`，未加载 .env，未打印/落盘密钥，临时缓存随进程清理；每题原始字段均核对通过，无结构差异。
   第 1 题：provider=`deepseek.web`，8 条，首条「神火股份（sz000933）行情走势」。第 7 题：provider=`deepseek.web`，8 条，首条「《金屬庫存》10/16LME鎳庫存減少0.74%_富聯網」。
   第 11 题：provider=`deepseek.web`，8 条，首条「SEC Proposes Significant Measures to Advance Retail Access to Private Markets」。第 17 题：provider=`deepseek.web`，1 条，首条「宁德时代新能源科技股份有限公司投资者关系活动记录表」。不据此重做质量判断。
   已知执行环境 DeepSeek 密钥在七个改动文件中的残留为 0。完成 diff 自查，未见 R1–R6 范围外行为；独立审阅仍待 Claude。无提交、合入、重建、重启或产品操作。
4. 与规格的偏差及理由：worktree 不带主目录未跟踪的 pyproject/uv.lock，使用 `uv run --no-project` 和现成虚拟环境，不复制环境或新增清单。未改超出白名单的旧默认断言、存储配置、Chromium 检查或共享协议，因此未消除相应门禁失败。
   首次真实验证第 1 题通过后，逐题关闭注入 client 导致现有限流器引用已关闭 client；未改共享逻辑，改用同一个 client 完整重跑四题通过（额外一次成功 Search）。
5. 未覆盖的缺口：真实 Exa 接替仅有 mock 证据，真实四题均未触发接替；产品路径与 §5.4 未验收。旧默认单测需授权调整；范围外全量失败及共享协议差异仍待处理。
   部署缺口：范围外 `docker-compose.yml:72` 仍显式默认 `exa`，且未透传 `STOCK_RESEARCH_DEEPSEEK_API_KEY`；仅填宿主 .env 后重建不会自动启用本次默认。未擅自修改部署文件，需 Claude 修订范围或另行处理后再给用户重建。
6. 下一步谁做什么：codex1 停下，保留 detached worktree 未提交 diff；Claude 审阅、处理旧断言/部署与协议范围缺口、复跑门禁后按协议合入 Stock 主目录（不提交）；用户再配置 Backend 密钥、重建并做产品外部检索验收。
