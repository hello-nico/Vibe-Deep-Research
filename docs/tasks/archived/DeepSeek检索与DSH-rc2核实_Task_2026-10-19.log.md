# DeepSeek 检索与 DSH rc.2 核实 · 过程记录

## Claude 审阅（2026-10-19）

- A 段（codex1）：采集完整、口径清楚，预算拦截与东方财富无代码都如实记录，未绕过。Claude 逐题读 raw/ 判定，结论写入 [evals/DeepSeek检索对比](../../evals/DeepSeek检索对比_2026-10-19/README.md)：Search 可作主力候选（接 Backend provider 层，保留 authority/rerank/summary），Fetch 不替代 Backend Reader；Exa/Tavily 只有 8 题对照是主要缺口。
- B 段（codex2）：逐补丁给出文件与行号，证据边界写得准确（宿主 200 ≠ 产品可用）。结论写入 [evals/DSH-rc2升级可行性](../../evals/DSH-rc2升级可行性_2026-10-19/README.md)：无补丁可删，5 个需重做，另有版本门禁与品牌补丁冲突。纠正 Claude 此前「新槽位可减补丁」的判断。
- 两段的 verify-protocol 失败来自 Claude 写的 §2 超长行，已由 Claude 拆行修复。
- 执行方对比记录：codex1、codex2 均按范围停下、无越界改动，质量高。
