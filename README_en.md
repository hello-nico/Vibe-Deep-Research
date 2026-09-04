<p align="center"><a href="README.md">简体中文</a> | <b>English</b></p>

<h1 align="center">Vibe Research</h1>

<p align="center">
  <b>Connect your AI once, then use a local financial research agent by default</b><br>
  Codex / Claude Code / WorkBuddy subscriptions or model APIs · Agent on by default · verified APIs can switch to direct mode
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-yellow"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-v1.0.3-F35D2B">
  <img alt="UI" src="https://img.shields.io/badge/UI-React%20%2B%20Vite-646cff">
  <img alt="Orchestrator tests" src="https://img.shields.io/badge/orchestrator-691%20checks-passing">
  <img alt="Desktop tests" src="https://img.shields.io/badge/desktop-34%20tests-passing">
  <img alt="Codex Harness" src="https://img.shields.io/badge/runtime-Codex%20Harness-black">
</p>

<p align="center">
  <a href="https://viberesearch.wiki">Website</a> ·
  <a href="#what-it-is">What it is</a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#model-access">Models</a> ·
  <a href="#data-and-markets">Data</a> ·
  <a href="#security-and-privacy">Security</a> ·
  <a href="#development-and-tests">Development</a> ·
  <a href="#current-boundaries">Boundaries</a> ·
  <a href="CHANGELOG.md">CHANGELOG</a>
</p>

---

## The Author Is Open to Opportunities

The author is open to AI roles at Tencent and other leading technology companies in Shenzhen, and hopes to join a team passionate about AI development. Areas of interest include AI / Agent product development, real-world deployment, and AI consulting.

Contact: [simonlin0423@gmail.com](mailto:simonlin0423@gmail.com)

---

## What it is

Vibe Research is a **local financial research workbench**. On first launch, the user makes one decision: connect an
existing Codex / Claude Code / WorkBuddy (CodeBuddy) subscription, or provide a model API. After the connection succeeds, Vibe Research
Agent is enabled by default. No understanding of harnesses, scripts, or routing modes is required.

