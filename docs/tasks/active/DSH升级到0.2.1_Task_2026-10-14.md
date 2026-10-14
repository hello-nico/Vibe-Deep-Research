# DSH 升级到 0.2.1

状态：2026-10-14 Claude 写定，用户同意（todo §1.5 内测首发关键路径；依据 [桌面安装包可行性](桌面安装包可行性_Task_2026-10-14.md) 报告 `.local/desktop-spike/report.md`）。执行方不提交、不 push、不运行 `scripts/start`，不切换用户正在用的工作台；不读 `.env` 与密钥。升级在 worktree 中完成，验收后由 Claude 合入主目录。

## 1. 目标

产品（Vibe 界面插件 `finance-ui` + Stock 研究插件）在 DSH `0.2.1-alpha.2` 上完整工作：现有全部页面、深度对话、问助手、公司研究与任务记录、内嵌组件渲染与现在一致。这是装进 DSH Desktop 的前提，本 Task 不做 Desktop 打包。

## 2. 现状（Claude 核实）

- Vibe 运行时：`desktop/dsh/runtime/package.json` 精确锁定 `@deepseek-ai/dsh-*` `0.1.7-alpha.2`（含 overrides），postinstall 用 patch-package 打 11 个补丁（`desktop/dsh/runtime/patches/`），并跑 `check-inline-result.mjs` 回归。
  升级与回退规则见 `desktop/dsh/runtime/README.md`「升级与回退规则」：先打基线标签、独立 worktree 升级、切换后 `node scripts/audit-session-tools.mjs --since <切换时间>` 必须退出 0。
- Stock 插件：`dsh/package.json` peer 锁 `0.1.7-alpha.2`，被 0.2.1 加载器拒绝；`dsh/src/research-tools.mjs:373,410,412` 用 `agent.session.append(type, data, { ignorable: true })` 写 `stock-research/status`、`maintenance`、`topic-candidate` 事件，0.2 改为 `appendPluginRecord` 与 `plugin:` 命名空间；前端读这些事件的地方需同步。
- 11 个补丁在 0.2.1 的处置：见可行性报告 Q2 表（逐个文件、源码行号、已解决 / 需重做 / 改插件绕开）。重点：`dsh-web-frontend`（`stock-ref:` 链接、`result:` 单图段落、`vibe` 围栏渲染与复制转换）须在 0.2 的 `ui-primitives` 源码位置重做；`dsh-client-ui-layout` 与 `finance-ui` 自注册 `root` 冲突；`dsh-session` 由插件改用新接口替代。
- 0.2.1 的来源：本机 `deepseek-harness` 仓库（基线 `d743267388`）；先确认 npm 上是否有 `0.2.1-alpha.2` 的同名包，没有则从该仓库构建本地包（可行性验证的 worktree 已有构建产物与命令）。

## 3. 冻结决定

R1 **流程**：Vibe、Stock 两仓在当前 HEAD 打本地基线标签 `baseline/dsh-0.1.7-alpha.2`（若已存在则不改）；两仓各开 worktree（允许的例外）完成全部改动；主目录不动。
R2 **包来源**：优先 npm 精确版本 `0.2.1-alpha.2`；不可得时用本机 `deepseek-harness` 基线构建的 tarball，记录生成命令与哈希。不混用两种来源。
R3 **Stock 插件**：peer 与 devDependencies 升到 0.2.1；三个自定义事件改用 0.2 的插件记录接口，读取方（Vibe 前端的过程面板、状态行）同步改；旧会话里已有的旧事件仍能显示（冷读兼容只做读取，不再写旧格式）。
R4 **补丁**：按可行性报告 Q2 逐个处理，每个补丁写清结论：删除（上游已等价）/ 重做（新补丁文件，按 0.2.1 源码）/ 由产品代码替代。`dsh-web-frontend` 的三项产品渲染与复制转换必须保留现有行为，`check-inline-result.mjs` 改为检查 0.2.1 的实际加载产物。不得删掉失败补丁来让安装通过。
R5 **界面**：统一根布局的拥有者（保留 DSH 的 layout 服务，产品提供根框架，与现补丁语义一致）；深度对话隐藏 DSH 自带预设、目录、权限选择器的现有规则逐项在 0.2.1 上重新走查（Human Checklist「深度对话隐藏 DSH 自带预设」）。
R6 **不做**：Desktop 打包与品牌、本机数据服务迁移、Backend 地址设置、任何新功能。

