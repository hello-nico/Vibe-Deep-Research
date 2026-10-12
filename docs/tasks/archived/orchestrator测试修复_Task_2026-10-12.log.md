# orchestrator 基线失败测试修复 · 过程记录

## 2026-10-12 · codex1 执行 R1–R3

### 范围与起始状态

- 用户授权按 Task R1–R3 实施、跑 §5、回填 §9 并新建本日志；不提交、不 push、不重启工作台。
- 已读 README、Human Checklist、AGENTS、两仓开发协议、系统职责与页面助手契约及本 Task；规格 §1–§8 未改。
- 起始工作树已有 `desktop/src/verticals/finance/lib/taskTrajectory.ts` 修改、其他未跟踪 Task 与 `output/`；本轮未编辑这些文件。未修改 desktop 页面、DSH、Stock 仓库。
- 环境：macOS，Node v22.22.3；仓库根现有 `.venv/bin/python` 为 Python 3.14.7。未安装或升级环境。

### 失败归属与修复

| 子项 | 当前证据与归属 | 修改与结果 |
|---|---|---|
| R1 | `REPO` 已解析为仓库根；`../.venv/bin/python` 不存在，`.venv/bin/python` 存在。原两项签名测试的 `spawnSync` 状态为 null，失败源于测试路径。 | `page_query.test.ts` 新增共用 `PYTHON` 常量，保留 `VRA_PYTHON` 优先级，默认仓库根 `.venv/bin/python`；两处签名测试均使用该常量。 |
| R2 | 修路径后，helper 在现有解释器下真实导入函数并导出签名；注册表默认参数及页面 `injectAs` 的现有断言均通过。未发现需修复的产品签名缺陷。 | 无注册表或页面查询改动，因此没有改动端点的签名对照清单；未删除端点或修改 Python 函数。 |
| R3 | Human Checklist 已确认「对话」入口，`Layout.tsx:54` 为 `Vibe Finance 对话`；原正向断言仍要求「深度对话」，属于测试过时。 | `ui_boundary.test.ts` 精确匹配当前名称；品牌、个人联系方式、版本号的否定约束原样保留（原测试用两条否定断言覆盖这些约束）。未改 Layout 文案。 |

两项签名测试仍要求导出退出码为 0；未放宽参数/导入/注入键断言，未新增 skip。新增常量与名称更新是本次全部测试代码差异。

### 命令与结果

以下测试命令工作目录为 `/Users/apple/ts/src/Vibe-Deep-Research/orchestrator`；门禁及 Git 命令工作目录为仓库根。

| 阶段 | 完整命令 | 结果 |
|---|---|---|
| 修复前复现 | `node --test test/page_query.test.ts test/ui_boundary.test.ts` | exit 1；13 项，10 过、3 失败、0 跳过；两项签名导出退出码 null，侧栏正向名称不符。 |
| 路径与名称修复后 | `node --test test/page_query.test.ts test/ui_boundary.test.ts` | exit 0；13 项，13 过、0 失败、0 跳过；真实签名检查通过。 |
| §5 首次全量（沙箱内） | `node --test "test/*.test.ts"` | exit 1；96 项，91 过、4 失败、1 平台跳过。4 项均为回环监听 EPERM，详见下文。 |
| §5 全量复跑（获准沙箱外） | `node --test "test/*.test.ts"` | exit 0；96 项，95 过、0 失败、1 平台跳过，耗时约 4.92 秒。#22、#23、#94 均通过。 |
| 类型检查 | `npm run typecheck` | exit 0；`tsc --noEmit -p tsconfig.json` 通过。 |
| 协议门禁 | `node scripts/verify-protocol.mjs` | exit 0；`verify-protocol: ok`。仅由门禁读取兄弟仓共享文件，未修改 Stock。 |
| 文档门禁 | `node scripts/verify-docs.mjs` | exit 0；`verify-docs: ok`。 |
| 不变量门禁 | `node scripts/verify-invariants.mjs` | exit 0；`verify-invariants: ok`。 |
| 差异检查 | `git diff --check` | exit 0，无输出。 |

首次全量失败为 #35（退役 HTTP 与 Client 重开）、#36（请求体字节上限）、#68（端口占用预检）、#74（测试创建的监听子进程回收）。共同错误为：

```text
listen EPERM: operation not permitted 127.0.0.1
```

按沙箱规则请求并取得提权许可后，原命令复跑成功；未修改这四项测试，也未操作工作台服务。全量中的唯一跳过为已有 `windows_support.test.ts` 的 Windows ACL 用例，条件为 `process.platform !== "win32"`，本轮未改。

### 证据等级、审阅与交接

- 签名核验：运行真实 Python 导入与 `inspect.signature`，没有签名夹具或替身；不联网取数，不证明供应商接口可用或返回值/日期格式正确。
- 测试库包含临时数据根、假信封、失败取数 shell、mock timers 等既有夹具；部分 HTTP/SQLite/端口测试执行真实本地行为，不等于真实研究、供应商或生产验收。
- 直接检查两个测试文件的 diff：仅路径常量共用与精确名称更新；既有断言不弱化，无意外产品改动。此为局部低风险变更，主线程完成自审，未委派独立审阅；Claude 审阅与亲自复跑仍待完成。
- 本 Task 仅覆盖 §9，完整过程保存在本日志；未提交、未 push、未创建分支、未重启工作台。无新的人类裁决事项。

## 2026-10-12 · Claude 审阅

- 改动只在两个测试文件：Python 路径改为仓库根 `.venv`，两处共用 `PYTHON` 常量，保留 `VRA_PYTHON` 覆盖，失败仍判红；侧栏断言改为现名「Vibe Finance 对话」，三条否定断言不变。
- R2 签名检查在真实 Python 下通过，无产品改动，符合 §3。
- Claude 复跑：orchestrator 95 通过、0 失败、1 跳过（Windows 平台）。审阅通过，待随下一批提交。
