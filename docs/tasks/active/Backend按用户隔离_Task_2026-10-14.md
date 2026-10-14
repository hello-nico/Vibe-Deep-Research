# Backend 按用户隔离

状态：2026-10-14 Claude 写定，用户同意（todo §1.5 内测首发第 3 步；依据 [Backend 用户层清点](Backend用户层清点_Task_2026-10-14.md) 产出 `.local/backend-user-layer/summary.md` 与 Claude 对 8 项待裁决的裁定）。执行方不提交、不重建、不读 `.env` 与密钥。
实施仓库：Stock-Research（`backend/`）。客户端带令牌另立（todo §1.5 第 4 步），本 Task 客户端不改。

## 1. 目标

Backend 部署到云端后多位内测用户共用：公共层共享，用户层按用户隔离。依 Human Checklist「数据分层是逻辑边界」。本 Task 完成后，本机现状不变（默认用户），云端用令牌区分用户。

## 2. 裁定（Claude，2026-10-14）

内测要按用户隔离的 7 类：
1. 个股页研究（论点、五档、支柱、驱动、版本与撤回）：现写在 Wiki 页研究块（`services/company_page_research.py` → `apply_research_blocks`），**搬出 Wiki 文件，按用户存**。
2. 议题与跟踪项：`workspace/research/topics`。
3. 研究关联：`workspace/research/links`。
4. 记忆：`workspace/research/memory` 的 `soul.md`、`recent.md`、`candidates.json`（含维护提议）、`trigger-log.jsonl`。
5. 草稿：`workspace/research/page-drafts`。
6. 问助手保存的记录：PostgreSQL `product_notes`。
7. 用户资料与「我的资料」状态：`user_material` 类文档仅本人可见；库内显示、隐藏、改标题按用户存（文档原件与解析仍是公共表）。

公共层（不隔离）：资料原件与解析、证据、事实与准入（含会话抽取候选准入后的事实）、provider 快照、行情与计算成果（`research_results`，按内容寻址）、报告关键页与披露存档、外部检索与雷达缓存、Wiki 系统内容、刷新检查状态（以后移出记忆目录，本 Task 不动位置）。
旧流程（草稿发布进共享 Wiki、Wiki 与议题报告）：内测不开放，只读保留，不做隔离。

## 3. 冻结决定

R1 **用户身份**：请求头 `Authorization: Bearer <token>`；服务器端令牌表 `default_workspace().root/users.json`，存令牌的 SHA-256 与 `user_id`（不存明文）；新增管理命令生成令牌（只打印一次）。无令牌时：环境变量 `STOCK_RESEARCH_LOCAL_USER=1`（本机默认开启）则视为用户 `local`，否则 401。令牌错误一律 401，不区分原因。
R2 **用户层存储位置**：文件类统一到 `default_workspace().root/research/users/<user_id>/`（`company-pages/`、`topics/`、`links/`、`memory/`、`page-drafts/`）；数据库类加 `user_id` 列（`product_notes`）或新表（「我的资料」状态：`library_items(user_id, document_id, hidden, title_override, added_at)`）；
  `documents` 表对 `user_material` 增加 `owner_user_id`。
R3 **个股页研究搬家**：
  - 新存储：每个用户每家公司一个目录，保存当前研究记录与上一版本（撤回用），记录格式沿用现有 `CompanyPageResearch` JSON 与 `researchVersion` 规则。
  - `page-research` 的读、写、驱动修改、撤回全部改读写新存储；Wiki 页不再写研究块。
  - 模型经 `wiki_read` 读公司页时，若该页需要显示研究判断，由服务端按当前用户把研究记录拼进返回内容（只读视图），不回写 Wiki 文件。
R4 **接口作用域**：§2 的 7 类接口一律从令牌取 `user_id`，只读写该用户的数据；跨用户访问返回 404（不暴露存在性）。公共接口不要求令牌以外的变化。
R5 **迁移**：幂等脚本把现有用户层数据归到 `local` 用户（文件移动到 `users/local/`、Wiki 研究块抽出存为 `local` 的个股页研究并从 Wiki 文件删除研究块、`product_notes` 回填 `user_id='local'`、现有资料的库状态写入 `library_items`）；提供回滚脚本（逆向恢复）；迁移前自动备份涉及目录与表。
R6 不做：客户端带令牌、令牌在设置页配置、云端部署、用户注册与登录界面、按用户的额度与计费。

## 4. 范围

单线，pi3：`backend/app/api/v1/` 涉及 §2 的路由、`app/services/company_page_research.py`、`research_topics.py`、`research_links.py`、`research_memory.py`、`page_drafts.py`、`product_notes.py`、`notes_store.py`、文档与库相关服务、新增身份依赖与令牌表模块、迁移与回滚脚本、测试。

测试至少覆盖：无令牌在本机默认为 `local`、关闭开关后 401；两个用户各自的个股页研究、议题、记忆、记录、资料互不可见；撤回只撤本人版本；公共接口两用户结果相同；迁移脚本重复运行结果不变、回滚恢复原状；`wiki_read` 的公司页按用户拼入研究判断且不改 Wiki 文件。

## 5. 验收

1. 门禁：`cd backend && uv run pytest`（按约定剔除）；`uvx ruff check` 新改文件；`git diff --check`。
2. 真实运行（用户重建后另派）：在本机 Backend 上跑迁移，个股页、跟踪页、资料、设置记忆照常；再用两个测试令牌各做一次公司研究，互相看不到对方研究。

## 6. Out of Scope

R6 所列；公共层内部结构调整；刷新检查状态移出记忆目录。

## 7. Stop Conditions

- 除 `wiki_read` 外还有读取方依赖 Wiki 文件里的研究块（例如数据包、关系图、报告编译），无法按 R3 平移 → 停下报告清单。
- 迁移需要停机以外的数据库结构变更风险（如大表重写）→ 停下报告。
- 需要改 R1–R5 → 停下报告。

## 8. 回滚

运行回滚脚本恢复文件与表；还原代码。

## 9. 当前交接

1. 状态与结论：2026-10-14 pi3 已在 worktree `/Users/apple/ts/src/Stock-Research/.worktrees/pi3`（detached `6e3a865`）完成七类用户层隔离、令牌中间件、迁移/回滚脚本与测试。未提交、未重建、未对真实库执行 0013。
2. 改动文件：见本轮回复清单（均在上述 worktree 的 `backend/`）。
3. 证据：门禁 pytest 1329 passed / 8 skipped / 7 deselected；新文件 `uvx ruff check` 通过；`git diff --check` 无输出。隔离测试覆盖两用户互不可见、迁移重跑不变、回滚恢复原状。
4. 与规格的偏差及理由：显式 `STOCK_RESEARCH_RESEARCH_TOPICS` / `STOCK_RESEARCH_RESEARCH_LINKS` 优先于用户目录，避免测试与已钉死叶路径的部署被改写；未设叶路径时仍写入 `research/users/<user_id>/`。公司研究不再回写 Wiki 研究块；`page-drafts/research` 仅在用户文件不存在时回退读 Wiki 块，供迁移前与旧测试。pytest 用主仓 `.venv`，因 worktree `backend/` 无 `pyproject.toml`。
5. 未覆盖的缺口：客户端带令牌另立。真实库迁移与双令牌运行留待用户重建后另派。
6. 下一步谁做什么：Claude 审阅 worktree；用户重建后另派真实运行（迁移脚本、两测试令牌互不可见）。
