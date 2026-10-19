# macOS 本地增量打包

此入口把固定 DSH `0.2.1-rc.2` 与两仓当前产品工作树装配为未签名内测包。运行环境、品牌、profile 隔离与欢迎页来自同目录的 [desktop.patch](desktop.patch)，不修改两仓产品来源。

## 使用

在 Apple Silicon macOS 上安装 Node.js 22.19+、npm、Git 和 Xcode Command Line Tools。屏幕录制权限用于原生窗口截图；构建及首次安装依赖需要网络。

```sh
node desktop/packaging/pack.mjs --full
node desktop/packaging/pack.mjs
node desktop/packaging/pack.mjs --dry-run
node desktop/packaging/pack.mjs --self-test
```

默认来源为当前 Vibe 仓库与同级 `Stock-Research` 主目录，包含 tracked 改动及产品目录内非隐藏、非凭据的 untracked 源文件；构建先封存快照，来源在封存过程中变化即失败。支持覆盖：

```sh
node desktop/packaging/pack.mjs --vibe-source /path/to/Vibe-Deep-Research \
  --stock-source /path/to/Stock-Research --dsh-source /path/to/deepseek-harness \
  --cache /path/to/private-build-cache --downloads /path/to/Downloads
```

`--dsh-source` 是本机上游 Git 源，只在缓存不存在时读取并克隆；固定检出 rc.2 提交 `687f282e8625c6b8d11ff58211a90524be2e4317`，不修改源仓库。换机需先取得含该提交的上游仓库。清空缓存后入口会重新创建隔离构建目录、下载 pnpm 11.28.5、冻结安装依赖、应用补丁并完整装配。不会读取用户 npm/Git 认证配置、`.env` 或证书。

## 缓存与替换

默认缓存 `.local/desktop-rc2/`，运行记录在 `pack/run-*/`。互斥目录 `pack/running/owner.json` 记录本次 PID；若异常断电留下锁，先确认该 PID 已结束，再人工移走此锁。脚本不回收外部进程。

指纹包含产品 `desktop/dsh/runtime/package-lock.json`、DSH `pnpm-lock.yaml`、十个运行时补丁和本目录 `desktop.patch`。缺少完整成功缓存、指纹变化或显式 `--full` 会完整装配并输出原因。产品版本、生产依赖或 peer 依赖变化同样转完整装配，避免遗漏闭包。

完整装配构建产品与 Host/client 库、使用发布的 Web 壳、打 DSH/vendor/native 包、运行欢迎页与 profile 测试、装配运行环境、真实应用十补丁并执行 `check-inline-result`，再运行 builder 与打包运行时 smoke（含 Office）。已下载的工具、依赖和编译缓存可复用。

增量重建两个产品 tarball，在已装配的 `dsh/node_modules/` 中替换对应目录。替换前校验旧清单；替换后调用上游 manifest 规范化、清单生成和验证函数。再运行原 electron-builder 重封装 ASAR、保留 arm64 必需的 ad-hoc 处理，并执行打包运行时 smoke。不会直接篡改现有应用的 ASAR、绕过校验或改变上游 builder。无 Developer ID 签名、公证、上传或发布。

缓存仅在交付和原生验收都成功后写回；开始修改前使旧缓存失效，失败或中断后的下一次自动走 full。不要手工伪造缓存记录。

## 原生验收与交付

使用锁文件中已有的 Playwright Electron 支持启动本次从 ZIP 解出的最终应用，独立 HOME 内预置不含凭据的官方风格 profile/userData；不设置 `DSH_DESKTOP_ISOLATED`，不访问真实官方目录。不连接模型，不向 Backend 写入研究。

增量首启通过欢迎页的“连接 DeepSeek 开始使用”进入密钥页，再选“稍后配置”，检查产品首页、两个产品组合、profile/userData 隔离、Compact 首次保存及模拟官方文件哈希不变，并以 macOS `screencapture` 保存原生窗口图。

full 额外保存欢迎入口页、密钥页和全屏图，检查 36px 窗口带及全屏隐藏，再次启动检查产品组合与已有 Detailed 偏好不被覆盖。窗口带拖动沿用 r9 用户验收；自动截图和几何断言不替代人工拖动与视觉验收。原生自动化仅在退出阶段使用确认框返回值夹具，接受本实例的退出，不操作其他应用。

ZIP 和 `ditto` 解出的 `.app` 放 Downloads，使用从 r10 开始递增的空闲标签，同时检查 ZIP 与应用路径，不覆盖。运行目录保存来源清单、工作树差异、快照哈希、产品哈希、日志、原生证据及 `result.json`。成功后标准输出最后一行 `PACK` 包含档位、总耗时、ZIP 路径、SHA-256、首页截图路径。

增量超过 15 分钟即报告停止；用户仍需打开交付应用确认可用。任何失败均返回非零状态，已生成的证据保留；失败产物不会被记为成功缓存。
