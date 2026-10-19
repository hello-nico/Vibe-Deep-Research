# DeepSeek 检索与 DSH rc.2 核实

状态：2026-10-19 Claude 写定，技术验证 Task（先证明再设计）。用户判断「接近生态本身才能加速」，要求先核实两块再定后续。执行方只采集与报告，不改产品代码、不提交、不切换主目录运行时、不碰用户现用 DSH_HOME，不读、不打印 `.env` 与任何密钥。

## 1. 目标

A. 回答「DeepSeek 原生 Search / Fetch API 能否替代或补充现有外部检索（Backend `search_external`：Exa 默认、Tavily、东方财富新闻）」，用同一组真实问题的并排数据说话。
B. 回答「DSH 从 `0.2.1-alpha.2` 升到 `0.2.1-rc.2` 要付出多少、能删掉多少补丁」，给出逐个补丁的结论。

## 2. 现状（Claude 核实）

- 产品外部检索走 Stock Backend `backend/app/services/external_search.py`，模型工具名 `search_external`（每轮限次、按 Topic 缓存卡片）。供应商由 `STOCK_RESEARCH_EXTERNAL_SEARCH_PROVIDER` 选择，有小时/日预算；T5 基线曾因日额度用尽失分。
- DSH 原生 `web_search` 在产品里已隐藏（`cordis.patch.yml` 关闭 `ui-settings-web-search`；工具名单排除 `web_search`、`web_fetch`）。alpha.2 只有 `dsh-web-search-deepseek`（Messages 服务端搜索，每次搜索耗一个模型轮次）。
- rc.2 新增 `dsh-web-deepseek-api`（#6103）：直连 `POST https://api.deepseek.com/v1/tools/search` 与 `/v1/tools/fetch`，不耗模型轮次。
- 官方文档 https://api-docs.deepseek.com/zh-cn/guides/search ：Search 参数 `query`（≤128 字，支持 `site:`、`-site:`、`"短语"`、`lang:`、`after:`/`before:`）、`count` 1–50、`ori_question`、`need_content`。
- Search 返回 `rerank_score`(0–3，≥1.5 高质量)、`title`、`url`、`snippet`、`summary`(600–800 字)、`content`、`site_name`、`date`、`authority`(0–4，≥3 权威)。
- Fetch 入参 `url`，返回 `title` + Markdown `content`；403 安全策略拒绝、404 取不到正文。价格各 5 元 / 千次成功请求，空结果与失败不计费；账号级各 5 QPS。经 Harness 服务端工具的调用 2026-11-01 起计费。
- DSH 上游已到 rc.2（npm `next` 标签）。我们锁 alpha.2，打 10 个补丁（见 `desktop/dsh/runtime/README.md`）；对应 9 个包在上游均有较大改动。rc.2 新增扩展点：`conversation.hero.options` 槽位（#6190）、模型标签槽位（#6357）、Definition 认领目标事件（#6075）；字号与主题重做（#6079）；通知唤醒轮次不再折叠空白（#6020）。

## 3. 冻结决定

R1 A 段只比检索与抓取接口本身，不改模型工具、不改提示词。直接调用 DeepSeek API；现有供应商经 Backend 现有 `search_external` 函数调用，凭据由 Backend 自身加载。
R2 DeepSeek 密钥用本机已有配置（用户确认一直存在）：优先执行环境的 `DEEPSEEK_API_KEY`；不在环境里时，由脚本在进程内从 Backend 自身加载配置的同名变量取得。脚本不打印、不落盘任何密钥与请求头，执行方不用 cat/grep 查看密钥文件。
R3 问题用真实用户说法（不出现产品机制词），覆盖下列五类，每类 4 题，共 20 题；同一题各供应商同时刻跑，记录原始返回：
  1. 公司近况：神火股份最近有什么消息；云铝股份三季度业绩怎么样；宁德时代最新公告；长江电力来水情况。
  2. 商品与行业数据：这周沪铝价格走势；电解铝社会库存最新数据；LME aluminium inventory this week；氧化铝现货价格最近变化。
  3. 宏观与政策：美联储十月议息会议预期；国内最新降准降息消息；证监会最近出了什么新规；国庆后人民币汇率走势。
  4. 研报与深度：电解铝行业研报 2026；新能源车电池产业链周期判断；AI 算力是否存在泡沫；黄金和美债收益率的关系。
  5. 精确查找（考运算符）：`宁德时代 三季度报告 site:cninfo.com.cn`；`神火股份 after:2026-10-01`；`"电解铝" 产能 天花板 lang:zh`；`aluminium tariff -site:wikipedia.org after:2026-09-01`（现有供应商不支持的运算符原样传入并如实记录）。
