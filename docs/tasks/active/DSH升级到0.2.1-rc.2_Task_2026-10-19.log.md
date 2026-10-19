# DSH 升级到 0.2.1-rc.2 · 审阅记录

## Claude 审阅

### 2026-10-19 晚 · claude3 · VibeAssistant 子插槽阻塞

- 根因：rc.2 原生 assistant-step 声明子插槽 reasoning.body / message.images；框架一槽只许一个声明者（ui-slots register 191–193）。
- 框架只给声明了 children 的条目发 renderSlot，且没有公开出口；遮蔽它的包装条目既拿不到 renderSlot，也不能再声明。
- 依据：两槽的原生默认条目只做一件事，转调根级工厂 conversation.chat.reasoning.content / conversation.images.content。
- 依据：渲染器给每个条目都发 renderFactorySlot（renderer client.js:740）。
- 修法：VibeAssistant 去掉 children，自建 renderSlot 转调上述两个工厂，外包 data-slot 锚点；原生组件不改，零 DSH 补丁。
- 代价：第三方若往这两个子槽注册替换条目，在 Vibe 会话里不生效；当前产品没有此类注册，可接受。值得向上游提“遮蔽条目继承子槽授权”。
- 验证：vibe_components 25/25、tsc 通过。全量 482 项 480 过：#34 端口占用（已知）。
- 验证：background_review_runtime「native spawn isolates…」在 worktree 稳定失败，主目录 alpha.2 同文件 4/4，已派 codex2 查根因。
- 待：codex2 在 5939 做真实页面复核（折叠/展开/控制台/VibeAssistant 实际挂载）后再判本线通过。

### 2026-10-19 晚 · claude3 · 合入主目录

- codex2 5939 复核通过：assistant-step 胜出者 priority -10，Compact 默认折叠、思考可展开，三类插槽错误 0，研究组件与建议尾标记在页。
- spawn 测试失败根因：.worktrees 下相邻 Stock 软链指向 alpha.2 主目录产物；codex2 改为按配对 worktree 定位，属测试路径问题，非 rc.2 缺口。
- 审阅：startTaskActivation 借 AsyncLocalStorage 在 agent/created（ctx.serial，同调用链 await）装人设并清空全局工具；并发隔离与监听释放有 child_composition 测试。
- 审阅：Stock 后台整理同样改为创建窗口装人设与工具限制，请求不再带 persona/toolFilter；结果投影补 groupTree/exclusive 属 rc.2 契约。
- 复跑：Vibe 482 项 480 过（#34 端口占用；#427 并发偶发，单独两次均过），tsc 过；Stock 320/320；文档/不变量/协议门禁过。
- 合入：两仓 worktree 改动（不含 docs/tasks 旧副本）复制进主目录未提交；与 worktree 逐字节比对 Vibe 426、Stock 788 个文件，0 差异。
- 主目录 runtime 仍是 alpha.2 安装产物：用户需先重装 runtime 依赖再重启工作台，否则启动器明确报“需要 0.2.1-rc.2 运行环境”。
