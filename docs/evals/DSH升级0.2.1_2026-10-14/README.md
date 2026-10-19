# DSH 升级 0.2.1（2026-10-14）

## 问题

产品（finance-ui + Stock 研究插件）在 DSH `0.2.1-alpha.2` 上是否完整工作，作为装进 Desktop 的前提。本轮不做 Desktop 打包。对应 [DSH升级到0.2.1](../../tasks/archived/DSH升级到0.2.1_Task_2026-10-14.md)。

## 方法与数据集

被测运行时：npm `0.2.1-alpha.2`（不混用本机 tarball）。原 11 个补丁逐项：dsh-client-modules、dsh-session、dsh-api-session-controller、dsh-client-ui-layout、dsh-client-ui-model-selection、dsh-client-ui-chat、dsh-client-ui-trajectory、dsh-llm-pi-ai、dsh-llm-deepseek、dsh-client-ui-conversation、dsh-web-frontend。

走查页：对话、动态、跟踪、关注、个股、资料、设置、问助手。三项真实运行：深度图表问答、问助手问答、海螺水泥 `600585.SH` 研究写入（唯一授权公司）。隔离工作台端口 5939/5949；Backend 经代理。截图留在 `.local/`。

## 环境

日期 2026-10-14。隔离 worktree：Vibe 终态 `b2e7be1507bd39239e26269d6b5c073fd6b501ce`，Stock `6e3a8650bb4a9e486a364ae321243ba95ce75085`。基线标签 `baseline/dsh-0.1.7-alpha.2` 未移动。模型 DeepSeek-V4.1-Flash High（隔离配置，副本已删）。主目录与现用 8700 未切换。

## 结果

脚本客观（来源 report / Task §9，不另算）：终态 Vibe 459/459、Stock 316/316、tsc/build 通过；本机服务 97 通过、1 项 Windows 检查跳过；`audit-session-tools --since 2026-10-14T05:42:50Z` 退出 0（5 新会话 / 4 请求头）。九个 `+0.2.1-alpha.2.patch`；modules 删除、session 由产品代码替代，其余重做。逐项见 [results.csv](results.csv)。

真实运行（执行方记录）：深度会话 `session-1c07f63d-c989-4e75-9029-02896e00a868`；问助手 `session-f39d4f6e-60d5-4109-9ce2-12f7beab70c7`；海螺 `task:83d1084ba5392c6b` completed，保存 version 2。敏感性首次调用 200。问助手遗漏页面可见现金指标；后台整理 skipped。

Claude 判定：未记录（待独立审阅）。

## 结论与适用边界

「同一 worktree 已同步 Vibe b2e7be15、Stock 6e3a865，完成 0.2.1 迁移及新增模块适配；门禁、三项真实运行、审计重跑完成。」（[Task §9](../../tasks/archived/DSH升级到0.2.1_Task_2026-10-14.md)）

「敏感性首次调用 200，海螺研究保存 version2。未提交/切换主目录，留隔离工作台供验收。」（[同上](../../tasks/archived/DSH升级到0.2.1_Task_2026-10-14.md)）

「问助手遗漏页面可见现金指标；成本份额保留假设待校准；后台草案引用无法回绑……整理 skipped。」（[同上](../../tasks/archived/DSH升级到0.2.1_Task_2026-10-14.md)）

「真实报告生成、中止/续跑、Claude 独立审阅与用户验收尚待。」（[同上](../../tasks/archived/DSH升级到0.2.1_Task_2026-10-14.md)）

不能把门禁全绿或海螺保存成功当成产品完整验收或整理发布成功。

## 重跑

隔离 worktree 升级、干净 `npm ci`、页面走查与三项真实运行；命令细节见 `.local/dsh-upgrade/report.md`（2026-10-14 13:58）。主目录不切换。
