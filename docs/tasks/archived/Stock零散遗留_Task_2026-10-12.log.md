# Stock 零散遗留 · 过程记录

## 2026-10-12 · R1–R3 实施与自动验证

执行范围来自同名 Task §1–§8 与用户本轮指令。实施仓库为 `/Users/apple/ts/src/Stock-Research`；本记录与 Task §9 回填在 Vibe。未提交、未 push；未执行 Compose up、docker run、迁移数据库、容器替换或工作台重启。

### 执行前证据与保护

- 阅读两仓 README、AGENTS、Checklist 相关条目、两仓协议、目标代码与迁移入口。
- `git ls-files workspace/research/product-notes workspace/wiki-reports` 无输出，R2 无已跟踪文件阻塞。
- Stock 原有提示词相关未提交改动及未跟踪的 `backend/pyproject.toml`、`backend/uv.lock` 保留；未修改或运行被排除模块的测试。
- 对 `dsh/`、`backend/app/analysis/`、名称含 `calculation_evidence` / `source_access` 的已跟踪文件及两份 uv 文件等共 129 个保护路径记录 SHA-256 / 缺失状态，后续核对一致。临时基线：`/private/tmp/stock-leftovers-protected-before.json`。
- 记录现有 Stock 容器 ID、镜像 ID、启动时间；检查不读取容器环境变量。

### R1 · 非法公司代码返回 422

改动：`backend/app/api/v1/company_data.py` 增加文件内 `_normalize_symbol`，仅转换 `normalize_symbol` 抛出的 `ValueError`，`detail` 原样保留。三个入口均先校验，之后才构造数据包、读取存储或取数；不改全局异常处理及服务层规范化函数。

新增 `backend/tests/test_company_data_routes.py`：三个路由 × 四类非法值（缺市场后缀、非法后缀、非法代码字符、空白），验证 422 与完整错误文字，并用失败哨兵证明非法输入不访问存储、数据包或 provider。

工作目录：`/Users/apple/ts/src/Stock-Research/backend`。

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -q -p no:cacheprovider \
  tests/test_company_data_packet.py tests/test_company_data_provider.py \
  tests/test_company_data_revision.py tests/test_company_data_routes.py
UV_CACHE_DIR=/private/tmp/stock-leftovers-uv-cache PYTHONDONTWRITEBYTECODE=1 \
  uv run --no-sync --frozen --offline python -c "import app.main; print('app.main import: ok')"
```

结果：`132 passed, 1 warning in 4.09s`；新增 12 项通过；`app.main import: ok`，退出码均为 0。警告为 FastAPI/Starlette TestClient 的 httpx 弃用提示，本次不改依赖。

证据等级：本地 pytest 与进程导入。既有测试使用固定资料、合成数据、SQLite 或替身；新增测试使用真实 FastAPI 路由和 TestClient，数据访问用失败哨兵替代。不构成真实 provider、运行中 HTTP 服务或新镜像部署验收。

命令差异：uv 增加 `--no-sync --frozen --offline`，pytest 禁止写缓存，Python 禁止写字节码；复用现有 `.venv`，不安装环境、不改两份 uv 文件。

### R2 · 运行数据忽略

仅在 `.gitignore` 增加 `workspace/research/product-notes/` 与 `workspace/wiki-reports/`；不删除、移动数据，不改 Dreaming 历史规则。

工作目录：`/Users/apple/ts/src/Stock-Research`。

```sh
git ls-files workspace/research/product-notes workspace/wiki-reports
git status --porcelain workspace/
git check-ignore -v workspace/research/product-notes/note-digest.json \
  workspace/wiki-reports/companies workspace/wiki-reports/industries workspace/wiki-reports/topics
