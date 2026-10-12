# Stock 零散遗留（参数报错、运行数据忽略、迁移镜像瘦身）

状态：2026-10-12 完成并验收，归档。不提交、不 push、不重建容器、不重启工作台。
实施仓库：Stock-Research（`backend/app/api/v1/company_data.py`、`.gitignore`、`backend/Dockerfile`、`docker-compose.yml`）。

权威：T7.1c 过程记录「2026-10-12 · 重建后接口抽查」（无后缀返回 500）；`todo.md` §5「Stock `backend/Dockerfile` 拆分构建目标：migrate 镜像不装 Chromium」；
AGENTS「认证、`.env`、私钥及本地数据须保持 ignored/untracked」；全局原则「Less is More」。

## 1. 目标

1. 个股数据三个接口收到非法代码时返回 422 与原因，不再 500。
2. 本地运行数据不再出现在 `git status`。
3. migrate 镜像不装 Chromium；改代码后重建 backend 不重装 Chromium。

## 2. 现状（Claude 核实，2026-10-12）

- `company_data.py` 三个路由直接调用 `normalize_symbol`；无市场后缀时抛 `ValueError`，`POST /wiki/companies/601288/coverage/ensure` 返回 500。
- Stock 未跟踪：`workspace/research/product-notes/`（`note-digest.json`）、`workspace/wiki-reports/`（companies、industries、topics）。`.gitignore:40–54` 已忽略 `workspace/` 下其他运行目录。
- `backend/Dockerfile`：`gbrain-runtime` 阶段 + 单一运行阶段；`:46` 在依赖安装后 `playwright install --with-deps chromium`，再 `COPY backend/`、`data/`。
  `docker-compose.yml` 的 `migrate`（`:28`）与 `backend`（`:49`）都用这一份、无 `target`；migrate 只跑 `alembic upgrade head`。

## 3. 冻结决定

R1. **422**：三个路由把非法代码统一转成 HTTP 422，`detail` 用 `normalize_symbol` 的原错误文字；只在本路由文件处理，不加全局异常处理器，不改 `normalize_symbol`。
R2. **忽略**：`.gitignore` 加 `workspace/research/product-notes/` 与 `workspace/wiki-reports/`；只改忽略规则，不删、不移动这些文件。先 `git ls-files` 确认两处无已跟踪文件。
R3. **镜像拆分**：Dockerfile 分出公共依赖阶段（Python 依赖、gbrain、lit），`migrate` 目标为依赖 + 代码，`backend` 目标为依赖 + Chromium + 代码。
  Chromium 层必须在 `COPY backend/` 之前，保证只改代码时命中缓存；compose 两个服务各写 `target`。不改 gbrain、lit 版本、环境变量或卷。

## 4. 范围

- 只改上列四个文件与 `company_data` 路由的测试（新增 422 用例）。
- 不碰提示词 Task 未提交的文件：`dsh/` 全部，`backend/app/analysis/`、`calculation_evidence.py`、`source_access.py` 及其测试。
- 不动 `backend/pyproject.toml`、`backend/uv.lock`（来历待用户确认）；不改 Dreaming 历史目录规则。

## 5. 验收

**执行方自动检查**：
- Backend：company_data 相关 pytest（含新 422 用例）；`uv run python -c "import app.main"`。
- `git status --porcelain workspace/` 不再列出两目录；`git check-ignore -v` 命中新规则。
- `docker compose config` 能解析且两服务 `target` 正确；`docker build --target migrate` 与 `--target backend` 均能构建（只构建镜像，不 `up`、不替换运行中的容器）。
  记录两镜像大小；迁移镜像内 `python -m playwright` 找不到 Chromium。改一行注释后再构建 backend，日志显示 Chromium 层命中缓存。
- 两仓 `verify-protocol`、`git diff --check`。

**用户验收（下次统一重建后）**：`docker compose up -d --build` 正常，migrate 成功退出，backend healthy；Claude 用无后缀代码请求 ensure 得 422。

## 6. Out of Scope

- 其他接口的错误码统一；镜像进一步瘦身（gbrain、lit 是否进 migrate）；`workspace/` 目录结构调整；T7.2 的数据包改动。

## 7. Stop Conditions

停止范围：只停对应子项，写进交接后继续其余工作。

- R2 目录下已有受版本管理文件：停 R2，列出文件。
- R3 构建需要联网失败或需读取 `.env` 真值：停 R3，回填构建日志末 30 行；compose 解析只用 `.env.example`。
- R3 发现 migrate 运行时依赖 Chromium 或 playwright：停 R3。

## 8. 回滚

`git checkout -- <路径>`；本地构建出的镜像标签用 `docker image rm` 清理，不动运行中的容器。

## 9. 当前交接

1. 状态与结论：R1–R3 实施并通过 Claude 审阅；2026-10-12 用户重建后 migrate 退出码 0、backend healthy，Claude 以无后缀代码请求 ensure 得 422 及原因。完成，归档。
2. 改动文件：Stock `.gitignore`、`backend/app/api/v1/company_data.py`、`backend/Dockerfile`、`docker-compose.yml`；新增 `backend/tests/test_company_data_routes.py`。Vibe 仅回填本节并新建同名 `.log.md`；排除文件与原有改动保留。
3. 证据：company_data 相关 pytest 132 项通过（新增 12 项，TestClient / 夹具 / 替身）；uv 导入 `app.main` 成功；两个目录无已跟踪文件，workspace status 为空，新忽略规则命中；Compose 仅用 `.env.example`，target 正确；两仓 verify-protocol 与 diff 检查通过。
   真实镜像构建均成功：migrate 983,178,334 字节，backend 1,976,216,313 字节；断网 build 验证迁移脚本可加载且 playwright CLI 找不到 Chromium；临时副本增加一行注释后重建，Chromium 层 `CACHED`、代码复制层重新执行。完整命令与证据见同名 `.log.md`。
4. 与规格的偏差及理由：无业务范围偏差。uv 使用 no-sync / frozen / offline，防止改动未确认的两份 uv 文件；构建使用排除 `.env*` 的 backend/data 临时上下文。镜像内检查也通过 docker build 执行，未运行服务容器。
5. 未覆盖的缺口：未实际执行 PostgreSQL 迁移、部署新镜像或请求部署后接口；未替代 Claude 审阅及用户下次统一重建后的验收。测试有一个 TestClient/httpx 弃用警告；不改依赖。临时验证镜像和构建日志保留，位置见过程记录。
6. 下一步谁做什么：无。代码随下次 Stock 提交入库。
