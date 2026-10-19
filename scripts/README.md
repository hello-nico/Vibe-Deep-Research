# 启动与检查

- `scripts/init`：初始化产品数据目录与配置；不读写用户全局 CLI 配置。
- `scripts/doctor`：检查 Node、本机数据目录、挂载与凭据隔离；`--net` 时复用 Backend 连接测试。
- `scripts/start`：启动前先回收上一轮遗留的本仓库进程（8765 / 5930，默认只杀命令行含本仓库路径者），再启动 Vite。本机数据服务由 DSH 插件挂载，不再单独监听 8765；诊断仍可用 `node orchestrator/src/api.ts`。无法确认归属的占用者报错，`--reclaim-any` 才一并结束。Vite 接缝管理 DSH 工作台进程。
- Windows 使用对应的 `start.ps1`、`init.ps1`、`doctor.ps1`。

开发环境需要 Node 22.18+，并安装 orchestrator、desktop 与 DSH 的依赖。行情、公告与新闻由 Backend 提供，本机不再运行 Python 取数。
模型接入与会话执行由 DSH 管理，不再由旧 Codex SDK 状态机启动。
