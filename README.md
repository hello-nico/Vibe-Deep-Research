# Vibe Finance

[English](README_en.md)

本地金融研究工作台。DSH 管会话和执行，Stock-Research Backend 管资料与研究知识，Client 管选择与界面偏好。

旧六阶段、旧资料库、旧对话执行链和 legacy 页面已退役；历史版本截图、发布记录与旧 Task 不能代表当前实现。

## 页面与数据

- 深度对话：DSH 原生会话、模型、轨迹与工具调用。
- 行业研究：41 行业 Wiki；产业研究：申万资料及相关观察。
- 个股研究：Client 研究名单中的公司，通过 Backend 读取 Wiki 和知识。
- 我的资料：Backend 上传、解析与证据阅读。
- 我的研究：Backend Topic、沉淀记录、成果与经确认的研究关联。
- 自选和持久界面偏好：本地 SQLite。退出研究名单不删除公司知识。

这些服务均可在本机运行；职责划分不表示公共与私人数据的划分。数据供应商和所选模型可能使用网络服务。

## 模块入口

契约描述当前实现，产品重构时整体改写。文档结构见 [docs/README.md](docs/README.md)。

| 模块 | 源码 | 契约 |
|---|---|---|
| 系统职责与数据归属 | — | [system-ownership](docs/contracts/system-ownership.md)（上位） |
| 产品页面与 DSH UI 插件 | `desktop/src/verticals/finance/`、`desktop/dsh/finance-ui/` | [product-ui](docs/contracts/product-ui.md)；设计方向见[产品对象模型与交互 v1](docs/decisions/implemented/产品对象模型与交互_v1_2026-09-23.md) |
| DSH 运行时与模型接入 | `desktop/dsh/runtime/`、`desktop/dsh-dev.ts` | [运行时说明](desktop/dsh/runtime/README.md) |
| 本机数据服务与 Client 存储 | `orchestrator/src/api.ts`、`service.ts`、`client_store.ts` | [system-ownership](docs/contracts/system-ownership.md) §1、§3 |
| 研究知识、维护与刷新 | Stock-Research Backend 与 DSH 插件 | [research-knowledge](docs/contracts/research-knowledge.md) |
| 公司 Wiki 生成与图文报告 | `CompanyWiki.tsx`、`WikiReportPane.tsx`；Stock `services/wiki_reports.py` | [wiki-reports](docs/contracts/wiki-reports.md) |
| 我的资料 | 资料页与对话上传入口；Stock 文档接口 | [my-materials](docs/contracts/my-materials.md) |
| 问助手（Ask / Agent） | `desktop/src/verticals/finance/assistant/`；Stock `dsh/src/consumers.mjs` | [page-assistant](docs/contracts/page-assistant.md) |
| 图表、计算与研究成果 | `ResearchResult`、`MarketChart` 及 Backend 成果 | [charts-and-results](docs/contracts/charts-and-results.md) |
| 研究记忆 | Stock Backend `research/memory/` | 现行规则见 Human Checklist；v2 [提案](docs/decisions/proposed/研究记忆机制v2_设计_2026-09-24.md) |
| 不变量 | — | [invariants](docs/contracts/invariants.md) |
| 决策、待办与进行中 | — | [Human Checklist](human-checklist.md)、[待办](todo.md)、[进行中的 Task](docs/tasks/active/) |

`datasources/`、`.agents/skills/data-access/` 和 `calc/` 保留被现用取数与校验消费的能力。`orchestrator` 不再注册研究启动工具，其 MCP 仅提供端点目录和受控取数。

## 本机启动

Node.js 要求 22.18+；Python 依赖与 Backend 按各自安装说明配置。先启动 Stock-Research Backend，再使用本仓库脚本：

```sh
scripts/setup
scripts/start
```

默认工作台 `http://127.0.0.1:5930`，本机数据服务 8765，DSH 5941。`scripts/start --no-open` 可不自动打开浏览器。启动前会先回收上一轮遗留的本仓库进程（8765 / 5930），其他程序占用时明确报错，需用 `--reclaim-any` 才一并结束。模型在工作台设置中配置；不要复制旧浏览器模型配置或用户全局 CLI 登录态。

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
