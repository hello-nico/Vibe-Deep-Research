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

1. 状态与结论：codex2：两仓 detached .worktrees/codex2-rc2 升级完成；§5 第1–3项完成，第4项未通过。华友研究第4步两次未完成，第5、6步等待；不切换、不提交，已停。
2. 改动文件：Vibe runtime manifest/lock、10补丁、checker/README；finance-ui 子任务创建、result-projection、dsh_paths 及测试；Stock dsh manifest/lock、background-review/research-tools 及测试。只改两仓指定 worktree；本 Task 仅回填§9。
3. 证据：Vibe 476通过/仅#34端口占用失败，tsc/文档/不变量/checker及两仓diff检查通过；Stock 320通过。七页截图、真实图表/问助手完成、audit退出0；报告 .local/dsh-rc2-upgrade/report.md，任务 task:841b5d76969e819b。
4. 与规格的偏差及理由：直接锁定session-controller使宿主同实例打补丁；公开创建窗口替代rc.2移除的persona/toolFilter；独立代理避免启动器读取.env。模型仅按补充授权传入环境变量，未打印/落盘；未改主目录产品代码与pi1取数文件。
5. 未覆盖的缺口：华友首会话工具JSON格式错误；自动续跑两次保存均403 invalid research hook token，未获该令牌注入授权，第6步未执行。未验收完整整理/GBrain导航/打包；浏览器已关闭，5939保留，未触碰5930或现用DSH_HOME。
6. 下一步谁做什么：Claude审阅两仓diff与报告；用户/Claude确认hook令牌安全进程注入方案，同时开启STOCK_RESEARCH_ACCUMULATE=1，复核模型格式错误后再授权新一轮华友研究，须见第6步完成并重审计；未通过前不切换现用工作台。
