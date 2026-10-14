# 本机取数迁往 Backend 清点

状态：2026-10-14 Claude 写定。用户决定：安装包不随带 Python，本机取数（行情、报价、大盘、资讯等）迁到云端 Backend，本机只调 Backend 接口（todo §1.5 打包线）。本 Task 只读清点，产出迁移施工图；不改代码、不写入 Backend、不提交，不读 `.env` 与密钥。

## 1. 目标

列清本机数据服务现在通过 Python 脚本取的每一类数据：产品哪里在用、用哪个端点、Backend 是否已有同能力、迁过去要做什么。按「能力」组织，不按来源（见 Agent 只关心数据是什么、不关心从哪里来的边界）。

## 2. 范围

- 登记表：`datasources/registry.json`（54 个端点）、`datasources/CATALOG.md`；执行：`orchestrator/src/service.ts`（`fetchEndpoint`、`runFetchProcess`）、`orchestrator/src/finance/`、`orchestrator/src/snapshot.ts`。
- 调用方：Vibe 前端 `desktop/src/verticals/finance/`（经 `/finance-api/fetch`、页面查询）与问助手快照。
- Backend 现有能力：Stock `backend/app/providers/`、`backend/app/market/`（外部价格目录与行情成果）、`api/v1/stocks.py`、`company_data.py`、`radar.py`、`industries.py` 等。

## 3. 产出

`.local/local-fetch-migration/summary.md`：
1. **能力表**：能力（如「A 股实时报价」「指数与板块行情」「资讯列表」「公告列表」）| 产品在哪里用（页面与组件）| 本机端点 ID | Python 依赖库 | 调用频率与时效要求 | Backend 是否已有同能力（有 / 部分 / 无，写出接口）| 迁移做法（直接改调 / Backend 新增接口 / 不再需要）。
2. **未被产品使用的端点**：登记了但前端和问助手都不调用的，单列，建议不迁。
3. **Python 依赖清单**：迁移后本机不再需要的库；如仍有必须留在本机的，写明原因。
4. **风险**：需要用户网络环境的（如需登录态、只允许国内 IP）单列；云服务器能否访问需用户部署后实测，本 Task 只标出。

## 4. 验收

Claude 审能力表后写迁移实施 Task（Backend 新增接口 + 前端改调 + 删除本机取数链）。

## 5. Out of Scope

任何代码修改；云端部署与网络实测。

## 6. Stop Conditions

需要读取密钥或登录态才能判断某端点 → 标「待定」继续，不读。

## 7. 回滚

只读，删除 `.local/local-fetch-migration/`。

## 8. 补充

无。

## 9. 当前交接

1. 状态与结论：只读清点完成。54 个端点里产品在用 15 个，39 个建议不迁。实时报价、指数、复盘榜单和宏观概率 Backend 没有同等接口。
2. 改动文件：无代码改动。产出 `.local/local-fetch-migration/summary.md`。
3. 证据：对照 `datasources/registry.json`、`orchestrator/src/finance/page_queries.ts`、`desktop/src/verticals/finance/lib/api.ts`、`pages/Feed.tsx`、`DailyReview.tsx`、`Intel.tsx`，以及 Stock `backend/app/market/`、`providers/`、`api/v1/research_results.py`、`radar/`。未发请求，未读密钥。
4. 与规格的偏差及理由：无。复盘页取回但未展示的龙虎榜和强势股归因仍算在用，并在风险里标出。
5. 未覆盖的缺口：云服务器能否访问这些源未实测。
6. 下一步谁做什么：Claude 审能力表后写迁移实施 Task。
