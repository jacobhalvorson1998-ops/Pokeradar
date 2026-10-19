# Issue #2: market diagnostics, Set Market Pulse and Vendor Mode

Verified October 19, 2026 (America/Chicago). Published snapshot: `2026-10-19T19:29:56.242Z` UTC. Counts describe this snapshot and will change with daily updates.

- Live website: https://jacobhalvorson1998-ops.github.io/Pokeradar/
- Vendor: https://jacobhalvorson1998-ops.github.io/Pokeradar/#vendor
- Data health: https://jacobhalvorson1998-ops.github.io/Pokeradar/#settings
- Historical evaluation: https://jacobhalvorson1998-ops.github.io/Pokeradar/evaluation.html
- Implementation branch: `feature/issue-2-vendor-market-pulse`
- Final publication and public checks: https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39311045736
- Branch validation: https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39311481336

## Result and limits

The website now explains empty Buy results, separates lower-confidence research candidates, provides fixed-cohort set trends and supports an iPhone Vendor calculator with exact-condition manual comps, transaction lots, sales and offline data. Strict Buy rules have not been lowered. TickerMint remains the daily personal-research source. No subscription, paid request, new account, service registration or commercial data arrangement was created.

**Supplemental history and provider-fed commercial Vendor pricing remain disabled.** Official documentation was blocked by HTTP 403 locally and from a GitHub-hosted runner; no authorized Scrydex credential has been made available to this task. Repository secret metadata is inaccessible to the integration (HTTP 403), so no assumption is made about accounts or keys outside this session. Earliest Scrydex history and applicable commercial licenses were not verified. The existing data does not provide a verified condition-specific listing offer. The app therefore never substitutes TickerMint's raw-printing market average for an NM/LP/MP/HP/damaged comp. Manual-comp examples in tests verify calculator behavior, not a real $100 condition-specific card quote. See [PROVIDER_RESEARCH.md](PROVIDER_RESEARCH.md) for the source matrix, observed access failures and exact checks still needed.

## Why Buy Now is empty

The public snapshot contains 21,256 English base cards and 27,470 card/printing records. It has 7,334 fresh verified prices, 7,235 history-ready records and 6,610 records with suitable peers.

| Category | Published count |
| --- | ---: |
| Buy Now | 0 |
| Wait | 1,092 |
| Watch | 5,518 |
| Insufficient Data | 20,860 |
| Worth Investigating (separate overlapping research tier) | 1,188 |

The auditable, sequential funnel is:

| Gate | Records remaining |
| --- | ---: |
| All printing records | 27,470 |
| Provider product matched | 22,677 |
| Recent nonzero quote | 7,343 |
| Exact English printing / eligible raw condition | 7,334 |
| 90-day usable history | 7,235 |
| Suitable same-set peers | 6,610 |
| Correction and discount | 998 |
| Relative underperformance | 359 |
| 7/14-day stabilization | 58 |
| No broad set decline | 46 |
| Evidence threshold | 0 |

A product match does not mean its price/history has been retrieved or its exact printing is proved. Identity-invalid raw quotes can appear before the identity gate and are excluded from verified coverage. Primary reasons are mutually exclusive; nonexclusive gate counts overlap and must not be added together.

| Primary failed check | Records |
| --- | ---: |
| Matched, but no usable quote | 15,237 |
| Correction and discount | 5,612 |
| No verified API product match | 4,793 |
| Relative underperformance | 639 |
| Suitable same-set peers | 625 |
| 7/14-day stabilization | 301 |
| 90-day usable history | 99 |
| Recent nonzero quote | 97 |
| Evidence threshold | 46 |
| No broad set decline | 12 |
| Exact English printing / eligible raw condition | 9 |

The existing strict market-evidence threshold **90** is explicitly retained in `scripts/model-policy.mjs`. Age preferences change ranking only. Worth Investigating exposes failed checks and never changes a record to Buy. Current tab counters include search, saved price, rarity, printing, ownership and set/collection scope; empty-state explanations distinguish global absence from results hidden by filters. Personal saved filters and ownership remain on the user's phone, so cloud work cannot inspect that private state. Browser tests exercise saved settings and exact filtered counts.

