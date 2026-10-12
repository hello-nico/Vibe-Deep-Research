# Pi 与 Dreaming 退役过程记录

## 2026-10-11 · codex2 实施 R1–R3

完成回填时间：2026-10-11 10:01 +08:00 后。实施目录为 Stock 主目录；Vibe 只改本 Task §9 与本过程记录。

### 开工依据与边界

- 完整读取本 Task、Stock README/AGENTS、两仓协议，以及前批 Stock 删减交接与 Claude 审阅尾部；核对 Wiki 契约、相关来源代码和测试。
- 本轮使用 task-driven-dev 的 Task/交接流程。以本 Task 的 Pi 整体退役授权为准，前批因 Pi 调用而保留的 Dreaming 链本轮解除。
- 原工作树包含前批删减、codex1 company_data 工作及 Claude DSH/analysis 工作。本轮不做 stash、checkout、reset，不提交或 push，不启动、重建或重启任何服务。
- 未编辑两仓 Checklist；未改 `dsh/`、`backend/app/analysis/`、`calculation_evidence.py`、`source_access.py` 或 company_data 指定组。只删除 wiki.py 对 `source_role_for` 的已无用途 import，不改该函数的 Owner 文件。
- 不读取真实 `.env`、认证文件或个人配置；只有公开 `.env.example` 参与配置修改/验证。磁盘 Dreaming 历史与数据库记录没有读取、删除或迁移操作。
- 源码快照与机械证据放 `/private/tmp/pi-dreaming-retirement/`，临时生成补丁工具为 `/private/tmp/pi-dreaming-edit.py`；不是新的产品配置或代码。统计从本轮开工文件快照计算，不从 dirty HEAD diff 猜测本轮归属。

### R1 · Pi

1. 删除前检索覆盖 backend、dsh/src、scripts、Compose、README、docs（排除归档与运行缓存）；另检索分段路径 `"pi" / "stock-research-wiki"`、`STOCK_RESEARCH_PI*`、`default_session_dir` 与 Wiki 数据目录名称，防止字面目录检索漏掉动态拼接。
2. Vibe `orchestrator/` 与 `desktop/` 只读检索没有生产 Pi/Dreaming 依赖；Stock DSH 没有 Dreaming 路由或 Pi launcher 调用。R1 不触发 §7 生产调用停止条件。
3. 删除 `pi/stock-research-wiki/` 的全部 38 文件：launcher、extension、合同辅助模块、包配置、提示词、两份技能、样例、eval 及七份 Node 测试。目录现场为 38 文件、10 目录，无额外 session 文件；仅在文件删除后移除空目录。
4. 删除 `backend/tests/wiki/test_pi_package.py` 和 `docs/tasks/pi-research-maintenance.md`。`test_analysis_skills.py` 删除三个 Pi loader/recipe/eval 用例及 json import；保留运行时中立的十二项分析正文结构检查。
5. `test_gbrain_adapter.py` 当前没有 Pi launcher 用例，只有 `.stock-research-wiki` 数据目录与 owner 标识验证，原样保留；`gbrain_adapter.py`、`page_diff.py` 原样保留。
6. `.env.example` 删宿主 Pi 变量和专属说明。settings 中 `sessions / STOCK_RESEARCH_PI_SESSION_DIR / default_session_dir` 只有 Pi 使用，删除这些配置代码，不删除磁盘 session 历史。
7. README 撤下 Pi 启动章节、启动命令、模块/目录映射和专属行为承诺；Wiki 手册删除已失去对象的 Pi Consumer、技能与预编译说明，保留 Backend 的草案验证/显式授权发布契约。
8. `research-audit-tasks.md` 删除只实施 Pi 的 §6 维护交接及其验证命令；TODO 同步撤下 Pi Consumer 名称，不新增任务或功能。

### R2 · Dreaming

