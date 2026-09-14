# 产品 DSH runtime

固定 `@deepseek-ai/dsh-*` 为 `0.1.2-rc.1`，React / ReactDOM 为 `18.3.1`。`package-lock.json` 记录完整安装闭包；运行依赖与用户 `DSH_HOME`、研究工作区分开。

通过仓库 `scripts/setup` 执行 `npm ci`，postinstall 自动应用下面补丁，失败即中断。产品插件通过官方 `plugin add link:` 安装到配置的 Web profile；不复制私人配置与凭据，不要求存在相邻 dsh-desktop。

## 产品运行配置

官方 `web` profile 提供运行底盘。`../finance-ui/cordis.patch.yml` 拥有固定产品组合、人设基础及通用工具权限（关闭 bash、PowerShell、文件读取与文件搜索）；Stock-Research 研究插件拥有原生研究工具及其生命周期，不覆盖这些全局设置。

`desktop/dsh-dev.ts` 启动时只为安装位置生成 `DSH_HOME/finance-runtime.patch.yml`，配置产品预设的绝对目录与默认 `vibe` 预设，不读取用户预设。启动使用 `dsh --profile web --patch <finance-runtime.patch.yml> --port <产品配置端口>`；旧阶段命名的 patch 不再加载。DSH profile 和会话仍留在产品专用 DSH_HOME。

## 补丁归属

这些补丁来自此前 M3 使用的 rc.1 运行环境，显式保留已有行为；不是当前产品修改上游源码的隐式前提。

| 包 | 保留原因 |
| --- | --- |
| cordis-plugin-loader 1.0.3 | 安装回落的 Node 包解析 |
| dsh-client-modules | 安装回落的客户端包元数据解析 |
| dsh-api-session-controller | 新会话事件保持 JSON 安全 |
| dsh-client-ui-settings-models | 已有 Provider 配置与模型管理改进 |
| dsh-client-ui-model-selection | 模型筛选与选择行为 |
| dsh-client-ui-deliverables | 已有文件引用呈现 |
| dsh-llm-pi-ai | 已有 Pi Provider 接入修正 |
| dsh-llm-deepseek | 区分额度、认证与服务商拒绝；默认目录改为官方 `deepseek-flash`(V4.1-Flash，含视觉)与 `deepseek-v4-pro` |
| dsh-client-ui-chat / trajectory | 呈现对应的模型失败语义；运行中文案改为「研究中…」，不沿用 DeepSeek「深度求索」 |

桌面发行版的窗口、Finder、目录选择桥接及替代布局补丁不带入。产品布局、主题和导航由 `../finance-ui` 的浏览器插件拥有；rc.1 composer 的目录按钮仍是有界 CSS 例外。

升级时必须一起核对精确依赖、lockfile、补丁和原生交互；不能删除失败补丁后仅凭安装成功宣称升级完成。
