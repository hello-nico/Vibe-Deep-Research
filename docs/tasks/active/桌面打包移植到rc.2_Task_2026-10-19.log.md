# 桌面打包移植到 rc.2 · 审阅记录

## Claude 审阅

### 2026-10-19 晚 · claude3 · 最终未签名包

- 快照来源：两仓 .worktrees/codex2-rc2（与已提交的 Vibe fc0aeaae / Stock 1d4c02c 逐字节一致），codex1 哈希核对来源未变。
- 产物：Vibe-Finance-0.2.1-rc.2-mac-arm64-unsigned.zip，SHA-256 296737c8…c717，Claude 复算一致；两个产品 tgz 见 SHA256SUMS。
- 首启：隔离 home 缺失偏好时写入 compact，已有 standard/next-input 保持；两个自建实例退出码 0；原生首页截图已看，中文首页与导航正常。
- 缺口：问助手打开后焦点留在入口按钮（手动点击输入框正常），记为产品侧待判断，不阻断试用；未做模型研究、Windows、签名、公证。
- 下一步：用户重启主目录工作台（先 scripts/setup）并试用 Mac 包后决定后续方向；签名需用户 Apple 证书。
