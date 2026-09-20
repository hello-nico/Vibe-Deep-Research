# Vibe Finance

[English](README_en.md)

本地金融研究工作台。DSH 管会话和执行，Stock-Research Backend 管资料与研究知识，Client 管选择与界面偏好。

当前为 M8.5/M8.6 收敛中的源码工作区，尚待用户最终验收。旧六阶段、旧资料库、旧对话执行链和 legacy 页面已退役；历史版本截图、发布记录与旧 Task 不能代表当前实现。M9 将从本轮验收提交后的基线继续。

## 页面与数据

- 深度对话：DSH 原生会话、模型、轨迹与工具调用。
- 行业研究：41 行业 Wiki；产业研究：申万资料及相关观察。
- 个股研究：Client 研究名单中的公司，通过 Backend 读取 Wiki 和知识。
- 我的资料：Backend 上传、解析与证据阅读。
- 我的研究：Backend Topic、沉淀记录、成果与经确认的研究关联。
- 自选和持久界面偏好：本地 SQLite。退出研究名单不删除公司知识。

这些服务均可在本机运行；职责划分不表示公共与私人数据的划分。数据供应商和所选模型可能使用网络服务。

## 模块入口

我的资料见 [M9.6 Task](docs/资料管理与对话引用_Task_M9.6_2026-09-17.md)：双入口 PDF/TXT/MD 上传、阅读和 @ 引用已接入正式 Backend 资料库；真模型与浏览器视觉待验收。URL/YouTube 导入延期。

| 模块 | 源码 / 契约与 Task |
|---|---|
| 产品页面与 DSH UI 插件 | `desktop/src/verticals/finance/`、`desktop/dsh/finance-ui/`；[M6 边界](docs/架构边界与UI组合方案_M6_2026-09-09.md) |
| DSH 运行时与模型接入 | `desktop/dsh/runtime/`、`desktop/dsh-dev.ts`；[运行时说明](desktop/dsh/runtime/README.md) |
| 本机数据服务与 Client 存储 | `orchestrator/src/api.ts`、`service.ts`、`client_store.ts`；[M8.5 Task](docs/Client选择与研究数据归属_Task_M8.5_2026-09-14.md) |
| 研究知识与发布 | Stock-Research 仓库的 Backend 与 DSH 插件；[M8 Task](docs/我的研究与行业入口_Task_M8_2026-09-10.md) |
| 研究记忆与按需维护 | [M9.3 Task](docs/研究记忆与按需维护_Task_M9.3_2026-09-16.md)：画像、研究连续性、四类 Wiki 后台维护与 Topic 候选；已实施，真实模型与浏览器待验收 |
| 多口径映射与研究画布 | [M9.4 Task](docs/多口径映射与研究画布_Task_M9.4_2026-09-16.md)：跨分类关联、Topic 画布与选中对象继续研究；复杂交互已暂停，未实施 |
| 公司 Wiki 生成与分类型报告 | [M9.5 Task](docs/公司Wiki生成与交互报告_Task_M9.5_2026-09-17.md)：缺页研究闭环、四类底稿与交互报告；E 节已接入真实 spawn 子 Agent 与只读过程，真实验收待用户 |
| 图表、计算与报告 | `ResearchResult`、`MarketChart` 及 Backend 成果；[M8.6 Task](docs/研究可视化与图数联动_Task_M8.6_2026-09-14.md) |
| 本轮删除与验收 | [旧系统退役 Task](docs/旧系统退役_Task_2026-09-15.md)、[Human Checklist](human-checklist.md) |
| 后续总体收敛 | [M9 边界图](artifacts/m9-research-workbench.html)、[待办](todo.md)、[文档索引](docs/README.md) |

`datasources/`、`.agents/skills/data-access/` 和 `calc/` 保留被现用取数与校验消费的能力。`orchestrator` 不再注册研究启动工具，其 MCP 仅提供端点目录和受控取数。

## 本机启动

Node.js 要求 22.18+；Python 依赖与 Backend 按各自安装说明配置。先启动 Stock-Research Backend，再使用本仓库脚本：

```sh
scripts/setup
scripts/start
```

默认工作台 `http://127.0.0.1:5930`，本机数据服务 8765，DSH 5941。`scripts/start --no-open` 可不自动打开浏览器。模型在工作台设置中配置；不要复制旧浏览器模型配置或用户全局 CLI 登录态。

独立运行本机数据服务：`npm run run --prefix orchestrator`。`scripts/doctor` 检查本机数据服务配置和依赖，不代表模型、Backend 或完整业务已验收。

## 验证与分发

```sh
npm run typecheck --prefix orchestrator
npm test --prefix orchestrator
npm test --prefix desktop
npm run build --prefix desktop
```

数据源测试可通过 `VRA_PYTHON` 指定已安装依赖的解释器。测试库和夹具与真实 Backend 验收分别报告。

当前只交付 Web 工作台。旧 macOS 独立客户端已退出产品范围，不属于验收剩余项或 M9 待办。

## 安全与边界

凭据由现用运行时配置管理，不写进源码、日志或测试夹具。Backend 保存证据和研究数据，DSH 保存会话，Client SQLite 保存选择；删除旧代码不清空这些现用数据。

研究输出展示来源、口径、缺口和推断，不提供买卖操作建议。金融组件的机械检查与用户视觉验收分别完成。公开发布前还需检查当前树、HEAD、完整历史和附件的隐私。

[MIT License](LICENSE)；第三方资源遵循各自授权，Lieflat 商业使用已获用户确认授权。