1. 删除服务 `backend/app/services/dreaming.py`、预检 `backend/scripts/dreaming_preflight.py`、专属测试 `backend/tests/wiki/test_dreaming_retired_types.py`。Pi `run-dreaming.sh` 已计入 R1，未重复计数。
2. wiki.py 删除 Dreaming import、三种请求模型、token 检查、scan packet/ref/subject 辅助代码、`/dreaming/{scan,present,decide}` 三条路由。
3. 除 Task 显列路由外，页面草案验证和发布也曾读取 `DreamEventStore().index()`。本轮移除这两处事件读取；带候选身份的新输入及旧候选 token 明确拒绝（422），防止删除授权检查后意外把原候选直接发布。无候选身份的普通草案、重试、Topic 关联和显式 host 发布仍走原路径。
4. 现有临时草案的候选身份字段/校验摘要格式未扩展或迁移；它们仅承接拒绝旧候选的边界，不再读取 Dreaming 授权事件。`PageDraftStore` 普通草案行为不改。AST 对比开工快照确认 wiki.py 保留下来的定义中，仅 `validate_page_draft` 与 `_publish_page_draft_unlocked` 改变。
5. research_topics.py 删除 `dreaming_topics` 与 `_dreaming_view`；Topic 正常 list/get/archive/restore/update 路径不改，仍由现有历史读取和归档测试验证。未给历史 Topic 加迁移或来源识别分支。
6. settings.py 删 Dreaming 根配置/辅助函数；Compose 和公开模板删根、token 配置及 Dreaming 挂载。没有删除本地历史目录或数据库数据，部署后 Backend 不再挂载或读取 Dreaming 事件。
7. README、Wiki 手册、architecture、glossary、standard、plan 对应当前执行章节、research-audit-tasks、TODO 撤下已不存在的运行时和延期任务承诺。没有把旧 Pi 能力机械归给 DSH；当前 DSH 行为仍以原组合包契约为准。
8. 增加五个退役边界用例：只有 fingerprint、只有 input hash、完整候选身份均拒绝创建草案；带候选身份的旧 token 拒绝发布且文件保留；OpenAPI 中无 Dreaming 路由。

### R3 · S-06 交界

`validate_topic_archive.py` 未直接 import Dreaming，但 `_validate_tracking_correction` 最后五行调用 `pool.dreaming_topics()` 并断言投影结果。仅删除这五行；原基线纠正、旧基线不可改、修正跟踪项、归档/恢复/CAS/并发检查全部保留。没有删除整份脚本。

### 每项前后 rg

Stock 主目录命令：

```sh
rg -n -i 'pi/stock-research-wiki|dreaming|run-dreaming' \
  backend dsh/src scripts docker-compose.yml README.md docs .env.example \
  --glob '!**/tasks/archived/**' --glob '!**/.venv/**' --glob '!**/__pycache__/**'
```

补充：

```sh
rg -n -i 'pi/stock-research-wiki|dreaming|run-dreaming|STOCK_RESEARCH_PI|default_session_dir' \
  backend/app dsh/src scripts docker-compose.yml .env.example
rg -n 'default_session|\.sessions|PI_SESSION|STOCK_RESEARCH_PI|stock-research-wiki|\bpi\b' \
  backend/app backend/tests scripts docs backend/wiki .env.example docker-compose.yml .github \
  --glob '!**/tasks/archived/**' --glob '!**/__pycache__/**'
```

Vibe 只读补查（排除安装包/构建/runtime）：

```sh
rg -n -i 'pi/stock-research-wiki|dreaming|run-dreaming' orchestrator desktop \
  --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/runtime/**'
```

| R 项 | 删除前全范围命中 | 删除后全范围命中 | 生产依赖结论 |
|---|---:|---:|---|
| R1 | 117 | 99 | Pi 的拼接引用/专属设置已删除；其余为下一项 Dreaming 或文档 |
| R2 | 99 | 13 | Dreaming 生产服务/路由/事件读取归零；其中两条为 R3 脚本 |
| R3 | 13 | 11 | 脚本调用归零，剩余均为下表保留项 |

原始捕获：临时证据目录中的 `R1-before-rg.txt`、`R1-after-rg.txt`、`R2-before-rg.txt`、`R2-after-rg.txt`、`R3-before-rg.txt`、`R3-after-rg.txt`。捕获不含真实凭据、配置或会话。

最终残留逐处：

| 位置 | 内容与处理 |
|---|---|
| `docs/human-checklist.md:20` | 已确认 Dreaming 停用；按用户纪律未改 |
| 同文件 `124` | 旧 Pi bounded-source 规则和已删除契约指针，由 Claude 收尾 |
| 同文件 `125` | 旧 Pi `--write` 收尾规则，由 Claude 收尾 |
| 同文件 `127` | 旧 Dreaming 历史回放/清理落点，由 Claude 收尾 |
| `docs/bitter-lessons.md:42` | 旧 Task 8 候选扫描参考经验，保留历史文本 |
| 同文件 `43` | 旧 Dreaming 范围门参考，保留历史文本 |
| 同文件 `58` | 旧 Task 8 增量复核参考，保留历史文本 |
| 同文件 `62` | 旧 append-only 事件设计经验，保留，需 Claude 判断历史措辞 |
| `docs/future.md:355` | 非当前实施项的未来讨论；只记录搜索命中，没有展开读取或修改 |
| `backend/wiki/README.md:236` | 既往 Synthesis 存量审计的文件类别，不是当前读取能力 |
| `backend/tests/wiki/test_page_drafts.py:57` | 负向路由不存在断言，无运行时调用 |

