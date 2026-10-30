# 产业链用户对象现状（2026-10-26）

## 1. 问题

产业链要改成用户对象之前，预置链现在写在哪、页面怎么挂上、用户层别的对象怎么存。对应 [产业链用户对象现状摸底](../../tasks/archived/产业链用户对象现状摸底_Task_2026-10-26.md)。

## 2. 方法与数据集

只读 Stock `backend/app/{data,services,api}`、`wiki/business_compiler.py`、`dsh/src`；Vibe `desktop/src/verticals/finance`、`dsh/finance-ui/research.mjs`、`orchestrator/src`。对照 [两个入口与对象生长](../../decisions/proposed/两个入口与对象生长_讨论稿_2026-10-26.md)。不调 ensure、不碰 5930 数据。

## 3. 环境

2026-10-26。代码现状。七条预置链 id：`coal-power-aluminium`、`lithium-battery`、`oil-gas-chemicals`、`steel-machinery`、`pig`、`real-estate`、`solar`（测试夹具有一处写成 `coal-power-aluminum`）。

## 4. 结果

### M1 预置链读写

**保留为公共层（生成与推荐）**

| 位置 | 用途 |
| --- | --- |
| Stock `generate_valuation_templates.py:13,83–94` | 从 eval `chains.csv` 生成七条链 |
| Stock `data/valuation_templates.json` 约 1736 行起 | 冻结链节点与传导 |
| Stock `valuation_templates.py:61–99,102–116` | `chain_list` / `chain`（节点公司=申万成分）/ `framework.chains` / `wiki_framework` 上下游 |
| Stock `api/v1/valuation_framework.py:11–21` | 只读 `GET /wiki/chains`、`GET /wiki/chains/{id}` |
| Stock `wiki/business_compiler.py:366` | 行业 Wiki 写入公共框架（含链关系） |
| Vibe `dsh/finance-ui/research.mjs:26,28` | 放行上述 GET |

**要改（现在当用户对象用）**

| 位置 | 用途 |
| --- | --- |
| Vibe `lib/chainPage.ts:100,135–152` | `loadChainView` / `loadChainIndex` 读预置链；`chainsOf` **按申万成分自动挂公司** |
| Vibe `pages/Watch.tsx:171,234–235` | 关注「产业链」分段列出**全部预置链** |
| Vibe `pages/CompanyPage.tsx:231,351` | 「所属产业链」= `chainsOf` 自动挂上的链 |
| Vibe `pages/ChainPage.tsx:16–35,48` | 预置链页；`useAiPage` 只有快照追问，没有个股那种绑定研究/写回 |
| Vibe `router.tsx:28` | `/chains/:chainId` |

**要删（逻辑，不是整文件）**

| 位置 | 用途 |
| --- | --- |
| `chainPage.ts:150–152` `chainsOf` | 按成分自动挂链（紫金挂上煤—电—铝的根因） |
| `Watch.tsx` 用 `loadChainIndex()` 当用户列表 | 预置七条不当作用户对象 |

对话：`suggestion-tools.mjs` 只有 question / indicator / company，**没有建链**。`consumers.mjs:162–163` 只把产业链当分析路径，不读写链对象。

### M2 用户层对象（参照）

| 对象 | 放哪 | 隔离 | 版本/撤回 |
| --- | --- | --- | --- |
| 关注 | 本机 `<dataRoot>/client/choices.sqlite` 表 `watchlist`（`orchestrator/src/client_store.ts:22–32`）；`GET/POST /client/watch`（`api.ts:88–93`） | 本机一份，**不经** Stock `user_id` | 无版本；删行即移除，不删 Backend 知识 |
| 研究名单 | 同库表 `research_roster`；`/client/research`（`api.ts:97–106`） | 同上 | 同上 |
| 观察项 | Stock Topic `tracking_items`；`POST /wiki/research-topics/{id}` 带 `expected_revision`（`research_topics.py:612–638`，`wiki.py:1405`） | `require_user` | revision 冲突 409；无则不写 |
| 记忆 | Stock `/wiki/research-memory`（`wiki.py:1607–1616`）；`version` + operations（`research_memory.py:31–34`） | 工作区用户 | version 冲突 409 |
| 个股研究 | `page-research` 与 `POST …/page-research/revert`（`company_data.py:164`） | `require_user` | 撤回上一版 |

用户链更像 **Topic/个股研究**（有结构、要撤回），不像关注名单（无版本的符号表）。公共 `GET /wiki/chains` 仍作骨架与推荐源。

### M3 最小版新增（只列项）

1. 用户链存储与接口（按用户隔离、带版本/撤回）
2. 建链：从公共 `chain(id)` 生成骨架，用户点了才建
3. 个股页「推荐所在链」（替代自动挂上）
4. 对话推荐「建这条产业链」（第四类 suggest）
5. 关注页产业链分段改读**用户链**
6. 去掉 `chainsOf` 按申万自动挂链
7. 产业链页问助手（与个股同一助手，能写回）

### M4 文件数（约）

| 项 | 约 |
| --- | ---: |
| 用户链存储与接口 | 5（服务、路由、测试、代理放行） |
| 建链 | 2 |
| 个股页推荐所在链 | 2（`CompanyPage.tsx`、`chainPage.ts`） |
| 对话推荐建链 | 4（`suggestion-tools`、`consumers`、前端卡片、vibe-check） |
| 关注页改读用户链 | 2 |
| 去掉自动挂链 | 1（`chainsOf` + 测试） |
| 产业链页问助手 | 3 |
| **合计** | **约 19** |

## 5. 结论与适用边界

公共七条链应留下做生成与推荐；用户对象要从零建。现状最大偏离是 `chainsOf` 与关注页把预置链当成已拥有对象。问助手：链页已有 `useAiPage` 快照，缺的是对象绑定与写回，不是「完全没有面板」。不写实施方案。

## 6. 重跑

对上表路径 `rg wiki/chains|chainsOf|loadChainIndex`。接口契约以 `valuation_framework.py` 为准。
