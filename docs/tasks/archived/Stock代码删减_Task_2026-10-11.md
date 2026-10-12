# Stock 代码删减（审计第二批）

状态：2026-10-11 Claude 写定，用户同意审计裁决清单与 bench 退役。只删除与随之必须的引用、契约、文档修改；不提交、不 push、不重建容器、不重启工作台。
实施仓库：Stock-Research。

权威：[代码膨胀审计](../archived/代码膨胀审计_Task_2026-10-10.md) 过程记录「Claude 审阅与裁决清单」（S-01…S-08）；完整字段见 Vibe `.local/code-audit/candidates.md`；
全局原则「Less is More」「不做兼容性开发」；Stock Human Checklist（Jev 停止项、Dreaming 停用、社区来源停用）；第一批做法见 [Vibe 代码删减](../archived/Vibe代码删减_Task_2026-10-10.md)。

## 1. 目标

1. 删除审计确认的 Stock Backend 侧无用代码与脚本（S-01、S-02、S-03、S-05、S-07、S-08），并整体退役 `bench/`。
2. 契约、README、AGENTS 与目录说明同步为删除后的现状，相关测试与门禁通过。

## 2. 现状（Claude 核实，2026-10-11）

- 旧 T7 未提交改动已撤下并存档到 `artifacts/t7-legacy/`，`wiki.py`、`api/v1/__init__.py` 已回到 HEAD，可以动。
- `backend/app`、`backend/wiki`、`dsh/src`、`pi/` 不读取 `bench/` 下任何文件（`git grep` 只命中 `market_benchmark_id` 等同名词）；`bench/` 共 123 个受版本管理文件。
- Stock Checklist 中「bench 只存冻结验证」与「release component 冻结」两条已由 Claude 删改；`### 行业 profile 与确定性抽取` 其余规则暂不动。
- `data/coverage/` 6 个文件只由 S-03 三个脚本生成；`data/industry_*.json`、`data/sw_em_mapping.json`、`workspace/research/industry-profiles/` 是现用数据，不删。

## 3. 冻结决定

R1. **S-01 Jev**：删除 `maintenance_jev.py`、`citation_semantic_check.py`、`maintenance_review.py`、`jev_eval/`（报告质检脚本 `calibrate_report_quality.py` 属 S-04，保留）、记忆影子
  （`memory_trigger.py`、`memory_trigger_rules.py`、`api/v1/memory_trigger.py`）及只测它们的测试；同步去掉 `maintenance.py`、`wiki.py`、`api/v1/__init__.py` 中的调用与路由注册。
  保留 `jev_gateway.py`、`injection_screen.py` 及其调用。DSH 侧（`dsh/src` 中调用上述路由或工具的代码）不改，逐处列进交接，由 Claude 在提示词与工具线处理。
R2. **S-02 Dreaming**：删除 `dreaming.py`、`validate_dreaming.py`、`dreaming_preflight.py`、`run-dreaming.sh`、`test_dreaming_retired_types.py`，以及 `wiki.py`、`research_topics.py`、`settings.py` 中的引用；
  README 与 Pi README 去掉 `run-dreaming.sh`。`workspace/research/dreaming` 与库中历史事件不删，现有通用读取接口能读到即可，不为它保留专用代码。
R3. **S-05 社区连接器**：删除 `connectors/__init__.py`、`community_runtime.py`、`opencli_xueqiu.py` 及两份测试；`replay_radar_600900.py` 与 `test_replay_radar_gate.py` 一并删除。旧社区快照读取保留。
  同步雷达契约、`docs/architecture.md`、`docs/provider-source-map.md`。
R4. **S-03、S-07、S-08 脚本**：删除 `build_coverage_universe.py`、`build_first_wave.py`、`build_priority_queue.py` 与 `data/coverage/`；`replay_market_600900.py`、`smoke_eastmoney_external_search.py`、`smoke_l1_company_page.py`；
  `flatten_document_storage_keys.py`、`backfill_manifest_artifact_hashes.py`。删 S-08 前只读核对文档卷已扁平（脚本的 dry-run 或等价只读查询报告 0 个待迁移），否则停该项。
R5. **bench 退役**：删除整个 `bench/`、`docs/benchmark.md`、`docs/annotation-guideline.md`；`docs/document-evidence-contract.md` 保留，删去「被钉住 / release component / 冻结」相关句子。
  AGENTS 删去 bench、钉住组件、`freeze_release.py --validate`、基线数值 Owner 等规则；README、`data/README.md`、`.gitignore`、`.dockerignore`、`docs/` 其他文件中指向 bench 的段落同步删改。
  `backend/tests` 中仅为 bench 存在的测试一并删除；只是用到 `benchmark` 一词的市场测试不动。
R6. **根目录杂物**（未受版本管理）：删除 `industry_wiki_41_drafts.zip`、`m3-refactor-home.png`、`scripts/bench_wiki_reads.py`、`scripts/compare_related_sql.py`。`backend/pyproject.toml`、`backend/uv.lock` 来历不明，不动，只在交接里报告。

## 4. 范围

