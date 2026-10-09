# Checklist 收敛：验收与补齐

状态：2026-10-09 Claude 写定。承接[Checklist 收敛与两仓协议统一](../archived/Checklist收敛与两仓协议统一_Task_2026-10-09.md)（修订超过两次，按协议关闭）。
本 Task 没有执行方实施部分：补齐由 Claude 做，验收由用户做。不提交、不 push，提交待用户说"可以提交"。

权威：[Human Checklist](../../../human-checklist.md)；[两仓开发协议](../../task-protocol.md)；
前一 Task 过程记录中的「用户裁决」与「Claude 审阅第二轮并关闭本 Task」（含当时给用户的选项原文）。

## 1. 目标

1. 补齐用户裁决里被截断的三处，两仓 Checklist 的"待用户裁决"章清空。
2. 用户读完两份新 Checklist 并确认；两仓门禁全绿后启用钩子、触发 CI。
3. 核实 #15 的运行态：产品界面能否切到 DSH 自带预设；新会话的工具表。

## 2. 现状（Claude 核实，2026-10-09）

- Checklist：Vibe 113 行、Stock 129 行；共享章逐字一致。两份"待用户裁决"章各剩 3 项，都是裁决原文截断：
  P21 后半句；研究组件目录第二条数据原则；个股页一条末尾括号。
- Claude 已按选项原文补修四处（两仓同步）：P1 自动写入覆盖范围；P5 Dreaming 停用（含 Stock 本仓条目）；
  P16 加"上云时（T15）重新评估 SSRF"；P22 `search_external` 每轮最多 3 次。
- 门禁：前一 Task 关闭后，两仓 `verify-protocol`、Vibe `verify-docs`、`verify-invariants` 通过（见 §9）。
- 运行层审计：历史 23 个 standard 会话命中禁用工具；`--since 2026-10-09` 无样本（今天没有新会话）。
- CI 托管：两仓 remote 为 `origin.cursor.com`，是否执行 workflow 未验证；跨仓拉取需要只读令牌 `CROSS_REPO_READ_TOKEN`。

## 3. 冻结决定

F1. 截断三处只按用户补发的原文写入，不推断。写入位置：研究组件目录、P21 进共享章；个股页进 Vibe 本仓章。
F2. 新增协议规则（待用户确认后写进 `task-protocol.md` 与两仓 Checklist 开发协议节）：
用户据以裁决的材料（选项、推荐、对比）必须先写进仓库文件，再请用户裁决；对话里的内容不算依据。
F3. 启用钩子的前提：两仓门禁全绿。CI 只在用户推临时分支后核对，不推主线。

## 4. 范围

- Claude：两仓 `human-checklist.md`（截断三处、F2 一行）、两仓 `docs/task-protocol.md`（F2，逐字一致）、本 Task。
- 用户：阅读与确认、界面核实、启用钩子、配置 CI 令牌、推临时分支。

## 5. 验收

**Claude 自动检查**：两仓 `node scripts/verify-protocol.mjs`；Vibe `verify-docs.mjs`、`verify-invariants.mjs`；两仓 `git diff --check`。

**用户验收**
1. 补发三处截断原文，并确认 F2。
2. 两份 Checklist 各自从头读到尾，确认每条都是自己的意思、没有遗漏仍然有效的决定。
3. 在工作台深度对话里查看能否切换到 standard / ptc / minimal 预设；新开一个会话问一个需要取数的问题，
   然后运行 `node scripts/audit-session-tools.mjs --since <开会话前的时间>`，应退出 0。
4. 两仓运行 `scripts/install-hooks`；只在一仓改共享章一个字并尝试提交，应被拒绝并显示差异；改回。
5. 两仓配置 `CROSS_REPO_READ_TOKEN`（只读），各推一个临时分支，查看 CI 结果。
6. 说"可以提交"后，Claude 重跑门禁、给出分笔提交计划并执行。

## 6. Out of Scope

- "细节需下沉契约"清单中未被 R6 承接的项（另立 Task）；
- Stock 的 Dreaming 代码与入口清理、死代码清点（各自 Task）；
- 关闭记忆影子模式（用户单独安排）；
- 若第 3 步发现能切到 standard 预设，修复另立 Task，本 Task 只记录。

## 7. Stop Conditions

停止范围：只停对应子项，其余继续。

- 用户补发的原文仍不完整或含义不清：继续留在"待用户裁决"章，不写入有效决定。
- 第 3 步能切到带 bash / 文件工具的预设，或新会话审计命中禁用工具：记录现象，另立修复 Task，暂不启用钩子以外的后续提交。
- CI 托管不执行 workflow：记录，提交不以 CI 结果为前提，但钩子必须启用。

## 8. 回滚

两仓 Checklist 与 `task-protocol.md` 用 Git 恢复到本 Task 开始前；已启用的钩子用 `git config --unset core.hooksPath` 取消。

## 9. 当前交接

1. 状态与结论：截断三处已补齐、F2 已确认并写入（2026-10-09）；两仓"待用户裁决"章已清空。§5 第 1–4 步完成（第 3、4 步由 Claude 在另一会话代做，见证据）；剩第 5 步 CI 与第 6 步提交。
2. 改动文件：两仓 `human-checklist.md`（P21、研究组件目录、个股页，另新增个股页与产业链页叙事模板一条）；两仓 `docs/task-protocol.md`（F2）；本 Task；todo。两仓 `.git/config` 设 `core.hooksPath=scripts/hooks`。
3. 证据：两仓 `verify-protocol`、Vibe `verify-docs` / `verify-invariants`、两仓 `git diff --check` 通过；共享章与 `task-protocol.md` 逐字一致（真实）。
   钩子反例（真实）：只改 Vibe 共享章一个字，直接运行 `scripts/hooks/pre-commit` 退出 1 并输出差异；改回后退出 0；未执行 git commit。
   #15 界面（真实）："更多操作"只有下载日志/反馈；"/"指令为文件、反馈、权限（沙箱与审批）、模型、导出与研究技能，无 Agent 预设切换入口；访问模式有"仅可查看 / 工作区内修改 / 完全权限"。
   #15 审计（真实）：12:29 新会话后 `audit-session-tools --since 2026-10-09T12:29:24+08:00` 退出 0：1 个会话、预设 vibe、30 个研究工具，无 bash/fs/shell。
4. 与规格的偏差及理由：截断原文取自用户已确认的裁决稿；产业链页叙事模板为用户同日确认原型后新增，落点 T7 与 T18 的关系待用户定。钩子验证改为直接运行钩子脚本，避免产生真实提交。核实时测试提问误追加到 10-08"华能国际走势"旧会话一轮，未删除。
5. 未覆盖的缺口：CI 托管与 `CROSS_REPO_READ_TOKEN` 未配置；"完全权限"在现预设下无对应工具，挂载 bash/文件工具时需重评；standard 等预设仍随 DSH web app 注册，界面无入口不证明其他路径不可达。
6. 下一步谁做什么：用户定产业链页落点并配置令牌、推临时分支看 CI（或先提交后补）→ 说"可以提交" → Claude 重跑门禁、给出分笔提交计划并执行。
