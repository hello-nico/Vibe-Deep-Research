# docs

文档按「契约 / 决策 / Task」三类组织。状态由所在目录表示，不另建索引；本文件只说明结构。

| 目录 | 放什么 | 规则 |
|---|---|---|
| [contracts/](contracts/) | 每个模块的契约与[不变量](contracts/invariants.md) | 描述当前实现；产品重构时整体改写 |
| [decisions/proposed/](decisions/proposed/) | 有验证证据、待拍板的提案 | 先证明再设计 |
| [decisions/implemented/](decisions/implemented/) | 已落地、仍需保留「为什么」的决策 | 跟着代码同步更新事实 |
| [tasks/active/](tasks/active/) | 待实施与进行中的 Task | ≤ 200 行；有 Out of Scope 与 Stop Conditions |
| [tasks/archived/](tasks/archived/) | 收尾后的 Task 与历史记录 | 冻结，不作为现行依据 |
| [整体验收规范](整体验收规范.md) | 长期有效的整体测试用例 | 只追加；需求变更才改预期 |
| [开发工作流范式](开发工作流范式.md) | 分工、Task 模板、并行与合并、审阅要点 | — |

人类决策在仓库根的 [human-checklist.md](../human-checklist.md)，顺序与未决事项在 [todo.md](../todo.md)。

检查：`node scripts/verify-docs.mjs`（目录结构、活跃 Task 行数、归档冻结、非归档文档的相对链接）与 `node scripts/verify-invariants.mjs`；CI 中运行。

## 进行中的 Task

- [Jev判断连续性_Task_2026-09-24](tasks/active/Jev判断连续性_Task_2026-09-24.md)
- [整体验收修复_第2轮_Task_2026-09-25](tasks/active/整体验收修复_第2轮_Task_2026-09-25.md)
- [治理对齐修复_Task_2026-09-21](tasks/active/治理对齐修复_Task_2026-09-21.md)
- [深度对话提示词与文案收敛_Task_2026-09-23](tasks/active/深度对话提示词与文案收敛_Task_2026-09-23.md)
- [真实阅读与数据引用优化_Task_2026-09-21](tasks/active/真实阅读与数据引用优化_Task_2026-09-21.md)
- [研究草案版本冲突_Task_2026-09-26](tasks/active/研究草案版本冲突_Task_2026-09-26.md)
- [记忆触发影子模式_Task_2026-09-26](tasks/active/记忆触发影子模式_Task_2026-09-26.md)
