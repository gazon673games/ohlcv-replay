# Local investigation artifacts

Use `.scratch/` in the repository being checked for disposable scripts, SDK
drafts, test temporary directories, trial wheels, screenshots, and debug state.
Both the workspace and backend repositories ignore this directory.

Keep reusable download, research, and fixture-update commands in backend
`tools/`. Keep deterministic tests and their small recorded inputs in
`tests/fixtures/`; these belong in Git.

Use `data/` for market datasets, exchange snapshots, saved Workbench strategies,
run inputs, and reproducible results. These files are also ignored, but they
are not disposable. Saved runs and the dataset catalog may reference absolute
paths: inspect those references before moving their inputs.

## Crypto investigation cleanup, 2026-10-08

Intermediate artifacts were collected under:

- `.scratch/crypto-research-2026-10-08/` in the workspace;
- `backtest_engine/.scratch/crypto-research-2026-10-08/` in the backend.

Each archive has a local `relocations.json` describing the original and new
paths. Historical debug manifests are retained as captured and may contain
their original paths. Active Workbench inputs and published results retain
their existing paths.

Windows denied access to 24 older pytest temporary directories in backend
`data/`. They remain covered by `/data/` in the backend `.gitignore`; their
relocation entries have status `blocked_windows_acl`. No ACL changes were made.

The full EURUSDT history and parameter-grid report remain in
`data/eurusdt-sweep/`. The SOL accumulation dataset and saved-run inputs remain
in `data/sol-monthly-check/`. The final Workbench comparison for the EURUSDT grid
also remains with its results.

Future offline checks can put temporary files in the backend scratch directory:

```powershell
cd backtest_engine
New-Item -ItemType Directory -Path .scratch/pytest -Force | Out-Null
uv run pytest -q -p no:cacheprovider --basetemp=.scratch/pytest/<unique-run-id>
```

Use a new run identifier: pytest can clear an existing `--basetemp` directory.
Never point it at datasets, saved results, or their inputs. Python bytecode and
pytest/Ruff caches are ignored separately and may be recreated by normal checks.

## Workspace organization, 2026-10-08

Crypto investigations and golden-accounting explanations are indexed in
`docs/research/README.md`. Locally supplied PDFs live under `docs/references/`
and are ignored; extracted book text and one-off scripts remain in
`.scratch/cy-book-review/`. Research-document/PDF moves are recorded in
`.scratch/project-cleanup-2026-10-08/relocations.json`.

Backend verification logs use `.scratch/logs/`. The original backend MVP guide
is archived under backend `docs/archive/`; current development guidance replaces
its daily-only restrictions. Permanent trust-control documentation and dataset
approval audits remain because they define research admission. The EURUSDT HTML
under backend `tools/` is a report template used by the renderer.

Duplicated shipped algorithms and parameter casting now delegate to the shared
SDK. Compatibility examples remain because saved strategies and tests use them.
Recorded fixtures, independent return oracles and reusable research/download tools
stay versioned; large runtime data stays local.

Local `.codex/config.toml` contains this machine's MCP paths and is ignored.
A portable example is versioned under `settings/`.
