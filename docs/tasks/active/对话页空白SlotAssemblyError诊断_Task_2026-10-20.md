# 对话页空白（SlotAssemblyError）诊断

2026-10-20 claude3 写定，待 codex2 实施。复现在独立实例（5939），不碰用户 5930 与现用 home；先只读诊断，定位到根因后可在 Vibe `.worktrees/codex2-slot`（叠加主目录未提交改动）做最小修复，不提交、不 push、不合并；不读凭据。

## 1. 目标

查清深度对话连续提问时页面变空白的原因并修复：用户在对话里问到第三题前后整页空白，无法继续。

## 2. 现状（codex2 实验记录）

- [产业链研究方法实验](产业链研究方法真实链路实验_Task_2026-10-20.md) §9：A 组 Q1 第三次回答后出现 `SlotAssemblyError`，页面空白；随后 Q2 两次发送前超时。记录在 `.local/method-experiment/runs.json`（约第 976 行）与 `screenshots/`。
- 错误定义：`desktop/dsh/runtime/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js:166–189`：「slot machinery rendered outside the installed renderer tree」或「slot rendered outside the root standard-source provider」。
- 嫌疑：rc.2 升级时 VibeAssistant 自建 `renderSlot` 转调根级工厂（`desktop/src/verticals/finance/dsh/vibe-node.tsx`，见 DSH 升级 Task 审阅记录）；或 Vibe 其他扩展位在 provider 外渲染插槽。

## 3. 冻结决定

Z1 稳定复现（记录步骤：新建会话、连续几题、是否与「新建对话」切换有关）；取完整错误栈与出错槽位名（开发构建或 source map）。
Z2 定位根因到文件:行；判断是 Vibe 包装（vibe-node 等）还是 DSH 原生问题。
Z3 Vibe 侧问题：最小修复 + 回归测试（能在测试里复现即写测试）；DSH 原生问题：只写复现与上游反馈草稿，不改 DSH 包。
Z4 修后在独立实例连续问 5 题以上不空白，截图存 `.local/slot-blank/`。

## 4. 范围

诊断只读；修复限 `desktop/src/verticals/finance/dsh/` 与 `desktop/test/`。

## 5. 验收

复现记录、根因（文件:行）、修复 diff 与测试；worktree `cd desktop && npm test`、`npx tsc --noEmit`。用户在 5930 连续提问验收。

## 6. Out of Scope

方法实验本身（修好后再续）。

## 7. Stop Conditions

无法稳定复现（给出已尝试步骤）；根因在 DSH 原生且无扩展点可绕开。

## 8. 回滚

丢弃 worktree。

## 9. 当前交接

1. 状态与结论：热重载空白稳定复现 2/2：唯一 root 卸载后，DSH RootOutlet 抛 boot-order SlotAssemblyError。属原生替换生命周期与产品独占根的组合缺口，按 Z3/§7 停，不改 DSH。
2. 改动文件：本 Task §9；.local/slot-blank/ 的 report.md、upstream-draft.md、诊断脚本、完整栈及截图。codex2-slot 已叠加主目录未提交改动，本次无产品源码修复或测试改动。
3. 证据：历史/新建切换 5 轮、真实问答 3 次均正常；重建 UI 两次正文均归零。原生 modules:496 先卸载，renderer:1240 缺根即抛；client.tsx:824 注册唯一根。npm test 489/490（5173 占用），tsc 通过。
4. 与规格的偏差及理由：复现触发是构建物热替换，不是提问次数；原现场只有异常类型，不能断言同因。Vibe 子组件无法保护父级 RootOutlet，故未补嫌疑代码或回归单测，反馈草稿未外发。
5. 未覆盖的缺口：无产品补丁的纯上游对照未跑；原现场完整栈缺失；没有修复，修后连续五题及 5930 用户验收未做。全量测试仅剩固定 5173 被占，未停止其所有者。
6. 下一步谁做什么：Claude 审阅根槽过渡证据并决定上游修复或另派产品刷新策略；方法实验保持停止。诊断浏览器及 5939/5949 已关，行情采样 PID 50261 继续；未提交、合并或 push。
