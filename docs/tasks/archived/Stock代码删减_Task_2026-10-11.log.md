# Stock 代码删减过程记录

## 2026-10-11 · codex2 第 1 轮

实施在 `/Users/apple/ts/src/Stock-Research` 主目录；Task 及本过程记录回填到 Vibe。读取了 Task 全文、两仓 AGENTS/README 与逐字共享的 task-protocol、审计 candidates 的 S-01…S-08、归档审计过程记录「Claude 审阅与裁决清单」、Stock Checklist 相关决定及受影响契约。按本会话已应用的 task-driven-dev 工作方式执行。

开工 Stock 已有 `docs/human-checklist.md` 修改，未跟踪的 artifacts、pyproject/uv.lock、四个 R6 杂物与 workspace 内容；随后其他执行线开始修改 company_data、analysis、provider、DSH 等文件。这些并行改动保持原样，没有 stash、重置或提交。没有读取凭据、`.env` 或个人配置；没有调用模型、写入数据库、重建容器或重启工作台。

### 执行结果与边界

- R1：删 21 个候选文件。保留 `jev_gateway.py`、`injection_screen.py` 与 `jev_eval/calibrate_report_quality.py`。移除影子路由注册、报告保存后的语义核对任务与默认 Jev 维护复核。
- `maintenance._server_reviews` 在没有 reviewer 时使用既有 `failed/review_missing` 结果，既有审批门继续返回 `review_incomplete`，不授予执行资格。刷新按钮仍有确定性 `not_required` 分支；没有把“停止 Jev”改成“自动准入”。原默认冻结 URL 测试改为缺少复核不可批准、executor 没有执行，同时保留服务端显示文本断言。
- R2：只删除无外部引用的 `backend/scripts/validate_dreaming.py`；README/Pi README 撤下启动命令，说明产品已停用与遗留依赖。其余按 §7 停止：Pi 代码仍有实际生产调用，且 Task 禁改 Pi 代码。
- R3：删三份连接器、对应两份测试、radar replay 与其 gate 测试。保留社区 envelope、旧卡片/快照读取与 Radar 核心 API 通道。三个契约同步撤下当前浏览器接线、默认社区观察和真实 OpenCLI 验收要求。
- R4：删覆盖生成三脚本、S-07 三脚本、S-08 两脚本。`data/coverage/` 停止删除：它被业务编译和现用年报入库读取，并非只有生成器使用。
- R5：删除整个 `bench/`（123 个受版本管理文件及目录内生成物）、两份对应领域/benchmark 文档；没有发现只为 bench 存在的 Backend 测试。保留市场 benchmark 测试、当前行业 Profile/数据/经营编译及 Document/Evidence 契约。删去 bench Owner、freeze 命令与 whitelist；Document revision/hash、Evidence 几何、历史版本可读等真实运行时约束保留。
- R6：四个未跟踪文件先按原相对路径复制到 `artifacts/root-clutter/`，逐一核对 SHA-256 后删除原件。未动未知来历的 `backend/pyproject.toml`、`backend/uv.lock`。

### §7 停止项与引用位置

Dreaming 保留 `backend/app/services/dreaming.py`、`backend/scripts/dreaming_preflight.py`、`pi/stock-research-wiki/run-dreaming.sh`、`backend/tests/wiki/test_dreaming_retired_types.py`，以及 wiki/research_topics/settings 中的依赖。

