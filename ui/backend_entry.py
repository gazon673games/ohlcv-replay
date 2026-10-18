from __future__ import annotations

import argparse
import multiprocessing
import os
from pathlib import Path

from backtest_engine.workbench.server import serve_workbench
from backtest_engine.workbench.settings import load_workbench_settings, runs_root
from backtest_engine.workbench.worker import main as worker_main


def main() -> int:
    multiprocessing.freeze_support()
    parser = argparse.ArgumentParser(description="OHLCV Replay Workbench backend")
    parser.add_argument("--settings", type=Path)
    parser.add_argument("--host")
    parser.add_argument("--port", type=int)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--worker", type=Path)
    args = parser.parse_args()
    if args.settings is not None:
        os.environ["WORKBENCH_SETTINGS_PATH"] = str(args.settings.absolute())
    if args.worker is not None:
        return worker_main([str(args.worker)])
    settings = load_workbench_settings(args.settings)
    os.environ.setdefault("WORKBENCH_MAX_JOBS", str(settings.jobs.max_concurrency))
    serve_workbench(
        host=args.host or settings.server.host,
        port=args.port or settings.server.port,
        output_root=args.output_root or runs_root(settings),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
