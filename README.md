# PokéRadar

An English, raw Pokémon chase-card screen for physical sets released from 2008 onward. Known prices at or above $100 are excluded from the main list. Unknown prices remain clearly marked as insufficient data.

Live app: https://jacobhalvorson1998-ops.github.io/Pokeradar/

## Development and checks

The app has no runtime dependencies or browser build framework. Use Node 22+ and Python 3:

```sh
node --test tests/*.test.mjs
node scripts/backtest.mjs
node scripts/build.mjs
node scripts/verify-site.mjs
node --check site/app.js
python -m http.server 8000 --directory site
```

Run the real mobile browser checks with:

```sh
python -m pip install -r requirements-dev.txt
python -m playwright install chromium webkit
python tests/mobile_smoke.py
BROWSER_ENGINE=webkit python tests/mobile_smoke.py
```

If Chromium is already installed, set `CHROMIUM_PATH=/usr/bin/chromium`. Tests emulate a 390×844 touch device, four-times CPU slowdown, 80ms latency and 8Mbps download. They verify first-card loading, bounded DOM size, search, saving, lazy details, snapshot revisions, offline cached loading and layout. The throttled measurement uses Chromium. CI also runs the same mobile interactions and layout checks with WebKit, the engine used by Safari. These are browser-engine tests, not tests on physical iPhone hardware.

## Faster daily updates

```sh
node scripts/sync.mjs
```

In this Codex cloud machine, Node 24 uses the platform proxy with `NODE_USE_ENV_PROXY=1`. GitHub's Node 22 runner uses its standard outbound network.

TCGdex's complete English rarity lists assess the physical-card universe without individually requesting commons and uncommons. Only secret/gallery exceptions missing from those lists need individual details. Pokémon TCG Pocket and oversized sets are excluded. The dashboard counts bulk-assessed cards separately from eligible cards, verified quotes and usable histories; a bulk assessment is not an individual-detail request.

TickerMint's documented free set index and whole-set responses resolve many exact products per request. A match requires exact normalized name, set, collector number and affirmative English evidence; TCGdex card/artwork identifiers must agree when available. Initial pricing comes from the matched product's specific standard printing history. Later daily quotes can use the free whole-set CSV only when its exact card identity and explicit printing agree with that previously verified binding. Combined aggregates and assumed reverse-foil prices are rejected. Full histories rotate separately from daily quote refreshes.

Atomic checkpoints preserve completed discovery, matches and saved prices. Old numeric IDs are reverified. Failed matches have retry timestamps, reasons, attempt counts and a review cooldown rather than permanent zero IDs. HTTP 429 honors Retry-After; transient failures back off. Previously saved verified observations survive provider failures. A successful refresh requires real, recent, printing-specific provider observations. Same-day reruns confirm a live quote instead of claiming success from an empty queue.

`data/sync_report.json` records counts, request/retry/rate-limit totals, elapsed time and remaining work. Ignored `.cache/pokeradar/full-history.json` supports evaluation; GitHub's cache retains it between daily runs. Public card details contain at most 120 recent observations and attribution.

Default workflow targets are 5,000 product-resolution attempts and 2,000 history refreshes, bounded by a 25-minute sync budget and 35-minute job timeout. Calls share a conservative 90/minute read gate; fallback search is at most 20/minute and 40 searches per run so it cannot starve the main queue. These are upper bounds, not guaranteed coverage. Unmatched printings remain pending. Change the `MAX_*_PER_RUN` variables to bound a local run; `SYNC_BUDGET_MS` bounds elapsed work.

## Opportunity screening

The score uses age 25%, set-relative value 25%, historical correction 20%, stabilization 15%, editorial Pokémon popularity 10%, and liquidity 5%. The requested age brackets are implemented. Unavailable liquidity receives no invented credit, so the evidence-supported maximum is 95.

Buy Now requires all quality gates as well as the score: verified recent English product/printing data; at least 90 calendar days and 28 observations with no large gaps; at least three suitable same-set peers; a meaningful correction and discount to recent prices; relative underperformance against peers; stabilization; and no broad set decline. Medians limit extreme-price influence. An old card or high score alone cannot qualify. Watch thresholds are screening aids, not predicted future prices or executable offers.

Historical evaluation uses weekly decisions, 30-day holds and a chronological training/test split with a holding-period embargo. Every decision and peer comparison uses only earlier observations. The new model is compared with the previous algorithm and a simple buy-every-eligible-card benchmark. Thresholds 80, 85 and 90 can be calibrated only with at least 30 training signals across ten cards; otherwise 80 remains provisional. Failed signals, returns, drawdowns and sample limitations are published at [the evaluation page](https://jacobhalvorson1998-ops.github.io/Pokeradar/evaluation.html). A zero-signal strategy has no measurable accuracy.

Market estimates exclude transaction costs and cannot establish an actual Near Mint listing. Listing depth, completed-sales volume, demand and scarcity are unavailable. Popularity is an editorial proxy. Current catalog/matching coverage introduces survivorship and retrospective-match bias even though price observations are separated in time. History begins in February 2024, not in the card's release year.

## Mobile data and deployment

`scripts/build.mjs` precomputes rankings, metrics and comparisons into `site/summary.json`. The browser paints its saved summary immediately and refreshes it in the background. It renders 18 cards at a time, lazily loads artwork, and requests `details/<id>.json` only when a card opens. Stale cached signals lose Buy Now eligibility. Refresh downloads published data; it does not launch a provider scan.

`Refresh Pokémon prices` runs daily at 14:18 UTC and saves progress even after a refresh failure. `Publish PokéRadar` deploys independently on site pushes, manual dispatch and successful refresh completion. Publishing runs model/provider tests, data checks and real mobile browser checks before uploading Pages. GitHub Pages must use GitHub Actions as its source.

## Official sources and free-plan scope

- [TCGdex filtering documentation](https://tcgdex.dev/rest/filtering-sorting-pagination) and [its official source](https://github.com/tcgdex/documentation/blob/master/src/content/docs/rest/filtering-sorting-pagination.mdx): filtering is complete unless pagination is explicitly requested; rarity resources return brief card lists.
- [TCGdex English API](https://api.tcgdex.net/v2/en): verified `/sets`, `/rarities`, `/rarities/{name}` and exceptional `/cards/{id}` responses.
- [TickerMint developer documentation](https://tickermint.cards/developers): verified `/sets?game=pokemon`, `/sets/{group_id}` and `/products/{id}/prices`. Free personal/noncommercial reads allow 120 requests/minute/IP, with lower search limits. Visible source attribution is retained.
- The documented `/v1/bulk/day` and `/v1/bulk/history` endpoints require a paid plan. This project does not call them or purchase a plan. Commercial use and raw dataset/feed redistribution require separate rights under the provider's terms. Full evaluation caches are ignored and are not published as a dataset.
