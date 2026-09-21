# 启动与检查

- `scripts/init`：初始化产品数据目录与配置；不读写用户全局 CLI 配置。
- `scripts/doctor`：检查 Node、Python、取数依赖、注册表、目录权限与凭据隔离。
- `scripts/start`：启动本机数据服务与 Vite；Vite 接缝管理 DSH 工作台进程。
- Windows 使用对应的 `start.ps1`、`init.ps1`、`doctor.ps1`。
- `scripts/gen_catalog.py`：由 `datasources/registry.json` 重新生成 `datasources/CATALOG.md`（改注册表后重跑）。
- `scripts/health.py`：按注册表逐端点实跑取数脚本，汇总可达性与失败原因（开发体检，不作为研究证据）。

开发环境需要 Node 22.18+，并安装 orchestrator、desktop 与 DSH 的依赖。
模型接入与会话执行由 DSH 管理，不再由旧 Codex SDK 状态机启动。
