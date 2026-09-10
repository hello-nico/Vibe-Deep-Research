# Todo

- 研究 Link 与行业入口（2026-09-10）：申万 Profile 作为 Theme Wiki 基础，板块中心改为 41 个 Industry Wiki 入口。核对 Profile 内容与来源如何复用、对象身份与 Link 如何衔接；后续按真实研究问题设计跨核心/非核心对象的遍历与相关材料选择，明确循环处理、相关性、深度与读取预算，避免默认全图展开。核心硬关系不在界面暴露；本项尚未实施。

- 我的研究与 Topic 调整（2026-09-10）：产品决定见 [Human Checklist](human-checklist.md#我的研究行业议题与主动积累2026-09-10当日讨论汇总)。[M7](docs/研究契约与主动积累_Task_M7_2026-09-10.md) 已更新为正式待审稿，纳入审计整改、硬关系积累断点和公司 Wiki 扶摇财务/估值内容（不强制文档 Evidence）；[M8](docs/我的研究与行业入口_Task_M8_2026-09-10.md) 承接产品闭环，均未实施。随 M7 评审角色能力矩阵、Note 关联存储、Topic/Session 绑定、发布权限与历史 Topic 保留方案；旧专题独有能力及行业正文接入继续按 Task 核对。

- 提交前回归基线清理（2026-09-10）：`desktop/test/ai_surface.test.ts`、`analysis_session.test.ts`、`daily_review_context.test.ts`、`lazy_routes.test.ts` 各有一项失败；在本轮修改前 HEAD 的独立快照复现。分别涉及旧侧栏断言、模型调用 mock、刷新请求计数、路由清单，需按现有合同核对，不能直接删除断言。M6 当前全量 94/98 通过，类型检查与构建通过。
