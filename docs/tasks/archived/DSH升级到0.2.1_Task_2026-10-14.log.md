# DSH 0.2.1 升级执行记录

## 2026-10-14 Codex

- 用户确认允许在 Vibe worktree 同步修改 `orchestrator/src/dsh_paths.ts` 中的版本门禁及对应测试；主目录不动。此项是对 Task §4 的必要范围补充，不涉及本机数据服务迁移或新功能。
- 两仓基线标签已存在并保持原值；新 worktree 基线分别为 Vibe `ec57148b96f8052448c6ed75e0b0de91180a4890`、Stock `210960f192a0d0e4e58bbec6aff022fc0dc595f3`。
- npm 精确版本可得，统一使用 registry npm 包。旧 lock 原地升级曾遗漏 Session Controller，已在空目录生成完整 lock 后干净安装，不混入本地 tarball。
- 自定义写入实际有五类：status、maintenance、topic-candidate、suggestion、vibe-check。全部迁移新插件记录接口，前端保留两种名称读取。
- 干净 npm ci 成功应用九个 0.2.1 补丁并通过实际 Web 产物检查。随后按真实 adapter 测试修正 pi-ai 的额度优先顺序；新补丁对 pristine 产物 dry-run 成功，adapter 测试通过。
- Stock `pnpm test` 314/314；Vibe 最终 `tsc --noEmit` 通过、`npm test` 445/446（无跳过或取消），唯一失败是实际运行时联测发现 `subagents.start is not a function`。未删改失败断言。
- 该缺口也影响 `finance-ui/host-state.mjs` 的报告、公司研究任务。0.2.1 `startActivation` 的本地子会话须持久化并进入父目录，signal 只取消发布前阶段，发布后由调用者 dispose；已向用户提出此生命周期差异，尚未收到确认。相关执行代码保留未适配状态，不能合入。
- 测试接线补齐 0.2.1 subagents 所需的 workingDirectory/fs-local；跨仓原生联测对 DSH 依赖使用宿主安装解析，避免 Session 私有品牌来自两份模块。模型和 Backend 为受控替身，不能当真实问答证据。
- 隔离 Web profile 使用官方 plugin add link 注册两插件。端口 5939/5949/8766，独立状态和工作区；8709 验证代理只转发 GET/HEAD/OPTIONS 到 8700。未读取或复制现用凭据。
- 真实浏览器走查了对话、动态、跟踪、关注、个股、资料、设置及问助手面板，截图在主目录授权输出 `.local/dsh-upgrade/`。Client 空库未复制用户自选；跟踪/关注只覆盖空状态。个股页读取已有云铝股份研究及内嵌数字，未运行新研究任务。
- 审计发现旧 `agent-presets` 配置节点已失效，创建了四个 standard 空会话。产品组合改用 `agent-preset-registry` 后，新建空会话 `session-b4b855d3-6fbc-44e8-872a-8d60aabc26d5` 确认为 vibe。2026-10-14T04:06:53Z 后的工具审计退出 2（1 会话、0 工具请求头）；没有把空会话算成通过。
- 模型凭据仍为空，已请求用户自行配置隔离设置页或允许记为未验收；尚未收到回复。带图表深度问答和问助手问答未执行，不伪造会话结果。
- `verify-docs`、`verify-invariants`、版本门禁 4 项测试均通过。自检定位上述真实接口阻塞；确定性门禁未全过，不进入最终独立审阅或合入。主目录并行出现其它工作改动，本任务未修改或回滚它们。
- 收尾关闭本任务临时浏览器和 5939/5949/8766/8709 隔离进程，保留 worktree/状态/截图/日志；用户原工作台和 Backend 8700 未停止。

## 续轮：用户确认 startActivation 语义

