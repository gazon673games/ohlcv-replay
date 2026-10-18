# Workbench UI

This module owns the Electron shell and browser application. It does not contain exchange or
backtest rules; those remain in sibling backend modules.

```text
ui/
|-- web/                 HTML, CSS, Monaco integration, charts, and UI controllers
|-- main.js              Electron lifecycle and backend process management
|-- settings.js          shared workspace settings loader
|-- backend_entry.py     PyInstaller entry into ../backtest_engine
|-- build-backend.js     frozen backend assembly with embedded web assets
`-- smoke.js             hidden-window layout and chart smoke test
```

Development commands:

```powershell
npm install
npm start
npm run smoke
npm run dist
```

In development, backend launch prefers `WORKBENCH_UV_COMMAND`, then `uv` from the inherited
`PATH`. If an IDE does not expose `uv`, the launcher falls back to the checked project environment
at `backtest_engine/.venv`. Run `uv sync` in `backtest_engine` if neither backend command exists.

Desktop and smoke startup check `/api/health`, which does not scan saved run history.
Startup failures are written to stderr and the desktop log, shown in a dialog, and exit with code 1.

`npm run dist` reads Python from `../backtest_engine`, settings from `../settings`, writes temporary
files to `../build`, and places the autonomous Windows application in `../dist`.

The main screen keeps market price and strategy equity in a synchronized central chart. Data and
strategy controls share a resizable right panel; Overview, Trades, Decisions, Diagnostics, Research,
and Runs occupy a resizable dock below the chart. Panel visibility, active tabs, and sizes survive
reloads. Focus chart temporarily hides both panels and restores the previous arrangement. The run
and cancel actions and the current status remain visible while switching panels.

Trade search and direction filters operate on the report's complete trade list. Click a trade to
show its entry and exit on the chart; unavailable candles produce an explicit message. History
checkboxes populate the existing comparison API, and clicking a completed run opens its report.
Opening a report preserves next-run capital and displays the run's frozen settings in Overview.

Every floating window can be resized from any of its four corners. Ctrl+mouse wheel over the
workspace zooms all windows around the pointer, from 25% to 200%. The percentage button in the
bottom taskbar resets the view to 100%. Workspace zoom survives reloads; dragging and resizing
continue to use the correct coordinates at any zoom. Windows can be moved and resized anywhere
on the workspace, including beyond the original screen in all directions. Drag with the middle
mouse button to pan. Clicking an off-screen window in the taskbar brings it into view without
changing its saved position. Tile and Cascade arrange windows in the current visible area.

Ctrl+Enter runs the strategy; Alt+1/2 opens data/strategy, Alt+3 opens trades, and Alt+Enter toggles
chart focus. Esc restores a focused workspace and closes menus. With the chart focused, +/− zoom,
left/right arrows pan, and Home fits the full period. These actions also appear beside the chart
and in its context menu. Workspace shortcuts other than Ctrl+Enter leave text editing alone.

Dataset previews are requested in bounded chunks. Display-only indicator and compatible timeframe
reloads preserve the chart range, report, equity, and execution markers. A timeframe that requires
another source asks the user to load that chart. Strategy inputs and quality gates remain separate.
See [UX audit and interaction specification](../docs/ui_ux_redesign.md) for rationale and scenarios.

`npm run test:chart-data` covers UI contracts and causal trade-to-candle mapping. For browser scenario
coverage, set `WORKBENCH_SMOKE_UX=1` and run `npm run smoke`; the fixture covers panel persistence,
trade navigation, comparison, duplicate submission prevention, cancellation, and rerun behavior.

Settings → Theme includes Light, Dark, and Grimdark. Grimdark uses all 20 supplied Army Painter
colors across panels, controls, statuses, chart series, and the Monaco editor: charcoal surfaces,
Ivory White text, and Moonbeam Yellow accents. The choice survives reloads. Indicator colors are
saved separately for each theme; existing custom Light/Dark colors are preserved when switching.

The default data flow intentionally exposes only `adapter -> instrument type -> instrument -> dates
-> timeframe -> load`. Selecting an instrument immediately fills the dates of saved history.
Adapters with historical availability support check the maximum range in the background and fill it
automatically until the dates are edited or loading starts. A slow or failed availability check does
not block a saved chart. Selecting a pair prepares the screen; **Load chart** opens it on demand.
The button reuses compatible saved candles, including a finer source for a coarser chart, without
compiling the strategy or checking dataset approval. Explicit network cache policies still force a
refresh. Rejected datasets remain viewable, while their backtests and sweeps stay blocked.
Market, board, continuous-contract mode, cache policy, and roll rule are adapter-owned defaults.

The chart timeframe is display-only. A strategy declares its own timeframe, one or more decision
times, history window, input columns, and contract count in `STRATEGY_METADATA` and JavaScript. Chart
SMA, EMA, Bollinger Bands, volume, and inflation overlays are calculated separately and never become
strategy inputs. The inflation setting also draws a purchasing-power benchmark beside strategy
equity, based on the configured initial capital. Long ranges use one fixed overview chosen at load
time; zooming changes only the viewport and never replaces the candles or requests a denser series.
The fixed load keeps up to 32,000 points, so medium ranges remain exact and long-range SMA/EMA
series retain enough samples to avoid visual aliasing.
The chart status reports both the source timeframe and fixed overview stride. Backtests publish
bounded live equity and decision samples while the full reproducible artifacts are built.
Executed-action markers use the actual fill timestamp and filled contract delta. On a fixed
overview they attach to the containing candle and are never shifted to a future candle.
Preview date inputs are interpreted in the stored dataset timestamp timezone, including UTC for
timezone-aware candles; explicit offsets are converted before filtering and indicator warmup.
Naive market timestamps are treated as exchange-local wall time; the browser timezone must not
shift a MOEX `11:30` decision to `08:30` on the chart. The action report separates decision and
fill timestamps and explains the strategy reason, signal features, position transition, fill price,
and trade result. Running a strategy reuses the dataset already displayed and preserves the visible
chart range. A data refresh happens only when no compatible loaded dataset covers the requested
instrument, source timeframe, and dates, or when the user explicitly reloads market data.

Language, theme, and chart-indicator controls are stored in a long-lived Workbench cookie so they
survive reloads and backend port changes. Legacy per-origin locale and theme values are migrated
automatically when the application next starts.

The adapter capability panel distinguishes delayed, subscription realtime, and enabled realtime
feeds. MOEX ISS is currently exposed as a delayed source: MOEX offers realtime data commercially,
but this adapter does not yet contain authenticated subscription transport.
