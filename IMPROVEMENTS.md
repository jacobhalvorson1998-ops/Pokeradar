# PokéRadar implementation and publication report

Published October 18, 2026. These figures describe the verified snapshot built at 22:32 UTC and deployed with commit `2ff7319`; scheduled updates will change them.

**Live website:** https://jacobhalvorson1998-ops.github.io/Pokeradar/

**Historical evaluation:** https://jacobhalvorson1998-ops.github.io/Pokeradar/evaluation.html

## What caused the slow updates

The previous updater requested individual card details even for commons and uncommons that could be excluded using whole rarity lists. It then restricted each run to 650 details, 65 product resolutions and 65 histories, with a fixed 1.25-second delay between searches. Product matching and history retrieval consumed separate requests for each card. Failed matches recorded as `0` could remain stuck permanently. The browser also loaded and processed far more catalog and historical data than it needed to display the first screen.

Not all 19,564 identified entries were physical cards: 2,480 belonged to Pokémon TCG Pocket. The upgraded physical-card review universe is 17,084 cards. Bulk rarity membership now reviews that entire universe, with individual detail requests reserved for exceptional or missing rarity information.

## What changed

- `scripts/provider.mjs` and `scripts/sync.mjs`: documented TCGdex rarity lists, whole-set TickerMint product indexes and printing-specific CSV refreshes; controlled queues; conservative shared limits of 90 reads/minute and 20 fallback searches/minute; HTTP 429 and transient-error backoff; atomic checkpoints; retryable matching statuses; separate quote/history rotation; preservation of saved prices after failures. Successful updater completion requires actual fresh, verified provider pricing. Logs distinguish retrieved data, rejected matches, retry cooldowns and remaining work.
- Exact matching checks the card name, set, collector number, affirmative English-language evidence and supported raw printing. Whole-set refreshes reuse only a previously verified product and the same printing. Unresolved language or printing evidence stays unresolved. Alternate Art labels require explicit provider evidence.
- `scripts/opportunity.mjs` and `scripts/backtest.mjs`: reproducible scoring, strict eligibility gates, same-set comparisons, dated historical simulation and training-only threshold calibration. `scripts/render-evaluation.mjs` publishes the results and failed examples.
- `scripts/build.mjs`, `scripts/verify-site.mjs` and `site/details/`: precomputed summary rows and separate per-card details. Complete history is absent from the initial summary; long evaluation archives remain outside the public site.
- `site/app.js`, `site/index.html`, `site/styles.css` and `site/sw.js`: 18-card pages, lazy artwork and detail loading, cached snapshots with background refresh, efficient search/filter/sort, saved cards, accessible mobile controls, Last Updated and offline indicators. Stale recommendations expire even in a tab left open across multiple days.
- Both GitHub Actions workflows: daily updates at **14:18 UTC**, a 25-minute provider-work budget within a 35-minute update job, progress saving, history-cache retention, automated publication and browser checks against the live deployment. GitHub may delay scheduled starts.
- `tests/`, `README.md`, `requirements-dev.txt` and `data/upgrade-baseline.json`: automated checks, reproducible setup instructions, browser-test dependencies and an auditable baseline.