此外 `.gitignore:48` 的历史 Dreaming 目录忽略和 `77–78` 的旧 Pi session 忽略保留，避免私有历史被加入版本控制。Wiki `.stock-research-wiki` owner/历史目录及 GBrain 禁用上游 `dream` 命令不是已退役运行时，保留。

DSH 只读发现：`dsh/src/my-research-tools.mjs:149` 仍传 `candidate_fingerprint / candidate_input_hash` 两个可选参数。普通调用是 undefined、JSON 不携带；若有旧调用带值，Backend 返回 422，不再读事件或准许发布。本线按纪律未改 DSH，由 Claude 协调；没有调用 Pi/Dreaming 路由的生产依赖。

### 测试、导入与配置验证

删前、删后相同集合：

```sh
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m pytest \
  backend/tests/wiki backend/tests/test_research_topics.py backend/tests/test_settings.py \
  -q -p no:cacheprovider
```

- 删前：270 passed / 7 skipped / 1 failed，3.69 秒。
- 删后：264 passed / 7 skipped / 1 failed，3.84 秒。
- 移除十一项 Pi/Dreaming 专属测试，增加五项退役边界验证，数量差吻合。唯一失败位置与内容相同：`test_research_topics.py:1026::test_wiki_tracking_http_upsert_and_cas` 期待 `provider_snapshot_not_found_or_ambiguous`，返回 `provider_snapshot_unavailable`。未修范围外环境或快照存储。
- 七项 skip 与删前数量一致，本轮没有恢复这些跳过项的真实运行环境；夹具与 mock 不作为真实部署验收。

加受影响关联回归：

```sh
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m pytest \
  backend/tests/wiki backend/tests/test_research_topics.py backend/tests/test_settings.py \
  backend/tests/test_research_links.py -q -p no:cacheprovider
```

结果：274 passed / 7 skipped / 2 failed，4.00 秒。除上述已有快照失败，`test_research_links.py:213::test_wiki_research_link_http_confirm_and_nbs_catalog` 返回 503，日志为缺 `STOCK_RESEARCH_GBRAIN_ROOT`，拒绝使用用户 brain。

为确定该额外测试失败归属，在 `/private/tmp/pi-dreaming-retirement/baseline-source/` 复制当前 app/wiki Python 源码及该测试/conftest，再用开工快照覆盖 wiki.py、research_topics.py、settings.py、dreaming.py。没有换主目录文件，没有 stash，没有复制 `.env`、依赖或私有数据。执行：

```sh
PYTHONDONTWRITEBYTECODE=1 /Users/apple/ts/src/Stock-Research/backend/.venv/bin/python -m pytest \
  backend/tests/test_research_links.py::test_wiki_research_link_http_confirm_and_nbs_catalog \
  -q -p no:cacheprovider
```

删前隔离源码同样在第 213 行返回 503、同样提示 GBrain 根未配置（1 failed，0.13 秒）；原目录未受影响。该处不归本删除范围，停止其环境修复，不添加个人配置、不降低读校验。

工作树 Backend 导入/路由检查（backend 目录）：

```sh
PYTHONDONTWRITEBYTECODE=1 uv run --no-sync python -c "from app.main import app; assert not any(p.startswith('/api/v1/wiki/dreaming/') for p in app.openapi()['paths']); print('working-tree import and retired-route check passed')"
```

通过，使用已存在 `.venv`；`--no-sync` 避免安装依赖或修改其他执行线的 pyproject/lock。不是现有容器镜像导入结果。

S-06 改后运行：

```sh
PYTHONPATH=backend PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python backend/scripts/validate_topic_archive.py
```

通过：`topic archive validator: PASS`。该脚本所有资料写入自建 TemporaryDirectory，不请求线上 API。

Compose：

```sh
docker compose --env-file .env.example config --quiet
```

通过。使用公开占位模板并静默解析，不读取/打印真实 `.env`。证明 Compose 结构和模板插值可解析，不证明用户实际部署环境或已启动容器应用新配置。

两仓分别执行：

```sh
node scripts/verify-protocol.mjs
git diff --check
```

