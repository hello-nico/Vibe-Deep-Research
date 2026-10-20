# Stock后端测试基线失败（诊断）

2026-10-20 claude 写定，待 pi2 实施。只读诊断：记录放 Vibe 主目录 `/Users/apple/ts/src/Vibe-Deep-Research/.local/stock-test-baseline/`；
不改代码；不提交；不重启服务（5930 归用户）；不停止别人的进程；不读凭据。

## 1. 目标

查清 Stock Backend 全量 pytest 稳定失败的 24 项原因，让门禁结果能被信任。

## 2. 现状

Stock 主目录 `cd backend && uv run pytest -q`：24 failed / 1395 passed（10-20）。集中在 tests/test_report_quality.py（17）、tests/test_real_evidence_artifacts.py（5）、tests/test_research_links.py（1）、tests/test_research_topics.py（1）。干净 HEAD 基线同四文件 19 失败，与当日合入无关。

## 3. 冻结决定

T1 逐项给出失败原因分类：环境依赖（端口被占、缺浏览器、缺本地数据、网络）/ 测试本身过时 / 产品代码真问题；每项附最小复现命令与关键报错一行。
T2 环境依赖类给出让测试在干净环境可重复的建议（跳过条件、夹具、端口参数化），真问题给出代码位置与修法建议；都不动手。

## 4. 范围

`.local/stock-test-baseline/`、本 Task §9。

## 5. 验收

§9 有分类表；门禁 `node scripts/verify-protocol.mjs`。

## 6. Out of Scope

修改测试或代码；重启或停止任何服务。

## 7. Stop Conditions

确认需要停止用户服务才能复现时，停下记录。

## 8. 回滚

删除记录目录。

## 9. 当前交接

1. 状态与结论：pi2 只读诊断完成。24 failed = 环境依赖 22 + 测试过时 2，无产品代码真问题。分类表：
   | 分类 | n | 关键报错 | 建议（未实施） |
   | 环境-缺浏览器 | 17 | Chromium 不存在 headless-shell-1243 | `playwright install chromium`；无浏览器 skip |
   | 环境-缺本地数据 | 5 | get_document None；5434 通、documents 空 | 原件缺失 skip（现仅 preflight 失败 skip） |
   | 测试过时 | 1 | 503 GBRAIN_ROOT required（nbs catalog） | 夹具设 STOCK_RESEARCH_GBRAIN_ROOT=tmp |
   | 测试过时 | 1 | snapshot_unavailable ≠ not_found_or_ambiguous | filesystem 店无 engine；改夹具或断言 |
2. 改动文件：`.local/stock-test-baseline/`（pytest 日志、chromium-stderr、results.csv、summary.json）；本 Task §9 与同名 `.log.md`。未改代码，未提交，未重启/停止服务。
3. 证据：`cd backend && uv run pytest -q tests/test_report_quality.py tests/test_real_evidence_artifacts.py tests/test_research_links.py tests/test_research_topics.py --tb=line` → 24 failed, 86 passed, 7.81s。子进程 `python -m app.services.report_quality --render-width 1200` 确认缺浏览器。证据等级：集成探针（真实本机 pytest）。
4. 与规格的偏差及理由：未再跑全量 1395；四文件 24 失败已对齐任务所述。干净 HEAD 19 失败的差即 5 条 evidence（库通无原件 fail，库不通 skip）。
5. 未覆盖的缺口：未执行 `playwright install`；未在无 5434 环境验证 evidence skip；未核对 CI 镜像是否装 Chromium。
6. 下一步谁做什么：Claude 判定是否装浏览器、补 skip/夹具；不改代码除非另开修复 Task。