| 保留链中的位置 | 实际依赖 |
|---|---|
| `pi/stock-research-wiki/run-dreaming.sh:5` | `exec run.sh --dreaming` |
| `pi/stock-research-wiki/run.sh:11,30–31` | usage 与 `--dreaming` 分支 |
| 同文件 `135–136,163–169` | 会话目录及独立 token 模式；未读取 token 值 |
| 同文件 `192,206–207` | 调用预检脚本及 scan/present/decide 工具、纪律文件 |
| `pi/stock-research-wiki/stock-research-wiki/index.ts:365–368` | dreaming headers |
| 同文件 `1841,1848–1849` | `stock_scan_dreaming` 调 `/wiki/dreaming/scan` |
| 同文件 `1857,1868–1871` | present 工具调 `/wiki/dreaming/present` |
| 同文件 `1885,1899–1902` | decide 工具调 `/wiki/dreaming/decide` |
| `pi/stock-research-wiki/tests/runtime.test.mjs:72–93,123–135,221–228` | 仍验证包装器、预检、白名单与纪律文件；未改 Pi 测试 |
| `backend/app/api/v1/wiki.py:35,421–426,1169,2516–2573` | import、鉴权、Topic 投影、三条路由 |
| `backend/app/services/research_topics.py:325–338,981` | Dreaming Topic 投影 |
| `backend/app/settings.py:35,52–53,67,106–107` | 历史工作区布局与默认根 |
| `docker-compose.yml:69,110` | Dreaming 历史卷配置，保持不变 |

coverage 保留全部六份数据及读取代码：

- `backend/wiki/business_compiler.py:46,49,69–74` 读 active 指针、L1 与历史 page seed。
- `backend/app/settings.py:213–215` 拥有指针路径。
- `backend/scripts/ingest_priority_annual_reports.py:38–44` 读 active 与 first_wave/priority。
- 生产调用向上经过 `backend/app/services/wiki_refresh.py:99,575`、`wiki_publish.py:479`、`backend/app/api/v1/wiki.py:2012`、`maintenance.py:163`。没有为删除数据添加替代值或兼容层。

### DSH 引用交接（本线未修改）

| 位置 | 影响与交接 |
|---|---|
| 删前 `dsh/src/research-tools.mjs:43` | fire-and-forget POST 影子 `trigger-judgements`；保存的删前/即时删后检索有该调用。其他执行线随后删除它，最终 rg 无该路由或 shadow helper。不是本线修改。 |
| `dsh/src/maintenance-tools.mjs:386` | POST `/wiki/maintenance-proposals`；路由保留，但默认 Agent 复核缺失、不可执行 |
| 同文件 `407` | GET 提案；继续返回真实失败/不可执行状态 |
| 同文件 `449` | POST confirm；既有 `review_incomplete` 拒绝批准 |
| `dsh/src/page-maintenance.mjs:138,140` | 仍调用 `propose_maintenance`、`review_maintenance` |
| `dsh/src/consumers.mjs:148,205` | 仍要求 Backend review、暴露两工具；由 Claude 协调是否撤下/修订 |

上述维护路由没有被删除；它们列在这里是因为 Jev 拆除改变其可执行条件。Backend 不增加另一套自动判断，不放宽审批。DSH prompt/tools 的产品收口由 Claude 执行，不属于本线。

### 删前/删后 rg

每个机械删除包前后各运行一次 `rg -n`；同步引用、文档完成后又做最终复核。原始结果在 `/private/tmp/stock-prune-20261011/{before,after,final}-R*.txt`，只含源码/文档路径与引用行。生成的机械删除辅助脚本也在该临时目录，未进入仓库。

共同搜索根（从 Stock 主目录）：

```text
backend dsh/src pi scripts .github backend/Dockerfile docker-compose.yml
docs README.md AGENTS.md data/README.md .gitignore .dockerignore
```

各 R 的搜索表达式：

```text
R1: maintenance_jev|maintenance_review|citation_semantic_check|memory_trigger|trigger-judgements|jev_eval/
R2: dreaming|run-dreaming
R3: connectors[./]|community_runtime|opencli_xueqiu|replay_radar_600900
R4: coverage_active_path|data/coverage|coverage/active|build_coverage_universe|build_first_wave|build_priority_queue|replay_market_600900|smoke_eastmoney_external_search|smoke_l1_company_page|flatten_document_storage_keys|backfill_manifest_artifact_hashes
R5: bench/|from bench|import bench|annotation-guideline|benchmark\.md|freeze_release
R6: industry_wiki_41_drafts\.zip|m3-refactor-home\.png|bench_wiki_reads|compare_related_sql
```