Agent mode maintains local context, calls tools, advances tasks, handles failures, and preserves the research
process. A Codex subscription runs through the
[OpenAI Codex Harness](https://developers.openai.com/blog/codex-as-a-platform); a Claude.ai subscription runs through
the local Claude Code Agent; a WorkBuddy / CodeBuddy account runs through Tencent's official CodeBuddy Code CLI. Vibe Research applies the same financial data, research procedures, deterministic
calculations, evidence checks, and compliance boundaries above those runtimes.

The Claude Code and WorkBuddy / CodeBuddy Agents currently support chat and bounded document tasks. Full six-stage research requires the
Codex Harness, or a model API connected in Agent mode. The UI states this boundary for the selected runtime.

API users may turn the Agent off in Settings and use direct model mode. This switch is available only to provider
profiles that have passed the direct-mode capability check.

| Agent mode (default, recommended) | Direct model mode |
|---|---|
| Maintains context and task state | Handles each request independently |
| Can call local data, calculation, and research tools | Does not call Agent tools |
| Supports six-stage research, debate, and Agent-guided backtesting | Suited to light chat, translation, and passage location |
| Preserves progress, evidence, reports, and failures | Does not preserve Agent task memory |
| Accepts either a subscription or an API as its reasoning source | Requires a verified API provider |

Codex, Claude Code, and WorkBuddy / CodeBuddy subscription runtimes are connected today, with live CLI, version, and login detection.
The CodeBuddy adapter reuses the local logged-in account and disables tools, MCP, user settings, automatic memory, and CLI session persistence. Qwen Code and DeepSeek CLI remain API paths because they require
their own API key.

## Features

| Module | Current capability |
|---|---|
| Home agent | Start a conversation immediately and ask about a company, industry, market review, or research task |
| Daily review | Summarises market activity, themes, limit-up drivers, and daily signals |
| Intelligence radar | Translated Investment News headlines, public news, A-share filings, and event probabilities |
| Industry signals | GPU rental rates, monthly industry data, commodities, hiring, and data calendars |
| Sector centre | Reviews sector performance and drills into specific industry themes |
| Company research | Six-stage A-share workflow: profile, financials, consensus, valuation, risk, and report |
| My reports | Stores PDF, DOCX, TXT, MD, and CSV locally, with extraction, search, citations, download, and deletion |
| Backtesting | Uses an agent conversation as the only input; asks for missing details, then calls the real backtest tool |
| Bull/bear review | Bull, bear, rebuttal, and neutral-referee stages share the same factual dossier |
| Watchlist and portfolio | Recognises A-share, US, and Hong Kong symbols; stores records locally and refreshes quotes |
| Research records | Stores research, backtest, and debate reports with search, timestamps, expansion, and deletion |
| Connect AI | First connects a subscription or model API, then shows the global Agent switch, enabled by default |

### Research output is inspectable

A six-stage research run produces:

- `report.md`: the final research report.
- `evidence.json`: evidence used in the run, including source, date, and raw reference.
- `calculations.json`: deterministic inputs, functions, and calculation DAGs.
- `conflicts.json`: disagreements between sources, without silent resolution.
- `manifest.json`: model, version, stages, status, recalled documents, and run metadata.
- `viewer.html`: a browser-readable evidence and report viewer.

If required data is missing, the run becomes `incomplete` or `failed`. It does not fill gaps with stale values or
model guesses.

## Quick start

### Requirements

| Item | Requirement |
|---|---|
| Operating system | Windows 11, macOS, or Linux; Windows runs natively and does not require WSL |
| Node.js | ≥ 22.18; Node 24 LTS recommended |
| Python | ≥ 3.11; Python 3.12 recommended and currently verified |
| Agent engine | Codex Harness is installed with the product dependencies; version 0.149.0 verified; no global Codex install required |
| Model access | ChatGPT or Claude.ai subscription login, or a provider that supports the Responses API |

> Node must be a build with TypeScript support enabled (the official nodejs.org installers and anything installed via nvm / fnm / Volta are): `node -p process.features.typescript` should print `strip` or `transform`. Some Linux distribution packages ship Node compiled without it; starting the app or running tests then fails with `ERR_UNKNOWN_FILE_EXTENSION ".ts"` / `ERR_NO_TYPESCRIPT` — switch to an official build. `npm test` runs this check first and prints the same guidance.

### Install dependencies

Windows (PowerShell or Command Prompt):

```bat
git clone https://github.com/simonlin1212/Vibe-Research.git vibe-research-agent
cd vibe-research-agent
scripts\setup-windows.cmd
scripts\start.cmd
```

`setup-windows.cmd` creates `.venv`, installs Node/Python dependencies, initializes the private product data
directory, and runs diagnostics. `start.cmd` starts the local API and browser UI and opens
`http://127.0.0.1:5930`.

macOS / Linux:

```bash
git clone https://github.com/simonlin1212/Vibe-Research.git vibe-research-agent
cd vibe-research-agent
scripts/setup
scripts/start
```

`scripts/setup` creates `.venv`, installs the bundled Agent engine and all Node/Python dependencies, initializes the
private data directory, and runs diagnostics. `scripts/start` checks the installation and fixed ports, starts both
services, and opens the browser only after both are healthy. No global Codex install or second terminal is required.

### Connect AI

Opening any feature for the first time takes the user to **Connect AI**. Choose one source and test and save it once;
the Agent is then enabled automatically. The second card only permits Agent-off mode after an API passes the direct
capability check.

For ChatGPT subscription access, start the UI, open **Connect AI → Subscription**, and click **Log in to Codex**.
Complete authorization on the official OpenAI page that opens, return to Settings, and click **Test and save**
after the login status turns ready. The product uses its own `.local/codex-home` and never reads or overwrites
`~/.codex`. If the authorization page does not open, return to Settings and click **Log in to Codex** again. If the
local status is still unclear, run `scripts/doctor` (or `scripts\doctor.ps1` on Windows) for an actionable diagnosis.

For Claude.ai subscription access, install and log in to Claude Code. The settings page detects it automatically;
no Claude API key needs to be entered into Vibe Research.

For WorkBuddy / CodeBuddy access, Settings directly detects the official CodeBuddy Code CLI bundled with an installed,
signed-in WorkBuddy desktop app. No second installation or login is required. Users without the desktop app can instead
install Tencent's CLI with `npm install -g @tencent-ai/codebuddy-code` and run `codebuddy` once to sign in. Neither path
requires entering a token or API key into Vibe Research.

For API access, open **Connect AI → API access**, choose a provider, enter the API base URL, model name, and key,
then click **Test and save**. A real model request must succeed before the new configuration is saved and shared
across the product. The same probe records whether the provider supports the verified direct-mode contract.
If the agent asks you to reconnect there, the local login session has expired; the research or backtest workflow
itself has not failed.

### Start the browser UI

Run `scripts\start.cmd` on Windows or `scripts/start` on macOS / Linux. Both commands manage the local API and UI
together at [http://127.0.0.1:5930](http://127.0.0.1:5930). On macOS / Linux, use `scripts/start --no-open` to skip
opening the browser automatically; Ctrl+C stops both processes.

Vite proxies `/api/*` locally and adds authentication on the server side. If `VRA_DATA_ROOT` is set, both
processes must use the same value.

### Run one research job from the command line

Windows PowerShell:

```powershell
node orchestrator/src/run.ts `
  --symbol 300308 `
  --market SZ `
  --python "$PWD\.venv\Scripts\python.exe"
```

Windows automatically uses the `controlled_mcp` execution layer. The research thread has no shell access and no
workspace write permission; it can only read sanitized run files, call deterministic calculations, and write the
current stage through controlled tools. macOS and Linux keep the existing hook-based execution layer.

macOS / Linux:

```bash
node orchestrator/src/run.ts \
  --symbol 300308 \
  --market SZ \
  --python "$(pwd)/.venv/bin/python" < /dev/null
```

A full run usually takes 15–19 minutes. Progress remains visible, and results are written to
`.local/runs/<run-id>/`. Exit codes: `0` complete, `2` incomplete/stale, and `3` failed.

## How it works

```text
Browser workbench
Home agent · review · intelligence · company research · backtesting · document library
        │
        ▼
Finance agent layer
117 data endpoints · six-stage SOP · calc · validator · report archive
        │
        ▼
OpenAI Codex Harness
agent loop · context · tools · progress · sandbox
        │
        ▼
Local Agent Runtime
Codex SDK · Claude Code CLI · CodeBuddy Code CLI (local detection / login probe / restricted execution)
        │
        ▼
Model Provider
ChatGPT / Claude.ai / WorkBuddy subscriptions · OpenAI · DeepSeek · Qwen · GLM · Kimi · MiMo · compatible APIs
```

The project enforces its rules at three levels:

| Layer | Components | Purpose |
|---|---|---|
| Instruction | `AGENTS.md` + `.agents/skills/` | Defines financial research discipline and procedures |
| Execution | Codex hooks + workspace sandbox | Restricts network, file access, data fetching, and output locations |
| Orchestration | orchestrator + validator + calc + gate | Enforces stages, citations, deterministic calculations, and compliance |

The project does not modify Codex source code. The Codex checkout is an upstream reference only; the product uses
the official CLI and SDK.

## Model access

The **Connect AI** page asks two separate questions: first where the AI comes from, then whether to use the Agent.
The second answer defaults to on, so most users never need to change it.

- The Agent Runtime manages local context, tool calls, task state, progress, and failure handling. Codex subscriptions use the Codex Harness; Claude subscriptions use the Claude Code Agent; WorkBuddy / CodeBuddy uses the CodeBuddy Code Agent. They are not presented as the same runtime.
- The Claude Code and WorkBuddy / CodeBuddy Agents currently support chat and bounded document tasks. Full six-stage research requires the Codex Harness, or a model API connected in Agent mode.
- The AI source can be a subscription login or the user's Model Provider API. Changing the source does not automatically disable the Agent.
- Direct mode does not run the Agent, call tools, or preserve Agent task memory. Six-stage research, bull/bear debate, and Agent-guided backtesting clearly ask the user to re-enable the Agent instead of silently degrading.
- Codex subscription mode uses the product's own `CODEX_HOME` and never reads or writes the user's `~/.codex`. Claude and CodeBuddy subscription modes reuse their own local login while forcing local tools, MCP, user settings, and automatic memory off. If WorkBuddy bundles an older CLI without a no-session-persistence flag, the entire answer runs under a disposable temporary home that is deleted afterward.
- Both subscription and API configurations must pass a real conversation probe before **Test and save** updates the active configuration.
- In API mode, the key persists in the current browser profile's local `localStorage` so it does not need to be entered again.
  It is not an OS keychain and encryption is not guaranteed, so use it only on a trusted personal computer and clear it after
  use on a shared machine. It is sent to the local backend per request and is not written to the repository, backend
  configuration, run ledger, or logs.

Built-in provider templates: OpenAI, DeepSeek, Qwen, GLM, Kimi, and MiMo. The Agent engine supports the Responses
API; the direct channel uses the separately declared and verified protocol in each provider profile. A template's
presence does not mean it passed the compatibility matrix. Unverified profiles do not unlock the direct switch.

See [docs/model-access.md](docs/model-access.md) and [providers/README.md](providers/README.md).

## Data and markets

- Current registry: **117 endpoints across 30 layers**, covering CN, US, and HK.
- Data includes quotes, candles, financial statements, consensus, filings, reports, fund flows, positioning,
  options, SEC/FINRA/CBOE, news, macro data, industry thermometers, hiring, restrictions, and data calendars.
- A-share, US, and Hong Kong symbols work in the watchlist, portfolio, document library, and agent conversations.
- **The six-stage company research workflow currently supports A-shares only.** It will not launch an empty
  US or Hong Kong research run without the required data chain.
- Scanned PDFs require OCR. Text PDFs preserve page-level citations.

See [datasources/CATALOG.md](datasources/CATALOG.md) for the endpoint catalog.

## Project structure

| Path | Purpose |
|---|---|
| `desktop/` | React + Vite local browser UI |
| `orchestrator/` | Agent orchestration, validators, API, MCP, chat, document library, and report archive |
| `backtest/` | Deterministic backtest engine and tool entry point |
| `calc/` | Deterministic calculation library |
| `datasources/` | Endpoint registry, catalog, and health checks |
| `.agents/skills/` | Financial research procedures and data tools |
| `providers/` | Provider templates with no secrets |
| `scripts/` | Initialisation and diagnostics |
| `.local/` | Private user data, reports, sessions, and run artifacts; gitignored |

## Security and privacy

- Original research documents stay on the local machine. The model receives only passages selected by server-side search.
- Keys for the backend's default provider come only from environment variables and are not written to product configuration or the repository.
- An API key entered in the browser persists in that browser profile's local `localStorage`; it is not an OS keychain and encryption is not guaranteed. It is sent through the local backend to the selected model provider only when used and is not written to backend configuration or logs.
- Document chat disables shell access, image reading, subagents, plugins, apps, and network access.
- Document citations use `[资料:<id> p.<page>]`. Missing, incorrect, or unknown citations are rejected by code.
- Research-stage agents have no network access. The orchestrator fetches data through controlled scripts and stores
  raw responses with hashes.
- The local API binds to `127.0.0.1` by default. Write requests require authentication and JSON.
- Output is limited to data, analytical frameworks, scenario probabilities, and decision checkpoints. It does not
  provide position, sizing, target-price, or stop-loss instructions.

## Development and tests

```bash
npm run typecheck --prefix orchestrator
npm test --prefix orchestrator

npm run typecheck --prefix desktop
npm test --prefix desktop
npm run build --prefix desktop

.venv/bin/python -m pytest calc/tests -q
.venv/bin/python -m pytest backtest/tests -q
.venv/bin/python -m pytest .agents/skills/data-access/scripts/tests -q
```

Current verified baseline:

- orchestrator: **691 checks** (690 passed locally plus one Windows-only ACL check skipped off Windows), Core industry-term count **0**, TypeScript typecheck passed.
- desktop: **34/34**, TypeScript typecheck and Vite production build passed.
- Python (calculation library, backtest, and data scripts): **577/577**.
- The current unreleased changes passed an independent Codex re-review with `No actionable P1/P2 findings`.

Project rule: test each completed component, run an independent Codex review, verify every finding, fix valid issues,
and re-review. A component is not described as complete and is not committed or pushed before that loop closes.

## Current boundaries

- Distribution remains open-source code plus a local browser UI, not a DMG or EXE. The current unreleased changes use
  one `scripts/start` command to manage the local API and browser UI together.
- MiMo API has passed an end-to-end run from an empty configuration to a real business report. Other third-party
  providers still require the user's own keys and are not marked verified without real compatibility-matrix runs.
- Native Windows 11 support includes PowerShell setup/start scripts, Windows path and process handling, and the
  controlled research toolchain. The CI matrix covers `windows-latest`, `macos-latest`, and `ubuntu-latest`.
  Windows 10 is best-effort, following upstream Codex support.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Disclaimer

This project produces research data, analytical frameworks, scenario probabilities, and decision checkpoints only.
It does not provide investment-action instructions. Nothing produced by this project is investment advice.
Third-party public data may be delayed, incomplete, or wrong. Users are responsible for verification, decisions,
and compliance with each data source's terms.

## Support

<p align="center">
  <a href="https://buymeacoffee.com/simonlin1212"><img src="./assets/bmc-qr.png" width="180" alt="Buy Me a Coffee"></a>
</p>

## License

This repository is licensed under the [MIT License](LICENSE). OpenAI Codex is licensed under Apache-2.0; this
repository does not contain Codex source code.

**Author:** Simon Lin · X [@linsizhen](https://x.com/linsizhen) · Email: [simonlin0423@gmail.com](mailto:simonlin0423@gmail.com)
