# gbrain 退役盘点 过程记录

只读。Stock 主目录 `/Users/apple/ts/src/Stock-Research`；会话 `/Users/apple/ts/src/Vibe-Deep-Research/.local/dsh/sessions`。未改代码、未提交、未读 `.env` / initdb 口令。

## `/refs/resolve`

`wiki.py:580` 的 `get_provider=_read_provider_snapshot` → `ProviderSnapshots().get`。`GBrainAdapter.provider_snapshot` 无生产调用点（仅 adapter 定义与回填脚本 `unique_provider_snapshot`）。

## 读路径 vs CLI

`existing_page` 读 `.stock-research-wiki/pages.json` + markdown 哈希，不调 gbrain 二进制。几乎所有 Wiki API 仍包 `brain_read_lock` / `brain_publish_lock`，连 `STOCK_RESEARCH_GBRAIN_DATABASE_URL`。

CLI 仍用于 `publish` 的 `sync`/`extract`/`list_pages` 校验，以及 DSH `gbrain serve` MCP（search / list_pages / get_page / traverse_graph / schema_graph）。

SQL 仍用于 `related_pages`、`page_update_times`；`provider_snapshot` 无活调用。

## 会话统计（只计工具名与 slug 前缀）

824 个 `*.jsonl.zstd`，事件类型 `tool/call`，`data.name`；`arguments` 为 JSON 字符串时只取 `slug` 的 `companies|industries|themes|comparisons` 前缀。

时间≥2026-10-09：315 会话、2823 次工具。≥2026-10-10：2613 次。10-09 当天创建 25 会话。

wiki 相关：wiki_read 156（公司 141、行业 15）；wiki_search 65；wiki_list_pages 6；save_company_page_research 97；update_company_drivers 12；resolve_refs 53。wiki_relations / wiki_schema_graph / wiki_refresh_company_api / wiki_report_publish = 0。

## 数据体量（不摘正文）

`workspace/wiki/.stock-research-wiki/pages.json`：86 页（companies 26、industries 58、themes 1、comparisons 1）。用户 `company-pages/current.json` 14。公司研究写入 `company_page_store`，仍要求 Wiki 页已存在。

未连接 Postgres，不能核验 `provider_snapshots` 是否覆盖 gbrain `page_versions`。

## Claude 审阅（2026-10-27）

- 抽查核实：`/refs/resolve` 走 `ProviderSnapshots`（`wiki.py:562`）；adapter 的 publish/page_update_times/provider_snapshot/related_pages 行号与附表一致。
- 补充：`wiki/page_diff.py:77` 的版本差异依赖 Wiki 目录 git 历史，git 保留，附表「git 提交 wiki 待定」定为保留。
- 通过，按附表②第 1–10 步写实施 Task，第 11 步不做。
