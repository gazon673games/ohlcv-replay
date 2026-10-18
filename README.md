# OHLCV Replay Workspace

The strategy editor supports Python SDK strategies and legacy JavaScript. Shipped
examples and the initial editor template use the shared `strategy-sdk` catalog.
The backend supplies a pinned wheel; desktop builds include it automatically.

An optional external SDK strategy directory is configured with
`strategies.sdk_catalog_path` in the process settings or `WORKBENCH_SDK_CATALOG_PATH`.
Its entries appear automatically in the strategy selector and refresh every ten seconds.
Algorithms and helper modules are pinned in a source snapshot for each run. See
[catalog setup and strategy authoring](docs/strategy_catalog.md).

Codex can operate the running application's shared job queue through the local
[research MCP](docs/mcp_research.md). Use the generic
[robustness protocol](docs/strategy_robustness_protocol.md) to freeze hypotheses
and compare native backtests. Recorded crypto return controls and investigations
are indexed in [research documentation](docs/research/README.md).

This directory is the application workspace. The desktop and browser UI live in `ui/`; domain
modules keep independent Git histories in sibling directories.

```text
ohlcv-replay/
|-- ui/                         Electron shell and Workbench web application
|-- settings/                   shared process and desktop defaults
|-- build/                      generated PyInstaller intermediates
|-- dist/                       generated Windows application and installer
|-- backtest_engine/            strategy, execution, accounting, research backend
|-- continuous_futures_builder/ continuous futures construction module
|-- data_store/                 market data storage module
`-- moex_iss_adapter/           MOEX transport adapter module
```

## Clone the workspace

```shell
git clone --recurse-submodules https://github.com/gazon673games/ohlcv-replay.git
cd ohlcv-replay
```

The four domain modules are pinned Git submodules with independent histories.
For an existing checkout, run `git submodule update --init --recursive`.
The optional external strategy catalog is maintained in the separate
[strategy-sdk repository](https://github.com/gazon673games/strategy-sdk).
The backend already includes its pinned SDK wheel.

Commit subjects use short imperative English sentences, start with a capital
letter, and stay within 72 characters. Omit prefixes such as `feat:` or `fix:`;
use a body when it adds useful context. The
[history map](docs/commit-history-map.csv) links original audit references to
the normalized commit hashes.

## Run the UI

```powershell
cd ui
npm install
npm start
```

The UI starts the adjacent `backtest_engine` backend automatically. Build the autonomous Windows
application with `npm run dist`; artifacts are written to `dist/` in this workspace.

Edit process defaults in `settings/workbench.json`. Strategy parameters remain in strategy source
and experiment manifests so individual runs stay reproducible.

For PyCharm, open this workspace root and run the shared `Workbench UI` configuration. Workspace
development conventions and verification commands are documented in `AGENTS.md`.

## Windows and portfolios

Workbench panels are independent windows inside the application. Drag their title
bars, resize the lower-right corner, minimize to the bottom window bar or maximize
with the square button. **Tile** and **Cascade** arrange visible windows. Panel
positions, sizes and visibility survive reloads; editor drafts survive minimizing.
**+ Chart** opens an independent chart from the local dataset library.

**Portfolio** selects multiple datasets, SDK strategies, per-instrument parameters,
budgets and exposure limits. Set the shared capital, currency, account leverage,
UTC date range and capital policy, then save and run the preset. The result shows
native ledger equity, drawdown, instrument contributions and confirmed fills,
with a separate price chart for each instrument. Portfolio runs use the same queue,
cancellation, history and comparison API as single-instrument runs.

Import/export accepts a portfolio preset JSON or the native multi-instrument CLI
configuration. Normal runs require approved catalog inputs. Simplified historical
data require the explicit diagnostic checkbox, which is recorded with the run.
SDK sources and input hashes are frozen before queueing; changed inputs reject
execution. Chart candle aggregation affects presentation only and is labeled.
The preset folder is `data/workbench/portfolios/` and remains local runtime data.
