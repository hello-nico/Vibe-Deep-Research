# 开始观察与看法写回现状（2026-10-20）

## 1. 问题

对话里「开始观察」和用户看法写回个股页，现在有什么、缺什么。对应 [开始观察与看法写回现状摸底](../../tasks/archived/开始观察与看法写回现状摸底_Task_2026-10-20.md)。

## 2. 方法与数据集

读 Vibe `desktop/src/verticals/finance/dsh/`、`pages/Tracking.tsx`、`lib/memory.ts`；Stock `dsh/src/{consumers,suggestion-tools,vibe-check,background-review}.mjs`、`backend/app/services/research_topics.py`。8700 只读 memory / candidates / topics / 神火 page-research。会话：`.local/dsh/sessions` 771 份 zstd 检索 `<suggest` 与 `suggest_next`。

## 3. 环境

2026-10-20。未改代码、未加关注、未触发研究。

## 4. 结果

### 链路

| 环节 | 文件 / 函数 | 接口或产物 |
| --- | --- | --- |
| 提示词（现网对话） | Stock `consumers.mjs` `VIBE_CATALOG_PROMPT` | 只许 `<suggest type="question\|company">`，**不要调用 suggest_next** |
| 工具（deep_research） | `suggestion-tools.mjs` `suggest_next` | type=`question` / `company` / **`indicator`**；indicator 须完整跟踪项；`POST /wiki/research-topics/tracking/validate` |
| 围栏校验 | Stock `vibe-check.mjs`；Vibe `vibe.ts` `readVibeCheck` | type 不是 question/company → `unsupported_suggestion` 丢掉 |
| 渲染 | `suggestion-node.tsx` `Suggest` | 追问、关注公司；`indicator` 只在历史节点显示「曾建议观察」，无按钮 |
| 点「开始观察」 | `suggestion-actions.ts` `startSuggestedIndicator` | `POST /wiki/research-topics/route` 后写入 Topic `tracking_items`；UI **未接线** |
| 跟踪项字段 | `research_topics.py` | `tracking_key`、`hypothesis`、`baseline{as_of,known_at,basis_refs}`、`observables`、`conditions{strengthen,weaken,overturn}`、`next_source`、`last_assessment`（新建必须 null） |
| 跟踪页 | `Tracking.tsx` `loadTrackingVariables` | 读研究里的价格变量，**不读** Topic `tracking_items` |
| 记忆 | `memory.ts` `loadMemory` | `GET /wiki/research-memory`；`stance`: stated / inferred / corrected |
| 议题候选 | `loadCandidates` | `GET /wiki/research-candidates` |
| 个股页论点 | `CompanyPage.tsx` | `page-research.thesis`（研究结论），不读记忆 |

8700：active Topic 6 条跟踪项皆空；recent 记忆 8 条，含 stated「继续跟踪万华…」。神火 page-research 无看法字段。

### 模型现在能不能输出「开始观察」

不能。现网提示词禁止 `suggest_next`，围栏也不认 indicator。771 份会话无 `<suggest type=` 回包；`suggest_next` 只出现在工具定义。若要输出，字段须是 `type=indicator` 且每条带完整 `tracking_item`（三组非空条件 + 本轮真实 `basis_refs`），否则校验剔除。

### 看法写回缺口

用户口头看法进 `research-memory`（后台结算 `memoryOps`，stated）。个股页不读它，也没有「看法并列」槽。研究 `thesis` 只能靠重新研究覆盖。原型 s3 所需接口：**没有**。

## 5. 结论与适用边界

最小切分（不写代码）：

| 层 | 改什么 |
| --- | --- |
| 提示词 | 允许第三类「开始观察」；去掉「不要调用 suggest_next」，或围栏加 `type="observe"` |
| Stock dsh | `vibe-check` 放行该类；deep_research 的 `suggest_next`/`indicator` 已有校验可复用 |
| 前端 | `Suggest` 加「开始观察」→ 已有 `startSuggestedIndicator`；跟踪页若要显示观察项需另读 `tracking_items` |
| 个股页 / Backend | 看法并列读 memory（按公司过滤）或给 page-research 加用户看法字段；写回须用户/Agent 确认后再改论点 |

边界：现网对话走围栏不走 `suggest_next`；跟踪页与 Topic 观察项不是同一套数据。未改产品。

## 6. 重跑

对照上表文件与 8700 四条 GET。会话检索：`zstd -dc .local/dsh/sessions/**/*.zstd | rg '<suggest type='`。
