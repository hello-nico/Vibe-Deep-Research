# Stock 测试环境跳过与过时修正 · 过程记录

## pi2 · 2026-10-20

工作区 `/Users/apple/ts/src/Stock-Research/.worktrees/pi2-tests`。只改四个测试文件。未装浏览器、未改产品代码、未提交。

### 改动

- K1 `test_report_quality.py`：模块级探测 Playwright `chromium.executable_path`；缺则 skip「本机无 Chromium headless shell」。不需要浏览器的 4 项仍跑。
- K2 `test_real_evidence_artifacts.py`：`get_document` 为 None 时 skip「本地无年报原件 {id}」。
- K3 `test_research_links.py`：HTTP 测试设 `STOCK_RESEARCH_GBRAIN_ROOT` 到 tmp wiki。
- K3 `test_research_topics.py`：`test_wiki_tracking_http_upsert_and_cas` 使用 conftest `provider_snapshots`（sqlite），断言仍为 `provider_snapshot_not_found_or_ambiguous`。

### 命令与结果

四文件：`88 passed, 22 skipped, 0 failed`（17 Chromium + 5 原件）。

全量（worktree cwd，主仓 `.venv/bin/pytest -q`）：**1404 passed, 30 skipped, 0 failed in 58.06s**。

`uvx ruff check --select BLE001` 四文件通过。整文件 `uvx ruff check` 仍报文件原有 I001/C408，非本次引入。

证据等级：真实 pytest。

## Claude 审阅（2026-10-20，claude）

- 结论：通过（合入排在本轮验收提交之后）。只改四个测试文件：缺 Chromium 时按名单 skip 并写原因，缺原件 skip，两项过时测试改夹具；未改产品代码、未装浏览器。worktree 全量 1404 过 / 30 跳过 / 0 失败。
- 合入后主目录仍有 test_real_evidence_artifacts 5 项失败：本机有原件但缺解析文本 / revision，skip 只覆盖了无原件。需补一处跳过条件，派 pi2。
- 补丁合入（2026-10-20）：缺 raw / markdown / revision 任一即 skip；主目录全量 0 失败。