## 4. 范围

单线，Codex：Vibe worktree 的 `desktop/dsh/runtime/`（package.json、lockfile、patches、检查脚本）、`desktop/dsh/finance-ui/`、`desktop/src/verticals/finance/dsh/`（只为接口变化）、读取插件事件的前端代码；Stock worktree 的 `dsh/`（package.json、lockfile、事件写入、测试、快照）。

## 5. 验收

1. 两仓 worktree：Vibe `cd desktop && npx tsc --noEmit && npm test`、`node scripts/verify-docs.mjs`；Stock `cd dsh && pnpm test`（模型表面快照差异只来自接口变化，逐项说明）。
2. 用 worktree 起一套**隔离**的工作台（独立 `DSH_HOME`、独立端口，Backend 指向本机 8700 只读使用），截图核对：对话页、动态、跟踪、关注、个股页（含任务进度与内嵌数字）、资料、设置；深度对话一次带图表的问答；问助手一次问答。每项给截图与会话 ID。
3. `audit-session-tools.mjs --since` 对隔离环境退出 0。
4. 报告写 `.local/dsh-upgrade/report.md`：包来源、11 个补丁逐个结论、事件迁移、走查结果、遗留问题。Claude 审后由用户在浏览器验收，再合入主目录。

## 6. Out of Scope

R6 所列；DSH 0.2 的新能力接入（如 `schedule`，归 T8b）。

## 7. Stop Conditions

- 0.2.1 既不能从 npm 取得，也不能从本机仓库构建出可安装包 → 停下报告。
- 某个补丁的产品行为在 0.2.1 上无法保留且需要改 DSH 源码以外的上游行为 → 停下报告该项，其余继续。
- 需要动用户正在用的工作台、`DSH_HOME` 或主目录 → 停下报告。

## 8. 回滚

删除两个 worktree；主目录未改，基线标签保留。

## 9. 当前交接

1. 状态与结论：2026-10-14 同一worktree已同步Vibe b2e7be15、Stock 6e3a865，完成0.2.1迁移及新增模块适配；门禁、三项真实运行、审计重跑完成。敏感性首次调用200，海螺研究保存version2。未提交/切换主目录，留隔离工作台供验收。
2. 改动文件：runtime依赖/九补丁/renderer检查，finance-ui组合/activation/local-data数据根，前端接口与记录投影、测试；获授权dsh_paths版本门禁。Stock dsh依赖/五类插件记录/activation/持久化注入及测试。主目录新增连接、跟踪、研究关键点、计算字段全部保留。
3. 证据：Vibe459/459、tsc/build通过；Stock316/316；本机服务97通过、1 Windows检查跳过、0失败；docs/invariants/protocol/diff check通过。审计since05:42:50Z退出0，5新会话/4请求头。海螺task:83d1084ba5392c6b completed；全部会话ID与researchVersion见主目录授权报告.local/dsh-upgrade/report.md及round2证据。
4. 与规格的偏差及理由：用户明确扩展本轮为同步最新HEAD及新增模块适配，授权两次只读问答和唯一海螺写入。密钥与hook副本已按要求删除，扫描无剩余复制值；无复制凭据重启后回读通过。仅修改worktree；Task规格不改，旧回填与diff先备份再快进，自动合并无冲突。
5. 未覆盖的缺口：问助手遗漏页面可见现金指标；成本份额保留假设待校准；后台草案引用无法回绑、范围保护拒绝全局写入，整理skipped。主研究保存成功不代表整理发布成功。真实报告生成、中止/续跑、Claude独立审阅与用户验收尚待；Desktop等原排除项仍不做。
6. 下一步谁做什么：Claude审报告/diff，用户在http://127.0.0.1:5939/验收；隔离Backend只读，复制凭据已删，新模型请求需用户配置。验收后由Claude合入。本轮不启动第二个海螺任务、不扩大Backend修改范围，现用工作台与8700未动。