Official API formats were checked against [TCGdex documentation](https://github.com/tcgdex/documentation) and [TickerMint developer documentation](https://tickermint.cards/developers). No paid API plan was purchased. Paid bulk-history endpoints are unused; provider attribution remains visible.

## Coverage before and after

| Measure | Previous snapshot | Published upgrade |
| --- | ---: | ---: |
| Cards reviewed | 670 individual details | 17,084 physical cards assessed |
| Catalog entries | 799 | 3,528 unique eligible prints |
| Prices | 72 recorded with weaker checks | 1,140 recent prices meeting strict verification |
| History passing recommendation data checks | Not measured equivalently | 1,137 |
| Cards with sufficient suitable set peers | Not measured | 1,093 |
| Recently verified cards below $100 | Not measured | 900 |

The new reviewed count measures bulk eligibility assessment, rather than pretending that 17,084 individual detail requests were made. It covers the full physical universe. The eligible catalog includes cards awaiting price verification; cards known to cost $100 or more are excluded from the displayed list. Unknown prices are clearly marked as insufficient data.

The published list contains **2 Buy Now**, 56 Wait to Buy, 833 Watchlist and 2,393 Insufficient Data entries. There are 1,142 active strictly matched price records; 1,140 meet the four-UTC-calendar-day freshness rule. Having history alone does not guarantee sufficient peers or a buying opportunity.

## Measured speed

- Initial discovery assessed the physical universe in about **25 seconds**, using bulk lists and exceptional details instead of thousands of individual requests.
- A substantial actual-provider batch took **12 minutes 5 seconds**, retrieving 997 new exact-print histories/quotes. A subsequent warm catch-up took **2 minutes 19 seconds**, refreshing 994 existing printing-specific quotes through 44 whole-set CSV requests and retrieving 147 histories. These are measured batches with different workloads, not a promise that the entire remaining catalog finishes in two minutes.
- The final catch-up used 200 TickerMint reads and two TCGdex reads, with no HTTP failures or rate-limit responses. Three successfully returned history payloads had unsupported printing data and were deferred rather than accepted.
- The initial summary is about **95 KiB using Node's default gzip settings**, with no complete histories. Throttled Chromium testing at a 390 × 844 viewport, 4× CPU slowdown, 80 ms latency and 8 Mbps showed first cards in approximately **2.3 seconds**, and cached cards in approximately **0.5 seconds**. WebKit passed layout and interaction checks. These are browser-lab measurements, not measurements on a physical iPhone.

## How Buy Now works

The Opportunity Score uses the requested weights: age 25%, same-set relative value 25%, historical correction 20%, stabilization/momentum 15%, editorial Pokémon popularity 10%, and liquidity/listing quality 5%. Age priority is 100 for 2008–2012, 85 for 2013–2016, 70 for 2017–2019, 50 for 2020–2022, 30 for 2023–2024 and 15 thereafter.

Liquidity, listing depth and completed-sales volume are unavailable. They contribute zero rather than invented evidence; weights are not redistributed, so the current evidence-supported maximum is 95. The score is not a probability of profit.

Buy Now also requires a verified English raw printing below $100, a recent quote, at least 90 days of usable history with 28 or more observations and no gap over 14 days, and at least three suitable same-set peers. Peers use compatible rarity and a one-quarter-to-four-times price band. Median changes limit outlier influence.

The current threshold is 80. Additional gates require at least an 18% correction from the 90-day high, at least a 7% discount to the 90-day average, underperformance of peers by at least five percentage points over 30 days and eight over 90 days, and a last-week movement between −3% and +4%. Broad set declines veto Buy Now. Age alone cannot produce a recommendation. Falling candidates go to Wait; other assessed cards go to Watch; weak evidence goes to Insufficient Data.

Card details show price/date, release year and set, score, 7/30/90-day movement, peer comparisons, valuation, explanation, principal risk, an entry/watch threshold and a TCGplayer link to inspect actual Near Mint listings. Unavailable sales and listing data is labeled explicitly.

## Historical results, including failures

Available provider history starts February 8, 2024, including for cards released in 2008. The simulation uses weekly decision dates and 30-day holds, with a chronological split on November 7, 2025. Features and peers use only observations available by each decision date. Training outcomes must mature before the split; a card cannot have overlapping holds within a strategy. Thresholds 80, 85 and 90 were considered using training data only. Threshold 80 was selected; held-out results did not change it.

| Held-out strategy | Holds | Positive after 30 days | Failed or flat | Median price change | Worst hold return | Worst drawdown during a hold |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| New model | 67 across 57 cards | 45 / 67 (67.16%) | 22 | +4.91% | −33.90% | −42.29% |
| Previous algorithm | 64 across 46 cards | 40 / 64 (62.50%) | 24 | +2.66% | −26.49% | −31.10% |
| Buy every eligible card benchmark | 8,557 across 988 cards | 5,565 / 8,557 (65.03%) | 2,992 | +1.88% | −46.67% | −70.45% |

These results are **mixed**: the new model had a higher positive rate and median price change in this sample, but worse tail losses and drawdown than the previous algorithm. They do not establish reliable future accuracy or lower risk. The public evaluation includes failed examples. Fees, shipping, tax and slippage are excluded; market estimates are not executable Near Mint offers. Current catalog coverage and present-day product matches create survivorship and retrospective matching bias, and different cards are correlated.

## Verification and remaining work

All **37 Node tests** passed. Coverage includes discovery, exact matching, printing/language rejection, rate-limit cooldowns, failed-request preservation, checkpoint/restart behavior, age weighting, peer comparisons, buying gates and stale data. Chromium and WebKit mobile browser checks passed, including search, saving, lazy details, offline behavior and the long-lived-tab expiry regression. Site integrity and payload checks passed. GitHub Pages deployment and the normal-HTTPS public mobile browser test passed in [deployment run 39173183647](https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39173183647).

Full pricing coverage is still incomplete: **1,934 histories await scheduled processing** and **452 product matches remain unresolved**. Of those matches, 356 lack affirmative English-printing evidence, 56 have a name mismatch, 38 lack a collector-number match, one has a set mismatch and one has an unsupported printing. They are not accepted to inflate coverage. Retry cooldowns and provider omissions mean a request-count estimate cannot promise a completion date; some cases may require better provider metadata or manual review. Existing exact quotes can refresh cheaply through whole-set CSVs while the daily queue continues history work. No additional user subscription or paid API purchase was made.

The code, verified snapshot and completed deployment are published. Daily automated processing is enabled; pending coverage remains visible rather than being presented as complete.
