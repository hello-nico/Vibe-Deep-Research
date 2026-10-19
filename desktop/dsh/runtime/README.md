# 产品 DSH runtime

> 2026-10-19：隔离 worktree 升级到 `0.2.1-rc.2`，未切换主目录与用户状态。执行状态见主目录 `docs/tasks/active/DSH升级到0.2.1-rc.2_Task_2026-10-19.md`；机械检查、受控运行与用户真实研究验收分别记录。

全部 DSH 包精确锁定 `0.2.1-rc.2`，统一来自 npm registry；没有混用本地构建包。`package-lock.json` 锁定完整闭包，React / ReactDOM 保持 `18.3.1`。通过 `npm ci` 安装，postinstall 必须成功应用十个补丁并执行 `check-inline-result.mjs`。

直接声明 session-controller、client-store 和 client-ui-slots，使产品使用的公开 API 与类型来自同一版本。当前锁文件中，从 runtime 根和 web-app 解析 session-controller 均指向根目录同一实例；对应补丁只打该实际加载实例，不依赖旧评估时的嵌套路径。

运行依赖、DSH_HOME 与研究工作区分别存放。产品插件通过官方 `plugin add link:` 注册到 Web profile，不复制私人配置或凭据。DSH 启动器统一宿主与 link 插件的模块解析；插件记录必须使用宿主同一实例的 `dsh-session`，直接跨仓导入的测试需要模拟这一解析边界。

## 产品运行配置

官方 `web` profile 提供运行底盘。`../finance-ui/cordis.patch.yml` 拥有产品根框架、默认 `vibe` 预设、人设及通用工具权限；保留 DSH layout 服务。0.2.1 的预设配置节点是 `agent-preset-registry`，旧 `agent-presets` 节点不再改变默认值。启动器暂时还会生成旧节点叠加层，但本版本有效默认值由产品组合提供。

Stock 插件拥有研究工具与生命周期。模型配置与凭据由 DSH 设置入口管理。上游首次启动引导和模型设置属于实际运行时，未通过复制用户配置跳过。

产品执行使用 `startActivation({ provider: 'spawn', label, request, signal, delivery: 'caller' })` 的 childId/result/dispose。DSH 上游允许 caller 投递使用临时会话，但产品插件要求 sessionPersistence，保证任务过程与续跑可读。发布后通过 dispose 取消；用户中止立即持久记为 cancelled，宿主关闭保留 running，下一次启动接续；同一步实际失败两次才 failed，重启本身不增加失败次数。容量拒绝返回明确原因并保留失败任务记录。

rc.2 的请求不再接受 persona 与 toolFilter。研究、报告及 Stock 整理通过 AsyncLocalStorage 隔离创建窗口，在 agent/created 中调用公开 tools.restrict 与 systemPrompt.section：屏蔽继承的全局工具，保留子任务局部注册工具，注入原有中文身份。创建结束释放临时监听；Stock 复用已有创建钩子。

## 十个 rc.2 补丁及历史替代

| 原补丁 | rc.2 处置 | 保留行为与验证边界 |
| --- | --- | --- |
| dsh-client-modules | 删除，上游已等价 | 上游已有 createRequire 元数据解析回落；隔离 Web profile 成功加载两个 link 插件及产品 UI |
| dsh-session | 由产品代码替代 | Stock 五类自定义记录使用 appendPluginRecord 和 plugin: 命名空间；原生 Session JSON/restore 与前端旧、新名称读取测试通过 |
| dsh-api-session-controller | 重做 | 保留已校验子会话无 cwd 的冷读豁免；普通会话仍拒绝。上游已使用序列化 projection hints，旧 projections 剥离不再移植；真实持久公司子会话与过程读取通过，不保证所有历史版本迁移 |
| dsh-client-ui-layout | 重做 | 仅移除上游 root/AppFrame 注册，保留 layout 服务、状态与命令；产品页面真实加载 |
| dsh-client-ui-model-selection | 重做 | 始终显示筛选，按 Provider 名称、模型 id/name/description 匹配，保留上游键盘行为 |
| dsh-client-ui-chat | 重做，部分扩展点替代 | QUOTA/AUTH/FORBIDDEN 中文语义、研究中措辞、隐藏「已添加工具」类注册行；finance 节点用 groupTree:turn 与事件 exclusive 认领，移除上游内硬编码 finance 类型白名单 |
| dsh-client-ui-trajectory | 重做 | QUOTA、ACCOUNT_QUOTA 与 FORBIDDEN 的中英文说明 |
| dsh-llm-pi-ai | 重做 | 额度识别优先于 401/403；401 认证、403 拒绝。实际 adapter 分类回归通过 |
| dsh-llm-deepseek | 重做 | 额度优先，401/403 区分，文件 API 保留拒绝码。实际 adapter 分类回归通过 |
| dsh-client-ui-conversation | 重做 | 研究场景 hero、输入占位与空 preview，保留中英文 |
| dsh-web-frontend | 重做 | 对 npm 实际加载的 ui-primitives 打包产物补 stock-ref、result 单图段落、vibe 围栏/流式位置/复制摘要；实际产物检查通过 |
| dsh-client-ui-theme | 新增（2026-10-14） | 设置快照字号字段缺失时回落到主题默认字号（正文 14px）的防御补丁；0.2.1 下实际把正文撑到 16px 的原因是产品 `client.tsx` 读了已不存在的 `snapshot.fontSize`（已改正）。移除条件：上游 `sectionFontSizes` 对缺失字段给默认值 |

除前两项外，每项对应一个 `+0.2.1-rc.2.patch`。layout、model-selection、theme、llm-deepseek、llm-pi-ai 原行为直接重生成；chat、conversation、trajectory、web-frontend 按 rc.2 产物移植。移除条件仍是上游提供等价行为并经过对应运行验证；不能因为补丁安装失败而删除功能。

`check-inline-result.mjs` 从发布的 Web entry 提取真实解析器、流式分段和 React renderer，覆盖 result 回退、普通图片、stock-ref、vibe 未闭合围栏、冻结前缀后的绝对位置和复制摘要。CSS、图标、无关文件上下文及代码块边界为受控绑定；它不能证明浏览器布局、真实模型输出或 Backend 证据正确性。带哈希产物升级后必须重新定位，不能沿用旧截取边界。

## 升级与回退规则

升级前在已验收提交上打本地基线标签 `baseline/dsh-<版本>`（两仓；已存在不移动），备份 DSH 状态；独立 worktree 和独立 DSH_HOME 验收后再切换。此次用户禁止触碰现用 DSH_HOME，故未备份或迁移用户状态，也未切换主目录。

记录带时区的 ISO 切换时间，开新会话实际发起请求后运行 `node scripts/audit-session-tools.mjs --home <隔离或目标 home> --since <时间>`。只读取预设名和请求工具名：禁用工具退出 1，无工具表、空目录或损坏记录退出 2；退出 0 才满足该项。源码断言、空白会话及模拟模型不能代替真实问答验收。

正式回退须恢复基线版本的 package、lockfile、patches、Stock 插件及相容的 DSH 状态备份，再安装验证。不能让旧运行时直接改写已被新版迁移的用户会话。当前 worktree 未切换，回退不需要改变主目录；基线标签保持原值。

共享约束见 [不变量 #16](../../../docs/contracts/invariants.md) 与 [Human Checklist](../../../human-checklist.md)「DSH 运行时与历史会话」。本 Task 不做 Desktop 打包。