R4 Fetch 用 15 个真实网址：巨潮公告 PDF 3、东方财富文章 2、财联社 2、上交所/深交所页面 2、政府网站 2、LME 或路透等英文 2、我们已入库资料的原文网址 2（从 Backend 文档列表挑）；同时用现有 `fetch_source_url` 对应实现抓同一批网址对照。
R5 B 段在新的 Vibe worktree 与独立 DSH_HOME 里只安装、打补丁、启动、读源码，不做真实模型问答，不切换主目录。

## 4. 范围

| 段 | 执行方 | 位置 | 内容 |
|---|---|---|---|
| A | codex1 | 只读 Vibe 主目录；产出写 `/Users/apple/ts/src/Vibe-Deep-Research/.local/deepseek-search-eval/` | 脚本 `run.mjs`（或 Python，经 `cd /Users/apple/ts/src/Stock-Research/backend && uv run` 调 Backend 函数）；原始返回 `raw/`；汇总 `summary.md` |
| B | codex2 | `git worktree add .worktrees/codex2 HEAD`（detached）；DSH_HOME 用 `.local/dsh-rc2-home/` | `desktop/dsh/runtime` 改锁 `0.2.1-rc.2` 后 `npm install`；逐个尝试 10 个补丁；产出 `.local/dsh-rc2-eval/summary.md` |

## 5. 采集项与验收

A 段 `summary.md` 必须含：
1. 每题每供应商：结果数、前 5 条标题/站点/日期、最新结果日期、`authority≥3` 条数（仅 DeepSeek）、`rerank_score≥1.5` 条数（仅 DeepSeek）、耗时、错误码。
2. 每类汇总：空结果率、错误率、中位耗时、前 5 条中文财经源占比（东方财富、财联社、证券时报、巨潮、交易所、上海证券报、第一财经、21 世纪经济报道、新浪财经）、近 7 天结果占比。
3. Fetch：每网址成功与否、状态码、正文字数、是否含表格、耗时；两种实现并排。
4. 实际调用次数与按官方价折算的费用。
5. 不下质量结论：相关性与可用性由 Claude 逐题读 `raw/` 判定。

B 段 `summary.md` 必须含：
1. 10 个补丁逐个：直接应用 / 冲突 / 上游已等价（指出上游提交）/ 可改用 rc.2 扩展点（指出槽位或接口）/ 必须重做，附依据文件与行号。
2. `npx tsc --noEmit`、`npm test`（desktop）在 rc.2 下的结果；产品插件能否加载、首页能否打开（脚本请求 200 即可，不截图）。
3. `dsh-web-deepseek-api` 在产品组合里启用所需的最小配置（`cordis.patch.yml` 片段，只写进报告不改文件），以及能否保留我们的 `search_external` 同时给模型开放 `web_fetch`。
4. 打包线只读核对：rc.2 Desktop 的更新发布是否只支持腾讯 COS，自托管更新源（通用 HTTPS 目录）是否可配；与 `桌面壳品牌与更新源` 已做的配置是否冲突。

门禁：两段都 `git -C /Users/apple/ts/src/Vibe-Deep-Research status` 不新增主目录改动（`.local/` 被忽略）；`git diff --check`（B 段 worktree）。

## 6. Out of Scope

切换主目录运行时；改模型工具、提示词或 Backend provider；真实模型问答；签名、公证与上传。

## 7. Stop Conditions

- A：按 R2 两处都取不到 `DEEPSEEK_API_KEY`，或返回 401/402 → 停下报告，不找其他凭据。
- B：rc.2 包在 npm 不完整或安装需要改动主目录 → 停下报告。

## 8. 回滚

删除 `.local/deepseek-search-eval/`、`.local/dsh-rc2-eval/`、`.local/dsh-rc2-home/` 与 `.worktrees/codex2`。

## 9. 当前交接

