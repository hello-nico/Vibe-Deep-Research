# gbrain 退役实施 过程记录

worktree `/Users/apple/ts/src/Stock-Research/.worktrees/pi1-gbrain`。未提交、未连库、未 docker build、未装包。

## 步骤

1. 删除 `WikiAdapter.provider_snapshot`（未迁入新 adapter）。`/refs/resolve` 仍走 `ProviderSnapshots`。
2. `page_update_times` 读 `history.jsonl`；`related_pages` 读 index links。
3–6. `wiki_list_pages`/`wiki_search` 改 Backend HTTP；去掉 MCP serve、relations/schema/get_page。
7. `publish`：pending → 写 md → git commit → index/history；链接 `links_from_markdown`。
8. lock 使用 `STOCK_RESEARCH_DATABASE_URL`（`postgresql+psycopg` 转 libpq）。
9. Dockerfile 去掉 bun/gbrain，保留 git。
10. compose `postgres:17`；删 `initdb/02_gbrain.sql` 与 GBRAIN_*。

## 验证

- grep 目标路径无 gbrain
- pytest -q：1663 passed, 29 skipped
- pnpm test：355 passed
- verify-protocol --sibling Vibe：ok
# gbrain 退役实施 · 日志

## Claude 审阅（2026-10-27，第一轮）

- 68 文件，+546 / −2401；新增 `wiki/adapter.py`、`/wiki/pages/search` 与测试。执行方报 pytest 1663 过 / 29 跳过、dsh 355 过。
- 退回两处：①adapter 里 `run`/`_read_only_sql` 抛错桩属兼容残留，删掉并改测试；②alembic 0014 改写历史 provenance 标签属不必要的数据迁移且 downgrade 抛错，撤掉，保留 `gbrain_backfill` 为历史数据值。
- backfill 脚本仍读旧库 `page_versions`，保留为部署前一次性迁移工具；部署时先跑它的 dry-run 核对快照已全部回填，再删旧库。

## Claude 审阅（2026-10-28，pi1-gbrain2 移植版）

**门禁（Claude 亲自重跑）**
- Backend 全量 1694 过 / 28 跳过，没有复现死锁；
- `app.main` 导入通过；
- dsh 构建通过、测试 359 过；
- verify-protocol ok；
- 残留检查：`backend/app`、`dsh/src`、compose、initdb、Dockerfile 中只剩历史标签 `gbrain_backfill`。

**结构**
- 与主目录逐文件对比，pi1 自己的改动涉及 66 个文件。主目录已有的改动（依赖瘦身、pip 缓存挂载、跟踪页、报告期等）都保留。
- Dockerfile 只删了 gbrain 阶段；compose 改用官方 postgres:17，去掉 GBRAIN_* 变量；锁改用主库连接；读取路径与旧 adapter 一致，都读文件索引 pages.json，现有页面不受影响。
- 发布流程 = 旧流程去掉 gbrain sync / extract / verify 三步。

**部署前数据核对**
- 本机 inventory 加容器内回填干跑：621 份快照中 601 份已在主库，可写 0，有歧义 20（旧库同一引用对应多个值，本来就无法判定）。退役不丢数据。

**必须修**
1. `wiki/adapter.py search_pages` 的类型复数化只在词尾加 s：company 变 companys、industry 变 industrys，按类型检索结果为空。改成显式映射 company/companies、industry/industries、theme/themes、comparison/comparisons，未知类型报错，并补测试。
2. `research-material-tools.mjs` 读 themes/comparisons 时，`navigation.readPage` 直接返回 Backend 原始 payload 作为工具结果。应与个股页走同一视图（`withWikiCitationUris(companyWikiView(...))` 或同等的工具结果格式），并补测试。

**顺手删**
3. `wiki-navigation.mjs` 的 `navigationTool` 只剩测试在用，属于死代码。删掉，相关测试改测 `wikiNavigationTools`。
4. `WikiAdapter.__init__` / `ensure_wiki_root` 的 `**_ignored` 兼容参数删除，调用方同步。

结论：修完上面 4 条、复跑门禁后即可合入。合入后用户需要重建 Backend；postgres 换镜像不需要重建数据卷，旧 gbrain 库留在卷里，以后再删。

## Claude 合入（2026-10-28）

- pi1 修完 4 条后复核通过：Backend 1695 过 / 28 跳，dsh 358 过。Claude 另删了无人调用的 `readPage`。
- 已复制进 Stock 主目录。合入后发现两个测试文件仍用 GBRAIN 环境变量名（`test_wiki_read_lock.py`、`test_company_page_research.py`），Claude 已改为 `STOCK_RESEARCH_DATABASE_URL` 等新名字。
- 与其他三条线合并后，主目录全量 1717 过 / 28 跳。
- 部署：执行 `docker compose up -d --build`，postgres 换成官方 17 镜像，沿用原数据卷，不用重建卷；旧 gbrain 库留在卷里，以后再删。
