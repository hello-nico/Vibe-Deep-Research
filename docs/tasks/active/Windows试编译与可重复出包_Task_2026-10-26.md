# 未签名 Windows 试编译，Mac 出包脚本可重复

2026-10-26 claude 写定，交 codex2。在 deepseek-harness 与 Vibe 的独立 worktree 中实施；不签名、不公证、不上传、不提交、不 push、不读 `.env` 与证书、不碰用户正在用的工作台与 DSH_HOME。依据：todo §1.5 打包线；[插件装进桌面安装包](../archived/插件装进桌面安装包_Task_2026-10-14.md)（Mac 未签名品牌包已可出，R6 当时不做 Windows）。

## 1. 目标

①一条命令从当前两仓代码出 Mac 未签名品牌包（插件与补丁齐全）；②未签名 Windows 安装包试编译成功，能装、能启动到首页。

## 2. 现状（Claude 核实）

- 10-19 有未签名 Mac 包 r9（rc.2）；出包步骤散在 [插件装进桌面安装包] Task 与 `.local/desktop-spike/`。
- Windows 构建从未做；本机为 macOS。
- 运行时补丁（patch-package）10-26 新增 dsh-llm-deepseek 尾随括号容错，需随包。

## 3. 冻结决定

P1 写一份出包脚本（放 Vibe `desktop/scripts/` 或现有打包目录，执行方选），步骤：取两仓指定提交 → 装插件 → 应用补丁 → 品牌资源 → 出 Mac 未签名包；脚本不含任何密钥。
P2 Windows：先查 Electron 构建能否在 macOS 交叉出未签名 Windows 包（electron-builder + wine 或等价）；不能就停下写明需要什么机器。能出就在 §9 写清产物与限制。
P3 安装包不含 Python、不含任何密钥；按 AGENTS 做一次密钥扫描。
P4 出的包放 `~/Downloads/`，文件名带日期；不覆盖用户已有包。

## 4. 范围

打包脚本与配置；deepseek-harness / Vibe 独立 worktree。

## 5. 验收

Mac 包能装能启动（可用 `open` 冒烟，截图或日志）；Windows 包产物存在，能否启动写明验证程度。

## 6. Out of Scope

签名、公证、更新源、云部署（用户定为最后）。

## 7. Stop Conditions

Windows 必须 Windows 机器才能构建；需要证书。

## 8. 回滚

删 worktree 与产物。

## 8.1 修订 1（Claude，2026-10-26）

Windows 停止正确（rc.2 打包脚本只接受 Windows x64 主机，需 VS C++ 与 Windows SDK），等用户提供 Windows x64 构建机。Mac 部分拆开继续：P1 出包脚本、P3 密钥与 Python 扫描、P4 产物放 ~/Downloads（带日期、不覆盖）；以两仓当前主目录 HEAD 为源（未合入的 worktree 改动不带），Mac 包装机冒烟启动到首页。

## 9. 当前交接

1. 状态与结论：按 §8.1 续做 Mac，新增 mac-arm64/mac-x64 两目标；Windows 仍停。用户 10-26 明确裁决 P3：保留 DSH 原生 Python，仅禁止 Stock 本机 Python 链；扫描据此保留原生运行时清单，不删除 DSH 能力。构建与验收进行中，尚无通过的新包。
2. 改动文件：仅本 Task §9 与 Vibe .worktrees/codex2-winpack/.local/windows-package-check/README.md 诊断证据；新建 Vibe detached worktree（bcf19003）和 DSH 同名 worktree（产品锁定 rc.2 687f282e86），无打包脚本或产品代码修改。
3. 证据：rc.2 apps/desktop/scripts/package-target.ts:180–181 明确拒绝非 Windows x64；prepare-windows-installer.ps1:11–17 要求 VS C++、Windows SDK、vcvars32.bat/cl。只读 origin/master 三份指定文档（22ddee3792），打包指南 :153–161 同样要求 Windows x64；retained-unsigned 是拒绝发布的预期夹具，不是成功产物。
4. 与规格的偏差及理由：触发停止条件后未继续 Mac 组装或编写未验证出包入口。仅参考 master 文档，不应用其代码或变更 rc.2。未执行会读取 .env.windows 的上游命令，也未访问证书；现有 Mac pack.mjs 不因源码检查宣称本轮已验收。
5. 未覆盖的缺口：Mac 重建/补丁/安装启动未完成；Windows 无 EXE；无新包可做 Python/密钥扫描或交付。verify-docs 通过；verify-protocol 被其他线《问助手合并为同一对话助手》Task :58/:63/:64 超长及交接字段顺序阻塞，未越界修改。仅静态证据，不冒充编译成功。
6. 下一步谁做什么：Claude/用户提供独立 Windows x64 构建机，配 Node 24、锁定 pnpm、Git、pwsh、tar、Python、VS C++ 与 Windows SDK；无需证书。若 Mac 单独继续，先明确拆分停止范围；codex2 已停，无签名、公证、上传、提交，不碰 DSH_HOME 或 5930。
