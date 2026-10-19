# DSH 0.2.1-alpha.2 → 0.2.1-rc.2 升级可行性

## 1. 问题

产品运行时从 `0.2.1-alpha.2` 升到上游 `0.2.1-rc.2` 要付出多少，能删掉哪些补丁，打包与更新源是否受影响。来源 Task：[DeepSeek检索与DSH-rc2核实](../../tasks/active/DeepSeek检索与DSH-rc2核实_Task_2026-10-19.md) B 段。

## 2. 方法与数据集

被测对象：`desktop/dsh/runtime` 的 10 个补丁、`check-inline-result.mjs`、产品插件加载、桌面品牌补丁（deepseek-harness `48b70127bf`）、rc.2 Desktop 更新与发布脚本。做法：独立 worktree 改锁版本并 `npm install`，记录 postinstall 补丁结果；逐个补丁对照上游 rc.2 源码给结论；独立 DSH_HOME 启动宿主；只读核对上游打包代码。不做真实问答。

## 3. 环境

2026-10-19；上游 deepseek-harness `687f282e86`（rc.2，10-17），基线 tag `dsh-v0.2.1-alpha.2`；npm 上 `next` 标签 = rc.2；两版之间 110 个功能与修复 PR、3698 个文件变更。Vibe worktree HEAD `91512238`。

## 4. 结果

| 补丁 | 结果 | 处置 |
|---|---|---|
| dsh-client-ui-layout | 直接应用 | 保留，按 rc.2 重新生成 |
| dsh-client-ui-model-selection | 直接应用 | 保留；新模型标签槽位只是非交互标签，替代不了筛选 |
| dsh-client-ui-theme | 直接应用 | 保留；字号重构后仍直接读字段 |
| dsh-llm-deepseek | 直接应用 | 保留；上游仍把 401/403 优先归认证错误 |
| dsh-llm-pi-ai | 直接应用 | 保留；同上 |
| dsh-api-session-controller | 包装位置变了（嵌套两处），原补丁改定位后可应用 | 重做定位，先查清实际使用的实例 |
| dsh-client-ui-chat | 冲突 | 重做；finance 过程节点可试用新的「事件认领」接口，中文错误与隐藏注册行仍需补丁 |
| dsh-client-ui-conversation | 冲突 | 重做；新会话选项槽位不能替代首屏标题 |
| dsh-client-ui-trajectory | 冲突 | 重做；额度与拒绝说明上游未覆盖 |
| dsh-web-frontend | 冲突 | 重做并重新定位打包产物；`check-inline-result.mjs` 边界失效 |

其他阻碍：`orchestrator/src/dsh_paths.ts:86–88` 只接受 alpha.2；桌面品牌补丁对 rc.2 有 4 个文件冲突。宿主首页 200，但产品插件因 worktree 缺依赖未加载，类型与完整测试无结论。

打包与更新源：客户端更新使用通用 HTTPS（generic provider），不限于腾讯 COS；上游上传脚本绑定 COS，但自托管不必用它；生产更新地址在上游写死为 `download.deepseek.com`，需要品牌补丁改写；rc.2 新增 latest 频道与独立安装包路径。

## 5. 结论与适用边界

1. **没有补丁可以删。** 我（Claude）在 10-19 先前认为新槽位能减少补丁，这个判断被本次结果推翻：5 个补丁原样保留，5 个必须重做。
2. **升级是一项中等工作量**：4 个冲突补丁、1 个定位、产物校验器、版本门禁、品牌补丁移植，外加完整依赖下的类型、测试、插件加载与真实问答验收，和 alpha.2 那次升级量级相当。
3. **升级的收益**在修复与打包：通知唤醒轮次不再折叠空白、已停止提示、空文本与旧会话重放修复、等子代理时结束本轮、任务时间线持久化、系统提示词去除机器相关值（提升缓存命中）、签名与公证流程、DMG 压缩、Windows 签名。
4. **DeepSeek Search 不依赖本次升级**：按[检索对比](../DeepSeek检索对比_2026-10-19/README.md)的结论放在 Backend provider 层，alpha.2 下即可接入。
5. **不能推出**：rc.2 下产品能正常运行（插件未加载、无类型与真实问答证据）；未签名包的品牌更新源问题仍未收口。

## 6. 重跑

- 原始数据：`.local/dsh-rc2-eval/`（`summary.md`、`npm-install.log`、`desktop-test.log`、`inline-result.log`、`startup-result.json`、`branding-apply-check.log` 等），产出于 2026-10-19；worktree `.worktrees/codex2`。
- 复现：在 detached worktree 中把 `desktop/dsh/runtime/package.json` 里全部 `@deepseek-ai/*` 锁到 `0.2.1-rc.2`，执行 `npm install`，看 postinstall 输出；`node check-inline-result.mjs`；品牌补丁 `git apply --check`。
