# Stock 测试环境跳过与过时修正（修复）

2026-10-20 claude 写定，待 pi2 实施。实施仓库 Stock-Research，worktree `/Users/apple/ts/src/Stock-Research/.worktrees/pi2-tests`；只改测试；不提交、不 push；不重启服务；不装浏览器；不读凭据。
权威：[Stock后端测试基线失败](../archived/Stock后端测试基线失败_Task_2026-10-20.md) §9 与 log；记录 `/Users/apple/ts/src/Vibe-Deep-Research/.local/stock-test-baseline/`。

## 1. 目标

全量 pytest 在本机只剩真问题：缺浏览器、缺本地原件时跳过并说明原因；两项过时测试按当前实现修正。

## 2. 现状

见诊断 §9 分类表：test_report_quality.py 17（缺 Chromium）、test_real_evidence_artifacts.py 5（库通但无原件）、test_research_links.py 1（GBRAIN_ROOT）、test_research_topics.py 1（snapshot_unavailable 断言）。

## 3. 冻结决定

K1 缺 Chromium：模块级检测，缺则 `pytest.skip` 并写「本机无 Chromium headless shell」；有浏览器时行为不变。
K2 缺原件：原件取不到时 skip 并写原因，不再判失败。
K3 两项过时：按诊断建议修夹具或断言，不改产品代码；若需改产品代码则停下。
K4 不降低任何其他断言。

## 4. 范围

上述四个测试文件及其夹具；本 Task §9。

## 5. 验收

`cd backend && uv run pytest -q` 0 失败（跳过数写进 §9）；`uv run ruff check` 改动文件。

## 6. Out of Scope

安装浏览器；产品代码。

## 7. Stop Conditions

K3 需要改产品代码。

## 8. 回滚

还原测试文件。

## 9. 当前交接

1. 状态与结论：pi2 已在 `.worktrees/pi2-tests` 只改四测试文件。全量 pytest **1404 passed, 30 skipped, 0 failed**。17 项缺 Chromium skip「本机无 Chromium headless shell」；5 项缺原件 skip；两项过时测试已过（GBRAIN_ROOT 夹具、sqlite snapshot 夹具）。未改产品代码，未装浏览器。
2. 改动文件：Stock worktree `backend/tests/test_report_quality.py`、`test_real_evidence_artifacts.py`、`test_research_links.py`、`test_research_topics.py`；本 Task §9 与同名 `.log.md`。未提交、未 push。
3. 证据：worktree `backend` 下 pytest -q 四文件 88 passed / 22 skipped；全量 1404 passed / 30 skipped / 0 failed（58s）。`uvx ruff check --select BLE001` 四文件通过。证据等级：真实 pytest。
4. 与规格的偏差及理由：worktree 无入库 pyproject.toml，用主仓 `.venv/bin/pytest` 在 worktree cwd 跑，未用 `uv run pytest`。`uv run ruff check` 无 ruff 入口；`uvx ruff check` 四文件仍有文件内原有 I001/C408，本次新增 BLE001 已清。
5. 未覆盖的缺口：有 Chromium 时 17 项排版检查未在本机跑过；5 份年报原件仍缺，skip 而非验页数。
6. 下一步谁做什么：Claude 审阅 worktree 四文件后合入；不装浏览器。
