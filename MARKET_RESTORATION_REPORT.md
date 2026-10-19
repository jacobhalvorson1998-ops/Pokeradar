# Market price restoration

Implementation branch: `feature/restore-market-prices`.
Live site: https://jacobhalvorson1998-ops.github.io/Pokeradar/

## What changed

Removed the NM/LP browsing selector, price overlays, condition-specific recommendations and condition-model evaluation. Normal cards, price filters, set completion estimates and research details use verified aggregate **Market Price**, with TickerMint / TCGplayer attribution and observed date. This is a printing-level estimate, not an executable or condition-specific resale price. Inspected condition remains in collection records and manual Vendor comps.

The previous UI suppressed saved aggregate prices because no authorized NM/LP feed existed. The raw records were still present. Restored prices require exact English card, product, printing and edition verification; a missing recommendation never hides a valid market quote. Ambiguous matches remain unavailable.

## Failed updater and recovery

Run `39322488425` successfully collected raw progress but failed during analysis/build/publication:

- Backtest used `Math.min(...largeArray)` on growing trade arrays. Large argument lists overflow V8's call stack. Replaced wide spreads with reductions and verified 300,000 holds, including the last failing observation.
- Builder treated provider card IDs as filesystem-safe strings. Real Unown IDs `exu-!` and `exu-%3F` broke its whitelist. `detailId` now maps punctuation-bearing identities to reserved SHA-256 filenames. Card IDs, printing keys and ownership remain unchanged. Mobile checks fetch both actual histories.
- Backtest writes reports atomically. A failed evaluation cannot overwrite good raw prices or publish partial output. The progress helper retains raw checkpoints on recoverable branches/artifacts; an integration test forces an evaluation failure and verifies main's prices remain intact.

Reviewed checkpoint `2185a4a2a` on `pokeradar-progress-39322488425`, based directly on main `0ed56ed74`. No main quote was newer than its corresponding checkpoint quote; no pre-existing product/printing pair changed. Recovery added 1,887 verified records, accepted 1,650 newer quote records and retained 4,160 current equal/newer records. Histories are unioned by date for the same product/printing; current observations win ties. Rejected checkpoint records do not replace existing records. Derived website files are rebuilt from current code. See `data/recovery-39322488425.json`.

Initial rebuilt snapshot: 27,752 printing records / 21,256 base cards; 10,516 fresh verified prices; 10,402 history-ready records; 9,230 with suitable peers. Counts can change after the next real provider refresh. Full archives stay in the Actions cache and local ignored cache; public detail files carry 120 observations.

## Research model

Weights are value/history/peers 35%, stabilization/downside 25%, supported set trend 15%, vintage significance/collector popularity 15%, verified liquidity 10%. Missing liquidity contributes zero. Exact-history discounts can support cards with scarce peers. Buying categories still require usable history, meaningful value, stabilization and sufficient set coverage; age alone cannot qualify a card. Saved vintage preferences affect ordering within categories, separately from evidence and confidence.

Declared provisional bands are 70 Buy Candidate / 80 Strong Opportunity. The 75-point band is sensitivity research only. The replay uses pre-decision observations, chronological split, mature training outcomes and nonoverlapping 30-day holds. Held-out results did not tune the bands. Initial snapshot: 16 Strong Opportunities, 87 Buy Candidates. No target count was imposed.

Local archive replay: February 8, 2024–October 19, 2026; split November 8, 2025. At 70: 122 mature training holds, 73 held-out holds across 53 cards, 86.30% positive market change, median +5.98%, worst −17.12%, worst drawdown −19.26%. At 80: 23 training / 13 held-out holds, too few to validate that band. These results are limited, retrospective aggregate market research; they exclude fees, tax, shipping, slippage and condition differences. They do not establish investment accuracy, liquidity or profit. GitHub restores its full archive and regenerates the report; the live evaluation is authoritative for its own snapshot.

## Coverage, vintage and Vendor safeguards

Missing coverage includes unresolved product searches, insufficient exact edition bindings, rejected name/set/number matches and matched products without usable history/quotes. Existing batch CSV updates, product-deduplicated histories, shared rate gates, retries, cooldowns and checkpoints remain. Discovery and history queues prioritize vintage holos/important older cards, special/reverse printings, explicitly imported tracked/wanted keys, modern chases, then ordinary cards. No browser collection data is automatically uploaded.

Base Set Charizard remains separated: Unlimited `42382 / Holofoil`, First Edition `106999 / 1st Edition Holofoil`, Shadowless `106999 / Unlimited Holofoil`. The additional 1999–2000 copyright printing remains unavailable without a verified binding. Original Base Set has no invented reverse holos. Vintage identity audit quarantines mismatches rather than increasing coverage with wrong prices.

Vendor displays aggregate Market Price as a research reference only. It never fills a condition-specific comp or verifies an offer automatically. Inspected condition, manual comp/date/source, exact-printing confirmation, fees, desired profit, reserves, 80/70/62.5/55% bands, saved offline manual comps, cash/trade lots and backups remain. No paid provider, external account, subscription or commercial arrangement was enabled. Scrydex/JustTCG coverage and commercial rights still require authorized documentation/access before any integration; see `PROVIDER_RESEARCH.md`.

## Validation status

Local: 84 Node tests passed; builder and generated-data verifier passed. Mobile Chromium passed collection/backup/preferences/stale/offline workflows (4× CPU, 80 ms network latency, 8 Mbps: 3.83 s first cards / 0.67 s cached), Vendor/offline workflows and aggregate/edition/Unown browsing. Rendering 100 cards took 0.277 s. Summary gzip is approximately 1.08 MB; artwork and histories remain lazy.

Native WebKit, fresh updater completion, deployment and real public HTTPS verification are checked in GitHub Actions before the final report is completed.
