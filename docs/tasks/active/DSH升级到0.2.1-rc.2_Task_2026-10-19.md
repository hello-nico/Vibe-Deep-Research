# DSH 升级到 0.2.1-rc.2

状态：2026-10-19 Claude 写定，用户同意。依据：[升级可行性](../../evals/DSH-rc2升级可行性_2026-10-19/README.md)（逐补丁结论）与上次升级 [DSH升级到0.2.1](../archived/DSH升级到0.2.1_Task_2026-10-14.md) 的流程。
执行方在 worktree 中实施：不提交、不 push、不运行主目录 `scripts/start`、不碰用户现用工作台（5930）与 `DSH_HOME`，不读 `.env` 与密钥。worktree 内安装、构建、测试产物允许。

## 1. 目标

产品（Vibe `finance-ui` + Stock 研究插件）在 DSH `0.2.1-rc.2` 上完整工作，行为与现在一致；打包线随后基于 rc.2。

## 2. 现状（Claude 核实）

- 现用 `0.2.1-alpha.2`，`desktop/dsh/runtime/package.json` 精确锁定全部 `@deepseek-ai/*`，postinstall 打 10 个补丁并跑 `check-inline-result.mjs`。npm `next` 标签 = rc.2。
- rc.2 下：layout、model-selection、theme、llm-deepseek、llm-pi-ai 5 个补丁原样可应用；chat、conversation、trajectory、web-frontend 4 个冲突；
  session-controller 包改为嵌套安装（`dsh-web-app/node_modules`、`dsh/node_modules`），原补丁需改定位。没有补丁可删。
- `check-inline-result.mjs:19、44` 的截取边界在 rc.2 失效。`orchestrator/src/dsh_paths.ts:86–88` 只接受 alpha.2。
- 冲突处可试的扩展点：ui-chat 的 finance 过程节点可改用「Definition 认领目标事件」（上游提交 `533299e6ab`）；其余中文错误、研究措辞、隐藏注册行、首屏标题仍需补丁。
- 产品聚焦色用 DSH 令牌 `--dsw-focus-ring-color`（`desktop/src/index.css`），升级后须仍生效。
- 上次升级交接已出现「整理 skipped」未被追查（即 10-19 修复的 422）；本次验收必须看到整理完成。
- 详细逐补丁依据（文件与行号）：`.local/dsh-rc2-eval/summary.md`（主目录绝对路径 `/Users/apple/ts/src/Vibe-Deep-Research/.local/dsh-rc2-eval/summary.md`）。

## 3. 冻结决定

R1 流程：两仓在当前 HEAD 打本地基线标签 `baseline/dsh-0.2.1-alpha.2`（已存在不移动）；两仓各开 detached worktree 完成全部改动，主目录不动。
R2 包来源：只用 npm 精确版本 `0.2.1-rc.2`，overrides 同步；不混用本地构建包。
R3 补丁：5 个可应用的按 rc.2 重新生成并改名 `+0.2.1-rc.2.patch`；4 个冲突的按 rc.2 源码重做，保留现有产品行为；session-controller 改为对实际被加载的实例打补丁并说明依据。
  能用扩展点替代的部分改用扩展点并删掉相应补丁片段；不得为让安装通过而删除行为。
R4 `check-inline-result.mjs` 改为检查 rc.2 实际加载产物；`dsh_paths.ts` 版本门禁改为接受 rc.2（只接受这一个版本）。
R5 Stock 插件：`dsh/package.json` peer 与 devDependencies 升到 rc.2，接口变化按需适配。
R6 不做：Desktop 打包与品牌补丁移植（下一个 Task）、新功能、DeepSeek 原生 web 工具接入。

## 4. 范围

codex2。Vibe worktree `.worktrees/codex2-rc2`：`desktop/dsh/runtime/`、`desktop/dsh/finance-ui/`、`desktop/src/verticals/finance/dsh/`（只为接口变化）、`orchestrator/src/dsh_paths.ts`、`desktop/dsh/runtime/README.md`、测试。
Stock worktree `.worktrees/codex2-rc2`：`dsh/package.json`、lockfile、接口适配与测试。
并行线 pi1 正在删除本机取数链（`orchestrator` 取数部分、`/finance-api/fetch`、`datasources/`）：不改这些文件；冲突由 Claude 合入时处理。

## 5. 验收

