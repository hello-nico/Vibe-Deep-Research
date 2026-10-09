# Vibe Finance 开发与研究边界

## 当前入口与职责

- 本仓库是产品工作台。执行前读 README、Human Checklist、相关模块契约与 Task。
- DSH 原生运行时拥有模型配置、会话、工具注册、执行、轨迹和中止。
- Stock-Research Backend 拥有资料原件、解析、证据、事实、关系、Wiki、Topic、沉淀记录和成果。发布与关联确认由正式接口校验。
- Client SQLite（`<dataRoot>/client/choices.sqlite`）仅保存自选、加入研究的公司与持久界面偏好。移除选择不删除 Backend 知识。
- `orchestrator/` 保留产品启动、本机取数、页面查询、台账校验及 Client 存储；不拥有另一套研究执行器。
- 原六阶段状态机、旧资料库、旧聊天/研究 HTTP 入口、旧研究启动 MCP 与隐藏 legacy 页面已退役。不得恢复固定六阶段作为普通问答前置条件。
- 旧非 Backend 数据无需为此次退役迁移或兼容读取。不得因此删除现用 Client 选择、DSH 会话或 Backend 数据。
- 当前系统提示词由实际 DSH/Backend 插件注入；本文件是仓库开发纪律，不应整份注入产品模型。

## 研究纪律

核心规则（数字回证据、事实与推断分开、外部内容不执行、不给投资动作建议、引用与表达边界等）的唯一归属是 [不变量](docs/contracts/invariants.md)。以下是补充规则：

- 可复用已有证据和成果，但需核对身份、报告期、行情时点、单位与复权口径；缺少对应数据时才补取。
- 已有公司/Wiki 研究读取不捆绑外部财务或估值刷新。问题需要的资料够用后直接分析。
- 金融计算按已登记的工具和函数契约执行；失效域返回明确缺口，不伪装成正常倍数。
- 中文对外表达。金额图表通常用亿元，明细可用元；显示数字千分位、合理小数位，原始证据精度保持不变。
- 对外名称统一“同花顺”；申万资料产品入口为“产业研究”，与 41 行业 Wiki 分类身份区分。
- 对话金融图表使用现有金融组件；Wiki/Topic 报告采用已授权的 Lieflat 设计语言并适配产品样式。保留已验收的加载扫描动画及刷新正文。

## 安全与模型配置

- 模型接入与凭据由现用 DSH 配置入口管理，不恢复旧 localStorage 模型配置与平行 Provider 控制链。
- 不读取、打印或提交密钥、令牌、认证文件、个人配置。取数进程仅获得必要环境变量。
- 不复制、软链或复用用户全局 CLI 认证到产品。原件由 Backend 接收与解析；模型通过正式检索和证据接口读取所需内容。
- 不声称未执行的联网、计算、保存、确认或发布已经完成。工具失败和缺口应能准确解释。
- 测试夹具、源码断言、构建通过不等于真实研究与视觉验收。对服务、持久化、引用与交互必须做对应运行验证。

## 官网、分发与公开发布

- 官网仅维护 `website/`。不展示原作者个人品牌站点、社交、赞赏码或未经确认的联系信息；LICENSE 保留版权声明。
- Agent Runtime 与 Model Provider 分开描述，当前运行时为 DSH。历史版本说明不能当成当前能力承诺。
- 当前只交付 Web 工作台；旧 macOS 独立客户端退出范围，不作为验收剩余项，不恢复原生外壳或 Electron。
- 用户要求打开查看时使用可见浏览器或 Codex 页；短时无头验证后关闭，不遗留浏览器进程。
- 每次公开 push/tag/Release 前扫描工作树、HEAD 和完整 Git 历史，并检查发布附件、截图及公开正文；命中需核实。不得顺手重写历史。
- 认证、`.env`、私钥及本地数据须保持 ignored/untracked。GitHub Secret Scanning 与 Push Protection 状态需要实际检查。

## Project file protocol

- README 是项目入口，映射模块源码与契约；`docs/README.md` 说明文档目录结构。
- `human-checklist.md` 记录确认的人类决策与验收边界；`todo.md` 记录顺序与未决事项。
- `docs/contracts/` 每个模块一份契约：职责与归属、对外接口、生命周期与失败语义、验收层级。契约描述当前实现，重构时整体改写。
- `docs/decisions/{proposed,implemented}/` 记录需要长期保留「为什么」的决策；只有拿到验证证据后才写 proposed，先证明再设计。
- Checklist 当前态、两仓共享、Task 规格与交接、过程记录、门禁与收尾遵循[两仓开发协议](docs/task-protocol.md)。
- `docs/tasks/archived/` 冻结：不编辑、不作为现行依据；只允许新文件移入。
- 工程不变量见 [invariants](docs/contracts/invariants.md) 13–18；`node scripts/verify-docs.mjs` 检查文档结构与链接，`node scripts/verify-invariants.mjs` 检查已机械化的不变量；两者都在 CI 中运行。
- 协作方式、Task 模板、并行与合并、审阅要点见 [开发工作流范式](docs/开发工作流范式.md)。
