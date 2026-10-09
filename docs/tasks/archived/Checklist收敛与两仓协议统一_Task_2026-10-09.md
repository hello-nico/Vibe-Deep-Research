# Checklist 收敛、两仓协议统一与门禁补齐

状态：2026-10-09 Claude 写定，用户确认方向（含原评估问题 5、6 一并处理）；第一轮在 #15 停止，续作待派发。
修订 1（2026-10-09）：#15 明确验证对象与允许入口（C13）；停止条件改为只停对应子项，其余继续（§7）。旧写法见过程记录。
修订 2（2026-10-09）：新增验证范围规则 C17；审计脚本加 `--since` 并写进 DSH 升级规则（C13）；阶段 D 先于启用钩子（§4）；执行方不再本机跑 CI 全量（§5）。
修订 3（2026-10-09）：用户已裁决（见过程记录「用户裁决」），新增 R6/R7 与契约承接范围（C3、C18、§4、§6、§7）。
第一轮做阶段 A（审计）与阶段 C（协议、门禁、CI），然后停下，等用户裁决阶段 A 的清单。
执行方只跑自动检查；不提交、不 push、不改写 Git 历史。
实施仓库：Vibe-Deep-Research 与 Stock-Research。只改文档、门禁脚本及其测试、CI 配置；不改产品代码与现有测试。

权威：[Human Checklist](../../../human-checklist.md)「开发协议：Checklist 当前态与两仓共享（2026-10-09）」（Stock 侧同名一节逐字相同）；
[不变量](../../contracts/invariants.md)。

## 1. 目标

1. 两仓 Human Checklist 改成"当前有效决定集"：人一口气能读完，没有前后矛盾。
2. 共享决定两仓逐字一致；Task 与 Checklist 协议两仓相同；由脚本硬性检查。
   兜底分三层：Agent 自跑 → 本地提交钩子强制跑 → 两仓 CI 最后核对（并且能跑绿）。
3. Task 的规格、当前交接、过程记录分开，长度各自有上限。
4. 补齐低成本的不变量门禁；协议里补上"依赖模型行为的设计先验证"。

## 2. 现状（Claude 核实，2026-10-09）

- Vibe `human-checklist.md`：94 节、约 113KB，不按时间排序，有 5 处"以后述补充为准 / 覆盖下文"。
- Stock `docs/human-checklist.md`：97 节、约 166KB，没有索引。
- 两仓标题完全相同的 3 节（外部内容注入隔离、公司 API 刷新边界、M8.6 真实轨迹修正），正文相似度 0.26–0.51，已分叉。
  另有约 8 组同议题、不同标题（如证据墙、DSH 同类读取合并、M8.5、研究提示词语言）。
- `深挖行为与一类推荐` Task：181 行、27KB，最长一行 983 字，回填占大半；现有门禁只数行数。
- Stock `AGENTS.md`「Task 协议」规定执行中不改写 Task；Vibe 实际在两轮之间修订规格。
- 过期内容：Vibe `AGENTS.md:41`（"本轮退役……M9……"）、`README.md:7`（"当前为 M8.5/M8.6 收敛中"）。
- `docs/README.md` 手工维护"进行中的 Task"列表，与"状态由目录表示，不另建索引"矛盾。
- **CI 现在跑不通**：
  - `cross-platform.yml` 的 Windows 步骤引用 8 个 `orchestrator/test/*.test.ts`，只有 `windows_support` 还存在；
  - 缺失的 7 个是 `local_agent_runtime`、`local_agent_stage_agent`、`runtime_provider`、`task_router`、`task_adapters`、`run_tools_registry`、`startup_health`；
  - Python 步骤跑 `backtest/tests`，目录不存在。
- Stock 没有 `.github/workflows`，也没有文档门禁。两仓 remote 都是 `origin.cursor.com/chen-cheng/...`；
  该托管是否执行 GitHub Actions、能否拉取另一个私有仓库，**未核实**。
- 不变量 18 条，已落地门禁 3 条（#8 Stock 快照、#16、#17）。#17 按单行匹配，跨行的 `register(` 会漏判。
  #15 只有 Stock 角色工具表的快照；#18 没有门禁。
- #15 预设（第一轮核实 + Claude 补查）：挂载在 DSH 包内部（`dsh-agent-preset-registry`）；DSH 自带的 standard 预设子树含 bash / fs。
  会话日志的 `session.agentPreset` 与 `request/header.data.header.tools[].name` 记录了实际发给模型的工具表。
  Claude 抽查最近 60 个会话：带工具表的 41 个，无 bash、pwsh、fs、写文件类工具；会话为 `vibe` 预设或未标注。
