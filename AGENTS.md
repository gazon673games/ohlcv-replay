# OHLCV Replay Workspace Guide

This file defines the shared development rules for the whole workspace. A nested
module may have its own `AGENTS.md`; the nearest file applies to work inside that
module.

## Workspace Map

- `ui/`: Electron shell, browser workbench, charts, editor, and packaging scripts.
- `settings/`: workspace-level runtime defaults.
- `backtest_engine/`: strategy runtime, execution, accounting, research, and API.
- `continuous_futures_builder/`: futures selection, rolls, and continuous series.
- `data_store/`: canonical market-data storage and validation.
- `moex_iss_adapter/`: MOEX ISS transport, snapshots, and exchange normalization.
- `data/`: local runtime data; generated and never committed.
- `build/` and `dist/`: generated application artifacts; never committed.

The workspace root and each domain module are independent Git repositories. The
root repository owns `ui/`, `settings/`, `.run/`, and workspace documentation.
Domain code must be committed in the repository that contains it.

## Architecture Rules

- New reusable trading algorithms belong in the shared `strategy-sdk` catalog,
  not in UI code, Workbench saved source, or duplicate backend strategy modules.
- Locate the catalog through `strategies.sdk_catalog_path` in process/local settings
  or `WORKBENCH_SDK_CATALOG_PATH`; do not assume physical adjacency across junctions.
  Read the SDK's `AGENTS.md` and `README.md` before authoring a strategy.
- See [catalog configuration and authoring](docs/strategy_catalog.md). Workbench
  stores `SDK_CATALOG_STRATEGY` references and presets. Preserve per-run source
  snapshots, bounded history, confirmed fills and independent execution/accounting.

- Keep the UI exchange-neutral. Exchange-specific behavior belongs in adapters.
- Expose adapters through capabilities and catalog APIs, not UI conditionals.
- Keep market-data ingestion, series construction, backtesting, and presentation
  as separate responsibilities.
- Treat approved datasets, instrument specifications, calendars, and experiment
  manifests as explicit inputs to a reproducible run.
- The portfolio ledger is the accounting source of truth. Reports consume ledger
  output rather than calculating a second version of cash or PnL.
- Strategies operate through the public runtime and order APIs. Do not bypass
  lookahead guards, quality gates, execution, or accounting layers.
- Keep Python and JavaScript source files at or below 300 physical lines. Split by
  responsibility when a modified file would exceed that limit.
- Prefer small domain objects and explicit state transitions over shared mutable
  dictionaries and mode flags.

## UI Development

Install dependencies and start the desktop workbench from `ui/`:

```powershell
cd ui
npm install
npm start
```

`npm start` prepares browser dependencies, starts Electron, and lets Electron
start the adjacent backend through `uv`. The backend serves `ui/web` and Electron
opens the resulting local URL.

Useful UI commands:

```powershell
cd ui
npm run smoke
npm audit --audit-level=high
npm run dist
```

The installer and unpacked application are written to the root `dist/` directory.
Do not edit generated files in `ui/web/vendor/`, `build/`, or `dist/`.

The shared PyCharm run configuration is `.run/Workbench UI.run.xml`. Open the
workspace root in PyCharm, select `Workbench UI`, and run it. PyCharm needs a Node
interpreter with npm and `uv` available on its process `PATH`.

## Backend Development

Run backend checks from the backend repository:

```powershell
cd backtest_engine
uv sync
uv run ruff check .
uv run pytest -q
uv run backtest --help
```

Run module checks from the module being changed. Follow that module's local
`AGENTS.md` for its exact test and lint commands.

Tests should be deterministic and offline by default. Live MOEX calls belong in
explicit integration or snapshot-update workflows and must preserve the raw
response used to produce normalized data.

## Settings And Runtime Data

- Workspace process defaults live in `settings/workbench.json`.
- Machine-specific overrides should use environment variables or ignored local
  files, not committed absolute paths.
- Strategy source and parameters belong in saved strategies and experiment
  manifests so a result can be reproduced.
- Never commit credentials, broker tokens, private endpoints, or local datasets.

Important UI environment variables:

- `WORKBENCH_SETTINGS_PATH`: settings JSON path.
- `WORKBENCH_DATA_ROOT`: runtime data directory.
- `WORKBENCH_PORT`: fixed backend port when one is required.
- `WORKBENCH_MAX_JOBS`: backend worker limit.
- `WORKBENCH_MOEX_RAW_ROOT`: immutable MOEX candle snapshot directory.
- `WORKBENCH_UV_COMMAND`: absolute `uv.exe` path when the IDE cannot find `uv`.

## Coding Style

- Match the patterns already used by the module being changed.
- Use typed boundaries for strategy parameters, events, orders, fills, ledger
  entries, adapter capabilities, and API payloads.
- Add comments for non-obvious market rules, state transitions, and failure
  policies. Do not narrate self-explanatory assignments.
- Keep public errors actionable: identify the failed dataset, instrument, order,
  gate, or configuration field.
- Preserve backward compatibility only where the public contract requires it;
  keep compatibility adapters at boundaries rather than in domain logic.
- Do not silently repair gaps, timestamps, rolls, prices, or currencies. Record
  the policy and its audit result.

## Verification

Scale verification to the changed surface. A UI or cross-module change normally
requires:

1. Focused unit tests in every affected module.
2. `npm run smoke` for UI behavior.
3. Backend API or end-to-end coverage for changed contracts.
4. A line-count check for modified source files.
5. `git status --short` in the root and every touched nested repository.

Packaging changes also require `npm run dist` and a launch check of the packaged
application. Execution, accounting, calendar, or data-quality changes require the
relevant golden backtest fixtures and reconciliation tests.

## Git Discipline

- Use short imperative English commit subjects, starting with a capital letter
  and limited to 72 characters. Omit type prefixes such as `feat:` and `fix:`.
  Add a body only when it provides useful context.
- Inspect repository boundaries before staging files.
- Preserve unrelated user changes and generated local data.
- Stage only files that belong to the current task.
- Commit root and nested-repository changes separately.
- Report the commit hash for each repository changed.
- A task is complete only when required checks pass, no needed process is still
  running, and every touched repository has an understood status.

- Shared SDK source editing must preserve revision conflict checks, history backups,
  local-only write endpoints and pinned snapshots for queued runs. Editing a Python
  draft does not publish it; only explicit "Save common SDK file" updates the catalog.
- Use SDK catalog_sources and source_files for shared loading and safe writes. Do not
  duplicate their dependency resolution in this host or import TradeRelay modules.

## LLM Research Workflow

Use the local [research MCP](docs/mcp_research.md) or its equivalent CLI when the
Workbench API is running. Inspect approved datasets and strategy contracts, freeze
the full experiment plan, submit it to the shared queue and poll progress. Prefer
paged metrics and ledger artifacts over loading full candles into the conversation.
Preserve failed and inactive trials and the experiment fingerprint. Standalone
protocol execution remains available for offline research and archived analysis.