Daily queues prioritize explicitly exported wanted/owned keys, missing fresh quotes/exact identities and representative chase cards, then histories. `data/priority_keys.json` is optional and must be deliberately supplied; there is no automatic upload of private browser ownership. Existing provider rates, shared backoff, budget, retry schedules and raw checkpoints remain in place. Original provider data was preserved; diagnostics and research tiers do not manufacture prices or recommendations.

## Set Market Pulse

The top mobile carousel supports pins/watchlisted set goals, logos, All priced cards versus Chase-only baskets, 7/30/90-day arrows and returns, as-of dates, coverage, sample counts, fixed-cohort sparklines, cohort details, leaders and laggards. 43 sets pass the 30-day all-card gate; 99 pass the Chase-only gate.

Each window compares the same verified exact printings at both endpoints and reports the median individual percentage return. There is one default printing per base card, not a sum of duplicate edition prices. Each horizon has its own fixed cohort. Endpoint references use actual observations on/before their target within the documented tolerance; no future observations or fabricated daily interpolation are used. A sparkline has one fixed cohort with actual references at every point.

The provisional gates are at least 10 endpoint samples and 30% fresh base-card price coverage. For baskets with fewer than 10 cards: at least 3 samples, 60% coverage and 60% sampled. Failed gates show **Insufficient set data**, including sparse vintage sets. Chase-only coverage uses the relevant chase-card denominator, so it can pass while the all-card basket fails.

Base Set example: 101/102 default printings priced (99% coverage); 7D -4.80% with 101 samples, 30D -5.70% with 101, 90D +0.20% with 101. These are daily research market estimates, not current condition-specific transactions.

## Vendor calculations, records and offline use

Select the exact set/printing/edition and inspected NM/LP/MP/HP/damaged condition. Identity and condition require manual confirmation. With no licensed condition quote available, enter an explicitly labeled manual comp, its observation date and source/notes. The calculator blocks mismatched or unverified identity/condition. A printing change during background refresh clears the comp and confirmations without transferring existing inventory to the new printing.

Provider-fed resale prices and set trends remain disabled pending verified commercial rights. The general carousel is personal research; Vendor accepts manually checked set/card 7/30/90-day inputs and links to exact products for manual checks. Refresh retrieves a daily publication, not a live show transaction. No secret-bearing on-demand API service or unlicensed scraping was introduced.

Illustrative, uncalibrated bands are stable/rising 80%, mild decline 70%, moderate decline 62.5%, sharp decline 55%. The weaker card/set 30-day trend applies; sharp 7/90-day weakness, stale comps, unknown or thin liquidity, volatility and scarce vintage sales add reserves. Age never increases a fraction. Normal/conservative scenarios and overrides expose the assumptions.

`Maximum = max(0, min(condition-matched comp × risk-adjusted fraction, stressed expected net resale − target dollar profit))`.

Net resale accounts for selling fees, shipping/handling, condition uncertainty, inventory holding and plausible further decline. Condition is already reflected in the comp and is not discounted a second time. Fee/shipping/profit inputs are per card. The screen shows opening offer, maximum, walk-away price, lot maximum, estimated net margin and break-even resale. It warns on asking prices above the maximum. Cash and trade credit are separate; an explicit redemption-cost factor converts trade credit to cash-equivalent cost.

Verified math examples: stable $100 reference → $80 before cost caps; −15% → $62.50; sharp decline → $55. A $100 stable comp with 15% selling fee, $5 shipping and $15 desired profit caps the offer at $65. These defaults are not proven optimal or profit guarantees.

Purchase/decline records, exact-condition inventory lots, bundle math, cash/trade cost basis, sale quantities/net proceeds, inventory CSV import/export and full vendor JSON restore are implemented. Failed writes preserve prior storage. Purchase records do not silently change collector ownership. All storage remains browser/device local; export backups regularly. There is no account or cross-device sync.