- 用户明确要求三条路径迁移为 `ctx.subagents.startActivation({ provider: 'spawn', label, request, signal, delivery: 'caller' })`；使用 childId、result、dispose，子会话必须持久化供任务续跑及过程面板读取。
- 冻结任务记录语义：用户中止写 cancelled；宿主关闭仍保留 running，由下一启动续跑；同一步两次失败写 failed；ACTIVATION_LIMIT_REACHED 必须成为可见失败原因，不吞掉。
- 同一两仓 worktree，原禁止提交/push/scripts/start/读取凭据和触碰现用工作台的限制保持。完成自动门禁后启动隔离环境并提示用户“请填模型密钥”，等待手动配置后执行真实图表问答、问助手问答、个股重新研究完成与工具审计。
- 真实重新研究会写 Backend，与原 Task 的8700只读条件有冲突；已请求用户明确测试公司写入范围或使用隔离Backend，接口迁移及测试不依赖该答复。
- 用户随后明确授权对现有8700写入，仅海螺水泥600585.SH，一次“重新研究”直到完成；禁止其它公司，尤其神火000933.SZ。深度对话与问助手两次问答只读、不保存记录或触发写回。报告必须记 task_id、会话ID及保存后的 researchVersion，供必要时撤回。真实验证据此收窄代理写入范围。
- 用户明确要求检查当前环境变量中的模型密钥。检查仅输出变量名与存在状态；发现 DEEPSEEK_API_KEY 后将其配置到本任务隔离 DSH_HOME 的私有 .env（0600），不输出值、不读取原件或现用配置。此授权替代先前等待用户手填模型的步骤。当前进程没有 STOCK_RESEARCH_HOOK_TOKEN；Backend 公司保存接口明确需要宿主授权，后续需在隔离环境配置，不能猜测或复用无关密钥。
- 用户明确允许从对应代码的 .env 读取 STOCK_RESEARCH_HOOK_TOKEN 并复制过去；仅解析 Stock-Research 主目录 .env 的此键，配置到隔离 DSH_HOME/.env（0600），不输出值、不复制其它配置或认证。该授权替代前述等待用户手工补宿主凭据的步骤。
- 真实深度问答已完成，会话 session-5e4d33cf-728f-471a-a671-d09ed12544cc，复用海螺已有行情制品 result:02373238cb9b413ba928f6bd31f99fa4，图表在实际浏览器渲染；只读期间0个写入转发，模型一次派生计算请求被范围代理拒绝，回答明确保留缺口。
- 海螺写前 researchVersion=null。打开尚未研究的个股页时，现有自动首研逻辑于2026-10-14T04:56:48.125Z启动唯一task:00d145cd9ca7cf15（子会话d11b5edf-0ed5-4220-bb79-abd7420b3c9b）。没有再次按“重新研究”另建任务；沿同一已授权任务完成，触发方式与显式按钮验收的差异保留。范围代理已改为仅允许海螺研究写入，其它公司/全局记忆/Topic仍拒绝。
- 三路径改为startActivation caller、childId/result/dispose；Stock增加sessionPersistence必需注入，后台暂存状态保留至Backend交接结束。关闭不计失败次数，用户cancel先写cancelled，容量拒绝显式记录。真实原生运行时测试验证持久子会话/descriptor/父目录；受控模型不是实际模型验收。
- 最终Vibe450/450、Stock314/314，无跳过/取消；tsc通过，文档门禁和diff check通过。实际模型为隔离DeepSeek-V4.1-Flash；凭据只在用户明确授权后配置。
- 问助手session-a8f6ae1b-20a3-4b0f-bc70-5c176d6ba332完成；实际仅read_page_context及wiki_read两次，无写工具/保存记录。上下文遗漏当前页可见现金指标，答案正确性未验收。
- 唯一海螺任务于05:02:43.860Z completed，正式GET回读version1/researchVersion ffaa4ab1458f26e2cc96642dcc03014313836ba86cb4fe8a8c4166e1e47ee535。关键变量两次422 scenarios额外字段后skipped，保存裸数字校验失败后模型修正成功；后台整理草案422、候选超范围拒绝，05:04:01整理skipped。没有改Backend校验或再开研究任务。
- 最终审计since2026-10-14T04:53:41Z退出0，5个新会话、4个工具请求头、0损坏。代理转发6个海螺相关写请求、拒绝4个；其它公司写入0。代理已恢复readonly，保存截图/读前读后/任务回读/审计日志。仅关闭本任务隔离进程及浏览器，未停止8700与现用工作台。待Claude独立审阅及用户验收，不提交/合入。

