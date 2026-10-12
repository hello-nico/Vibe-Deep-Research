# orchestrator 基线失败测试修复

状态：2026-10-12 Claude 写定，用户同意派 codex1。只修三项基线失败测试及其直接原因；不提交、不 push、不重启工作台。
实施仓库：Vibe-Deep-Research（`orchestrator/`、`datasources/registry.json`）。

权威：AGENTS「官网、分发与公开发布」（不展示原作者品牌与联系入口）；[两仓开发协议](../../task-protocol.md)；全局原则「不做兼容性开发」「Less is More」。

## 1. 目标

1. `orchestrator` 的 `node --test "test/*.test.ts"` 全部通过（当前 92 过、3 挂）。
2. 每项失败先查明是测试过时还是产品代码有缺陷，再改对应一侧；棘轮本意（参数名真能被函数接收、侧栏无原作者入口）保持有效。

## 2. 现状（Claude 核实，2026-10-12）

- #22、#23 `test/page_query.test.ts:149,175`：用 `VRA_PYTHON ?? path.join(REPO, "..", ".venv", "bin", "python")` 运行 `test/helpers/endpoint_signatures.py`。
  `REPO` 已是仓库根（`:15`），`REPO/../.venv` 不存在，仓库根 `.venv/bin/python` 存在；`spawnSync` 退出码为空，断言 `r.status === 0` 失败。路径修正后签名检查本身是否通过未知。
- #94 `test/ui_boundary.test.ts:68`：断言 `to="/" aria-label="Vibe Finance 深度对话"`；`Layout.tsx:54` 现为 `aria-label="Vibe Finance 对话"`（工作台外壳改版后入口名为「对话」）。品牌与联系方式的两条否定断言仍通过。
- 三项在 Vibe 删减前已失败，与删减无关。

## 3. 冻结决定

R1. **Python 路径**：改为仓库根 `.venv`，两处测试共用一个常量；保留 `VRA_PYTHON` 覆盖；取不到签名仍判红，不改成跳过。
R2. **签名检查**：路径修好后若报注册表参数与函数签名不符或端点导入失败，按实际情况修 `datasources/registry.json` 或页面查询的 `injectAs`，不放宽断言。
  端点模块已被删除的，删去注册项及引用它的页面查询块，前提是 `rg` 确认产品无其他调用；否则停该项。
R3. **侧栏断言**：改为与现名「Vibe Finance 对话」一致，保留品牌、联系方式、版本号三条否定断言；不改 `Layout.tsx` 文案。

## 4. 范围

- `orchestrator/test/page_query.test.ts`、`orchestrator/test/ui_boundary.test.ts`，以及 R2 必须改的 `datasources/registry.json` / 页面查询定义。
- 不改 `desktop/` 页面行为、DSH、Stock 仓库；不改提示词 Task 未提交的 `desktop/src/verticals/finance/lib/taskTrajectory.ts`。

## 5. 验收

**执行方自动检查**：`orchestrator` 全量测试 0 失败；`npm run typecheck`（orchestrator）；`node scripts/verify-protocol.mjs`、`verify-docs`、`verify-invariants`、`git diff --check`。
R2 若改注册表，列出每处改动的端点与函数签名对照。

**用户验收**：无界面变化，不需要；Claude 复跑测试即可。

## 6. Out of Scope

- 其他测试的重构或覆盖率；注册表中与三项失败无关的条目；Python 环境安装或升级。

## 7. Stop Conditions

停止范围：只停对应子项，写进交接后继续其余工作。

- 修路径后签名导出脚本自身报错且原因在 Python 环境（缺包、版本）：停 R1/R2，回填错误末 20 行。
- R2 需要删除产品仍在调用的端点或改 Python 取数函数签名：停该项。

## 8. 回滚

`git checkout -- <路径>`。

## 9. 当前交接

1. 状态与结论：2026-10-12 Claude 审阅通过（复跑 95 过、0 失败），已提交。codex1 已完成 R1–R3，待 Claude 审阅复跑。R1 为测试解释器路径错误，R3 为入口名称断言过时；修路径后真实签名检查通过，R2 无需改注册表或页面查询。
2. 改动文件：`orchestrator/test/page_query.test.ts`、`orchestrator/test/ui_boundary.test.ts`；本 Task 仅回填 §9，新建同名 `.log.md`。未改产品源码、DSH、Stock 或 `taskTrajectory.ts`。
3. 证据：orchestrator 中 `node --test "test/*.test.ts"` 获准在沙箱外复跑，95 过、0 失败、1 项原有 Windows ACL 平台跳过；针对性测试 13/13、0 跳过。`npm run typecheck`、三项门禁、`git diff --check` 均通过，命令与证据边界见同名日志。
4. 与规格的偏差及理由：无实现偏差。首次全量测试 4 项因沙箱拒绝监听回环端口报 EPERM；同命令在沙箱外复跑全部通过，未修改这些测试或放宽断言。
5. 未覆盖的缺口：签名检查真实导入现有 Python 函数，但不证明外部供应商联网取数及返回值正确；未做 Windows ACL 实机验收。无界面变化，按 §5 不需用户视觉验收。
6. 下一步谁做什么：无执行项，本 Task 关闭。