通过；Task/过程记录回填后两仓再核对一次，仍通过。新建过程记录以 `git diff --no-index --check /dev/null <log>` 额外检查，没有空白错误输出；该命令因文件不同返回 1，区别于普通 `git diff --check` 的通过结果。没有改共享协议或 Checklist 来绕过门禁。

### 本轮统计与改动清单

按开工 → R1 → R2 → R3 分阶段源码快照统计，避免混入前批/并行线的 HEAD 差异；重复修改文件在各 R 可出现，合并后不重复计算文件数。

| R 项 | 改动文件数 | 整份删除 | 删除行 | 新增行 | 净减行 |
|---|---:|---:|---:|---:|---:|
| R1 | 47 | 40 | 7,856 | 25 | 7,831 |
| R2 | 17 | 3 | 1,069 | 57 | 1,012 |
| R3 | 1 | 0 | 5 | 0 | 5 |
| 合计 | 59 个不同文件 | 43 | 8,930 | 82 | 8,848 |

包含文档、配置、测试和代码；Pi 包本身现场为 38 文件、7,341 行，与 Task 的约数不同，按实际快照记录。详细逐文件统计在临时 `stats.json`。

除整个 Pi 目录外，本轮不同改动路径如下（相对 Stock 根）：

```text
.env.example
README.md
TODO.md
docker-compose.yml
backend/app/api/v1/wiki.py
backend/app/services/dreaming.py                         [删除]
backend/app/services/research_topics.py
backend/app/settings.py
backend/scripts/dreaming_preflight.py                    [删除]
backend/scripts/validate_topic_archive.py
backend/tests/wiki/test_analysis_skills.py
backend/tests/wiki/test_dreaming_retired_types.py         [删除]
backend/tests/wiki/test_page_drafts.py
backend/tests/wiki/test_pi_package.py                    [删除]
backend/wiki/README.md
docs/architecture.md
docs/market-intelligence-system-plan.md
docs/research-audit-tasks.md
docs/standard.md
docs/tasks/pi-research-maintenance.md                    [删除]
docs/technical-glossary.md
```

`docs/bitter-lessons.md` 未改变，本轮候选快照包含它但统计没有计入。没有改测试基础设施、真实 Provider、数据卷或任何持久数据库。

### 审批与剩余验收

尝试同步清理 bitter-lessons 的旧 Task 8/Dreaming 设计经验时，自动审批拒绝，原文理由为「该补丁删除了 bitter-lessons 中的历史 Task 8/Dreaming 审计经验并改写历史表述；用户授权的是退役运行时代码及必要引用清理，未授权抹除这类历史记录，保留并列为残留更安全。」补丁未应用，没有通过脚本或其他方式绕过；保留这些历史经验并逐处列进残留，继续完成其余授权事项。

三问：本轮实现的是 Task 已冻结的退役决定，无新架构决定；重复验证的路由撤下/候选拒绝边界已补五项测试；没有新增不变量或修改 Checklist。Claude 审阅并统一处理人类决定章、历史措辞与 DSH 可选参数。两项环境基线失败仍在，本轮没有把测试“全绿”当成完成结论。

用户统一重建后仍需验收 Backend 正常启动、Topic 列表与详情；当前容器和工作台未重启、不会自动加载本轮源码。真实历史 Topic/部署验收未执行，自动检查不能替代。codex2 写完停下，等待 Claude 审阅。

## 2026-10-11 · Claude 审阅

- 复跑：Stock `import app.main`、`git diff --check`、两仓 verify-protocol、Vibe verify-docs 通过；`tests/wiki`、`test_research_topics.py` 等 281 通过、7 跳过，唯一失败 `test_wiki_tracking_http_upsert_and_cas` 删前已有。
- DSH 候选身份字段：Claude 在提示词线删除 `topic-protocol.mjs` 的 `candidateFingerprint`/`candidateInputHash` 参数与校验、`my-research-tools.mjs` 的透传，更新 `my_research` 模型面快照；DSH 247/247。
- `bitter-lessons.md` 是历史经验记录，保留不删，同意执行方处理。
- Checklist：两仓共享章「Pi 保留为开发实验」改为「Pi 运行时已退役」、Dreaming 改为「已退役（历史数据留在磁盘、不再读取）」；Stock 本仓「Pi 研究运行时与受控发布」改名「Wiki 受控发布」，删 Pi 读取、`--write` 回放与 Dreaming 三条，发布条改写为不依赖 Pi 的表述。