- #15 历史事故：DSH 09-23 21:26 升级后到 09-24 13:18，23 个产品会话跑在 `standard` 预设；其中 1 个用 bash 读工具结果落盘文件并用 Python 自算。之后均为 `vibe`。
- 第二轮执行方为"本机跑 CI 等价命令"临时装了 Python 3.12，跑了 `calc/`、取数技能等与本 Task 无关的全量测试（规格问题，由 C17 纠正）。
- 不变量 #4 写的是 2026-10-08 起的目标状态，同时注明"现行实现仍走提案→确认"：不变量描述了尚未实现的行为。
- 推荐卡片 Task 连续 3 轮真实验收失败，根因都是靠提示词约束模型的工具调用顺序；现有协议没有对应规则。

## 3. 冻结决定

**Checklist**

C1. 只记当前有效决定，原地改写，不追加。推翻旧决定时直接改旧条目，不写"替代 X"；历史靠 Git，长期理由写 `docs/decisions/`。
C2. 三章，顺序固定：
- `## 两仓共享决定`：用 `<!-- shared:begin -->` 与 `<!-- shared:end -->` 包住，两仓逐字节一致；
- `## 本仓决定`；
- `## 待用户裁决`（可以为空）。

前两章用 `###` 按模块分组，模块与 README 模块表、`docs/contracts/` 对齐。
C3. 每条是一个 `- ` 条目，1–3 行，末尾写 `（YYYY-MM-DD 确认｜落点）`；落点为"已实现：<契约>""待实施：<Task>""待重设计：<Task>"或"规则"。
C4. 共享标准：同时约束两仓代码或行为的决定（跨仓接口、数据归属、两边都要实现的语义）。共享内容两边放全文，不放链接。
C5. 每份 ≤ 200 行（共享章计入两边）；代码块外单行 ≤ 300 字；禁用"以后述""以本补充为准""替代下文""覆盖下文"。

**Task**

C6. Task = 规格（§1–§8）+ `## 9. 当前交接`；过程记录放在同目录的 `<Task 名>.log.md`。
- 规格：派发时 ≤ 200 行；执行方不改；规划方只在两轮之间修订（停止条件触发或验收未通过），在状态行下加"修订 N（日期）：原因"，旧写法移入过程记录；修订后仍 ≤ 200 行。
- 当前交接：每轮覆盖，≤ 60 行，固定 6 个字段：状态与结论；改动文件；证据（命令、结果、证据等级：替身 / 真实）；与规格的偏差及理由；未覆盖的缺口；下一步谁做什么。
- 过程记录：只追加，默认不读。
- 代码块外单行 ≤ 300 字。修订超过 2 次，或需要新的设计决定：另开新 Task 并引用旧 Task。

C7. 冻结决定依赖模型行为（工具调用顺序、"如有需要再调用"的可选调用、输出格式遵从）时，必须二选一：
先做行为验证（同一模型至少 3 次真实运行，记录通过率），或者在 Stop Conditions 写明"真实运行不稳定即停，改走确定性实现"。
不能把"提示词这样写了"当成行为已成立。
C8. 两仓各有一份 `docs/task-protocol.md`，逐字一致，内容为 C1–C7、C9、C16 的使用规则、C17 与收尾三问。
两仓 `AGENTS.md` 只用一句话引用它；Stock「Task 协议」一节改为引用；`docs/开发工作流范式.md` §3 模板同步为 C6 结构。
C9. `AGENTS.md` 只放长期规则：禁止"本轮"和里程碑编号（`M\d+(\.\d+)?`、`T\d+(-[a-z])?`）。删除 Vibe `README.md:7` 的阶段描述。
C10. `docs/README.md` 删除"进行中的 Task"列表，改成一句"见 `tasks/active/` 目录"。

**门禁与 CI**

C11. 新增 `scripts/verify-protocol.mjs` 及其测试，两仓逐字一致。检查：
- 共享章逐字节一致（不一致时输出 diff）；本仓章节不得出现与共享章同名的 `###` 或条目；Checklist 符合 C2、C3、C5；
- 两仓的 `task-protocol.md`、`verify-protocol.mjs` 及其测试、C16 的钩子与安装脚本逐字一致；`AGENTS.md` 符合 C9；
- `docs/tasks/active/*.md`（不含 `.log.md`）符合 C6。