1. 状态与结论：【A 段 / codex1，2026-10-19】20 题四路 Search、15 网址双路 Fetch 采集完成，只采集不下质量结论，未触发 §7 A。DeepSeek Search 正式 20 次均 200；Fetch 为 6 次 200、5 次 404、3 次 504、1 次连接错误。
   【B 段 / codex2，2026-10-19】核实结束，未切换。rc.2 包闭包已安装；5 个补丁直接应用、1 个需适配嵌套安装路径、4 个冲突，没有完整补丁已证明可删除。postinstall 失败，不能仅改版本升级；未触发 §7 B。
2. 改动文件：【B 段】detached `.worktrees/codex2`（HEAD 91512238）仅改 `desktop/dsh/runtime/package.json`、`package-lock.json`。产出 `.local/dsh-rc2-eval/summary.md` 及安装、类型、测试、启动、品牌补丁检查日志；主目录仅回填本节。未提交、未改上游。
   【A 段】产出仅在 `.local/deepseek-search-eval/`：`run.py`、`report.py`、`raw/`、`summary.md`；仓库仅回填本 Task §9，未改代码、未提交、未重启服务。
3. 证据：【B 段】npm install 退出 1（补丁 5 warning / 5 error）；305 个 DSH 包安装位置均 rc.2。Desktop npm test：192 通过、61 失败（包含依赖缺失，不能归为 rc.2 回归）；npx tsc 缺本地编译器，现有编译器检查缺 node/vite 类型。worktree diff --check 通过。
   隔离 DSH_HOME 启动后认证 GET / 为 200，仅证明原生宿主 HTML；产品插件缺 ajv，未加载。品牌补丁对 rc.2 的 apply --check 失败。逐补丁文件/行号、配置建议和更新源核对见 summary。
   verify-protocol 退出 1：本 Task 原有 §2 第 14 行超过 300 字；冻结规格未改。收尾主目录状态无额外文件项，本次服务和挂起检查进程均已退出。
   【A 段】Backend 目录 `uv run --no-sync` 执行采集；供应商子进程经 uv 加载 Backend 配置及现有函数。完整性断言：80 Search、30 Fetch，每题四份、每网址两份；同题开始最大差 0.196 秒。255 份产出文本检查已知敏感值残留为 0；真实接口，无夹具。
   DeepSeek 含预检共 21 Search、15 Fetch，成功非空 21+6 次，按官方价折算 ¥0.135，未核验账单。Exa/Tavily 各实际 HTTP 8 次；东方财富无远端请求。原始返回、逐题字段、分类统计、Fetch 表格/截断与费用见 `.local/deepseek-search-eval/summary.md`。
   【A 段门禁】git diff --check 通过；git status 文件项与开工一致，.local 产出被忽略。verify-protocol 重跑退出 1，仍仅本 Task 原有第 14 行超 300 字，冻结规格未改。
4. 与规格的偏差及理由：【B 段】只安装 runtime，未装 Desktop/Orchestrator 依赖、未生成范围外前端产物，因此产品加载与类型兼容未能完成验证；未改产品修复这些缺口。为隔离导入生成临时 overlay，未改原组合。未运行 scripts/start、未做模型问答、未接触现用 DSH_HOME。
   【A 段】保留原预算：Exa/Tavily 后 12 题均预算拦截；东方财富原题无代码，前 12 题参数错误、后 8 题预算拦截。未补 symbol 或绕过函数。预检原始响应被正式第 1 题覆盖，调用与费用已单列；正式 110 份返回完整保留。
   已入库列表 source_uri 为空，按列表选定 ID 后只读来源表补取两个原文 URL；使用已登记的本机数据库映射，未改配置。Fetch 对照为 read_public_url 对应实现，不含 DSH 摘录/筛查；成功不暴露上游 HTTP 码，报告明确记缺失。
5. 未覆盖的缺口：【B 段】4 个冲突补丁和 session-controller 定位需移植；行内产物 validator 需重新定位。正常启动另有 orchestrator/src/dsh_paths.ts 的 alpha.2 硬校验。真实产品首页、完整依赖下类型/测试、模型有效工具表、品牌打包和自托管更新仍未验收。
   【A 段】预算拦截题及东方财富没有远端结果，不能据此判断供应商质量；Backend Reader 部分正文截断，HTTP 成功码未暴露；预检响应无独立存档。相关性、可用性、替代或补充判断均留给 Claude 逐题读 raw/。
6. 下一步谁做什么：codex1、codex2 均按范围停下；Claude 阅读两份 summary 与 A 段 raw 后判定并与用户定后续。后续升级须另行授权补丁、版本 gate 与完整隔离依赖验证，不直接切换主目录。
