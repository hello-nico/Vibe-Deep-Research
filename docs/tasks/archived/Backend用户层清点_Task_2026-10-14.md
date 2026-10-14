# Backend 用户层清点

状态：2026-10-14 Claude 写定，用户同意（todo §1.5 内测首发第 3 步的前置）。只读清点：不改代码、不写入 Backend、不提交、不重建，不读 `.env` 与密钥。产出只写 Vibe `.local/backend-user-layer/`。

## 1. 目标

Backend 将部署到云端，多位内测用户共用。依 Human Checklist「数据分层是逻辑边界」：公共层（对所有用户都一样）共享，用户层（研究判断、跟踪项、研究关联、记忆与画像、草稿、记录等）按用户隔离。本 Task 列清 Backend 现在哪些接口和存储属于用户层，作为按用户隔离的施工图。

## 2. 范围（Claude 已知的入口，需逐个核实并补全）

- 路由：Stock `backend/app/api/v1/` 下 `analysis.py`、`company_data.py`、`documents.py`、`industries.py`、`maintenance.py`、`notes.py`、`page_reads.py`、`radar.py`、`research_results.py`、`stocks.py`、`tracking.py`、`wiki.py`、`world_model.py`（`wiki.py` 体量最大，逐个路由看）。
- 文件存储：`workspace/research/` 下 `links`、`memory`、`page-drafts`、`product-notes`、`topics`、`dreaming`、`industry-profiles`、`jev-eval`、`jev-screen`；`workspace/wiki`（含个股页研究块，`services/company_page_research.py` 经 `apply_research_blocks` 写入）、`workspace/wiki-reports`、`workspace/tmp`。
- 数据库：PostgreSQL 各表（`services/postgres_store.py` 与 `world_model_store.py` 等建表处）；研究成果与计算凭据（`services/research_results.py`）；provider 快照。
- 调用方：Vibe 前端（`desktop/src/verticals/finance/`）与两个 DSH 插件（`desktop/dsh/finance-ui`、Stock `dsh/src`）各自调用哪些 Backend 路由。

## 3. 分层口径

- **公共层**：同样的输入对任何用户结果都一样。例：资料原件与解析、证据、事实与硬关系、provider 快照、行情与外部价格成果、按内容寻址的计算凭据、报告关键页、报告披露数存档、行业 Wiki 系统内容。
- **用户层**：带某个用户的选择、判断或行为。例：个股页研究（论点、五档、支柱）、议题与跟踪项、研究关联、记忆、草稿、问助手保存的记录、关注相关的产物。
- **待裁决**：拿不准的照实列出，写出两种归属各自的理由，不自己决定（例如由用户研究触发、但按内容寻址的计算凭据；混写了系统内容与研究块的 Wiki 页）。

## 4. 产出

`.local/backend-user-layer/summary.md`：

1. **接口表**：路由 | 方法 | 读或写 | 涉及的存储（目录、文件或表）| 分层（公共 / 用户 / 待裁决）| 调用方（前端页面、插件工具名）| 备注。
2. **存储表**：存储位置 | 内容 | 分层 | 写入方 | 大小与条目数（`du`、计数）。
3. **混合点**：同一个文件、表或接口里公共内容与用户内容混在一起的地方，逐个说明怎么混的（例如 Wiki 页面同时有系统块与研究块）。
4. **按用户隔离的候选做法**：对每类用户层存储，给出最小改法的候选（按用户分目录、表加 `user_id` 列、接口从令牌取用户），只列选项与工作量估计，不下结论。
5. **调用方影响**：哪些插件工具与前端请求需要带上用户身份。

## 5. 验收

Claude 审两张表与混合点，裁决「待裁决」项后写按用户隔离的实施 Task。

## 6. Out of Scope

任何代码修改；鉴权方案设计；数据迁移；Backend 部署。

## 7. Stop Conditions

需要写入 Backend 或读取密钥才能判断 → 停下报告。

## 8. 回滚

只读清点，删除 `.local/backend-user-layer/` 即可。

## 9. 当前交接

1. 状态与结论：2026-10-14 只读清点完成。用户层存储是议题、关联、草稿、笔记、个股研究块；Wiki 页、成果表、文档表和记忆目录是混合点。8 项待裁决，未自行归属。
2. 改动文件：无代码改动。产出 `.local/backend-user-layer/summary.md`。本节为交接覆盖。
3. 证据：路由来自 `backend/app/api/v1`；文件 `du` 与计数；表行数来自运行中 Backend 已有连接（documents 1945，research_results 888，product_notes 12）。未读 `.env`。
4. 与规格的偏差及理由：无。关注名单在 Client SQLite，不计入 Backend 存储，已在产出注明。
5. 未覆盖的缺口：原件目录在容器挂载路径，本机 `workspace/documents` 为空。`alembic_version` 无应用角色读权限，未计数。
6. 下一步谁做什么：Claude 审两张表与混合点，裁决待裁决项后写按用户隔离的实施 Task。
