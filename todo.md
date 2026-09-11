# Todo

- 研究 Link 与行业入口（2026-09-10）：申万 Profile 作为 Theme Wiki 基础，板块中心改为 41 个 Industry Wiki 入口。核对 Profile 内容与来源如何复用、对象身份与 Link 如何衔接；后续按真实研究问题设计跨核心/非核心对象的遍历与相关材料选择，明确循环处理、相关性、深度与读取预算，避免默认全图展开。核心硬关系不在界面暴露；本项尚未实施。

- 我的研究与 Topic 调整（2026-09-11 校准）：[M7](docs/研究契约与主动积累_Task_M7_2026-09-10.md) 第一包硬关系（词表、宿主 finalize、metric + 有界 subsidiary_of 回放）已实现，待真实验收；Topic/Session、Note 关联与主动草案发布仍未做。[M8](docs/我的研究与行业入口_Task_M8_2026-09-10.md) 待 M7 交接后开始。

- 提交前回归基线清理（2026-09-10）：`desktop/test/ai_surface.test.ts`、`analysis_session.test.ts`、`daily_review_context.test.ts`、`lazy_routes.test.ts` 各有一项失败；在本轮修改前 HEAD 的独立快照复现。分别涉及旧侧栏断言、模型调用 mock、刷新请求计数、路由清单，需按现有合同核对，不能直接删除断言。M6 当前全量 94/98 通过，类型检查与构建通过。
