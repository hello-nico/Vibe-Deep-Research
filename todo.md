# Todo

- 提交前回归基线清理（2026-09-10）：`desktop/test/ai_surface.test.ts`、`analysis_session.test.ts`、`daily_review_context.test.ts`、`lazy_routes.test.ts` 各有一项失败；在本轮修改前 HEAD 的独立快照复现。分别涉及旧侧栏断言、模型调用 mock、刷新请求计数、路由清单，需按现有合同核对，不能直接删除断言。M6 当前全量 94/98 通过，类型检查与构建通过。
