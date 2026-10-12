# Pi 运行时与 Dreaming 退役（删减第三批）

状态：2026-10-11 Claude 写定，用户同意 Pi 运行时整体退役、Dreaming 剩余代码删净。只删除与随之必须的引用、契约、文档修改；不提交、不 push、不重建容器、不重启工作台。
实施仓库：Stock-Research。

权威：[Stock 代码删减](Stock代码删减_Task_2026-10-11.md) §9 与过程记录（Pi 对 Dreaming 的依赖链与保留清单）；Vibe AGENTS「DSH 原生运行时」；Stock Checklist「Dreaming 整体停用」；全局原则「Less is More」「不做兼容性开发」。

## 1. 目标

1. 删除 `pi/stock-research-wiki/` 整个 Pi 运行时包，以及只为它存在的测试、配置与文档。
2. 删除 Dreaming 剩余代码（服务、路由、预检、包装器、Topic 投影、设置、测试）；历史数据文件留在磁盘，不再有代码读取。

## 2. 现状（Claude 核实，2026-10-11）

- 产品研究只走 DSH（Vibe AGENTS）；`pi/` 共 38 个受版本管理文件、约 6,700 行，`run.sh:192,206` 与扩展 `index.ts:1848,1868,1899` 是 Dreaming 的仅有调用方。
- Pi 之外引用 Pi 的：`backend/tests/wiki/test_pi_package.py`、`test_analysis_skills.py`、`test_gbrain_adapter.py`、`.env.example:64`、README、`backend/wiki/README.md`、`docs/tasks/pi-research-maintenance.md`、`docs/research-audit-tasks.md`。
- `backend/wiki/gbrain_adapter.py`、`page_diff.py` 中的 `.stock-research-wiki` 是 Wiki 数据目录与 Git 作者名，不是 Pi，不改。
- Dreaming 剩余：`app/services/dreaming.py`、`scripts/dreaming_preflight.py`、`tests/wiki/test_dreaming_retired_types.py`、`api/v1/wiki.py` 路由、`research_topics.py:325–338,981` 投影、`settings.py`、`docker-compose.yml:69,110` 卷配置；`scripts/validate_topic_archive.py` 也提到 Dreaming（属 S-06，T7.2 后再定）。

## 3. 冻结决定

R1. **Pi**：删除整个 `pi/`；删除只测 Pi 包的测试（`test_pi_package.py` 整份，另两份测试中只为 Pi 的用例）；`.env.example` 删 Pi 专用变量段；README、`backend/wiki/README.md`、`docs/research-audit-tasks.md` 删 Pi 段落；`docs/tasks/pi-research-maintenance.md` 删除。
R2. **Dreaming**：删除服务、预检脚本、测试、`wiki.py` 中 Dreaming 路由与 import、`research_topics.py` 的 Dreaming 投影、`settings.py` 中 Dreaming 配置、`docker-compose.yml` 的 Dreaming 卷挂载。
  磁盘上的 `workspace/research/dreaming` 与库中历史事件不删、不迁移。Topic 读取遇到旧 Dreaming 来源的记录时按普通历史记录显示或忽略，不报错（以现有测试为准）。
R3. **S-06 交界**：`validate_topic_archive.py` 若 import 已删模块，只删去 Dreaming 相关分支；无法这样做时停该项，不删整份脚本。

## 4. 范围

- 只改 R1–R3 列出的文件及因删除必须同步的引用、测试、契约与文档。
- codex1 仍在改 `backend/app/services/company_data*.py`、`company_packet_extract.py`、`providers/company_statements.py`、`api/v1/company_data.py` 及其测试；Claude 改过 `dsh/`、`backend/app/analysis/`、`calculation_evidence.py`、`source_access.py`。这些都不碰。
- 不改 Checklist（Claude 收尾时处理「Pi 研究运行时与受控发布」一章与 Dreaming 条目）；不改 Vibe 仓库。

## 5. 验收

