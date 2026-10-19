# 本机数据服务

当前模块提供 Client SQLite、产品启动接缝与本机 HTTP 入口。
DSH 拥有会话和模型执行，Stock Backend 拥有资料、Wiki、Topic、记录、成果、关联，以及页面所需的行情、公告与新闻。

- HTTP 入口：`src/api.ts`，所有请求使用 Bearer 鉴权。
- 数据服务：`src/service.ts`（路径与错误语义）；Client 选择与偏好：`src/client_store.ts`。
- 开发启动：`../scripts/start`；DSH 接缝位于 `../desktop/dsh/`。

旧六阶段状态机、独立对话运行时、报告库、研究启动接口、MCP 入口、用户台账与观测序列、macOS 打包入口、本机 Python 取数链已退役；产品只给 DSH 使用，不提供 MCP 接入。

验证：`npm run typecheck`、`npm test`。

[退役 Task](../docs/tasks/archived/旧系统退役_Task_2026-09-15.md) · [项目入口](../README.md)
