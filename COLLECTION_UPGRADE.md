# PokéRadar: collection and all-era research upgrade

Verified October 18, 2026 (Central), against the snapshot built at 8:08 PM Central. Figures describe this publication snapshot and will change with daily updates.

Website: https://jacobhalvorson1998-ops.github.io/Pokeradar/

## What changed

PokéRadar now combines research with a personal **My Sets** tracker. The mobile design uses a dark emerald theme, larger card artwork, set logos, collapsible filters and five fixed navigation destinations: Home, Buy Opportunities, My Sets, Collection and Settings. Search is available throughout.

When inspected, the published summary still contained no pre-2008 cards, even though newer source changes had broadened discovery. A remaining 2008 quality check also rejected vintage research data. The upgrade removes that restriction throughout the model and published build, updates the snapshot/cache format, and checks actual vintage data and browser display before publication. Refresh downloads the newest published catalog revision, including catalog-only changes; provider sync runs separately in GitHub Actions.

The snapshot contains **21,256 English physical cards across 201 sets**, represented by **24,617 card/printing records**. It includes Base Set, Jungle, Fossil, Team Rocket, Neo Genesis, Legendary Collection and the EX-era sets. There is no arbitrary minimum release year. Pocket digital and oversized sets remain excluded; Japanese releases are not mixed into English prices. A placeholder date on the generic Miscellaneous Promos set is shown as unverified rather than assigning it to Ancient Mew. Other broad promo families may supply a set start date rather than an individual card release date.

All rarities are included. Common, Uncommon, Regular Rare, Holo Rare, Gold Star, Shining, Crystal, vintage ex/LV.X, PRIME/LEGEND, Full Art, Alternate Art, IR, SIR, Secret and promotional categories can be filtered independently of printing/edition. English rarity data comes from the maintained Pokémon TCG API dataset; printing declarations come from card-specific TCGdex metadata. Crystal identification uses the source's Crystal Type ability, not guessed rarity labels.

## Printing accuracy and current coverage

Normal, holo, reverse, First Edition, Shadowless and other declared printings have separate identities. The provider must verify the corresponding product and exact historical printing before a price is attached. One history request can populate several independent printing records; their prices are never pooled. Special editions without exact product evidence, or editions sharing an indistinguishable price identity, stay unpriced. Base Set has **zero reverse holo records**.

A targeted real-provider validation retrieved 28 vintage foil/edition histories in 18 seconds using 26 requests, with no HTTP failures or rate-limit responses; 23 quotes were recent. Stale edition histories remain marked stale.

This snapshot has **4,247 recent verified printing prices**, including **981 pre-2008 prices** and **399 prices above $100**. There are **4,211 histories** meeting the recommendation history checks and **3,879 records** with suitable comparable peers. The default profile currently has **5 Buy Now**, 1,001 Wait, 2,873 Watch and 20,738 Insufficient Data records. These categories reflect evidence gates, not promised returns.

Printing metadata has been retrieved for **3,100 cards**. **18,156 cards still await that enrichment**, and **16,698 printing records lack a matched product in the saved resolver**. An API response can also lack usable printing declarations. Exact coverage stays incomplete; ordinary catalog cards remain available for tracking while pricing or variant metadata is missing. Daily processing continues the queue with provider backoff and checkpoints. Concurrent app changes no longer cause the updater to lose its raw progress: it rebuilds against the latest code, while conflicting manual data edits get a recoverable checkpoint instead of being overwritten. No paid plan was purchased.

## Collection and set plans

Choose a set to see collector-order cards, owned/missing counts, completion progress and verified price coverage. Standard counts its default printing per card. Master adds only verified applicable normal/holo/reverse records; First Edition, Shadowless and special goals remain separate. Master goals show when incomplete metadata may expand their totals. There is no assumption that every card has every printing.

Ownership records support Owned, Missing and Want to Buy, quantity, raw condition, exact variant, purchase price per card, purchase date, notes and desired entry price. Missing-only, missing Buy Now, Wait, biggest declines, editorial Pokémon popularity, cheapest missing and most expensive missing views support a set buying plan. Cost totals include only missing cards with fresh exact prices, explicitly naming unpriced missing cards and marking partial totals. Quantity does not inflate unique-card completion.

CSV export/import preserves records by stable printing key. Full JSON backups also include goals and preferences. Imports validate before saving; failed saves preserve the previous collection. Earlier starred cards migrate to Want to Buy. Background price refreshes preserve an unfinished collection form, and metadata changes cannot silently transfer ownership to another printing.