**执行方自动检查**：
- 删除前后 `rg -i "pi/stock-research-wiki|dreaming|run-dreaming"` 覆盖 `backend`、`dsh/src`、`scripts`、`docker-compose.yml`、README、`docs/`（`docs/tasks/archived`、`artifacts/` 除外），残留逐处回填。
- Backend：`tests/wiki`、`test_research_topics.py`、`test_settings*`、受影响路由测试；`uv run python -c "import app.main"`。基线对比用删前跑一次的结果，不用 `git stash`（主目录有其他执行线的未提交改动）。
- `docker compose config` 能解析；两仓 `verify-protocol`、`git diff --check`；删除行数按 R 项统计。

**用户验收（统一重建后）**：Backend 正常启动；Topic 列表与详情正常。

## 6. Out of Scope

- S-04 报告运行时、S-06 校验脚本整份去留；维护提案后端（T8）；Wiki 数据目录命名；任何新功能。

## 7. Stop Conditions

停止范围：只停对应子项，写进交接后继续其余工作。

- 生产代码（含 DSH、Vibe orchestrator）仍有对 Pi 或 Dreaming 的运行时引用：保留该项，回填位置。
- 删除 Topic 投影导致现有 Topic 读取测试失败且不是删前已有失败：停 R2 的该部分，回填。
- 需要删除或迁移磁盘数据、数据库记录：停下。
- 需要改范围外文件（含其他执行线的文件）：停该项。

## 8. 回滚

`git checkout -- <路径>` 恢复受版本管理文件；本 Task 不动数据。

## 9. 当前交接

1. 状态与结论：2026-10-12 Claude 审阅通过，用户重建后验收通过，已提交。codex2 完成 R1–R3。Pi 目录与 Dreaming 运行链已撤下；历史数据不删、不迁移，Backend 不再读取 Dreaming 事件。未提交、未 push、未重建或重启；未改 Checklist、codex1 或 Claude 指定文件。
2. 改动文件：Stock 本轮 59 个受版本管理文件（43 删除、16 修改），含 Pi 38 文件、两份 Pi 专属文件、Dreaming 三份文件及必要配置/测试/文档。R3 只删 `validate_topic_archive.py` 的五行 Dreaming 断言。完整分组见过程记录。
3. 证据：同集合 pytest 删前 270 通过/7 跳过/1 失败，删后 264 通过/7 跳过/同一失败；扩展关联路由集合 274 通过/7 跳过/2 个已复现旧失败。新增五个退役边界用例通过。工作树导入、路由检查、S-06 脚本、Compose 模板解析、两仓门禁与 diff 检查通过。
   每 R 前后 rg 已完成；生产代码无 Pi/Dreaming 调用。按本轮快照统计删除行：R1 7,856，R2 1,069，R3 5；含配置和文档，共删 8,930、增 82，净减 8,848 行。
4. 与规格的偏差及理由：`test_gbrain_adapter.py` 当前已无 Pi 启动用例，未改。S-06 无直接 import，但有投影调用，依 R3 删除该分支。`uv run --no-sync` 保持现有依赖；Compose 以 `.env.example` 解析，不读取真实凭据。历史经验文档按自动审批拒绝意见保留。
5. 未覆盖的缺口：Topic 快照测试返回存储不可用；关联路由测试缺 GBrain 根，删前源码隔离复现同错。未修范围外环境、未部署或做真实 Topic 验收。Checklist、历史文档和负向测试的残留逐处见过程记录；普通草案保留，候选身份草案明确拒绝，不再读事件授权。
   DSH `my-research-tools.mjs:149` 仍传可选候选身份字段，普通请求不带值不受影响；带值返回 422。未改 DSH，由 Claude 协调。自动审批拒绝删除 `bitter-lessons.md` 中历史经验，补丁未应用。
6. 下一步谁做什么：无执行项，本 Task 关闭。DSH 候选字段与 Checklist 已由 Claude 收尾；S-04、S-06 留 T7.2 后再定。
