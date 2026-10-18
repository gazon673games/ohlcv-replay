# Desktop dependency audit, 2026-10-08

`npm audit fix` updated compatible packages within the existing declared ranges,
including Electron 43.7.9 and electron-builder 26.17.0. The lockfile is versioned.
The initial audit reported 26 high and 7 moderate findings. The final
`npm audit --audit-level=high` passes with zero high findings and 8 moderate
dependency-chain findings rooted in `sprintf-js`, through the build downloader's
logging dependencies. The current audit reports no compatible fix for that chain.

No forced major upgrade/downgrade was applied. Verification covers the Node UI
tests, Electron smoke test, installer build and actual packaged application launch.
Packaged native spot/perpetual SOL regressions and research process pools are
also checked against recorded prices and independent golden balances.

Repeat the audit from `ui/`. Store detailed generated reports under ignored
`.scratch/logs/`, rather than adding scanner output to source directories.
