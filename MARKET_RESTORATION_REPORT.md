# Market price restoration

Implementation branch: `feature/restore-market-prices`.
Live site: https://jacobhalvorson1998-ops.github.io/Pokeradar/

Current validated snapshot: **11,595 fresh verified market prices**, plus 110 clearly marked stale quotes; 27,862 printing records / 21,256 base cards. The NM/LP selector is gone. There are 17 Strong Opportunities and 112 Buy Candidates, with no demonstrated backtest advantage over the broad benchmark. Collection, Vendor, offline caches, custom price limits and 20/50/100-card views remain available.

## What changed

Removed the NM/LP browsing selector, price overlays, condition-specific recommendations and condition-model evaluation. Normal cards, price filters, set completion estimates and research details use verified aggregate **Market Price**, with TickerMint / TCGplayer attribution and observed date. This is a printing-level estimate, not an executable or condition-specific resale price. Inspected condition remains in collection records and manual Vendor comps.

The previous UI suppressed saved aggregate prices because no authorized NM/LP feed existed. The raw records were still present. Restored prices require exact English card, product, printing and edition verification; a missing recommendation never hides a valid market quote. Ambiguous matches remain unavailable.

## Failed updater and recovery

Run `39322488425` successfully collected raw progress but failed during analysis/build/publication:

- Backtest used `Math.min(...largeArray)` on growing trade arrays. Large argument lists overflow V8's call stack. Replaced wide spreads with reductions and verified 300,000 holds, including the last failing observation.
- Builder treated provider card IDs as filesystem-safe strings. Real Unown IDs `exu-!` and `exu-%3F` broke its whitelist. `detailId` now maps punctuation-bearing identities to reserved SHA-256 filenames. Card IDs, printing keys and ownership remain unchanged. Mobile checks fetch both actual histories.
- Backtest now streams held-out dates without retaining all card snapshots; a full local-archive replay produced identical results before and after the change. Sorted historical references now use binary lookup instead of repeated scans; another complete local replay matched every result. The daily workflow checkpoints raw progress and performs analysis/build/verification once against latest main, with 45 minutes of job headroom and the same 25-minute provider budget.
- Backtest writes reports atomically. A failed evaluation cannot overwrite good raw prices or publish partial output. The progress helper retains raw checkpoints on recoverable branches/artifacts; an integration test forces an evaluation failure and verifies main's prices remain intact.

Reviewed checkpoint `2185a4a2a` on `pokeradar-progress-39322488425`, based directly on main `0ed56ed74`. No main quote was newer than its corresponding checkpoint quote; no pre-existing product/printing pair changed. Recovery added 1,887 verified records, accepted 1,650 newer quote records and retained 4,160 current equal/newer records. Histories are unioned by date for the same product/printing; current observations win ties. Rejected checkpoint records do not replace existing records. Derived website files are rebuilt from current code. See `data/recovery-39322488425.json`.

Initial rebuilt snapshot: 27,752 printing records / 21,256 base cards; 10,516 fresh verified prices; 10,402 history-ready records; 9,230 with suitable peers. Counts can change after the next real provider refresh. Full archives stay in the Actions cache and local ignored cache; public detail files carry 120 observations.

## Research model

Weights are value/history/peers 35%, stabilization/downside 25%, supported set trend 15%, vintage significance/collector popularity 15%, verified liquidity 10%. Missing liquidity contributes zero. Exact-history discounts can support cards with scarce peers. Buying categories still require usable history, meaningful value, stabilization and sufficient set coverage; age alone cannot qualify a card. Saved vintage preferences affect ordering within categories, separately from evidence and confidence.

Declared provisional bands are 70 Buy Candidate / 80 Strong Opportunity. The 75-point band is sensitivity research only. The replay uses pre-decision observations, chronological split, mature training outcomes and nonoverlapping 30-day holds. Held-out results did not tune the bands. Initial snapshot: 16 Strong Opportunities, 87 Buy Candidates. No target count was imposed.

The larger production archive is more informative than the small local archive. The final full-archive evaluation covers 2024-02-08–2026-10-19, with a chronological split at 2025-11-08:

| Screen | Mature training holds | Held-out holds | Positive 30-day change | Median change | Worst change |
| --- | ---: | ---: | ---: | ---: | ---: |
| Candidate and Strong (70+) | 6,315 | 3,398 | 54.47% | +1.79% | −98.52% |
| Strong (80+) | 567 | 356 | 53.09% | +0.91% | −91.45% |
| Broad eligible-card benchmark | — | 92,202 | 57.76% | +1.98% | −98.18% |

The candidate screen did not demonstrate an advantage over that benchmark. Extreme provider-price moves distort averages; no sales, executable prices or causes of those moves are established here. Failed outcomes are retained rather than filtered out to improve results.