- 只改 R1–R6 列出的文件及因删除必须同步的引用、测试、契约与文档。
- 不改 `dsh/`、`pi/` 代码（README 文字除外）、Vibe 仓库；不改 S-04 报告运行时与 S-06 校验脚本（T7.2 后再定）。
- codex1 同时在改 `backend/app/services/company_data*.py`、`company_packet_extract.py`、`providers/company_statements.py`、`api/v1/company_data.py` 及其测试；这些文件不碰，删减牵涉到它们即停该项。
- 不做重构、改名或顺手修复。

## 5. 验收

**执行方自动检查**：
- 每项删除前后各跑一次 `rg`，确认 `backend`、`dsh/src`、`pi`、`scripts`、CI、Dockerfile、compose 中无残留引用（含字符串路由、动态 import）；残留只允许在 DSH 侧，逐处回填。
- Backend：受影响模块对应的 pytest，加 `tests/wiki`、`maintenance`、`research_topics`、`settings`、radar 相关测试；容器内导入检查（`python -c "import app.main"` 或现有等价入口）。
- `node scripts/verify-protocol.mjs`（两仓）、`git diff --check`。
- 删除行数统计（按 R 项）。

**用户验收（用户重建容器后）**：Backend 正常启动；对话与关注页正常；Claude 抽查维护与 Wiki 接口。

## 6. Out of Scope

- DSH 工具与提示词（Claude 本人的提示词与工具线）；T7.1c 取数；S-04、S-06；Checklist `### 行业 profile 与确定性抽取` 其余规则的去留（只在交接中列出哪些规则因 bench 退役失去对象）。

## 7. Stop Conditions

停止范围：只停对应子项，写进交接后继续其余工作。

- 删除前复核发现生产代码（含动态引用、配置文件路径）仍依赖候选：保留该项，回填引用位置。
- 某项删除需要改 DSH 运行时才能让 Backend 测试通过：停该项。
- 测试失败且原因不在删除范围内：记录失败与基线对比（`git stash` 前后各跑一次），不顺手修。
- 需要读取或改动凭据、环境配置、数据库数据：停下。

## 8. 回滚

`git checkout -- <路径>` 恢复受版本管理文件；R6 的未跟踪文件删除前先拷到 `artifacts/root-clutter/`（不提交），用户确认后再清。

## 9. 当前交接

1. 状态与结论：2026-10-12 Claude 审阅通过，用户重建后验收通过，已提交。codex2 本轮完成 R1、R3、R4 的八份脚本、R5、R6；R2 仅删除无调用的 `validate_dreaming.py` 并撤下 README 启动说明。Dreaming 其余链与 `data/coverage/` 按 §7 保留。未提交、未 push、未重建或重启。
2. 改动文件：Stock 共 182 个受版本管理文件（162 删除、20 同步修改）；另四个未跟踪杂物先备份至 `artifacts/root-clutter/` 再删除。Backend 修改仅 `api/v1/{__init__,wiki}.py`、`services/maintenance.py` 与 `test_maintenance.py`；其余为候选及必要文档。完整分组见同名过程记录。
3. 证据：相关 pytest 删前 376 通过、7 跳过、1 失败；删后含注入筛查/记忆回归 392 通过、7 跳过，同一基线失败，无新增失败。两仓 `verify-protocol`、两仓 `git diff --check`、现有容器导入、工作树导入/路由检查通过。S-08 只读核对待迁移记录与目录均 0；每 R 删前/后 rg 已记录。
   指定候选删除行数（不含同步引用修改）：R1 4,088；R2 243；R3 1,051；R4 1,519；R5 239,050（代码/测试 9,367，其余主要 JSON 数据/配置）；R6 225 文本行及两份二进制。候选代码/测试合计 16,493 行。
4. 与规格的偏差及理由：Pi `run.sh:192,206` 与扩展 `index.ts:1848,1868,1899` 仍依赖 Dreaming；本 Task 禁改 Pi 代码，保留服务/路由/预检/包装器及对应测试。`business_compiler.py:46,69` 与 `ingest_priority_annual_reports.py:38–44` 实际读取 coverage，保留六份数据。使用删前基线与删后同失败对比，未 stash 并行工作树。
5. 未覆盖的缺口：`test_research_topics.py:1026` 期待快照不存在，实际返回存储不可用，删前已复现，未修。容器导入只验证现有镜像，改后部署与真实产品验收未执行。`backend/pyproject.toml`、`uv.lock` 来历不明，未动；Checklist 失去对象的规则见过程记录，未改。
   DSH 待协调：`maintenance-tools.mjs:386,407,449` 仍请求提案创建/读取/确认；`page-maintenance.mjs:138,140` 仍调用两维护工具；`consumers.mjs:148,205` 仍提示/暴露依赖 Backend 复核的维护。默认复核撤下后 Agent 提案保持拒绝执行，显式刷新不受此影响。
   删前 `research-tools.mjs:43` 的影子路由调用由其他执行线随后撤下；最终 rg 已无该调用，本线未改 DSH。Pi 保留引用及社区负向断言逐处见过程记录。
6. 下一步谁做什么：无执行项，本 Task 关闭。DSH 维护工具已由提示词线删除；Pi 依赖的 Dreaming 链由 Pi 与 Dreaming 退役 Task 删除；R6 备份去留、Topic 测试基线待后续。
