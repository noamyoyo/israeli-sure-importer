# Fixes & Change Log

Reverse-chronological log of importer changes. **Append a row as the final step of any change**,
right after it's verified — so the next session (or the next you) can see what's shipped and,
crucially, what's sitting **uncommitted** in the working tree and why.

This file exists because working-tree changes here have gone uncommitted for weeks before now
(the `importPending` / API-timeout / installment-date fixes were found stranded on 2026-09-08).
If you leave something uncommitted deliberately, say so here with the reason.

Deploy = local `docker build -t israeli-importer:latest .` → redeploy Portainer stack **155** via
the API round-trip (see `noam-kb:infra-portainer`, "Rebuilding a local (non-registry) image").
The operational bits (`config.json`, `rules/`, `transfers/`, `secrets/`, compose) live one level
up in `~/Projects/docker/SureFinance/` and are **not** in this git repo — note changes to them
here too.

| Date | Commit | Area | Summary |
|------|--------|------|---------|
| 2026-09-08 | `0fefe0a` | pipeline | **Raw scrape archive + per-run manifest (opt-in).** First step of the budget dashboard's Sure-free migration (`~/Projects/budget/docs/plans/2026-09-07-sure-free-redesign.md`). New `src/raw-archive.ts`: `archiveScrape()` writes each target's verbatim `scrapeResult.accounts` (balance + txns, pre-transform/dedup) to `$RAW_ARCHIVE_DIR/<YYYY-MM-DD>/<target>.json`; `writeManifest()` writes `<date>/manifest.json` (per-target ok/error/seconds/scraped/balances). Both **no-op unless `RAW_ARCHIVE_DIR` is set**, never throw — parallel output, not on the Sure path. `src/index.ts`: `archiveScrape()` after a good `scrapeResult` (incl. dry runs — read-only); `TargetStats` gains optional `seconds`/`balances`/`errorMsg`; `writeManifest()` after the target loop. `tsc --noEmit` clean. **Deploy status when written: built + dry-run tested locally, NOT yet in the live image** — the redeploy sets `RAW_ARCHIVE_DIR=/app/logs/raw` + adds nothing else. |
| 2026-09-08 | `2b91922` | dedup / dates | **Pre-existing working-tree fixes committed as one set** (Noam's, from earlier debugging — found uncommitted 2026-09-08). (1) `config.ts`: `importPending?: boolean` per-target override + AJV schema entry — Beinleumi's pending txns get a fallback sourceId then re-import under an identifier-based one once settled = permanent duplicate; `importPending: false` per target stops it. (2) `sure-client.ts`: Sure API timeout 30s→120s (`SURE_API_TIMEOUT_MS`) — Ha-Benleumi's dedup fetch runs ~31s and was failing the whole run; plus `Source ID:` notes parse anchored to `\nSource bank:` instead of end-of-line (raw bank descriptions can contain embedded newlines, which truncated the sourceId and silently broke dedup). (3) `transformer.ts`: recurring Max loan installments report `tx.date` as the loan origination date → every monthly installment landed dated to loan-open, invisible to "balance since X" queries (caused two Max-8345/Max-3727 balance corrections); use `tx.processedDate` for installment rows only. |
| ~2026-09 | `3c52652` | max | **fix(max): import recurring loan installments with correct charge date.** (Superseded/extended by the `transformer.ts` part of `2b91922`.) |
| ~2026-09 | `d220181` | beinleumi | **fix(beinleumi): parse negative balance, fix reconcile ordering, add observability.** Negative Ha-Benleumi balance (overdraft) was mis-parsed; reconcile/valuation POST now runs before the `newCount===0` early-exit so a stale balance isn't left in Sure when everything deduped; per-account `balance=… | reconcile=…` log line added.  |

> Earlier history predates this log — see `git log` and `RELEASE_NOTES.md`. The
> `noam-kb:sure-finance` skill's `references/importer.md` documents the older fixed bugs
> (sourceId dedup protocol, the three original bugs) and the redeploy recipe.