| R | 候选文件删除前命中 | 即时删除后 | 最终 | 解释 |
|---|---:|---:|---:|---|
| R1 | 32 | 2 | 1 | 最终仅保留 S-04 的 calibrate 脚本自身命令；影子 DSH 调用由其他线撤下 |
| R2 | 90 | 87 | 80 | 停止项的真实引用保留，README 的启用说明撤下 |
| R3 | 16 | 4 | 3 | Pi 两条 `doesNotMatch` 负向断言及 bootstrap“不加载 connectors”说明，无实际调用 |
| R4 | 17 | 16 | 14 | coverage 停止项、同名 PostgresStore 方法与其测试；不是已删脚本的调用 |
| R5 | 96 | 76 | 2 | Checklist 127 的既有规则与 block_replay“不 import bench”说明；均非运行时读取 |
| R6 | 0 | 0 | 0 | 无引用 |

初次人工检索已记录 R1 原生产调用 `maintenance.py:229`、`wiki.py:2259`、`api/v1/__init__.py:4,20`；机械包前 rg 的 32 命中是撤除这些显式授权调用之后、实际文件删除之前。

另对全部被删 bench 顶层 Python 模块名做 bare import / 引号动态模块名检索（`from/import <模块>`、`"<模块>[.py]"`），在共同运行时根中 0 命中；对运行时 `\bbench\b`、配置名与 `workspace/research/industry-profiles/*.json` 的 bench 路径做补查，只有“不 import”说明。CLI/CI/镜像没有残留启动命令。

### S-08 真实只读核对

两迁移脚本都会调用 `_load_root_env()`，因此没有运行它们的 dry-run，也没有读取 `.env`。用现有容器的本地数据库角色执行等价只读计数，不索取或打印密码：

```bash
docker exec stock-research-postgres psql -U stock_research_migrate -d stock_research -X -A -t -c "BEGIN READ ONLY; SELECT count(*) FROM document_artifacts WHERE storage_key LIKE 'documents/%'; ROLLBACK;"
docker exec stock-research-backend python -c "from pathlib import Path; p=Path('/var/lib/stock-research/workspace/documents'); nested=p/'documents'; print({'root_exists': p.is_dir(), 'nested_document_dirs': sum(x.is_dir() for x in nested.iterdir()) if nested.is_dir() else 0})"
```

输出：数据库事务 `BEGIN / 0 / ROLLBACK`；文档根存在、嵌套目录数量 0。只读取元数据计数与目录层级；不读取文档内容、不修改数据库、没有执行迁移。按 Task 的文档卷扁平条件删除 S-08；没有声称重新回填或重新核对所有 artifact 内容哈希。

### 测试与门禁

删前基线（未进行本线修改时）：

```bash
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m pytest backend/tests/wiki backend/tests/test_maintenance.py backend/tests/test_research_topics.py backend/tests/test_settings.py backend/tests/test_radar*.py backend/tests/test_wiki_reports.py -q -p no:cacheprovider
```

结果 `1 failed, 376 passed, 7 skipped`。失败仅 `test_wiki_tracking_http_upsert_and_cas`（`backend/tests/test_research_topics.py:1026`）：测试期望 `provider_snapshot_not_found_or_ambiguous`，环境实际返回 `provider_snapshot_unavailable` / 取数快照存储不可用。没有修测试、切换 store、配置数据库或补环境值。

删后检查（额外覆盖保留的注入筛查 HTTP、gateway 间接路径和通用记忆）：

```bash
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m pytest backend/tests/wiki backend/tests/test_maintenance.py backend/tests/test_research_topics.py backend/tests/test_settings.py backend/tests/test_radar*.py backend/tests/test_wiki_reports.py backend/tests/test_injection_screen.py backend/tests/test_injection_screen_http.py backend/tests/test_research_memory.py -q -p no:cacheprovider
```

结果 `1 failed, 392 passed, 7 skipped`；唯一失败与删前完全相同，没有新回归。一次中间命令误列不存在的 `test_jev_gateway.py`，pytest 未运行并返回 file-not-found；随后改用实际存在、测试 gateway 的注入筛查文件，以上为最终有效结果。Starlette/httpx 弃用警告未处理。

