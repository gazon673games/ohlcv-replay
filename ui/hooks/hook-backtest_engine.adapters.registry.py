"""Bundle installed adapter implementations discovered dynamically at runtime."""

from PyInstaller.utils.hooks import collect_entry_point, collect_submodules

hiddenimports = collect_submodules("backtest_engine.adapters")
datas, entry_imports = collect_entry_point("backtest_engine.market_adapters")
hiddenimports.extend(entry_imports)
