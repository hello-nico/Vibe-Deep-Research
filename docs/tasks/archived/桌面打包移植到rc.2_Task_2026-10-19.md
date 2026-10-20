# 桌面打包移植到 rc.2

状态：2026-10-19 Claude 写定（用户全权委托推进）。承接[桌面壳品牌与更新源](桌面壳品牌与更新源_Task_2026-10-14.md)与[插件装进桌面安装包](插件装进桌面安装包_Task_2026-10-14.md)，两者在 alpha.2 上已完成未签名品牌包。
执行方在 deepseek-harness 的独立 worktree 中实施：不提交到上游、不 push、不签名、不公证、不上传；不碰用户现用工作台与 `DSH_HOME`；不读 `.env`、证书与密钥。worktree 内安装、构建与打包产物允许。

## 1. 目标

在 DSH `0.2.1-rc.2` 上产出一份**合成补丁**（品牌 + 产品插件装入），打出未签名 macOS arm64 品牌包，产品功能与 alpha.2 包一致。签名、公证、更新源上线与 Windows 包在本 Task 之后。

## 2. 现状（Claude 核实）

- alpha.2 成果：品牌补丁 `.local/desktop-brand/worktree.patch`（deepseek-harness worktree 本地提交 `48b70127bf`）；装入补丁在 `.local/desktop-bundle/dsh-worktree`（基线 `d743267388`）。
  均为主目录绝对路径 `/Users/apple/ts/src/Vibe-Deep-Research/.local/...`。
- rc.2 对品牌补丁冲突 4 个文件：`electron-builder-config.mjs`、`package-target.ts`、`smoke-packaged-runtime.ts`、`main.ts`（`.local/dsh-rc2-eval/branding-apply-check.log`）。
- rc.2 更新机制：客户端用 generic HTTPS feed；新增 latest 频道与独立 bin 路径（`desktop-auto-update-environment.mjs:14–15、162–170`）；production 更新地址固定 `download.deepseek.com`（`:29`），test origin 不能带路径（`:116–132`）。
  未签名包不带更新配置（`electron-builder-config.mjs:98、264`）。
- 产品运行时升级到 rc.2 正在 codex2 线进行（[DSH升级到0.2.1-rc.2](DSH升级到0.2.1-rc.2_Task_2026-10-19.md)），产品输入取它的两个 worktree：Vibe 与 Stock 的 `.worktrees/codex2-rc2`。

## 3. 冻结决定

R1 deepseek-harness 新建 detached worktree，基线为 tag `dsh-v0.2.1-rc.2`，放在 `/Users/apple/ts/src/Vibe-Deep-Research/.local/desktop-rc2/dsh-worktree`。
R2 品牌：沿用 alpha.2 的单一品牌配置入口与字段（名称 Vibe Finance、appId `com.vibefinance.desktop`、协议 `vibefinance`、图标）；按 rc.2 源码重做 4 个冲突点。
  更新源：production 与 test 都接受品牌配置里的 `updateOrigin`（必须 HTTPS），保留 rc.2 的 nightly/latest 频道与 bin 路径规则；未配置时上游行为不变。
R3 装入：两个产品包与生产依赖随包内置；产品 bundle patch 生效；运行时补丁按 rc.2 的 10 个补丁经 Desktop 补丁通道打上，打包流程运行 `check-inline-result.mjs` 等价检查。
R4 两份改动合成一个补丁文件 `.local/desktop-rc2/desktop.patch`，附应用说明；这份补丁是后续签名、公证与 Windows 的唯一基础。
R5 不做：签名、公证、上传、Windows 构建、更新源上线。
R6 产品应用的 profile、DSH_HOME、Electron userData 与凭证引用独立于官方 DSH Desktop，不共用、不改写（2026-10-19 用户实测发现共用）。
R7 欢迎窗口（human-checklist 2026-10-19）：只留一个主按钮“连接 DeepSeek 开始使用”，点进 API Key 页，页内一句说明去哪里获取密钥；
  账号登录降为按钮下方的次要文字链接；“稍后配置”保留。经品牌配置入口或 locale/布局补丁实现，不改上游登录逻辑；欢迎窗口始终在最前。

## 4. 范围

codex1。只在 R1 的 worktree 与 `.local/desktop-rc2/` 下工作；产品源码只读取两个 rc.2 worktree，不修改。
先做品牌与装入的源码移植（不依赖产品）；产品输入等 rc.2 线 §5 第 4 项通过（第 6 步完成）后再打包，未通过前打包步骤停下等待。

## 5. 验收

1. Desktop 相关测试与类型检查在 worktree 通过（列出命令与结果）；`git diff --check`。
2. 未签名 arm64 目录包：Finder 名、关于面板、Dock 进程名为 Vibe Finance；协议 `vibefinance`。
3. 原生冒烟（短时，脚本或系统自动化截图，结束关闭应用）：首页标志不压红绿灯、产品首页加载、设置页「连接」可见、问助手打开且输入框聚焦无品牌橙。
4. 报告 `.local/desktop-rc2/report.md`：两份补丁的移植逐项、冲突处理、合成补丁哈希、截图与日志路径、遗留问题。

## 6. Out of Scope

R5 所列。

## 7. Stop Conditions

- 产品输入（rc.2 worktree）尚未通过第 6 步验收 → 完成源码移植后停下等待。
- 品牌或更新源只能靠改 rc.2 签名、校验策略实现 → 停下报告。

## 8. 回滚

删除 R1 worktree 与 `.local/desktop-rc2/`。

## 9. 当前交接

1. 状态与结论：codex1已重打并交付r9，普通首启进入产品首页；原生红黄绿不压logo/“对话”、全屏无空带已截图核对。顶部带拖动未能证实，不记通过；自建实例正常退出0，交Claude3复核该缺口。
2. 改动文件：产品来源改为两仓主目录Vibe 15ddf0f9+未提交D8五文件、Stock 1d4c02c；仅只读封存编译，清单与tar哈希见.local/desktop-rc2/r9/source-summary.json及sources/。r8桌面补丁未改；本轮产物、日志与截图均在同目录。
3. 证据：两产品锁定构建、十补丁/check-inline-result、CLI/Office冒烟与D8规则4项通过；ZIP CRC及ASAR一致性通过。Downloads/Vibe-Finance-0.2.1-rc.2-mac-arm64-unsigned-r9.zip，SHA-256：c0603246a768060cfc916508d8e7321fbc261e97776f1ee95a702d2f5af5cb1b。
4. 与规格的偏差及理由：依本轮用户指令以主目录取代§4旧worktree来源，记录全部工作树输入。拖动一次有效请求前后窗口坐标仍为(116,33)，其余尝试被工具拒绝；不能区分自动化限制与产品问题，不擅改源码。详见report.md及r9/drag-result.json。
5. 未覆盖的缺口：顶部带实际拖动待人工复核。未填真实密钥、登录或研究；此前问助手自动聚焦缺口保留。截图为r9-native-window.png、r9-fullscreen.png等；未做Windows、Developer ID签名、公证或上传。
6. 下一步谁做什么：Claude3在Downloads/Vibe Finance r9.app人工复核拖动并判定D8；ZIP已复制、ditto解压后改为指定r9名称，未覆盖Vibe Finance.app或Vibe Finance 2.app。只退出自建实例，未操作用户实例及5930/5939；verify-protocol通过，无提交/push，已停下。
