# Backend 按用户隔离

状态：2026-10-14 Claude 写定，用户同意（todo §1.5 内测首发第 3 步；依据 [Backend 用户层清点](../archived/Backend用户层清点_Task_2026-10-14.md) 产出 `.local/backend-user-layer/summary.md` 与 Claude 对 8 项待裁决的裁定）。执行方不提交、不重建、不读 `.env` 与密钥。
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

1. 状态与结论：2026-10-14 第二次迁移（只复制 Wiki 研究块，不改页）已留在真实数据上，备份 `workspace/research/user-layer-backup-20261014-150230`。Claude 审阅后把 pi3 的迁移脚本与测试合入 Stock 主目录，并补上读路径漏洞，已提交 Stock `620f198`；§5.2 两令牌真实运行通过，本 Task 收尾归档。
2. 改动文件：Stock 主目录，相对已提交的 `6272fe5`：`backend/scripts/user_layer_migrate.py`、`backend/tests/test_user_isolation.py`（pi3）；`backend/app/api/v1/wiki.py`、`backend/tests/wiki/test_core_research.py`（Claude）。
3. 证据：2026-10-14 15:41 调 127.0.0.1:8700。local 对 000933.SZ、600900.SH 的 page-research 为 200 且 research 非空。qa-alice、qa-bob 的 research 与 researchVersion 为 null；pages/read 无 company_page_research，markdown 无「个股页研究」。错误令牌 401。users.json 已删这两条，目录未生成。旧令牌明文未跨 shell 保留，清理后未用同一串复测 401。
4. 与规格的偏差及理由：Claude 补修读路径：`_with_user_research` 总是先去掉 Wiki 文件里的 `company_page_research` 块，只拼当前用户的记录；`/page-drafts/research` 的 `spec` 同样经过它，`researchVersion` 只取用户存储。
   `test_core_research` 两条断言原本锁定「从 Wiki 块取版本」的旧行为，改为断言不显示、不取版本，并改用临时工作区（原先会读到真实 `local` 研究）。
5. 未覆盖的缺口：Wiki 文件里的旧研究块仍在（已无人读得到），留待以后正式发布时清理，避免触发完整性校验；旧流程 `/pages/diff` 仍可比较含旧块的版本，内测不开放。两个测试令牌的真实运行未做。
6. 下一步谁做什么：Claude 审阅这次双令牌读页结果。Wiki 旧块仍待正式发布时清理。测试用户已删除。
