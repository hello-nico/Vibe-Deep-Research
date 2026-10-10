# 数据源 adapter + registry(Phase 1)

`registry.json` 是运行时端点注册表，记录各端点的市场、来源、合规标记、参数、阶段与启用状态。
完整目录见 [CATALOG.md](CATALOG.md)，由 `scripts/gen_catalog.py` 生成并通过测试核对端点清单；数据源连通性体检用 `scripts/health.py`。

## CI 范围

页面取数在用的端点共 16 个（大盘行情 `/daily-review`、资讯雷达 `/intel`、`doctor --net` 探针），对应的数据源测试在 CI 运行。其余约 100 个无产品调用方的端点与 `industry_tags.json` 暂留仓库、不在 CI 运行；`/signals` 页面所需的 `gpu_rent_thermometer` 随该页面的去留决定。逐项依据见归档的[死代码清点](../docs/tasks/archived/死代码清点_Task_2026-10-09.log.md)。

合规标记和已登记不等于本次可用；当前取数成功、缺口和限制以运行信封为准，也不构成对所有来源商用或再分发权限的保证。
