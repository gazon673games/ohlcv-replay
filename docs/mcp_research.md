# Workbench research through MCP

MCP connects Codex to the running local Workbench API. Desktop, CLI and MCP share
the same job queue, cancellation, strategy snapshots, execution and ledger. A
separate LLM service or OpenAI API key is not needed.

## Start and connect

Start Workbench normally (`npm start` from `ui/`). Install the backend environment
with `uv sync --locked` from `backtest_engine/`. The MCP stdio entry point is:

```powershell
uv run backtest-mcp --url http://127.0.0.1:8765
```

This process communicates through stdio and does not start another HTTP server.
Use the URL of the running application if its port differs. `WORKBENCH_URL` is an
alternative to `--url`; otherwise the configured server port is used. Only local
HTTP origins are accepted, and local calls bypass HTTP proxy environment settings.

Copy [the configuration example](../settings/codex-mcp.example.toml) to the
project's `.codex/config.toml`, replacing the absolute backend path. This local
file is ignored by Git. Reload the Codex session after changing its MCP setup.
Codex reads project MCP settings for trusted projects; see the
[official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Tools and workflow

| Tool | Purpose |
|---|---|
| `list_datasets` | Approved dataset IDs, venue, dates and timeframe; paged |
| `list_strategies` | Saved presets and configured shared SDK catalog |
| `get_strategy_contract` | Parameters, bounds, scheduling and history requirements |
| `submit_backtest` | Queue one native backtest |
| `prepare_experiment` | Freeze requests, SDK dependencies, inputs and runtime identity |
| `submit_robustness` | Queue a prepared plan; verified resume is supported |
| `get_job` / `cancel_job` | Shared progress and worker cancellation |
| `get_results` | Native metrics or paged experiment results and family diagnostics |
| `get_artifact` | Selected rows/columns of ledger, trades and statistical tables |

First inspect catalogs and the parameter contract. Supply `dataset_id`,
`strategy_id`, `from_date`, `initial_capital`, `base_currency`, optional `params`
and `execution_overrides`. Capital and currency are explicit: `1000` and `USDT`
describe an initial portfolio of 1000 USDT. Unknown fields and overrides that
replace catalog binding, source, capital or quality gates are rejected.

For robustness, prepare the complete plan before submitting it. Example protocol
for a strategy whose contract exposes `example_parameter`:

```json
{
  "name": "SMA neighborhood and execution costs",
  "split_date": "2024-01-01",
  "workers": 2,
  "max_runs": 20,
  "cases": [
    {"name": "baseline", "group": "neighbors"},
    {"name": "slippage", "group": "cost", "request_overrides": {"slippage_bps": 5}}
  ],
  "grids": [{"name": "example", "group": "neighbors", "params": {"example_parameter": [1, 2]}}],
  "family_groups": ["neighbors"],
  "fresh_selected_group": "neighbors"
}
```

The example is a protocol shape, not a validated trading hypothesis. Choose a
split inside the approved dataset and parameter values allowed by the strategy.
The plan allows up to four case workers and 500 total runs, including an optional
fresh selected run. Queue concurrency is controlled independently by Workbench.
Crypto commission stress requires explicit approved historical instrument rules;
the generic `commission_bps` field does not replace maker/taker fees.

`prepare_experiment` returns an `experiment_id` and fingerprint without trading.
Submit that ID, poll `get_job`, and read `get_results(kind="robustness")`. Changes
to prepared manifests, runtime or pinned inputs fail closed. Changing a live
strategy after preparation does not replace its frozen source. Resume verifies
completed native outputs; failed cases and inactive strategies remain in reports.

Results live beside the Workbench runs directory under
`research/protocols/<experiment_id>/`. Each case retains ordinary native artifacts
under `runs/<case>/`; common progress, requests and logs use existing job storage.
For a ledger page, request `get_artifact` with `name="portfolio_ledger"`, selected
`columns`, `offset`, `limit` and, for experiments, `case_name`. Limits are 100 rows
and 20 columns; JSON above 64 KiB returns a file reference. Nonfinite statistical
values are represented as strings so tool JSON remains valid.

## CLI and verification

The CLI uses the same HTTP services. The original standalone protocol runner
remains useful for offline execution and analysis of archived native outputs.

```powershell
uv run backtest robustness-prepare --config tools/robustness_example.json --experiment-id cy_check
uv run backtest robustness-submit cy_check
uv run backtest robustness-status cy_check
uv run backtest robustness-submit cy_check --resume
```

Both CLI and MCP default to the configured local port and accept `--url` or
`WORKBENCH_URL`. CLI output paths from the protocol are allocated by the server;
relative input paths are resolved before the request is sent.

Offline integration tests start a real HTTP server and real stdio MCP client.
Recorded Binance SOL prices drive spot and perpetual golden balances through
the complete MCP → API → queued worker → execution → ledger path. Tests also
cover prepared-source immutability, resume, paged ledger reads, visible case
failures, strict gates and equivalent CLI execution.

MCP optimizes discovery, orchestration and result reading. New reusable strategies
still belong in the configured shared SDK, and shared source edits retain its
existing revision checks, backups and explicit publication workflow.
