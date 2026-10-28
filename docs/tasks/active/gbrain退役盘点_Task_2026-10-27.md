# gbrain 退役盘点

2026-10-27 claude 写定，交 pi1。**只读**：在 Stock 主目录 `/Users/apple/ts/src/Stock-Research` 读代码与本机会话记录，不改代码、不提交、不重启、不读凭据（`.env`、`initdb` 里的口令文件不读）。
依据：Checklist 2026-10-09「gbrain 退役：provider 快照由 Backend 自存，系统内容由页面模板现取」（待实施 T10）；用户 2026-10-27 重申：gbrain 大部分功能用不上，用到的部分自己实现。讨论记录：`/Users/apple/ts/src/Vibe-Deep-Research/docs/decisions/proposed/数据归属与gbrain退役_讨论记录_2026-10-09.md`（§2 核实、§6 退役顺序）。

## 1. 目标

弄清今天代码里 gbrain 还承担哪些职责、哪些仍在产品路径上，给出逐项替代方案与分步拆除计划，供 Claude 写实施 Task。

## 2. 现状（Claude 核实）

- 引用 gbrain 的文件（不含 `wiki/gbrain_adapter.py` 本身）：
  `settings.py`、`main.py`、`api/v1/{company_data,tracking,wiki,page_reads}.py`、`services/{wiki_publish,wiki_publish_lock,wiki_refresh,maintenance,refresh_checks,research_topics,agent_extractions,provider_snapshots,provider_snapshot_backfill}.py`、dsh `src/wiki-navigation.mjs`。
- 部署：
  Dockerfile 用 bun 从 GitHub 构建 gbrain（182MB）并装 git（87MB）；compose 的 Postgres 用 `pgvector/pgvector:pg17`，注释说 pgvector 只给 gbrain 库用；`initdb/` 建 gbrain 角色与库；backend 需 `STOCK_RESEARCH_GBRAIN_ROOT`、`STOCK_RESEARCH_GBRAIN_DATABASE_URL`。
- 已有 `provider_snapshots.py` 与 `provider_snapshot_backfill.py`：退役顺序第 1 步（provider 快照自存）可能已部分完成，需核实 `/refs/resolve` 是否仍回落 gbrain。
- 个股页、产业链页已由模板从 Backend 取数（T7/T7b）；Wiki 公司页、行业页的系统块编译是否还被产品读，需核实。

## 3. 冻结决定

G1 逐个调用点追到产品入口：哪个 DSH 工具或哪个页面会触发它；用 Vibe `.local/dsh/sessions` 统计 2026-10-09 以后真实会话中相关工具的调用次数（只统计工具名与页面类型，不摘录内容）。
G2 每项给替代：Backend 已有能力 / 需自写的小实现（写清大致规模）/ 直接删除（产品已不用）。不引入新的外部依赖。
G3 数据：列出 gbrain 库与 `workspace/wiki` 里仍需保留的数据（如 provider 快照历史、已接受的研究块），给一次性迁移方式；不在本 Task 执行迁移。
G4 部署收益：去掉 gbrain 后 Dockerfile 的 bun 阶段、git、pgvector 镜像、initdb 角色、环境变量哪些可删。

## 4. 范围

只读盘点，产出写在 §9 及附表。

## 5. 验收

§9 附两张表：①调用点｜文件:行｜产品入口｜10-09 后调用次数｜替代方式｜规模；②拆除步骤（每步可单独合入、单独回滚，标前置依赖）。

## 6. Out of Scope

改代码；数据迁移；Vibe 前端。

## 7. Stop Conditions

需要读凭据、连生产数据或改代码才能判断时停下回报。

## 8. 回滚

无改动。

## 9. 当前交接

1. 状态与结论：只读盘点完成。gbrain CLI/MCP 今天仍撑搜索、发布管线、链接 SQL 与导航；公司/行业页读取走本机 markdown+index，但几乎每次 Wiki 读写都要 gbrain 库上的 advisory lock。`/refs/resolve` 已改走 Backend `provider_snapshots`，不再回落 gbrain。Theme/Comparison MCP 与 relations/schema 在 10-09 后次数为 0。

2. 改动文件：无代码。本 Task §9 与 `gbrain退役盘点_Task_2026-10-27.log.md`。

3. 证据：Stock 主目录代码追踪。会话 ≥10-09：2823 次调用、315 会话。wiki_read 156（公司 141 / 行业 15 / 主题对比 0）；wiki_search 65；wiki_list_pages 6；relations/schema/refresh_api/report_publish=0。resolve_refs 53 已走 Backend 表。wiki 索引 86 页；用户研究 JSON 14。未连库。

4. 与规格的偏差及理由：`research_topics.py` 现声明不是 GBrain 页，未列入调用表。未连 `stock_research_gbrain`，page_versions 是否已全部回填未知（停止条件）。次数含 10-09 当天 25 会话，与前次盘点可能重叠。