未使用 §7 的 `git stash`：删前已有完整基线并复现同一失败，且共享主目录同时有 codex1/Claude 的未提交及已暂存改动。以真实删前/后同失败完成基线对比，避免 stash 波及并行工作。

```bash
docker exec stock-research-backend python -c "import app.main"
PYTHONPATH=backend PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -c "from app.main import app; paths=app.openapi()['paths']; assert '/api/v1/wiki/research-memory/trigger-judgements' not in paths; assert '/api/v1/wiki/reports' in paths; assert '/api/v1/wiki/research-memory' in paths; print('working-tree import/schema: retired shadow route absent; reports and general memory retained')"
node scripts/verify-protocol.mjs
git diff --check
```

容器导入 exit 0（只验证已部署旧镜像；没有重建或复制工作树进容器）。工作树导入与 schema 三断言 exit 0。两仓分别跑 `verify-protocol`，均 `ok`，协议 `cmp` 一致；两仓 diff-check 均通过。第一次 Stock diff-check 报本线删节后的 EOF 多空行，已移除并重跑通过。

证据等级：pytest 为测试替身/临时目录 HTTP 行为与现有运行时模块；S-08 为真实容器/元数据只读；路由 schema 为工作树机械检查；容器 import 为现有镜像 smoke。没有改后部署、真实模型、对话或关注页验收，不把这些检查当作产品完成。

### 删除统计与文件分组

指定候选的行数单独统计，不把 JSON 快照当作代码行数，不包含必要引用/文档修改：

| R | 删除文件 | 文本行 | 备注 |
|---|---:|---:|---|
| R1 | 21 | 4,088 | 六份服务/路由、四份测试、jev_eval 十一份脚本/测试 |
| R2 | 1 | 243 | validate_dreaming；其余候选保留 |
| R3 | 7 | 1,051 | 三连接器、两测试、radar replay 与 gate |
| R4 | 8 | 1,519 | 三覆盖生成、三真跑、两迁移脚本；六份 coverage 不删 |
| R5 | 125 | 239,050 | bench 123 文件与两份文档 |
| R6 | 4 | 225 | 两脚本文本行；zip/PNG 两份二进制不计行 |

R5 拆分：`bench/code/` 35 文件 9,367 行；`bench/config/` 10 文件 40,937 行；`bench/data/` 76 文件 187,676 行；release 1 文件 125 行；bench README 125 行；两份 docs 共 820 行。指定候选代码/测试合计 16,493 行；其余主要为配置、快照与文档。

本线可归属的受版本管理 diff（仅候选和以下修改路径，以 `git diff HEAD --numstat -- <这些路径>` 核对）：182 文件，新增 55 行、删除 246,136 行，净减少 246,081 行；不计其他执行线的 company_data、analysis、DSH 和 Checklist 改动。R6 的 225 文本行及二进制是未跟踪文件，另计。

修改的 20 个文件：

```text
backend/app/api/v1/__init__.py
backend/app/api/v1/wiki.py
backend/app/services/maintenance.py
backend/tests/test_maintenance.py
README.md
AGENTS.md
.gitignore
.dockerignore
data/README.md
docs/architecture.md
docs/bitter-lessons.md
docs/company-radar-contract.md
docs/deterministic-extraction-pipeline.md
docs/document-evidence-contract.md
docs/market-intelligence-system-plan.md
docs/provider-source-map.md
docs/research-audit-tasks.md
docs/standard.md
docs/tasks/pi-research-maintenance.md
pi/stock-research-wiki/README.md
```

R1 删除名称：`services/{maintenance_jev,citation_semantic_check,maintenance_review,memory_trigger,memory_trigger_rules}.py`、`api/v1/memory_trigger.py`；`tests/test_{maintenance_jev,maintenance_review,citation_semantic_check,memory_trigger}.py`；`scripts/jev_eval/{evaluate,evaluate_r2,evaluate_r3,evaluate_r4,replay_citation_semantic,session_candidates,trigger_log_report,test_evaluate,test_evaluate_r2,test_evaluate_r3,test_evaluate_r4}.py`（上述相对 backend）。其他删除路径与 Task §3 完全一致，例外已列出。

