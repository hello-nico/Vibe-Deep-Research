# Vibe Finance

[简体中文](README.md)

A local financial research workbench. DSH owns sessions, models and execution. Stock-Research Backend owns documents, evidence, Wiki, Topics, notes, results and confirmed research links. Client SQLite owns watchlists, the research roster and persistent UI preferences.

The source workspace is undergoing M8.5/M8.6 acceptance. The former six-stage engine, local report library, legacy chat execution and hidden legacy pages have been retired. Historical release screenshots and acceptance reports do not establish readiness of the current source or packaged application. M9 follows the next accepted commit.

## Entry points

- Product UI: `desktop/src/verticals/finance/` and `desktop/dsh/finance-ui/`.
- DSH runtime: `desktop/dsh/runtime/` and `desktop/dsh-dev.ts`.
- Local data service and selections: `orchestrator/src/api.ts`, `service.ts`, `client_store.ts`.
- Durable research: the separate Stock-Research repository and its DSH plugin.
- Decisions and tasks: [Human Checklist](human-checklist.md), [documentation index](docs/README.md), [retirement task](docs/旧系统退役_Task_2026-09-15.md), [M9 diagram](artifacts/m9-research-workbench.html).

All services can run locally. This is a responsibility boundary, not a public/private data classification. Data suppliers and the selected model may use network services.

## Run and validate

Requires Node.js 22.18+ and configured Python dependencies. Start Stock-Research Backend, then run `scripts/setup` and `scripts/start`. The workbench defaults to port 5930, local data API to 8765 and DSH to 5941. Configure models in the workbench settings.

```sh
npm run typecheck --prefix orchestrator
npm test --prefix orchestrator
npm test --prefix desktop
npm run build --prefix desktop
```

Set `VRA_PYTHON` to the Python interpreter containing the data dependencies when needed. `scripts/doctor` checks local data-service prerequisites; it does not certify model or end-to-end research behavior.

The retained MCP service only lists registered data endpoints and fetches data. Research execution belongs to DSH. Do not restore the former research startup tool or parallel model credentials.

Credentials must not enter source, logs or fixtures. Removing old code does not delete current Backend research, DSH sessions or Client selections. Builds and fixtures are separate from runtime and visual acceptance. The current delivery scope is Web only; the former macOS app is not an acceptance item or an M9 task.

[MIT License](LICENSE). Third-party resources retain their own license terms; the user has confirmed commercial authorization for Lieflat.
