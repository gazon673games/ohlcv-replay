# Application settings

`workbench.json` contains process and desktop-shell settings shared by the Python backend and
Electron. Strategy parameters and experiment configs do not belong here; they stay with each run
so its manifest remains reproducible.

Environment variables take precedence for machine-specific overrides:

- `WORKBENCH_SETTINGS_PATH`: another settings JSON file.
- `WORKBENCH_HOST`, `WORKBENCH_PORT`: bind address and fixed port.
- `WORKBENCH_DATA_ROOT`: runtime data location.
- `WORKBENCH_MAX_JOBS`: maximum isolated workers.

Packaged Electron keeps mutable datasets and runs under its user-data directory. The bundled JSON
provides defaults and is not modified at runtime.

The `proxy` section provides the initial Workbench proxy configuration. The settings menu can
enable the proxy for selected adapters or for all adapters. An address without a scheme, such as
the default `localhost:10808`, is treated as `http://localhost:10808`. Runtime changes are stored
as `proxy-settings.json` beside the Workbench `runs/` directory, under the ignored data root, so
machine-specific proxy choices are not committed.
