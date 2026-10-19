Current upgrade: persistent NM/LP browsing, 20/50/100-card pages and exact vintage validation. Existing TickerMint prices are aggregate research only; **NM and LP currently show unavailable until an authorized condition provider is validated**. See [condition upgrade report](CONDITION_UPGRADE_REPORT.md) and [public vintage audit](https://jacobhalvorson1998-ops.github.io/Pokeradar/vintage-audit.html).

# PokéRadar

Personal English Pokémon card research and set completion, published at **https://jacobhalvorson1998-ops.github.io/Pokeradar/**.

PokéRadar includes every released English physical set represented by TCGdex, across all rarities and prices. Pokémon TCG Pocket and oversized sets are excluded. There is no minimum release-year filter. Japanese printings remain a separate future catalog; they are never combined with English pricing.

See [the collection upgrade report](COLLECTION_UPGRADE.md) for measured coverage, historical results and limitations.

## Run locally

Use Node 22 or newer and Python 3.12 or newer. There are no Node package dependencies and no API credentials are required for the free endpoints used here.

```sh
node scripts/build.mjs
node scripts/verify-site.mjs
python -m http.server 8000 --directory site
```

Open http://localhost:8000. HTTP serving is required for JavaScript modules. Opening index.html directly from a file manager is unsupported.

```sh
node --test tests/*.test.mjs
python -m pip install -r requirements-dev.txt
python -m playwright install --with-deps chromium webkit
python tests/mobile_smoke.py
python tests/vendor_smoke.py
BROWSER_ENGINE=webkit python tests/mobile_smoke.py
BROWSER_ENGINE=webkit python tests/vendor_smoke.py
```

An existing Chromium can be selected with `CHROMIUM_PATH=/usr/bin/chromium`. The browser test serves gzip-compressed assets, matching Pages delivery, and measures a 390 × 844 mobile viewport. Chromium additionally uses 4× CPU slowdown, 80 ms latency and 8 Mbps bandwidth. WebKit tests the mobile layout, forms, saved data and navigation without Chromium-specific throttling. Browser emulation is not a physical iPhone measurement.

## Data pipeline

```sh
node scripts/sync.mjs
node scripts/backtest.mjs
node scripts/build.mjs
node scripts/verify-site.mjs
```

For catalog/printing enrichment without TickerMint pricing requests:

```sh
MAX_VARIANT_DETAILS=1500 node scripts/enrich.mjs
```

TCGdex's whole set and rarity indexes discover all cards without individual common-card scans. English rarity/subtype metadata and set logos are enriched from the [Pokémon TCG API's maintained data repository](https://github.com/PokemonTCG/pokemon-tcg-data). TCGdex card-specific `variants` and `variants_detailed` determine printing existence. Their exact English TCGplayer product bindings, where present, supplement strict TickerMint name/set/number/language matching. Card metadata refreshes periodically; new cards receive priority over refreshes.

Normal, holo, reverse, First Edition, Shadowless and special records remain separate. Edition booleans alone do not create foil/edition combinations. A special printing without an exact product binding stays unpriced; ambiguous identical product/printing bindings across editions are rejected. Original Base Set has no reverse holo records. The generic Miscellaneous Promos set has a placeholder provider date; it is displayed with an unverified year instead of assigning that date to Ancient Mew.

Free whole-set CSVs refresh only previously verified identical printing prices. History reads are grouped by product ID: one provider response can supply independent foil/edition histories without mixing their values. The history work limit counts unique product reads, so sibling variants do not consume extra request slots. Failed reads preserve prior quotes and history. Retry statuses include timestamps, reasons and cooldowns. A successful updater requires actual recent verified provider quotes. Catalog and price success timestamps are maintained separately.

The updater uses conservative shared rate gates: 90 reads/minute and at most 20 fallback searches/minute, plus Retry-After and transient-error backoff. It does not access paid bulk endpoints or purchase a plan. Provider data is used for this personal research app with attribution; review the [TickerMint developer documentation and terms](https://tickermint.cards/developers) before changing distribution or commercial use. See also [TCGdex documentation](https://github.com/tcgdex/documentation).

Daily GitHub Actions run around **9:18 AM Central during daylight time / 8:18 AM in winter** (14:18 UTC). GitHub may delay scheduled starts. The provider budget is 25 minutes within a 35-minute job; checkpoints retain unfinished work. The save helper applies raw provider changes to the latest main, rebuilds derived output, and retries if main advances. Conflicting manual raw edits remain untouched; an updater checkpoint branch and seven-day artifact retain its progress for review. The helper runs only in disposable Actions/test checkouts. Publication runs independently after successful updates. It restores the historical archive and rebuilds analysis using the latest checked-out model before checking Chromium and WebKit, deploying Pages, and verifying both engines against the public HTTPS site. This prevents an older in-flight updater from publishing stale scoring rules after a code upgrade.

## Catalog and research model

`site/catalog.json` is the expanded source catalog; `site/prices.json` holds exact-printing observations. `site/summary.json` uses version 5: compact `columns` plus card-row arrays, set indexes, coverage and update status. Initial data contains no complete histories. `site/sets/<id>.json` provides full precomputed set analyses. `site/details/<id>.json` contains a priced card's analysis and trailing 120 observations; it loads on demand. Full historical archives stay in ignored `.cache/pokeradar/` and the Actions cache. The client indexes sets once and renders at most 18 cards per page.

The default score weights are age 25%, relative set value 25%, correction 20%, stabilization/momentum 15%, editorial Pokémon popularity 10%, and liquidity/listings 5%. Unavailable liquidity earns zero, with no rescaling. Older collectible cards receive greater age credit; ordinary commons and uncommons receive capped credit so age alone cannot place them above modern chase cards. Settings offer precomputed age weights of 15%, 25% and 35%, plus collectible-significance or equal-age treatment. Changing age redistributes weight equally with relative value and correction. These profiles change ranking, not buying eligibility.

The displayed Opportunity Score ranks preferences. Buy Now uses a separate non-age market-evidence score (the other 75 weighted points, including zero for unavailable liquidity), calibrated using training data. This prevents age from mathematically excluding strong modern signals. Buy Now requires all data-quality gates, sufficient same-set rarity/printing/edition peers, an 18% correction, a 7% discount to the recent average, relative underperformance, 7- and 14-day stabilization, and no broad set decline. Price filters never determine qualification. Quotes must be within four UTC calendar days; usable history spans 90 days with at least 28 observations and no gap over 14 days. Confidence separately describes verified identity, freshness, history and peer coverage; missing liquidity caps it at 85. It is not a profit probability. Actual condition-specific Near Mint offers, listing depth and sales volume are unavailable.

`site/evaluation.html` reports the default model against the original algorithm and a broad benchmark. Weekly decisions use observations known at that date and 30-day nonoverlapping holds. Threshold calibration uses mature training outcomes only. The original comparator retains its original $100 limit; the new model and benchmark span all prices. Feature evaluation uses the mathematically sufficient 100-day window while retaining full history for exits/drawdowns; the optimized and full-history replays were checked for identical results. History starts in February 2024, even for vintage cards. Current product matches and coverage introduce retrospective/survivorship bias. Fees and actual listing availability are not reconstructed. Historical results do not establish future accuracy or lower risk.

## My Sets and collection storage

Standard counts one default printing per collector number. Master adds only verified applicable standard holo/reverse variants. First Edition, Shadowless and other special goals remain separate. Unknown variant metadata can expand future Master totals; this is shown in the set plan. Missing-card totals include only fresh exact prices, with explicit unpriced counts and partial totals. None is presented as $0.

Collection records track quantity, raw condition, exact printing/edition, purchase price per card, purchase date, notes and desired entry price. CSV imports merge by stable exact-printing key and validate the complete file before saving. CSV exports neutralize spreadsheet formula prefixes while preserving round-trip text. Full JSON backups also retain set goals and preferences. Existing starred cards migrate to Want to Buy. Metadata changes never silently transfer ownership to a different printing.

`site/lib/collection.mjs` is a versioned, provider-independent domain module. The current adapter saves atomically through localStorage and reacts to changes in another tab. A failed save keeps the previous stored collection. Snapshot caches use a separate IndexedDB database and a tiny local preview; replacing catalog caches does not clear ownership. Background research refreshes preserve unsaved collection forms. Future authenticated cross-device storage can implement the same record schema and revision semantics, with server-side ownership checks and conflict handling.

**Current limitation:** collection data lives on this browser/device. Clearing site data, private browsing, changing devices or losing the phone can remove access. Export CSV or a full backup regularly. No account or cross-device service is currently provided.


## Set Market Pulse, diagnostics and Vendor Mode (Issue #2)

The top carousel reports robust median changes on fixed, exact-printing endpoint cohorts, never changing price totals. Each basket contains one default printing per base card. All-priced and Chase-only baskets are separate. The provisional gates are 10 comparable samples and 30% fresh verified base-card price coverage. Sets with fewer than 10 relevant cards require at least 3 samples, at least 60% price coverage and 60% sampled. Sparse windows show insufficient data. A sparkline uses a cohort with actual historical observations at every point; no interpolation occurs. See `scripts/market-pulse.mjs`. The compact summary contains only precomputed window statistics and six-segment sparklines, not the source histories.

`site/health.json` records the sequential funnel, nonexclusive failures, mutually exclusive primary reasons and nearest misses. The Settings dashboard and current-filter counts distinguish absent product matches, matched products awaiting a usable quote, stale prices, printing/condition identity, history, peers and market gates. Worth Investigating remains a distinct research tier and cannot override a failed Buy gate. `scripts/model-policy.mjs` retains the previously deployed strict threshold of 90. The historical report evaluates thresholds 80/85/90 plus research-only gate variants with mature training, held-out decisions, per-1,000 frequency, failures, downside and successive 90-day test windows. Results do not silently lower production policy.

Vendor Mode is lazy-loaded. **Provider-fed resale pricing is disabled pending verified commercial rights and explicit approval.** It uses visibly manual exact-condition comps and manual trend inputs; daily TickerMint aggregates are never passed off as NM listings. See [the provider review](PROVIDER_RESEARCH.md). No Scrydex account, subscription, paid request or legacy data import has been created. The shared `PriceSource` boundary carries exact identity, condition, metric, observed/fetched dates, coverage, provenance and quality. Imported providers remain separate series; disagreement compares only like-for-like definitions and dates. `scripts/import-source.mjs` refuses import without explicit source approval, authorization and coverage verification. Keys belong only in approved server-side workflow secrets, never the static site.

Illustrative cash bands start at 80% for stable/rising, 70% for mild declines, 62.5% for moderate and 55% for sharp declines. The weaker card/set 30-day trend determines the band; sharp 7/90-day weakness, uncertainty, staleness, thin liquidity, volatility and scarce vintage trading add reserves. Normal/conservative scenarios and overrides expose the assumptions. The maximum is the lower of the trend cap and stressed net resale less desired dollar profit, clamped at zero. Condition is already in the comp; a separate reserve covers uncertainty only. Fees, shipping, handling and profit inputs are per card. Trade credit is converted by an explicit cash-redemption cost, never confused with cash.

Purchase/decline decisions, exact-condition inventory lots, cash/trade cost basis, bundle maxima, sales and net proceeds persist in the separate versioned `pokeradar_vendor_v1` browser record. Vendor CSV and full JSON backups can be restored; this is local storage, not cross-device sync. Purchasing does not silently alter collector set ownership. Offline shell modules and the published catalog are cached; up to 60 opened card histories remain available. Refresh downloads the most recent daily publication, not live show transactions.

An explicit `priority_keys.json` export in Data Health includes owned/wanted keys only when requested. To prioritize them in a provider run, deliberately place the reviewed file at `data/priority_keys.json`; private collection records are never automatically uploaded. The bounded queue prioritizes personal keys, missing fresh prices/exact identities and representative chase cards, then historical refreshes. Existing rate limits, shared cooldowns, retry schedules and checkpoints remain active.