另一个仓库的路径取 `--sibling` 参数或 `VIBE_SIBLING_REPO`，默认 `../<另一仓名>`；找不到就报错。
C12. Vibe `verify-docs.mjs` 删掉与 C11 重复的 Task 检查，忽略 `.log.md`，其余不变。
C13. 不变量门禁（Vibe `verify-invariants.mjs`，必要时加 Stock `dsh/test` 断言）：
- #17 改为按语句解析，跨行的 `register(` 也要检查，判定规则不变；
- #18 禁用标识符清单：从[旧系统退役 Task](../archived/旧系统退役_Task_2026-09-15.md)整理，写进脚本并注明出处；扫描 Vibe 现用源码目录；
- #15 产品预设不挂 bash 与文件写工具，分三层，不进入 DSH 包内部：
  - 角色层（CI）：Stock `dsh/test` 断言每个角色的工具表不含 bash、pwsh、shell、fs、读写文件类工具；
  - 声明层（CI）：Vibe `finance-ui/cordis.patch.yml` 禁用四个宿主工具；`preset-vibe` 的 plugins 不含任何 tool 行；`dsh-dev.ts` 默认预设为 `vibe`。脚本注释写明"只证明声明，不证明有效工具表"；
  - 运行层（本地审计，不进钩子与 CI）：新增 `scripts/audit-session-tools.mjs`，只读 DSH 会话日志的上述两个字段，只输出预设名、工具名与计数；命中禁用工具即退出 1。执行方跑一次并回填结果；
    加 `--since <ISO 日期时间>`，只审计创建时间在其后的会话；不带参数时审计全部。
    `invariants.md` #16 与 `desktop/dsh/runtime/README.md`「升级与回退规则」增加一步：切换后开一个新会话，用 `--since <切换时间>` 跑审计，退出 0 才算切换完成；
  - DSH 预设能否在产品界面切换到 standard 等预设：只核实并写进交接缺口，不修改；
- `invariants.md` 中对应三行的"门禁候选"改为已落地，并写明脚本位置。

C14. CI 修复：只删除指向不存在文件的引用（7 个 Windows 测试文件、`backtest/tests`），不删、不改任何现存测试。
两仓 CI 都跑 `verify-protocol.mjs`，并同时拉取另一个仓库；Stock 新建最小 workflow，只跑门禁。
C17. 验证范围（写进 `task-protocol.md`）：执行方只跑与改动相关的检查——改到的文件对应的测试，加门禁。
全量测试与跨平台测试交给 CI；不为验证新装运行环境；Task 确需更大范围的检查时，在规格里逐条写明命令。

C18. 用户裁决的两条规则（写进 `task-protocol.md`）：
- R6：计划中要重做的界面或流程，现行实现写进对应契约，Checklist 只留一行"由 Tx 重新设计"；
- R7：不变量已覆盖的内容，Checklist 不再写。
为承接 R6，阶段 B 允许改写契约，范围仅限过程记录「Claude 执行说明」列出的项；先写进契约，再删 Checklist。

C15. 不变量 #4 改写为描述当前实现（提案→确认）；"自动写入、事后透明"作为目标，指向 Checklist 对应条目与后续 Task。

C16. 本地提交钩子：两仓新增逐字一致的 `scripts/hooks/pre-commit` 与 `scripts/install-hooks`。
- 钩子只跑快检查：`verify-protocol.mjs`，以及本仓存在的 `verify-docs.mjs`、`verify-invariants.mjs`；不跑完整测试；失败即拒绝提交。
- `install-hooks` 执行 `git config core.hooksPath scripts/hooks`（仓库级配置，worktree 共享）；Vibe `scripts/setup` 调用它。启用由用户执行。
- `task-protocol.md` 写明：禁止 `--no-verify`；Claude 审阅时不以回填为准，合并或提交前自己重跑全部门禁。

## 4. 范围与阶段

**阶段 A：审计（第一轮）**
逐节审计两份 Checklist（共 191 节），表写进本 Task 的过程记录。
表的列为：仓库、节名、状态（有效 / 已被替代 / 已并入契约 / 过时）、归属（共享 / 仅 Vibe / 仅 Stock）、依据、冲突说明。
表后附两份清单：
- **待用户裁决**：两仓版本有出入的共享决定、前后矛盾的条目，每条给出两版原文要点；
- **细节需下沉契约**：有效决定的细节只在 Checklist、契约里没有的。

**阶段 C：协议、门禁、CI（第一轮）**
C6–C16 全部完成，但先不对 Checklist 启用 C2、C3、C5 检查：在阶段 B 完成前，脚本对 Checklist 只报告、不判失败（显式开关，阶段 B 后删除）。

