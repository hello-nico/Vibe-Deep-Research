# DeepSeek 检索接入 Backend · 过程记录

## Claude 审阅（2026-10-19）

- codex1 实施符合 R1–R6，mock 覆盖全面，真实四题路由正确；主动发现 docker-compose 默认仍为 exa、未透传新密钥。
- Claude 在 worktree 修三处：DeepSeek 只有中等匹配且 Exa 不可用时保留 DeepSeek 结果（原实现返回空，规格措辞也不清）；`docker-compose.yml` 默认改 `deepseek` 并透传 `STOCK_RESEARCH_DEEPSEEK_API_KEY`；`tests/test_settings.py` 旧默认断言改为新默认。
- Claude 复跑：检索与设置测试 48 通过；全量 1353 通过 / 19 失败，与主目录失败集合逐条比对无新增（17 项 Chromium、2 项存储与 GBRAIN 环境）。
- 范围外 lint 顺手整理（导入、UTC、删 last_err）可接受。待合入 Stock 主目录；用户配置密钥并重建后验收。