These are retrospective aggregate market estimates before fees, tax, shipping, slippage and condition differences. The app explicitly states that no advantage has been established. Declared bands were evaluated unchanged; held-out results did not tune them. The smaller local replay had only 73 candidate and 13 Strong held-out examples and is not used to claim predictive accuracy. The current live evaluation is authoritative for its snapshot and archive.

## Coverage, vintage and Vendor safeguards

Main remaining price gaps: 4,504 unresolved products, 11,592 matched products without a usable exact quote, and 61 identity/printing reviews. Another 110 old quotes remain visible with a stale label; 117 fresh quotes lack enough usable history for ranking. Missing peers no longer hide a valid price. These are genuine source/coverage gaps rather than a condition-price requirement. Existing batch CSV updates, product-deduplicated histories, shared rate gates, retries, cooldowns and checkpoints remain. Discovery and history queues prioritize vintage holos/important older cards, special/reverse printings, explicitly imported tracked/wanted keys, modern chases, then ordinary cards. When an exact batch quote has extended a complete history in the current run, the full history endpoint is deferred until the periodic seven-day recheck. Missing prices, stale/incomplete histories, identity changes and failed batch quotes still refresh. This prevents repeated downloads of already-covered vintage cards from consuming requests needed for lower-priority coverage. No browser collection data is automatically uploaded.

Base Set Charizard remains separated: Unlimited `42382 / Holofoil`, First Edition `106999 / 1st Edition Holofoil`, Shadowless `106999 / Unlimited Holofoil`. The additional 1999–2000 copyright printing remains unavailable without a verified binding. Original Base Set has no invented reverse holos. Vintage identity audit quarantines mismatches rather than increasing coverage with wrong prices.

Vendor displays aggregate Market Price as a research reference only. It never fills a condition-specific comp or verifies an offer automatically. Inspected condition, manual comp/date/source, exact-printing confirmation, fees, desired profit, reserves, 80/70/62.5/55% bands, saved offline manual comps, cash/trade lots and backups remain. No paid provider, external account, subscription or commercial arrangement was enabled. Scrydex/JustTCG coverage and commercial rights still require authorized documentation/access before any integration; see `PROVIDER_RESEARCH.md`.

## Validation status

Local: 86 Node tests passed; builder and generated-data verifier passed. Mobile Chromium passed collection/backup/preferences/stale/offline workflows (4× CPU, 80 ms network latency, 8 Mbps: 3.83 s first cards / 0.67 s cached), Vendor/offline workflows and aggregate/edition/Unown browsing. Rendering 100 cards took 0.277 s. Summary gzip is approximately 1.08 MB; artwork and histories remain lazy.

Native Chromium and WebKit passed on implementation commit `d60f06d2b`: [validation 39340794416](https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39340794416). The streaming backtest commit `866defe41` also passed [native browser validation 39344338476](https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39344338476).

[First restored publication 39343482697](https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39343482697) succeeded, including mobile Chromium/WebKit and both engines against the actual HTTPS Pages website. Independent HTTPS checks confirmed `aggregate-opportunity-v1`, no condition selector/data columns, 10,516 fresh prices, separate Charizard editions and both punctuation-bearing Unown history URLs. [Publication 39344511471](https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39344511471) also passed the browser and public HTTPS checks with the explicit full-archive limitation and offline shell v12.

The original in-flight refresh `39343482735` passed collection, evaluation, build and save, writing commit `dd8616ff1` with 11,595 fresh verified prices, 11,478 history-ready records, 27,862 total printing records, 17 Strong Opportunities and 112 Buy Candidates. Its overall conclusion was cancelled because it exceeded the older 35-minute job limit; the saved data commit and history checkpoint were retained. The corrected workflow removes the duplicate evaluation and allows 45 minutes while keeping the normal provider budget at 25 minutes.

The corrected [updater verification 39347477551](https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39347477551) **completed successfully**. Its real five-minute provider pass retrieved 5,861 fresh verified printing quotes; its single analysis/build/verification pass saved commit `a4a338994`. The result is partial catalog coverage, with seven provider errors retained in diagnostics; failed requests preserved saved quotes. This was a bounded verification run. Scheduled/default provider runs keep their full 25-minute limits.

Manual `quick_refresh` caps discovery/resolve work and history requests; it does not relax matching, quote/history preservation, backtesting, generated-data checks or publication browser tests. It avoids repeating a full provider pass merely to verify the workflow repair. The successful updater automatically triggered [publication 39348675269](https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39348675269), which **completed successfully**. All 86 Node tests, generated-data verification, mobile Chromium/WebKit collection/Vendor/100-card checks, and both browsers against the actual HTTPS Pages site passed. Independent final HTTPS reads confirmed the latest snapshot, 11,595 fresh prices, no condition selector, v12 assets, separate Charizard editions, both Unown detail URLs, matching diagnostics and the declared research weights.

The reusable cloud-startup draft was also updated with the restored aggregate behavior, 86-test commands and current workflow guidance. It is available for review in the cloud environment setup UI.
