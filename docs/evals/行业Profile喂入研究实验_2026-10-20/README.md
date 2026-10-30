# 行业 Profile 喂入研究实验（2026-10-20）

## 1. 问题与范围

回答个股页研究收到所属申万二级行业核心问题后，研究文字、token 与耗时如何变化。只记录机械项，行业贴合度、套话与错误由 Claude 盲评。规格见 [Task](../../tasks/archived/行业Profile喂入研究实验_Task_2026-10-20.md)。完成 4/24。

## 2. 方法与样本

神火、云铝、农业银行、长江电力、宁德时代、万华化学，各 A/B 两次。A 为开始时冻结的现行插件，B 只增加 industry_attention 核心问题原文数组和 P1 指定一句提示。不含 rationale、证据或公司列表。源码/差异在本机 .local/profile-injection-experiment/sources/、method-B.patch。两组按 A 后 B 顺序串行，模型随机性与真实资料随时间变化限制因果比较。
每次独立 home、Client、工作目录与 Backend 用户层，先核实 research:null；首次数据包不得带既有 previous_judgment，同次保存后再读自身判断另记。未读取评分标准，也不评分；不因文字质量挑选或重跑结果。浏览器检查页面可用后，通过界面同一 /finance-research-runs 产品接口启动研究，不冒称按钮交互验收。

## 3. 环境与隔离证据

两仓 detached .worktrees/codex2-profile（Vibe cf492c82，Stock eacb4ed 及开跑前主目录产品源码快照）。854 文件冻结指纹，正式研究中不重建 UI、不跟随其他工作区。5939 产品/5949 DSH/8739 私有 Backend 桥接。模型由 shell DEEPSEEK_API_KEY 经 apiKeyEnv 交原生 Provider，未打印/落盘密钥，未读取 .env/凭据。
Backend 子进程执行现有容器内正式 FastAPI、PostgreSQL、校验与保存代码，独立 /tmp 用户根与接受的公开 Wiki 副本；无 mock、假保存器或测试文件系统 store。首次六家公司读隔离全部 HTTP 200、research:null。资料库与计算原件复用真实公共数据，未覆盖现用用户研究。
准备期经历 Client 根遗漏、随后输入框超时。此次截图/DOM/console 定位为复制 profile 的相对软链断裂，产品 UI 从未加载，导致初始 root 无注册；与归档案例的热替换时卸载 root 机制不同。只修实验启动器创建 Client、保存 stderr、复制后使用有效绝对软链。第二轮 A/B 页面均通过，随后全部使用全新正式单元。历史失败及预检保存在 attempts/，不计研究结果。
首两份研究的正式任务与保存均成功，但旧用量 CLI 拒绝子会话裸 UUID，观察器误标失败；以同一 project/summarize 逻辑补采原生日志，并只读重连私有用户层取回原保存结果，没有新发模型研究或挑选较好答案。observerErrors 与 observerStop 原样保留。

## 4. 机械结果

本轮尝试 6/24：A 保存 4 份、失败 2 份，B 未发题。农业银行两次连续未通过正式保存校验，按 P5/§7 停止。原始提交与拒收回执见本机 cells/A-601288.SH-{1,2}/save-submissions.json、save-rejection-receipts.json：首次最终拒绝 business/details、profit_formula/details、tracking/details，第二次最终拒绝 profit_formula/details，均为 invalid_page_research／“文字字段不得含阿拉伯数字”。原文包含未经字段占位符承载的净息差 1.28%、净利差 1.19% 等数值；此前亦出现“归母”等措辞拒收。属于模型提交未满足既有保存契约，不是页面空白；不改产品、不放宽校验、不追加重跑。以下用量与拒绝次数包含失败尝试，引用和买卖字样仅统计已保存文字。

| 组 | 完成/尝试 | 保存成功 | 保存拒绝次数 | 主研究 token 总量 | 耗时秒 | 引用解析 | 买卖字样 |
|---|---|---:|---:|---:|---:|---|---:|
| A | 4/6 | 4 | 16 | 2,767,486 | 1410.0 | 121/127 | 0 |
| B | 0/0 | 0 | 0 | 0 | 0.0 | 0/0 | 0 |

| 单元 | 状态 | 保存 | 拒绝 | 步数 | token 总/未缓存/缓存读/输出 | 秒 | 引用 | 买卖字样 |
|---|---|---|---:|---:|---|---:|---|---:|
| A-000933.SZ-1 | completed | 是 | 2 | 12 | 363676 / 48509 / 290304 / 24863 | 225.8 | 32/33 | 0 |
| A-000933.SZ-2 | completed | 是 | 3 | 13 | 480238 / 33461 / 416000 / 30777 | 235.7 | 33/34 | 0 |
| A-000807.SZ-1 | completed | 是 | 3 | 20 | 701485 / 62345 / 608384 / 30756 | 286.1 | 28/30 | 0 |
| A-000807.SZ-2 | completed | 是 | 1 | 12 | 353182 / 33857 / 300288 / 19037 | 255.7 | 28/30 | 0 |
| A-601288.SH-1 | failed | 否 | 3 | 13 | 409294 / 48421 / 333056 / 27817 | 205.5 | 0/0 | — |
| A-601288.SH-2 | failed | 否 | 4 | 13 | 459611 / 34657 / 401280 / 23674 | 201.2 | 0/0 | — |

主表按产品任务 sessions 中的主研究及自动续接会话计量，从发起接口到主任务 completed 计时，不含实例启动和指标读回。含后台整理的全部会话已报告 token 为 A=2973865、B=0；后台未全部等到终态，不能作完整计费比较。缺 usage 的内部尝试 A=5、B=0，详见 cost.json 与 backgroundTaskStates。被拒项、MALFORMED_RESPONSE 等原生错误与自动续接原样留档；引用解析统计已保存计算引用及 fieldIds 对应的原始 source_ref，证明可读，不证明语义支持。买卖字样需人工读语境。

## 5. 盲评材料与判断边界

未满足 24 次完成条件，未生成完整盲评包或映射。
不作研究效果或接入产品的判断。页面研究文字来自正式 Backend 保存结果及产品展示函数，实际页面交互与最终用户视觉验收不在此结论内。已按停止条件保留失败记录，停止原因见本机 runs.json。

## 6. 检查与重跑

原始会话、页面图、stderr、研究保存读回、数据包与计算凭据在本机 cells/；机械表 mechanical-results.json、group-summary.json；核对 verification.json。入口 node .local/profile-injection-experiment/run.mjs；已有单元不覆盖，停止标记须经授权处理，不直接删除。
主目录门禁 node scripts/verify-docs.mjs 与 node scripts/verify-protocol.mjs；最终结果在 gates 日志。未提交、合并或 push，未操作 5930，行情采样进程不动。