**Storage limitation:** ownership and preferences live in this browser on this device. Clearing site data, private browsing, switching devices or losing the phone can remove access. Export backups regularly. There is no account or cross-device sync yet. The collection schema and storage boundary are versioned so an authenticated service can be added later without tying ownership to a pricing provider.

## Research model and historical limits

The score retains the requested market-evidence weights and a configurable older-card preference. Settings offer 15%, 25% or 35% age weight and collectible-significance or equal-age treatment. The default caps age credit for commons/uncommons while favoring older collectible holos and chase cards. Changing age weight redistributes weight with set-relative value and correction; hard buying gates always apply. Price limits only filter the view and never suppress a fundamentally qualifying opportunity above $100.

Peers must match set, compatible rarity, printing and edition, within a reasonable price band. Buying requires verified recent prices, usable 90-day history, at least three peers, a meaningful correction and discount, relative value, stabilization over 7 and 14 days, and no broad set decline. Momentum also considers 30 days. Age-weighted Opportunity Scores rank candidates. Buying eligibility uses the non-age market-evidence score, so a strong modern card can qualify even with a lower age-based ranking score. Missing liquidity earns zero in both. Confidence is a separate indicator of identity, freshness, history and peer coverage; it is not a probability of profit. Liquidity, completed-sales volume and condition-specific Near Mint listing prices remain unavailable.

The published market-evidence screen was evaluated using the restored Actions archive: 4,267 price histories, chronological training/test periods and 30-day holds. The market threshold **85** was selected using training outcomes only. The held-out results were:

| Strategy | Positive holds | Failed / flat | Median market change | Worst hold return | Worst peak-to-trough drawdown during a hold |
| --- | ---: | ---: | ---: | ---: | ---: |
| New market-evidence screen | 73 / 127 (57.48%) | 54 | +1.56% | -25.99% | -99.71% |
| Previous algorithm | 78 / 150 (52.00%) | 72 | +0.56% | -38.10% | -50.32% |
| Broad benchmark | 15,923 / 26,166 (60.85%) | 10,243 | +2.38% | -77.53% | -99.71% |

Results are **mixed and do not demonstrate an investment advantage**. The new screen improved the historical positive rate over the old algorithm in this sample, but did not beat the broad benchmark's positive rate or median change. Its extreme peak-to-trough drawdown was worse than the old algorithm's. Drawdown measures a decline from a peak during a hold, not necessarily the loss from the entry price; unusually large provider-price spikes can make this measure extreme. Market estimates are not completed sales or executable offers.

Held-out results did not drive threshold retuning. The evaluation covers all qualifying signals rather than a budget-constrained portfolio following preference rankings. The original comparator retains its original $100 cap; the new screen and benchmark span all prices. Data begins in February 2024, even for vintage cards; present-day matches, survivorship, correlated cards, unavailable historical listings and excluded transaction costs limit conclusions. The [public evaluation](https://jacobhalvorson1998-ops.github.io/Pokeradar/evaluation.html) includes failed examples and the full methodology. Neither the Opportunity Score, market-evidence score nor data-confidence indicator is a probability of profit.

## Speed, automatic updates and checks

The complete initial index is about **647 KiB gzip**, without full histories. The client indexes sets once, renders 18 cards, loads sharp artwork lazily and retrieves a chart only when needed. Saved previews paint immediately, followed by the full IndexedDB snapshot and background refresh. Measured throttled mobile Chromium loading was about **2.5 seconds cold** and **1.1 seconds cached** at 4× CPU slowdown, 80 ms latency and 8 Mbps. These are browser-lab measurements, not physical-iPhone measurements. An optimized historical feature window produced identical results to full-history replay while reducing repeated work.

Daily GitHub Actions remain enabled around **9:18 AM Central in daylight time / 8:18 AM in winter**. Successful catalog and price times, coverage, unmatched records, history and provider errors/rate limits appear in Settings. Scheduled starts may be delayed by GitHub. A green provider run requires actual fresh verified quotes.

All **58 automated tests** and the local Chromium checks passed, including actual Base Set display, vintage holo classification, printing/edition separation, Standard/Master progress, ownership, CSV, saved settings, high-price opportunities, custom filters, stale data, offline loading, storage failure preservation and unfinished-form preservation. Chromium and WebKit mobile checks, GitHub Pages deployment, and both normal-HTTPS public browser checks **passed** in [publication run 39183878251](https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39183878251). The public tests displayed all eight named vintage sets, persisted ownership through reload, and opened a separately identified reverse-holo history. The deployed shell is version 7, and the model is `market-evidence-v3`.
