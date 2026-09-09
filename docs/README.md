# docs

- 默认 Agent 与 DSH：[默认Agent与DSH模型配置_M3_2026-09-08.md](默认Agent与DSH模型配置_M3_2026-09-08.md) — 独立 rc.1 runtime、正式双端插件与原生启动重构已实施并提交；用户已确认启动，体验由用户验收。当前架构、文件归属及剩余边界集中在 M3；与旧接入方案冲突的目标以 M3 和 Human Checklist 为准。

- 当前 DSH 技术验证任务：[测试版隔离与DSH研究交互验证_M2_2026-09-08.md](测试版隔离与DSH研究交互验证_M2_2026-09-08.md) — 日常使用 `scripts/setup` / `scripts/start`，阶段性用 App 验收；阶段一基本隔离已验证。首页会话与设置入口由 M3 开发预览承接，见 [阶段一验证记录](M2_阶段一验证记录_2026-09-08.md)。

- [AI接入与执行模式_v1_2026-09-04.md](AI接入与执行模式_v1_2026-09-04.md) — 旧接入设计与实现参考；执行引擎选择、模式开关的目标已被 M3 替代，旧实现尚待迁移。
- [双引擎任务架构_v3_2026-09-04.md](双引擎任务架构_v3_2026-09-04.md) — 内部任务分层与历史实施记录：deterministic / quick / deep；不再代表用户要手动选择三种模式。
- [release-checklist.md](release-checklist.md) — 发布前清单:只能由维护者拍板 / 提供的事项(License、仓库地址、国产模型矩阵真测、模板易变字段核实)与发布时序(审计在 push 之前)。
- [model-access.md](model-access.md) — 模型接入指南：订阅 / API、Agent 开关、直连能力探针、10 项兼容矩阵和 provider 扩展。
- 编排器细节(状态机 / validator / hooks / 配置 / MCP / HTTP API / 批量 / 提醒 / 矩阵):[../orchestrator/README.md](../orchestrator/README.md)
- 数据源端点目录(自动生成):[../datasources/CATALOG.md](../datasources/CATALOG.md)
- 计算库契约:[../calc/SPEC.md](../calc/SPEC.md)
- provider 模板字段与约束:[../providers/README.md](../providers/README.md)
- 二开验收记录沿用本目录现有 M 文档形式（用户决定、行为边界、验证证据、仍未宣称）；约定见 [Human Checklist](../human-checklist.md)。
- 当前界面取舍：[首页与盘面取舍_M1_2026-09-08.md](首页与盘面取舍_M1_2026-09-08.md)