The service worker caches the matching version-9 shell and lazy Vendor modules, the daily snapshot and up to 60 opened histories. Cached modules load immediately; saved snapshot/detail requests have a three-second network fallback. Saved observations keep their dates; stale comps get a strong warning and additional reserve. Previously cached Buy labels without current evidence are withheld while preserving usable saved prices and ownership. No all-card history download is needed on the phone.

## Historical evaluation and verification

The published archive spans 2024-02-08 to 2026-10-18; time split 2025-11-07. Weekly rolling decisions use only observations available at that date, with mature training holds, a chronological embargo, no overlapping card holds per strategy and successive 90-day held-out reporting windows. Multiple thresholds and gate variants are evaluated below; alternative gates remain research-only and do not retune deployment using test outcomes. Matching/coverage is known today, so retrospective identity, survivorship and provider-coverage biases remain.

| Research variant | Held-out holds | Positive | Median change | Worst hold | Worst peak-to-trough drawdown | Qualifying decisions / 1,000 eligible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Strict gates / evidence 80 | 648 | 55.25% | +1.94% | -54.13% | -99.71% | 4.44 |
| Strict gates / evidence 85 | 442 | 55.66% | +1.84% | -54.13% | -99.71% | 3.01 |
| Strict gates / evidence 90 | 15 | 60% | +1.18% | -54.13% | -54.13% | 0.09 |
| Research only: 30D relative gate / evidence 85 | 459 | 55.99% | +1.95% | -54.13% | -99.71% | 3.12 |
| Research only: 7D stabilization / evidence 85 | 458 | 53.93% | +1.42% | -90.39% | -99.71% | 3.21 |

These are provider market-price changes before fees, taxes, shipping and actual execution. Positive market change is not investment profit. Extreme peak-to-trough drawdowns can reflect provider spikes and are not necessarily loss from the entry price. Thin strict-screen samples do not establish accuracy; the broader benchmark and previous algorithm remain in the public evaluation. There is no established investment advantage and the vendor bands have not been historically calibrated.

All **71 Node tests** passed. GitHub-hosted Chromium and WebKit collection/Vendor tests, Pages deployment and public normal-HTTPS Chromium and WebKit checks passed in the linked publication run. Tests cover stable/declining/sparse sets, exact vintage editions, near-buy separation, source/condition conflicts, stale quotes, existing rate limits/retries/checkpoints, no lookahead, costs, cash/trade/bundles, backup restore, failed saves, refresh identity changes and offline use. Public tests verify all eight named vintage sets, ownership reload, a separate reverse history, pulse/health and $80/$62.50 manual Vendor scenarios.

Measured mobile-browser performance (390 × 844):

- webkit: first cards 1.722 s; cached 0.098 s; CPU slowdown 1×; gzip index 873,942 bytes (test compression).
- chromium: first cards 2.651 s; cached 1.228 s; CPU slowdown 4×; gzip index 873,942 bytes (test compression).

Chromium uses 4× CPU slowdown, 80 ms latency and 8 Mbps; WebKit functional tests are unthrottled. These are browser-lab measurements, not a physical iPhone measurement. Compression level affects the reported gzip size; the build additionally enforces a 2 MB gzip budget. The initial wire format uses numeric profile scores and only includes full failure lists for research-tier candidates; complete analyses remain on-demand in set/detail files.

## Remaining external prerequisites

- Authorized Scrydex history access and measured vintage/condition/date coverage, current documented rates/bulk rights, and explicit licensing checks are still required before integration. No pre-2024 history is claimed or imported.
- TickerMint's applicable commercial/resale license and any paid plan must be independently confirmed and approved before enabling provider-fed Vendor pricing. The issue's reported tariff is not treated as verified permission.
- JustTCG, PriceCharting and TCGplayer alternatives remain separate research options; no unauthorized APIs, chart scraping or registrations were added.
- The cloud network/startup draft records required documentation/browser-download destinations and current commands. Reviewing/saving/publishing the cloud environment is separate from this already published website.
