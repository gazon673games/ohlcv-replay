"""Catalog modules load dynamically and retain source files for revision hashes."""

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

hiddenimports = collect_submodules("strategy_sdk")
datas = collect_data_files("strategy_sdk", include_py_files=True)