5. 未覆盖的缺口：gbrain 库内是否还有未回填快照；UI 页面命中次数无埋点；git 是否仍要在去掉 CLI 后保留。

6. 下一步谁做什么：Claude 按附表②写实施 Task。用户不验收。不改代码、不提交。

附表① 调用点（次数=DSH `tool/call`，≥2026-10-09；UI=页面/后台非工具）

| 调用点 | 文件:行 | 产品入口 | 次数 | 替代 | 规模 |
|---|---|---|---|---|---|
| existing_page 读 markdown+index | `gbrain_adapter.py:162`；`wiki.py:1682,1884` | wiki_read；GET `/pages/read`；个股模板 | wiki_read 156 | 已有本机页；只需换锁 | 小 |
| existing_page 门闩 | `company_data.py:80,102`；`tracking.py:40`；`save_research:622` | save_company_page_research 97；update_drivers 12；跟踪页 | 97+12 | 改查 index 或只认用户 JSON | 小 |
| publish `sync/extract` | `gbrain_adapter.py:223`；`wiki_refresh.py:459`；`wiki.py:2268` | 草案发布、ensure、入库 outbox、refresh-api | 工具 0；后台/UI | 自写落盘+index+history，链接从 spec 抽 | 中 |
| wiki_search MCP | `wiki-navigation.mjs:56` | wiki_search | 65 | Backend 检索 markdown | 中 |
| wiki_list_pages MCP | 同上 | wiki_list_pages | 6 | 已有 GET `/wiki/pages` | 删 MCP |
| get_page / relations / schema MCP | 同上 | 仍注册 | 0 | 删；主题/对比改 `/pages/read` | 删 |
| related_pages SQL | `gbrain_adapter.py:334`；`wiki.py:1565` | UI ResearchKnowledge | UI | `pages.json` 已有 links | 小 |
| page_update_times SQL | `gbrain_adapter.py:307`；`wiki.py:1751` | UI 研究目录 sort=updated | UI | `history.jsonl` | 小 |
| provider_snapshot SQL | `gbrain_adapter.py:317` | 无活调用；仅回填脚本 | 0 | 已有 ProviderSnapshots；删方法 | 删 |
| `/refs/resolve` | `wiki.py:580` `_read_provider_snapshot` | resolve_refs | 53 | 已完成，无 gbrain | 已有 |
| brain_*_lock | `wiki_publish_lock.py` | 几乎所有 Wiki 读写 | — | 改 `stock_research` advisory lock | 小 |
| objects/status、NBS 列表、page-reads | `wiki.py:226,1418`；`page_reads.py:46` | UI 对象状态/产业研究/资料 | UI | 随 index+锁 | 随 1 |
| extractions 读 required_metrics | `agent_extractions.py:531` | extractions/finalize | 后台 | 改数据包字段 | 小 |
| maintenance existing_page | `maintenance.py:219,445,600` | 维护提案 | 后台 | index | 随 1 |
| gbrain CLI 镜像 | `backend/Dockerfile` | 部署 | — | 去掉 bun 阶段 | 见② |
| git 提交 wiki | `gbrain_adapter.py:683` | 发布 | — | 可改只靠 history.jsonl | 待定 |
| pgvector + gbrain 库 | compose / `initdb/02_gbrain.sql` | 部署 | — | 改官方 postgres、删角色库 | 见② |

附表② 拆除步骤（每步可单独合入、单独回滚）

| 步 | 做什么 | 前置 | 回滚 |
|---|---|---|---|
| 1 | 断言 resolve 不调 gbrain；删除 `provider_snapshot` | 无 | 还原方法 |
| 2 | 列表时间与 related 改 index/history，不再 SQL gbrain | 无 | 还原 SQL |
| 3 | `wiki_list_pages` 改 GET `/wiki/pages`，删 MCP list | 2 可选 | 还原 MCP |
| 4 | Backend 全文检索 markdown；`wiki_search` 改道；删 MCP search | 无 | 还原 MCP |
| 5 | 删 relations/schema/get_page（次数 0）；主题/对比走 `/pages/read` | 无 | 还原工具 |
| 6 | 删除 `connectWikiNavigation` / `gbrain serve` | 3–5 | 还原导航 |
| 7 | publish 去 CLI：写 md、更新 index、append history、从 spec 抽链 | 2 | 还原 adapter.publish |
| 8 | advisory lock 迁到 `stock_research` | 2、7 | 改回 GBRAIN URL |
| 9 | Dockerfile 去掉 bun/gbrain 二进制（git 是否保留随⑦） | 6、7 | 还原阶段 |
| 10 | 删 `stock_research_gbrain*`、pgvector 镜像、`initdb/02`、GBRAIN_* | 8、9 | 还原 compose/initdb |
| 11 | 可选：停系统块编译，个股/产业链只走数据包（T7） | 产品确认 Wiki 不再展示系统块 | 恢复编译 |
