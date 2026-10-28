# gbrain 退役实施

2026-10-27 claude 写定，交 pi1。Stock worktree `/Users/apple/ts/src/Stock-Research/.worktrees/pi1-gbrain`（基于主目录当前状态，含未提交的依赖拆分）；不提交、不重启、不读凭据、不连 gbrain 库、不跑 docker build。用户在验收，主目录冻结，只在 worktree 改。
依据：Checklist 2026-10-09「gbrain 退役」；用户 2026-10-27 重申；盘点见 [gbrain退役盘点](gbrain退役盘点_Task_2026-10-27.md) §9 附表①②。

## 1. 目标

Backend 与 dsh 不再调用 gbrain CLI、MCP 与 gbrain 库；镜像去掉 bun/gbrain 阶段，compose 去掉 gbrain 库与 pgvector。

## 2. 现状（Claude 核实）

- 盘点附表①的调用点已核对：`wiki/gbrain_adapter.py` 有 `publish`（:217）、`page_update_times`（:308）、`provider_snapshot`（:317）、`related_pages`（:334）、`_git`（:724）；`/refs/resolve` 已走 `ProviderSnapshots`（`api/v1/wiki.py:562`）。
- `wiki/page_diff.py:77` 的版本与差异靠 Wiki 目录的 git 历史，所以 **git 保留**，发布仍要 git 提交。

## 3. 冻结决定

R1 按盘点附表②第 1–10 步依次做；第 11 步（停系统块编译）不做。每步完成跑相关测试再进下一步，§9 逐步记结果。
R2 搜索：Backend 新增对 `workspace/wiki` Markdown 的全文检索接口（逐页扫描即可，86 页规模，不建索引库、不加依赖），`wiki_search` 改调它；返回字段尽量与原工具一致，让提示词不用改。
R3 发布：自写落盘 + 更新 index + 追加 `history.jsonl` + git 提交，链接从 spec 抽取；保留现有 outbox、重放与幂等语义。
R4 锁：advisory lock 改用 `stock_research` 主库连接；文件存储模式（测试）行为不变。
R5 删除 gbrain 相关代码、设置项、环境变量、Dockerfile 阶段、`initdb/02_gbrain.sql`、compose 中 GBRAIN_*；Postgres 镜像改官方 `postgres:17`（先 `git grep -i vector` 确认主库不用 pgvector）。
R6 已有数据不迁移：gbrain 库里的 provider 快照是否已全部回填，由 Claude 部署前另行核实；本 Task 不连库。
R7 不做兼容：不保留 gbrain 回退分支或开关。

## 4. 范围

Stock `backend/`、`dsh/src/wiki-navigation.mjs` 及其调用方与测试、`docker-compose.yml`、`initdb/`、相关文档（backend README、wiki README、部署说明）。

## 5. 验收

- `git grep -i gbrain` 在 `backend/app`、`backend/wiki`、`dsh/src`、compose、Dockerfile 中无残留（文档里的历史说明除外，需列出）。
- Backend 全量 pytest（`backend/.venv`）、启动冒烟 `from app.main import app`；dsh `pnpm test`；`node scripts/verify-protocol.mjs`。
- 新检索接口与发布路径有测试。

## 6. Out of Scope

停系统块编译；Vibe 仓；数据迁移；部署。

## 7. Stop Conditions

需要连 gbrain 库、读凭据、改共享 Checklist 决定，或某一步发现产品仍依赖 gbrain 独有能力（如向量检索）时停下回报。

## 8. 回滚

丢弃 worktree。

## 9. 当前交接

1. 状态与结论：审阅 4 条已在 `pi1-gbrain2` 修好。search 类型用显式映射；Theme/Comparison `wiki_read` 与个股页同一视图；删 `navigationTool`；删 WikiAdapter `**_ignored`。

2. 改动文件：`backend/wiki/adapter.py`、`backend/app/api/v1/wiki.py`、`tests/wiki/test_wiki_search.py`、`dsh/src/wiki-navigation.mjs`、`dsh/src/research-material-tools.mjs`、`dsh/test/tool-scope.test.mjs`、`dsh/test/navigation-failure.test.mjs`。未提交。

3. 证据：冒烟通过。pytest 全量 1691 passed / 28 skipped，另 3 failed + 1 error 为 `test_agent_extractions` 本机库脏数据，单文件 44 passed。dsh `pnpm test`（含 build）358 passed。verify-protocol ok。

4. 与规格的偏差及理由：无。gbrain 字样仍只剩 backfill 脚本与历史标签 `gbrain_backfill`。

5. 未覆盖的缺口：未 docker build、未部署。全量 pytest 与共享 Postgres 偶发污染。

6. 下一步谁做什么：Claude 复审后合入。不提交。
