# scripts

Repository tools that do not run on the phone.

- `espn-capture/` captures live Iowa State college basketball games from ESPN on a schedule (`ESPN live capture` workflow) and commits trimmed polls and `REPORT.md` under `tests/leagues/<adapter>/captures/<event>/`, at most 2 games per adapter.
- `team-catalog/` builds and validates the committed team catalog (`catalog/`), probes ESPN and statsapi for it, and runs the live capture (`Team catalog` workflow). See its README.
- `stream-pipeline/` is the catalog-driven pipeline for one team's game: a read-only `extract` job and a browser-free `publish` job in the `Stream pipeline` workflow, writing `streams/<league>/<espnId>.json`. The Worker starts it for a Get video press. See its README.
- `iphone-harness/` is the Windows USB diagnostic harness for the family iPhone's SideStore signing chain (status, SideStore refresh history and real expiry, live log watch during a charger plug-in, screenshots, launch tests). Its `out/` folder is git-ignored because pulled device logs carry the Apple Account e-mail. See its README and `FINDINGS-2026-10-09.md`.