1. 门禁：Vibe `cd desktop && npx tsc --noEmit && npm test`（仅 #34 失败）、`node scripts/verify-docs.mjs`、`node scripts/verify-invariants.mjs`；Stock `cd dsh && pnpm test`；`node check-inline-result.mjs` 退出 0；各自 `git diff --check`。
2. 隔离工作台（2026-10-19 Claude 按用户全权授权补充）：必须经产品启动路径（`orchestrator/src/dsh_paths.ts`）启动，仅替换 DSH_HOME 与端口；
  研究保存令牌与积累开关由产品进程按现行逻辑自行读取，执行方不读、不打印、不落盘。原约定：worktree 起一套，独立 `DSH_HOME`（`.local/dsh-rc2-home/`）、端口 5939，Backend 用本机 8700。模型凭据：用户 2026-10-19 授权从执行方 shell 的环境变量 `DEEPSEEK_API_KEY` 传给隔离工作台进程（DSH 按 `apiKeyEnv` 读取）；不写入文件、不打印、不复制现用 `DSH_HOME` 的凭据。
3. 运行页核对（短时无头脚本，结束关闭浏览器）：对话、动态、跟踪、关注、个股页、资料、设置各一张截图；问助手输入框聚焦计算样式无品牌色。
4. 真实运行（用户配置模型后）：一次带图表的深度对话、一次问助手、一次公司研究（华友钴业，避开并行重跑的神火与长江电力）；跟踪页第 6 步「整理结论」为完成。
  `node scripts/audit-session-tools.mjs --home <隔离 home> --since <切换时间>` 退出 0。
5. 报告 `.local/dsh-rc2-upgrade/report.md`：10 个补丁逐个处置、扩展点替代、门禁、截图与会话 ID、遗留问题。

## 6. Out of Scope

R6 所列；用户现用工作台切换（Claude 审阅、用户在 5939 验收后再决定）。

## 7. Stop Conditions

- 某补丁的产品行为在 rc.2 上只能靠改上游源码保留 → 停下报告该项，其余继续。
- 需要动 5930、现用 `DSH_HOME` 或主目录 → 停下报告。
- 执行方环境里没有 `DEEPSEEK_API_KEY` → 做完 §5 第 1–3 项后停下报告。

## 8. 回滚

删除两个 worktree 与 `.local/dsh-rc2-home/`；主目录未改，基线标签保留。

## 9. 当前交接

1. 状态与结论：codex2：两仓同步指定HEAD和未提交修复后重叠rc.2，零冲突；门禁符合要求。华友六步全done，整理17:04:04完成、草案待授权。本轮无MALFORMED_RESPONSE，审计0。中文8题开头0句英文，思考摘要19/19含英，按R3停下，未提交或切换。
2. 改动文件：两仓codex2-rc2同步Vibe 7b4afe04、Stock de8b1fc，导入指定中文及Backend修复；原rc.2差异先存.local/dsh-rc2-upgrade/sync-1757/再重放。仅worktree代码、忽略证据和本Task§9；主目录产品代码及pi1文件未自行改动。
3. 证据：任务task:2e7436e370e28fb6；研究02634130-e5c1-490c-9402-8e79fdd9a772、整理ab36a283-aa2f-4bb2-bd60-a784ab5b0146均completed。Vibe 479项478过仅#34失败，Stock320全过，tsc/文档/不变量/checker/diff均过。report.md、company-synced-task.json、audit-synced-final.json。
4. 与规格的偏差及理由：无范围扩张；产品resolve/prepare启动5939/5949、指定home，研究配置由产品自行取得，模型继承授权环境变量。首次并行测试有受控子任务超时，独立及全量复跑通过，未改断言。中文仅接口实测不开浏览器；未复现格式错误，未导出原始帧。
5. 未覆盖的缺口：.local/zh-check/summary.md记录5问助手、3深聊及全部10条中文进度；非空思考块完成态首行19/19含英，未逐帧采样UI。研究保存修正裸数字后成功，但5处无效情景占位被剔除、部分参数待校准；整理完成不代表草案已发布，旧偶发JSON错误未定因。
6. 下一步谁做什么：Claude审阅同步及rc.2差异，并按中文R3决定英文思考摘要处理；用户在5939验收，草案发布仍需授权。5939产品进程771/997保留，模型轮询已结束，本轮未开浏览器；不提交、不碰5930/现用home，codex2已停。