## 最新HEAD续轮（用户2026-10-14授权）

- 用户要求同一worktree更新两仓主目录最新HEAD，适配任务/跟踪/local-data/backend-connection/研究关键点及calculation-protocol；重跑全部门禁、工具审计与三项真实运行（两问答只读，海螺唯一研究写入，其它公司禁写）。验证后删除隔离模型密钥及hook令牌副本，报告追加，保留隔离工作台供用户验收。
- Vibe从ec57148b快进至b2e7be1507bd39239e26269d6b5c073fd6b501ce，Stock从210960f快进至6e3a8650bb4a9e486a364ae321243ba95ce75085。先保存二进制diff与Task旧回填，再merge --ff-only --autostash；均Applied autostash，无冲突。未执行git commit/push，主目录未改，升级改动保持未提交。
- 原Task规格不改；本轮用户明确扩展适配已合入主目录的新增模块，并授权继续一次海螺真实研究。隔离凭据删除为本轮必须完成项，不能仅关闭进程代替。
- 适配local-data数据根到宿主同一Client目录，真实SQLite回归通过；0.2 connection.admit/webServer.register实际可用。连接设置真实保存代理地址并测试成功，Stock后续请求沿同一文件配置代理。主目录calculation-protocol新字段/模板/快照保留，实时Backend OpenAPI一致。
- 最终Vibe459/459、Stock316/316；tsc/build通过。本机服务97通过、0失败、1 Windows ACL检查按macOS平台跳过；初跑缺worktree .venv签名导出失败，指定已有Python环境后通过，未放宽断言。docs/invariants/两仓protocol/diff check通过。
- 真实深度新会话session-1c07f63d-c989-4e75-9029-02896e00a868仅read_research_result一次，图表实际渲染；问助手新会话session-f39d4f6e-60d5-4109-9ce2-12f7beab70c7只读四工具调用。期间转发写入0，自动补覆盖被拦；助手仍遗漏当前页现金指标，答案正确性未验收。
- 点击重新研究一次，新task:83d1084ba5392c6b、child daccfe52-3a81-4507-80b4-60c6c24df06b。05:47:24.451Z创建、05:52:39.638Z completed；计算首次200，关键变量done，首次保存裸数字拒收后修正成功，version2回读。researchVersion bb6fc8c0f48b270d890cfa51427437b40b3eb16fe764093beec8c42d2134890e。
- 敏感性result:1fe1064a02494c2296a0f790a1e70ed0、情景result:1a6ab0f59cd14f46b8d85148771150d6。成本份额保留假设待校准；后台a0be912b-ddbc-4298-89b3-e1ca10d3b5af草案422/全局写入被范围代理拒绝，整理skipped，不声称发布成功。唯一研究没有追加第二个root task。
- 工具审计since2026-10-14T05:42:50Z退出0，5新会话/4请求头/0损坏。验证代理转发6次海螺相关写请求、拒绝4次，其它公司写入0。恢复readonly，保留完整round2证据及截图；所有会话/版本见报告与round2-validation-run.json。
- 05:55:39.410Z删除隔离DSH_HOME/.env整个复制文件，两键为DEEPSEEK_API_KEY/STOCK_RESEARCH_HOOK_TOKEN；10040个隔离文件含解压日志检查无剩余复制值，隔离.credentials.yaml不含该两值。原件未修改。停止验证宿主后env -i无复制凭据重启，回读任务completed与已保存个股计算页通过。
- 留http://127.0.0.1:5939/供验收（DSH5949/只读代理8709），不启动独立8766，不运行scripts/start、不提交/push。报告已追加；待Claude独立审阅与用户验收。新的模型请求需用户自行在隔离设置配置，已删除副本不能恢复使用。
