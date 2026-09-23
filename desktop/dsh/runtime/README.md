# 产品 DSH runtime

固定 `@deepseek-ai/dsh-*` 为 `0.1.2-rc.1`，React / ReactDOM 为 `18.3.1`。`package-lock.json` 记录完整安装闭包；运行依赖与用户 `DSH_HOME`、研究工作区分开。

通过仓库 `scripts/setup` 执行 `npm ci`，postinstall 自动应用下面补丁，失败即中断。产品插件通过官方 `plugin add link:` 安装到配置的 Web profile；不复制私人配置与凭据，不要求存在相邻 dsh-desktop。

## 产品运行配置

官方 `web` profile 提供运行底盘。`../finance-ui/cordis.patch.yml` 拥有固定产品组合、人设基础及通用工具权限（关闭 bash、PowerShell、文件读取与文件搜索，并关闭 web-runtime `surfaceContext`，避免把本机 GUI 地址和 runtime 源码路径注入模型）；Stock-Research 研究插件拥有原生研究工具及其生命周期，不覆盖这些全局设置。

`desktop/dsh-dev.ts` 启动时只为安装位置生成 `DSH_HOME/finance-runtime.patch.yml`，配置产品预设的绝对目录与默认 `vibe` 预设，不读取用户预设。启动使用 `dsh --profile web --patch <finance-runtime.patch.yml> --port <产品配置端口>`；旧阶段命名的 patch 不再加载。DSH profile 和会话仍留在产品专用 DSH_HOME。

## 升级与回退规则

每次升级 DSH 前，先在已验收提交上打本地基线标签 `baseline/dsh-<版本>`（Vibe 与 Stock 两仓），并备份 `.local/dsh`；在独立 worktree 升级，隔离验收后再切换，切换验收后打新基线。回退时检出基线标签里本目录的 `package.json`、`package-lock.json`、`patches/`（及 Stock `dsh` 的 package / lockfile / dist），恢复 `.local/dsh` 备份，`npm ci` 后重启。完整规则见 [Human Checklist](../../../human-checklist.md)「运行时升级规则：先打基线标签」。当前基线：`baseline/dsh-0.1.2-rc.1`。

## 补丁归属

这些补丁来自此前 M3 使用的 rc.1 运行环境，显式保留已有行为；不是当前产品修改上游源码的隐式前提。「类型」按实际 diff 区分：bug fix = 修上游缺陷；产品功能 = 上游没有的产品行为；产品配置 = 默认值 / 装配调整；文案 = 界面文字。混合补丁分条列在备注。移除条件在下次升级时逐项验证，不预设上游已修复任何 bug。

| 包 | 类型 | 现有依赖与内容 | 移除条件 |
| --- | --- | --- | --- |
| cordis-plugin-loader 1.0.3 | bug fix | 安装回落的 Node 包解析：裸名 `import` 失败时经 `createRequire` 按安装位置重解析 | 上游提供等价回落；升级后实测 `link:` 插件的裸名 import 成功 |
| dsh-client-modules | bug fix | 客户端包元数据解析回落：按 `expectedPackageName` 经 `createRequire` 重解析 | 上游等价回落落地，产品插件元数据可解析 |
| dsh-api-session-controller | 产品功能（分条） | ① 报告只读子会话：`retainSubagent` 引用计数挂载（M9.5 归属）；② `sessions.retain` 客户端契约扩展（`source`/`signal`）；③ 历史读取 cwd 门禁：普通会话要求 cwd，已校验子 Agent 豁免；④ 新会话事件 JSON 安全（bug fix） | ① 归 M9.5 后续包评估替代；② 上游已用 `sessions.retain(address, { source, signal })`（见 `sidebar-chat/index.tsx`，0.1.6-alpha.2），升级后验证只读面板、关闭/释放与后台执行互不干扰后改用上游 session patch；③④ 上游提供等价门禁与事件序列化后逐项退出 |
| dsh-session | bug fix | `Session.append` 接受并持久保留显式 `ignorable: true` envelope marker，使插件的纯信息事件可被旧 vocabulary 的冷读路径安全跳过；缺省仍为 required，surface 事件仍要求 `SurfaceIntent` | 上游 `Session.append` 等价支持、校验并保留该 marker，且未知 required 事件仍被 persistence reader 拒绝 |
| dsh-client-ui-settings-models | 产品功能 | 已有 Provider 配置与模型管理改进（自定义 Provider / 模型增删 / 连通性测试等 UI 依赖） | 逐项对照上游设置页能力清单，等价覆盖后退出；退出前不能删除（模型接入入口依赖它） |
| dsh-client-ui-model-selection | 产品功能 | 模型筛选与选择行为（会话模型切换、筛选控件） | 上游筛选/选择能力等价后退出 |
| dsh-client-ui-agent-preset | bug fix | 会话列表订阅先握住全局 `list` store，不再在通知回调里回查 `scope.sessions`。产品把 `#dsh-conversation` 挂在非对话路由上时，conversation isolate 已 inactive，回查会刷屏 `cannot get required service "sessions" in inactive context` | 上游列表订阅不再经过 inactive isolate 的 `sessions` 查找，升级后在个股/行业图文报告页硬刷新核对控制台不再刷该错 |
| dsh-client-ui-chat | bug fix + 文案 | ① 错误语义：区分额度（QUOTA）/ 认证（AUTH）/ 服务商拒绝（FORBIDDEN）；② 运行中文案「研究中…」替代「深度求索中...」 | ① 上游错误码语义等价；② 上游文案可配置 |
| dsh-client-ui-trajectory | 文案 | 轨迹面板 QUOTA / FORBIDDEN 失败语义文案（中英） | 上游文案可配置或语义等价 |
| dsh-client-ui-deliverables | 产品功能 | 本地路径引用解析（`localPathReference`：绝对路径 / 含分隔符 / 常规文件名才当路径，裸标识符保持惰性）；产物为空时仍提供 mention 解析 | 上游支持等价本地路径 mention 与空产物行为 |
| dsh-llm-pi-ai | bug fix | 错误分类区分 401/403 与额度，避免把服务商拒绝误报为认证失效 | 上游分类等价 |
| dsh-llm-deepseek | 产品配置 + bug fix | ① 默认目录改官方 `deepseek-flash`（V4.1-Flash，含视觉）与 `deepseek-v4-pro`；② 错误分类区分额度、认证与服务商拒绝 | ① 上游默认目录更新后重新对照；② 上游分类等价 |

上游 `packages/client/ui-subagent/src/client/sidebar-chat/index.tsx` 已使用 `sessions.retain(address, { source, signal })`，是 session-controller patch 的升级替代候选；本轮未核验 0.1.6-alpha.2 远端之外的版本，不改任何 patch 内容。

桌面发行版的窗口、Finder、目录选择桥接及替代布局补丁不带入。产品布局、主题和导航由 `../finance-ui` 的浏览器插件拥有；rc.1 composer 的目录按钮仍是有界 CSS 例外。

升级时必须一起核对精确依赖、lockfile、补丁和原生交互；不能删除失败补丁后仅凭安装成功宣称升级完成。