**第二轮（用户裁决后）按 D → B → C17 补齐的顺序**
- 阶段 D：`docs/tasks/active/` 的历轮回填与旧规格移入各自的过程记录，§9 改写为 6 字段；本 Task 同样处理。完成后两仓门禁对 Task 全绿。
- 阶段 B：按 C1–C5、C18 与过程记录「用户裁决」重写两份 Checklist；R6 涉及的契约先补写；删除上面的报告开关。
- 补齐修订 2 新增的 C17、`--since` 与升级规则。
- 两仓门禁全绿之后，用户才启用钩子。

## 5. 验收

**执行方自动检查**
- 两仓 `node scripts/verify-protocol.mjs` 退出 0；Vibe `verify-docs.mjs`、`verify-invariants.mjs` 退出 0；两仓 `git diff --check` 退出 0。
- `verify-protocol` 测试（`node --test`）覆盖反例，每项都要报错：
  - 共享章不一致；本仓章节与共享章同名；条目缺日期或落点；超过 200 行；单行超过 300 字；出现禁用字样；
  - AGENTS 含"本轮"或里程碑编号；Task 规格超过 200 行；交接超过 60 行或缺字段；
  - 找不到另一个仓库；两仓协议文件或脚本不一致。
- 钩子：在临时仓库里造一个门禁失败的改动，`git commit` 被拒绝；改正后能提交。
- `verify-invariants` 测试覆盖：跨行 `register(` 未交给 `track()` 时报错；源码出现 #18 禁用标识符时报错；预设挂上 bash 时报错。
- CI：执行方不 push，只校验两仓 workflow 语法；不在本机跑 CI 全量（C17）。托管上的实际运行由用户 push 后核对。
- CI 里现存测试引用已删除文件导致的失败，归「死代码清点」Task，不在本 Task 处理。

**执行方回填**：阶段 A 的统计（各状态、各归属多少节）；#15 预设位置与 #18 清单来源；CI 删除了哪些引用；改动文件清单。

**用户验收**
1. 第一轮后：逐条裁决待裁决清单。
2. 第二轮后：两份 Checklist 各自从头读到尾（预计各 10 分钟内），确认每条都是自己的意思、没有遗漏。
3. 两仓门禁全绿后运行两仓 `scripts/install-hooks`，把两仓推到临时分支触发 CI 查看结果；只在一仓改共享章的一个字并尝试提交：提交被拒绝，并显示 diff。
4. 打开一个迁移后的 Task，只读规格和当前交接，能看懂现状和下一步。

## 6. Out of Scope

- 改写 `docs/contracts/` 正文，C18 列明的 R6 承接项除外；"细节需下沉契约"清单中的其余项另立 Task；
- 关闭记忆影子模式（用户单独执行）；#4 以外的不变量条文；
- `docs/decisions/` 整理；`docs/tasks/archived/` 的任何改动；
- 产品代码、提示词、DSH 插件；删除或修改现存测试；
- 规划层面的改动（如 T1 是否改为确定性生成）；
- Stock `AGENTS.md`「Task 协议」以外的条款；配置 CI 凭据（由用户配置）。

## 7. Stop Conditions

- 停止范围：以下条目只停对应子项，写进交接后继续其余工作；只有第一条停整轮。
- 每一轮按 §4 的分轮做完：停下（第一轮等用户裁决，第二轮等用户验收）。
- 裁决原文被截断、或裁决没覆盖到的条目：该条跳过，列进交接，不自行补全。
- R6 的现行实现在契约和代码里都找不到可靠描述：不删 Checklist 原条目，列进交接。
- 有效决定压到 3 行以内会丢约束，或者 Checklist 压不进 200 行：停下，报告条目与行数，不放宽上限。
- 归属判断不了，或两仓版本冲突：放进待裁决清单，不自行合并措辞。
- 从只读信息（remote、仓库内配置）就能判断托管不支持 workflow，或者拉取另一仓库需要凭据：写进交接缺口，说明用户需要配置什么；不读写任何凭据。
- 修 CI 需要删除或修改现存测试，或者 CI 跑起来后有现存测试失败：停下回填，不改测试。
- #18 扫描在现用源码里命中禁用标识符，或 #15 运行层审计命中禁用工具：该项停下回填，不改源码。
- 门禁需要改 `docs/tasks/archived/` 才能通过；迁移时某个 Task 规格超过 200 行：停下。

## 8. 回滚

