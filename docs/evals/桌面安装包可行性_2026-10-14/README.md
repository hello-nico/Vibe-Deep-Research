# 桌面安装包可行性（2026-10-14）

## 问题

以 DSH Desktop 为底座装入产品插件，能否在 macOS 上得到能装、能打开对话页、能连 Backend 做一次问答的安装包；Windows 同路需要什么。对应 [桌面安装包可行性](../../tasks/archived/桌面安装包可行性_Task_2026-10-14.md)。

## 方法与数据集

被测对象：上游 Desktop `0.2.1-alpha.2`（基线 `d743267388641bc76f17c45ce8b4c231aed1d32c`）；产品插件 finance-ui 与 Stock `dsh`；运行时补丁 11 个（`desktop/dsh/runtime/patches/` 实际文件，不是 README 历史 15 行）。

题目 Q1–Q8：插件随包内置还是首启外装；0.2.x 加载与 11 补丁处置；装入后是否为我们的对话页与六导航；patch/Backend 地址如何生效；品牌能否只改配置；更新源与版本规则；macOS 上能否出 Windows 包；orchestrator 改插件的工作量。

验收：隔离 `DSH_HOME` 启动未签名 macOS arm64 目录包；能到对话页即可行，问答为加分。截图留在 `.local/`，不纳入本目录。

## 环境

日期 2026-10-14。宿主 Node v22.22.3，pnpm 11.28.5。独立 worktree `.local/desktop-spike/dsh-worktree`。实验 App ID `com.vibefinance.desktop-spike`。未读 `.env` 与密钥，未填模型，未改 Vibe/Stock 主目录业务代码。Backend 只读 health GET。

## 结果

脚本客观（来源 report，不另算）：`package:mac:arm64:dir --unsigned` 重打包退出 0；包内 smoke 退出 0（包内 Electron Node 24.21.0）；两次 GUI 启动退出 0，实见上游欢迎页与 `dsh-app://app/` 原生对话页；Windows 入口退出 1（要求 Windows x64 构建机）；health HTTP 200。产物约 1.0 GiB 未签名目录包。

执行方逐问记录见 [results.csv](results.csv)（非 Claude 判定）：Stock peer `0.1.7-alpha.2` 被 0.2.1 拒绝；finance-ui 仅 patch 解析通过；产品六导航与「神火股份靠什么赚钱」未做。

## 结论与适用边界

「macOS arm64 未签名目录包已生成，隔离启动到上游原生对话页；产品六导航与问答未达到，不算产品验收通过。」（[Task §9](../../tasks/archived/桌面安装包可行性_Task_2026-10-14.md)）

「Stock 插件被 0.2.1 peer 校验拒绝，按 §7 停止兼容修改。」（[同上](../../tasks/archived/桌面安装包可行性_Task_2026-10-14.md)）

「产物是上游壳加实验隔离保护，未装入两个产品插件……经“稍后配置”进入原生对话，无凭据、无问答。」（[同上](../../tasks/archived/桌面安装包可行性_Task_2026-10-14.md)）

Claude 审阅专节：未记录。不能把上游原生对话页当成产品可行性通过。Windows、签名、公证、更新源上线未做。

## 重跑

命令与隔离环境见 `.local/desktop-spike/report.md`（2026-10-14 11:22）。只读该报告，不遍历 6.8G 目录。工作树补丁 `.local/desktop-spike/worktree.patch`。