```

结果：前两条均无输出；第三条的 product-notes 命中 `.gitignore:52`，三个报告子目录命中 `.gitignore:42`，退出码均为 0。

### R3 · 镜像拆分与构建方法

`backend/Dockerfile` 增加 `dependencies` 公共阶段及 `migrate` / `backend` 目标。Python 依赖、gbrain、lit 在公共阶段；只有 backend 安装 Chromium，安装层在复制业务代码之前。migrate 默认命令为 `alembic upgrade head`；Compose 原有命令保留。两个服务分别设置 `build.target`。版本、环境变量与卷均未改。

迁移依赖核查：读取 `backend/alembic/env.py`、各版本导入及两个服务辅助模块；未发现迁移路径依赖 Chromium / playwright。

Compose 解析清空继承环境，只用 `.env.example`；不打印解析后的环境变量：

```sh
cd /Users/apple/ts/src/Stock-Research
set -o pipefail
env -i PATH="$PATH" docker compose --env-file .env.example config --format json | \
  python3 -c 'import json,sys; c=json.load(sys.stdin); targets={s:c["services"][s]["build"]["target"] for s in ("migrate","backend")}; assert targets=={"migrate":"migrate","backend":"backend"}; print(json.dumps(targets))'
```

结果：`{"migrate": "migrate", "backend": "backend"}`，退出码 0。

构建使用临时上下文，只复制 `backend/` 与 `data/`；排除虚拟环境、缓存、字节码与 `.env*`。不会传输仓库根的 `.env`、运行数据或认证配置；Dockerfile 仍来自本次改动。

```sh
cd /Users/apple/ts/src/Stock-Research
mkdir -p /private/tmp/stock-leftovers-build-context
rsync -a --exclude=.venv --exclude=__pycache__ --exclude='*.pyc' \
  --exclude=.pytest_cache --exclude=.env --exclude='.env.*' \
  backend data /private/tmp/stock-leftovers-build-context/
cd /private/tmp/stock-leftovers-build-context
set -o pipefail
docker build --progress=plain --target migrate -f backend/Dockerfile \
  -t stock-leftovers-migrate:20261012 . 2>&1 | tee /private/tmp/stock-leftovers-migrate-build.log
docker build --progress=plain --target backend -f backend/Dockerfile \
  -t stock-leftovers-backend:20261012 . 2>&1 | tee /private/tmp/stock-leftovers-backend-build.log
```

migrate 构建退出码 0，镜像 ID `sha256:911cf10cd2282e0516306b2ad1cdcc9d031258c2883a4632cca714fc94407006`。backend 构建与缓存证据见下续记。

迁移镜像验证也只用 docker build。临时 `verify-migrate.Dockerfile` 以验证镜像为基础，在 `--network=none` 下执行 `alembic history`，随后通过 Python 子进程执行 `python -m playwright screenshot --browser chromium about:blank /tmp/chromium-check.png`，断言返回非零且包含 `Executable doesn't exist`。

```sh
docker build --network=none --progress=plain -f verify-migrate.Dockerfile \
  -t stock-leftovers-migrate-check:20261012 . 2>&1 | tee /private/tmp/stock-leftovers-migrate-check.log
```

结果：构建退出码 0；迁移脚本成功加载；CLI 返回 `Error: Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux-arm64/chrome-headless-shell`；随后输出 `migrate Chromium absence: verified`。共同依赖仍含 playwright Python 包，未调整依赖范围。没有执行数据库迁移。

### 两仓门禁与审阅边界

分别在两仓运行：

```sh
node scripts/verify-protocol.mjs
git diff --check
```

首次结果：两仓均 `verify-protocol: ok`，diff 检查均无输出。最终回填后再次核对见下续记。

执行方自审：异常转换只覆盖参数规范化；未扩大到服务错误；忽略规则仅新增两条；Docker 公共依赖无浏览器安装，backend 的 Chromium 层位于代码复制之前，默认最终目标仍为 backend。正式 Claude 审阅及下次统一重建后的用户验收待执行。

### R3 · 构建完成与缓存实证

backend 首次构建成功，退出码 0；Chromium 安装层执行 119.8 秒。镜像 ID `sha256:ae1d77c8cf470e39ea7d3607df26bbd03201ea14e5c589febecc5c3d2eeccf5e`。

在临时上下文的 `backend/app/api/v1/company_data.py` 文件头增加一行注释：`# R3 cache validation: change only application code in the temporary build context.`。没有在 Stock 源文件中加注释。

```sh
cd /private/tmp/stock-leftovers-build-context
set -o pipefail
docker build --progress=plain --target backend -f backend/Dockerfile \
  -t stock-leftovers-backend-cache:20261012 . 2>&1 | tee /private/tmp/stock-leftovers-backend-cache.log
docker image inspect stock-leftovers-migrate:20261012 stock-leftovers-backend:20261012 \
  --format '{{index .RepoTags 0}} {{.Id}} {{.Size}}'
```