两仓 Checklist、AGENTS、README、`docs/README.md`、`开发工作流范式.md`、`invariants.md`、活跃 Task 用 Git 恢复到派发前；
删除 `task-protocol.md`、`verify-protocol.mjs` 及其测试、`scripts/hooks/`、`install-hooks`、过程记录；
已启用钩子的仓库执行 `git config --unset core.hooksPath`；恢复两仓 CI 配置、`verify-docs.mjs`、`verify-invariants.mjs`。

## 9. 当前交接

1. 状态与结论：2026-10-09 修订 3 第二轮按 D→B→补齐顺序结束，停下等审阅；尚未全绿、不标 Task 完成。三个旧 Task 已迁移，死代码清点未动；两份 Checklist 已重写并启用硬门禁，Vibe 112 行、Stock 128 行，共享 49 条、本仓 16/29 条、各待裁决 4 条。
   阶段 A 保留原 191 节逐节表与两份清单：有效 103、替代 24、契约 35、过时 29；归属共享 134、Vibe 18、Stock 31、待裁决 8。六组 R6 先补契约，C17/--since/升级审计步骤已补齐。
2. 改动文件：本轮 Vibe 20 文件、Stock 5 文件，逐文件清单见 log。Vibe：Checklist、四契约、invariants #4/#16、runtime README、task-protocol、protocol/audit 各脚本与新增测试、三旧 Task 与三日志、本 Task §9 与 log。
   Stock：docs/human-checklist、task-protocol、verify-protocol 与其新增测试、README 的旧 Checklist 引用。共享五文件逐字一致；原派发基线与无关 citation/测试等改动保留，todo、死代码清点、archived、产品代码和现存测试未编辑。
3. 证据：相关测试 Vibe 90 项（protocol 40、invariants 29、audit 21）全过，Stock 56/56 全过（替身/源码与临时 Git）；临时仓失败拒绝提交、修正可提交。真实文件检查：Stock protocol 退出 0；Vibe protocol 退出 1，仅本 Task 修订次数；Vibe docs/invariants 与两仓 diff --check 退出 0。
   两 workflow YAML/结构检查通过，未运行全量 CI 或新装环境。真实历史 509 个日志文件、258 带表、278 header：standard 的 bash/read/write/edit 各 10 次，退出 1；--since 2026-10-09T00:00:00+08:00 跳过 509、无样本退出 2，不作切换通过证据。
   #15 实际挂载沿首轮文件行号（log），本轮不进 DSH 包；#18 清单来源仍为旧系统退役 Task 与 60b87aad 删除符号，现用源码无命中。CI 首轮只删 7 个不存在的 Windows 测试引用及 backtest/tests，本轮未改 CI。
4. 与规格的偏差及理由：本 Task 标修订 3，但 C6 规定超过两次另开 Task，门禁如实拒绝；该项停止，未删修订记录、未改 §1–§8 或放宽门禁。规格完整文本与迁移前快照相同；其他 Task 只机械折行并迁移历史。
   §6 禁改 #4 以外条文与 C13/本轮提示明确补 #16 相冲突，按明确授权仅补 #16 升级步骤。--since 用文件系统创建时间，不读第三个日志字段；复制/恢复后的时间不能证明原逻辑会话年龄，限制写入 runtime README。
5. 未覆盖的缺口：三处裁决截断仍待补齐：P21 后半句、组件第二数据原则、个股页括号；P16 的 A 定义未见，原网络边界保留不扩权。T7–T16/S1 等方向不冒充实现；R6 发现面板阈值现状 1100px、旧 900px 未实现，页面回退接口原因不上屏，交 T8 重审。
   #15 历史 standard 命中，产品切换 standard/ptc/minimal 的真实 UI 路径仍未验证；今日无新会话，运行时切换验收未覆盖。此前 CI 端口 EPERM 与退役引用失败归死代码清点/托管验证，本轮不重跑、不修现存测试。
   origin.cursor.com 托管能力未验证；用户需配置两仓只读 CROSS_REPO_READ_TOKEN，必要时 SIBLING_REPOSITORY/SIBLING_REF。未读凭据/个人配置，未启用主仓钩子、提交、push、重启/重建或关闭影子模式。
6. 下一步谁做什么：Claude 审阅 diff 与 log，按 C6 另开后继 Task 承接修订 3，补齐四项裁决依据并重跑两仓门禁；不靠删除修订行或忽略本 Task 凑绿。用户逐条读两份 Checklist 并补齐裁决，核实预设切换及新会话工具表。
   两仓门禁全绿后，用户才运行两仓 install-hooks、各推临时分支查看 CI；Claude 合并/提交前亲自重跑门禁。其余下沉细节另派 Task，本轮不扩契约范围。