### R6 备份核对

备份根 `/Users/apple/ts/src/Stock-Research/artifacts/root-clutter/`；下列相对路径与原件一致，复制后摘要相等才删除原件：

| 路径 | 字节 | SHA-256 |
|---|---:|---|
| `industry_wiki_41_drafts.zip` | 172,860 | `cb6a6bbe8880b3ec1021d9ba9d7012061f6cfec6c19e8974c70e456bd2d8d55a` |
| `m3-refactor-home.png` | 71,734 | `b3cc7e27903e189e1492d7c8923e056f63e03fc5b7ee5910091bbe44bd66ba2a` |
| `scripts/bench_wiki_reads.py` | 5,842 | `3481cba420f5f444d1fcc056675a090d2d09bc595b43cd13342d29bccfd0be8c` |
| `scripts/compare_related_sql.py` | 2,811 | `06eaaf47e7209f47bedd893dc3674870afd5938aa98ba67dc4dfd27e5605d5b9` |

### Checklist 待 Claude 裁决（未改）

`docs/human-checklist.md`「行业 profile 与确定性抽取」105–119 的下列规则因 bench 退役失去当前执行对象：人工 v1.2 active golden 分母与 Entity/Relation 计分；10 家 universe/seed/revision/source-map/source-only golden 冻结；逐家公司 recall/precision/negative 与 Mention 指标门；同批 release/evaluator 不变与 exposed regression/重抽样；global + thin industry compiler/Gazetteer 编译配置；selection policy/候选排序、替补与 manifest 冻结。行业 Profile 资产、证据准入及“资料不等于事实”仍有实际 Owner，不推定整章失效。

另 `docs/human-checklist.md:127` 的 annotation-guideline/standard 类型权威与 discovery seed 规则仍指向已退役规范；这是已有未提交 Checklist 的人类决定，本线只记录，不自行转移 Owner。Claude 应连同上述规则明确删除、改写或重新归属。

### 交接与停止

Claude 审阅范围、协调 Pi 与 DSH 依赖及 Checklist；确认是否另立 coverage 删除范围，不能在本轮顺手切断业务编译。用户自行重建部署后验证 Backend 正常启动、对话、关注、维护与 Wiki；现有容器的成功导入不替代这些验收。未知 pyproject/uv.lock 交由其原执行线说明来历。R6 备份由用户确认后再清。

codex2 本轮停止，等待 Claude 审阅；未提交、未 push、未重建、未重启。

## 2026-10-11 · Claude 审阅

- 复跑：两仓 verify-protocol、git diff --check、`import app.main` 通过；`test_maintenance.py`、`tests/wiki`、`test_research_topics.py` 281 通过、7 跳过，唯一失败 `test_wiki_tracking_http_upsert_and_cas` 删前已有。
- coverage 保留判断正确（Claude 先前以为只被生成脚本使用，有误）；Dreaming 与 Pi 依赖链转入 [Pi 与 Dreaming 退役](Pi与Dreaming退役_Task_2026-10-11.md)。
- DSH 维护提案工具：用户同意撤下，Claude 在提示词与过滤修订线删除 `maintenance-tools.mjs`、`page-maintenance.mjs` 及接线；后端提案路由留待 T8。
- Checklist：用户同意删除「行业 profile 与确定性抽取」中 bench 时代 11 条（pooled corpus 开发单位、golden 计分、盲测冻结、逐家门槛、Mention 指标、同批重跑、compiler 配置与 Teacher、131 个 SW2 研报抽样与排序替补重过门 4 条），保留「抽取主线不因 Gazetteer 阻塞」「全市场按通用抽取→行业增强」；「事实关系层」类型归属改为只归 standard，删 discovery seed 一句。原文见 Git 历史。