缓存验证构建退出码 0，镜像 ID `sha256:373b70f14a58f0c3f29731423d44a711b09eef2e36205200b08c7e58892968d8`。关键日志：

```text
#11 [dependencies 7/7] RUN pip install --no-cache-dir -r requirements.txt     && command -v lit     && lit --version | grep -q "2.14.5"
#11 CACHED
#16 [backend 1/3] RUN python -m playwright install --with-deps chromium     && rm -rf /var/lib/apt/lists/*
#16 CACHED
#17 [backend 2/3] COPY backend/ /app/backend/
#17 DONE 0.4s
#18 [backend 3/3] COPY data/ /app/data/
#18 DONE 0.2s
```

镜像大小为 Docker `.Size`（非压缩传输体积）：

| 验证标签 | 字节 | 十进制 MB |
|---|---:|---:|
| `stock-leftovers-migrate:20261012` | 983,178,334 | 983.18 |
| `stock-leftovers-backend:20261012` | 1,976,216,313 | 1,976.22 |

migrate 相对 backend 少 993,037,979 字节。依赖仍完全共用，未进一步移除 gbrain、lit 或 playwright Python 包。构建用了当前工作树（包括原有未提交文件），只生成独立验证标签，未部署。

保留四个本地验证标签：上表两项、`stock-leftovers-migrate-check:20261012`、`stock-leftovers-backend-cache:20261012`。本轮不清理镜像、不动原有服务镜像标签。原始构建日志在 `/private/tmp/stock-leftovers-{migrate-build,backend-build,migrate-check,backend-cache}.log`；可持久审阅的命令、结果与关键缓存 / 缺浏览器证据已写在本记录。

### 容器保护与最终交接

构建前、migrate 构建后、全部构建后均执行：

```sh
docker inspect stock-research-backend stock-research-migrate stock-research-postgres \
  --format '{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}}'
```

三次输出一致，容器未被替换或重启：

| 容器 | ID 前缀 | 镜像 ID 前缀 | 启动时间 UTC |
|---|---|---|---|
| `stock-research-backend` | `7b57ceef17c6` | `2c73e49a165f` | `2026-10-12T01:56:21.540247641Z` |
| `stock-research-migrate` | `3ca565779f1a` | `a7d400d10cb6` | `2026-10-12T01:56:20.379315167Z` |
| `stock-research-postgres` | `228a8f1b2718` | `9f6f5e8f6bf6` | `2026-09-14T01:55:53.427256618Z` |

未触发 R2/R3 停止条件，无待裁决的新行为或归属选择。§9 已回填，规格 §1–§8 保持原样。下一步为 Claude 审阅；数据库迁移、新镜像 healthy 与部署后 422 请求留待用户下次统一重建后验证。

回填后的最终复核：两仓 `node scripts/verify-protocol.mjs` 均输出 `verify-protocol: ok`、退出码 0；两仓 `git diff --check` 均无输出；Stock `git status --porcelain workspace/` 为空；129 个保护路径的 SHA-256 / 缺失状态与执行前一致。Vibe 同时出现的 orchestrator 测试及其 Task/log 改动不属于本轮，未处理。

## 2026-10-12 · Claude 审阅

- R1：三个路由经 `_normalize_symbol` 在访问存储前转 422，`detail` 保留原错误文字；新测试覆盖 4 种非法代码 × 3 个路由，并断言不访问存储、数据包和 provider。
- R2：`.gitignore` 只加两行，按字母序归位；文件未删、未移动。
- R3：`dependencies` → `migrate`（代码 + `alembic upgrade head`）/ `backend`（Chromium 层在 `COPY backend/` 之前）；compose 两服务各写 `target`，环境变量和卷未变。backend 是最后一个阶段，不带 target 构建时结果不变。
- Claude 复跑 company_data 四份测试：132 passed。审阅通过；部署验收待用户下次统一重建，重建后 Claude 用无后缀代码请求 ensure，确认返回 422。

## 2026-10-12 · 重建后验收（Claude）

`docker compose ps`：migrate Exited (0)，backend Up (healthy)。`POST /api/v1/wiki/companies/601288/coverage/ensure` → 422，detail「symbol must include a market suffix, e.g. 600011.SH (allowed: .SH .SZ .BJ .HK .US)」。验收通过。
