# PokéRadar: collection and all-era research upgrade

Report prepared October 18, 2026 (Central). Figures describe this publication snapshot and will change with daily updates.

Website: https://jacobhalvorson1998-ops.github.io/Pokeradar/

## What changed

PokéRadar now combines research with a personal **My Sets** tracker. The mobile design uses a dark emerald theme, larger card artwork, set logos, collapsible filters and five fixed navigation destinations: Home, Buy Opportunities, My Sets, Collection and Settings. Search is available throughout.

When inspected, the published summary still contained no pre-2008 cards, even though newer source changes had broadened discovery. A remaining 2008 quality check also rejected vintage research data. The upgrade removes that restriction throughout the model and published build, updates the snapshot/cache format, and checks actual vintage data and browser display before publication. Refresh downloads the newest published catalog revision, including catalog-only changes; provider sync runs separately in GitHub Actions.

The snapshot contains **21,256 English physical cards across 201 sets**, represented by **24,617 card/printing records**. It includes Base Set, Jungle, Fossil, Team Rocket, Neo Genesis, Legendary Collection and the EX-era sets. There is no arbitrary minimum release year. Pocket digital and oversized sets remain excluded; Japanese releases are not mixed into English prices. A placeholder date on the generic Miscellaneous Promos set is shown as unverified rather than assigning it to Ancient Mew.

All rarities are included. Common, Uncommon, Regular Rare, Holo Rare, Gold Star, Shining, Crystal, vintage ex/LV.X, PRIME/LEGEND, Full Art, Alternate Art, IR, SIR, Secret and promotional categories can be filtered independently of printing/edition. English rarity data comes from the maintained Pokémon TCG API dataset; printing declarations come from card-specific TCGdex metadata. Crystal identification uses the source's Crystal Type ability, not guessed rarity labels.

## Printing accuracy and current coverage

Normal, holo, reverse, First Edition, Shadowless and other declared printings have separate identities. The provider must verify the corresponding product and exact historical printing before a price is attached. One history request can populate several independent printing records; their prices are never pooled. Special editions without exact product evidence, or editions sharing an indistinguishable price identity, stay unpriced. Base Set has **zero reverse holo records**.

A targeted real-provider validation retrieved 28 vintage foil/edition histories in 18 seconds using 26 requests, with no HTTP failures or rate-limit responses; 23 quotes were recent. Stale edition histories remain marked stale.

This snapshot has **4,247 recent verified printing prices**, including **981 pre-2008 prices** and **399 prices above $100**. There are **4,211 histories** meeting the recommendation history checks and **3,879 records** with suitable comparable peers. The default profile currently has **2 Buy Now**, 1,001 Wait, 2,876 Watch and 20,738 Insufficient Data records. These categories reflect evidence gates, not promised returns.

Printing metadata has been retrieved for **3,100 cards**. **18,156 cards still await that enrichment**, and **16,698 printing records lack a matched product in the saved resolver**. An API response can also lack usable printing declarations. Exact coverage stays incomplete; ordinary catalog cards remain available for tracking while pricing or variant metadata is missing. Daily processing continues the queue with provider backoff and checkpoints. No paid plan was purchased.

## Collection and set plans

Choose a set to see collector-order cards, owned/missing counts, completion progress and verified price coverage. Standard counts its default printing per card. Master adds only verified applicable normal/holo/reverse records; First Edition, Shadowless and special goals remain separate. Master goals show when incomplete metadata may expand their totals. There is no assumption that every card has every printing.

Ownership records support Owned, Missing and Want to Buy, quantity, raw condition, exact variant, purchase price per card, purchase date, notes and desired entry price. Missing-only, missing Buy Now, Wait, biggest declines, editorial Pokémon popularity, cheapest missing and most expensive missing views support a set buying plan. Cost totals include only missing cards with fresh exact prices, explicitly naming unpriced missing cards and marking partial totals. Quantity does not inflate unique-card completion.

CSV export/import preserves records by stable printing key. Full JSON backups also include goals and preferences. Imports validate before saving; failed saves preserve the previous collection. Earlier starred cards migrate to Want to Buy. Background price refreshes preserve an unfinished collection form, and metadata changes cannot silently transfer ownership to another printing.

**Storage limitation:** ownership and preferences live in this browser on this device. Clearing site data, private browsing, switching devices or losing the phone can remove access. Export backups regularly. There is no account or cross-device sync yet. The collection schema and storage boundary are versioned so an authenticated service can be added later without tying ownership to a pricing provider.

## Research model and historical limits

The score retains the requested market-evidence weights and a configurable older-card preference. Settings offer 15%, 25% or 35% age weight and collectible-significance or equal-age treatment. The default caps age credit for commons/uncommons while favoring older collectible holos and chase cards. Changing age weight redistributes weight with set-relative value and correction; hard buying gates always apply. Price limits only filter the view and never suppress a fundamentally qualifying opportunity above $100.

Peers must match set, compatible rarity, printing and edition, within a reasonable price band. Buying requires verified recent prices, usable 90-day history, at least three peers, a meaningful correction and discount, relative value, stabilization over 7 and 14 days, and no broad set decline. Momentum also considers 30 days. Confidence is a separate indicator of identity, freshness, history and peer coverage; it is not a probability of profit. Liquidity, completed-sales volume and condition-specific Near Mint listing prices remain unavailable.

The default profile was evaluated using chronological training/test periods and 30-day holds. Held-out results were **45 positive signals out of 72 (62.50%)**, with **27 failed or flat**, a **+2.02% median price change**, **−40.51% worst hold return** and **−65.46% worst drawdown**. The previous algorithm had 62.50% positive signals, a +2.66% median and −31.10% worst drawdown. The broad benchmark had 62.96% positive holds and a +1.59% median. The original comparator retains its original $100 cap; the new model and benchmark span all prices.

These results do **not** demonstrate a reliable accuracy or risk advantage. Threshold selection used training outcomes only; held-out results did not drive retuning. Other preference profiles were not separately calibrated. Data begins in February 2024, even for vintage cards; present-day matches, survivorship, correlated cards, missing historical listings and excluded transaction costs limit conclusions. The [public evaluation](https://jacobhalvorson1998-ops.github.io/Pokeradar/evaluation.html) includes failed signals.

## Speed, automatic updates and checks

The complete initial index is about **657 KiB gzip**, without full histories. The client indexes sets once, renders 18 cards, loads sharp artwork lazily and retrieves a chart only when needed. Saved previews paint immediately, followed by the full IndexedDB snapshot and background refresh. Measured throttled mobile Chromium loading was about **3.1 seconds cold** and **1.4 seconds cached** at 4× CPU slowdown, 80 ms latency and 8 Mbps. These are browser-lab measurements, not physical-iPhone measurements. An optimized historical feature window produced identical results to full-history replay while reducing repeated work.

Daily GitHub Actions remain enabled around **9:18 AM Central in daylight time / 8:18 AM in winter**. Successful catalog and price times, coverage, unmatched records, history and provider errors/rate limits appear in Settings. Scheduled starts may be delayed by GitHub. A green provider run requires actual fresh verified quotes.

All **55 automated tests** and the local Chromium checks passed, including actual Base Set display, vintage holo classification, printing/edition separation, Standard/Master progress, ownership, CSV, saved settings, high-price opportunities, custom filters, stale data, offline loading, storage failure preservation and unfinished-form preservation. Final Chromium/WebKit deployment and public verification results will be recorded after publication.
