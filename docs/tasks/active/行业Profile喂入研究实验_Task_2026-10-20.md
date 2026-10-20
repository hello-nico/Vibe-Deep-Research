# 行业 Profile 喂入研究实验（技术验证）

2026-10-20 用户批准（「那个实验也要跑，交给 codex，按照你说的做」），claude 写定，待 codex2 实施。真实产品链路（DSH → Stock 研究插件 → DeepSeek），隔离实例与隔离用户层，不覆盖用户已存研究；不提交；不重启 5930；不读 `.env` 与凭据文件，模型密钥只用当前 shell 环境变量传给隔离进程，不打印、不落盘。
权威：[估值体系总览](../../decisions/proposed/估值体系总览_2026-10-20.md) 第 3 节（Profile 冻结、作注意力规格）；用户 10-20「这是固定的 token 成本，一定要确定了有价值才做」；方法实验的隔离做法（[产业链研究方法真实链路实验](产业链研究方法真实链路实验_Task_2026-10-20.md)、`.local/method-experiment/`）。

## 1. 目标

回答：个股页研究时把公司所属申万二级行业 Profile 的核心问题交给模型，研究是否明显更贴行业、少套话，且不引入硬凑或错误内容；每次多花多少 token 与时间。

## 2. 现状

- 研究工具集 Stock `dsh/src/consumers.mjs` `COMPANY_RESEARCH_TOOLS` 不含 `read_industry_profile`，数据包无 Profile 内容。
- Profile：`workspace/research/industry-profiles/profiles/<代码>.json` 的 `core_questions`（每行业中位 5 条、约 250 字）。

## 3. 冻结决定

P1 两组：A 现行研究；B 在 `read_company_data_packet` 返回里加 `industry_attention`（只含所属二级行业核心问题原文，不含 rationale、证据与公司列表），提示词加一句「逐条回应 industry_attention 里的问题：结合本公司当期数据回答，或写明不适用及理由；问题只是关注方向，不是事实」。其余字节相同，差异存 `method-B.patch`。
P2 样本：神火、云铝、农业银行、长江电力、宁德时代、万华化学，每家 A、B 各 2 次，共 24 次；每次全新隔离会话与用户层。
P3 盲评准备：输出页面研究文字（论点、各节摘要与详情）存为随机编号文件，组别映射写入单独的 `mapping.json`，并记录其 SHA-256 于 §9；Claude 评完前不读映射。
P4 机械项：token（总、未缓存、缓存读、输出）、步数、耗时、保存是否成功、被拒次数、引用可解析率、买卖字样。
P5 不读评分标准、不向模型注入评分要点；任一组连续两次失败按方法实验的停止规则处理。
P6 结论写 `docs/evals/行业Profile喂入研究实验_2026-10-20/README.md`（六节，只写机械项与样本说明，判断项留给 Claude）。

## 4. 范围

`.local/profile-injection-experiment/`、隔离 worktree 与实例、eval 目录、本 Task §9。

## 5. 验收

24 份研究文字齐全、随机编号与映射哈希、机械项表；门禁 `node scripts/verify-docs.mjs`、`node scripts/verify-protocol.mjs`。证据等级：真实链路。

## 6. Out of Scope

接入产品；改 Profile；Claude 评分（另行）。

## 7. Stop Conditions

隔离实例无法与用户 5930 完全分开；同一组连续两次空白或失败。

## 8. 回滚

删除实验目录与隔离实例。

## 9. 当前交接

1. 状态与结论：15:48 按 P5/§7 停止，尝试 6/24；A 保存 4 份、农业银行连续失败 2 份，B 未发题。两次最终拒收均为 invalid_page_research：文字直接写入净息差等阿拉伯数字，未使用字段占位符；未改产品或放宽校验。
2. 改动文件：自有 launch.mjs、run.mjs、bridge.mjs、backend-bridge.py、finish.mjs 及隔离产物；两仓 codex2-profile 冻结快照与 B 的 P1 差异；eval README、本 Task §9。不改主目录产品代码、不提交。
3. 证据：.local/profile-injection-experiment/ 内 attempts/diagnostic-{1-broken-links,2-valid-links}/ 保存截图、DOM、console；cells/A-601288.SH-{1,2}/ 的 save-submissions.json 与 save-rejection-receipts.json 保存原始提交和拒收；runs.json 保存停止标记。
4. 与规格的偏差及理由：空白由实验复制 profile 的相对软链断裂引起，修启动器后第二轮 A/B 预检通过，区别于归档热替换故障。首两份用量观察器拒绝裸 UUID 的误报仅只读补采，未重做研究。854 文件冻结、verify-docs 与 verify-protocol 均通过。
5. 未覆盖的缺口：§7 阻止跑满 24 次，无完整盲评包、mapping.json 或哈希，不能判断 Profile 效果；未读评分标准、未评分。主研究已报告 2,767,486 token（含失败），后台未全终态且部分尝试无 usage，不冒称完整账单；引用 121/127 可读，未证明语义支持。
6. 下一步谁做什么：Claude1 审阅保存契约失败后裁决是否另开修复与续跑；当前已使用界面同一研究接口，改走直接接口仍受相同校验。隔离浏览器与 5939/5949/8739 已关闭，未碰 5930、现用 home 或已存研究；行情采样 PID 50261 仍运行，未 push。
