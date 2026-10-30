
## Claude 补充（2026-10-26）

上游 deepseek-harness master（10-23，未发版）有打包与签名文档可参考，只读：`git -C /Users/apple/ts/src/deepseek-harness show origin/master:apps/desktop/packaging/README.zh.md`、`apps/desktop/windows-signing/README.zh.md`、`apps/desktop/tests/expected/retained-unsigned.md`。仍以我们在用的 rc.2 为构建基线，不升级。

## Claude 审阅

- 2026-10-26：Windows 停止正确（`package-target.ts` 拒绝非 Windows x64，安装器需 VS C++ 与 Windows SDK），待用户提供构建机。Mac 部分不受此限，见 Task §8.1 修订 1 续做。
- 2026-10-30：Owner 选择回收 worktree。未提交的打包脚本（`pack.mjs`、`README.md`、`build-heads.mjs`、`scan-artifact*.mjs`）已存入本地分支 `codex/winpack`（84fceb58，未推送）。worktree 里被 git 忽略的 `.local/` 诊断证据（`windows-package-check/`、`scan-*probe.json`）随回收删除，回收前没有检查忽略文件，无法恢复；恢复打包时需要重新生成。
