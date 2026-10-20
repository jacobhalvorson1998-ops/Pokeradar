> Historical report. The user removed condition browsing; current behavior and validation are documented in [Market Restoration Report](MARKET_RESTORATION_REPORT.md).

# Condition-safe vintage upgrade

Live website: https://jacobhalvorson1998-ops.github.io/Pokeradar/

Implementation branch: feature/condition-safe-vintage. This extends the existing app and retains Set Market Pulse, My Sets, collection backups and preferences, and Vendor inventory.

## What changed

Normal browsing now defaults to Near Mint, with an obvious Lightly Played control. The preference survives reloads and full backups. Prices, changes, opportunity scores, confidence and entry targets use only exact selected-condition observations. Missing data reads NM Price Unavailable or LP Price Unavailable. TickerMint printing averages remain available in a clearly separated details section and Set Market Pulse; they never fill NM/LP gaps. Only exact, fresh, conflict-free condition prices receive green verification.

Cards Per Page offers 20 (default), 50 and 100 throughout card browsing, set goals, missing cards, collection, opportunities and search. Page size, condition, compact/detailed view and the 15%/20% review threshold are saved. Filtering resets to page one; existing collection and Vendor storage keys are retained. Larger pages keep lazy artwork and fetch histories only when details are opened. Dark emerald surfaces, larger artwork, vintage gold borders and clearer edition/condition labels improve scanning.

## Actual vintage findings

Thirty actual provider printing series were checked, with 38 representative catalog printings audited in both conditions (76 comparison rows). No verification prices were invented. The complete before/after table is published at vintage-audit.html, with structured evidence in vintage-audit.json and data/vintage_live_validation.json.

The live provider calls confirmed that Base Set ordinary Unlimited Charizard is product 42382 / Holofoil. First Edition Shadowless and Unlimited Shadowless share product 106999 but use 1st Edition Holofoil and Unlimited Holofoil respectively. The First Edition quote was September 19, 2026 ($10,000 aggregate); the Shadowless quote October 18 ($2,257.87 aggregate). These are distinct series, and neither is a verified NM quote. Legendary Collection product 84569 separates Holofoil ($274.99) and Reverse Holofoil ($975), both October 18 aggregates.

A genuine ordinary-printing naming mismatch was corrected using actual separate provider series plus card-specific declarations. Generic Holofoil requested a nonexistent series where the provider used Unlimited Holofoil. Recovered October 18 aggregate prices: Neo Discovery Espeon $365.17; Neo Genesis Lugia $534.65; Team Rocket Dark Charizard $380.85; Jungle Snorlax $163.58; Fossil Gengar $223.23. Existing primary card keys remain stable. Metadata corrections require review of previously saved printing identities; ownership is never silently moved between editions.

The full 1999–2012 audit flagged 93 saved records for identity or printing review; 2,519 priced records lacked independent product metadata in the bulk cache. Flagged records are excluded from published aggregate research, Pulse and historical evaluation. Some retained raw observations were already unusable because current printing metadata differed. Gender/spelling conventions (Nidoran M/F, Imposter/Impostor) and exact collector-number suffixes are normalized explicitly; fuzzy matching is not used. Other name/collector/printing problems remain withheld for review. Raw archives retain evidence for correction.

## Opportunities and Vendor

The proposed historical model uses 35% own-history/peer value, 25% stabilization/downside, 15% condition-specific set trend, 15% collector significance and 10% actual liquidity evidence. Own history can qualify without three peers, with lower confidence. Missing liquidity contributes zero. Severe decline produces Wait / Avoid. Strong Opportunity, Buy Candidate, Watch for Dip, Wait / Avoid and Insufficient Data are research categories, separate from actual offers.

The fixed 80+/70–79/55–69 bands use a weekly, chronological 65/35 training/holdout evaluator with 30-day holds and a training embargo. No condition histories are presently eligible, so these weights/bands remain experimental and no production condition recommendations were fabricated. The existing aggregate screener retains its strict threshold of 90. Full status: condition-evaluation.json.

Vendor keeps confirmed manual condition comps and the illustrative 80/70/62.5/55% trend bands, weaker card/set trend, fees, shipping, desired profit and risk reserves. An entered offer may show Buy Now at This Price only when positive, within the risk-adjusted maximum, meeting desired profit, backed by a fresh exact-condition comp, without a comparable-source conflict and with a known trend. A manual comp stays visibly labeled. A condition change clears the prior comp and confirmation. You can explicitly save up to 200 confirmed manual comps for offline reuse. They are keyed by exact English card/set/number/printing/edition/condition, included in full Vendor backups, remain labeled manual, and require inspection and confirmation again when loaded. Old saved comps display STALE and cannot produce a Buy Now at This Price label. Inventory CSV continues to contain lots only. The user must inspect condition; artwork and age never establish NM.

## Coverage and priority refresh

Settings separates NM, LP, vintage and missing-variant coverage from aggregate match/history/peer diagnostics. Provider requests remain deduplicated, globally rate-limited, retried with backoff and checkpointed. Personal keys and selected My Sets can be explicitly exported for prioritization; they are not automatically uploaded.

The existing authenticated GitHub Actions refresh workflow now accepts one exact card key OR set ID. Inputs are validated against the catalog, capped at 5,000 printing records, serialized with daily updates and limited to one priority request per hour using saved request timestamps. No public browser API endpoint or credentials were added. This improves the existing authorized aggregate refresh; NM/LP refresh needs an approved condition provider and validated batching contract.

## Remaining provider work

There are **zero verified NM prices and zero verified LP prices** in the authorized dataset. Thus the requested 20 verified condition-specific before/after price comparisons, validated NM/LP source crosschecks, condition-model calibration and automatic NM/LP recommendations remain incomplete. The comparison report shows unavailable values honestly.

Scrydex and JustTCG official docs/pricing/terms returned HTTP 403 here; actual vintage/Shadowless coverage, earliest history, limits, batch support, costs and commercial permissions remain unverified. TCGplayer’s condition guide was accessible and is linked in the app. No subscriptions, accounts, scraping, paid API requests or commercial data arrangements were enabled. Authorized provider access and licensing approval are required before enabling condition data. Current costs must be confirmed directly before any purchase; earlier issue estimates are not independently verified pricing.

## Validation

Published application release: `13ef629382112943a96a9abf36ea769bc9dc7024`.

Successful Pages deployment and public checks: https://github.com/jacobhalvorson1998-ops/Pokeradar/actions/runs/39321812966

All 81 unit tests passed. Mobile Chromium and native WebKit each passed collection/backups, Vendor/offline inventory and saved manual comps, and condition/100-card browsing workflows before deployment. The public HTTPS website then passed both mobile engines, including 100-card compact scrolling and preference persistence, vintage sets, collection persistence, separate Legendary Collection reverse history, and actual-offer labels only within the manual condition-matched maximum. TLS verification stayed enabled throughout. These are iPhone-sized browser tests at 390 × 844, not measurements from a physical iPhone.

Publication-run Chromium measurements: **2.762 seconds cold / 0.585 seconds cached**, with 4× CPU slowdown, 80 ms latency and roughly 8 Mbps download. Native WebKit: **3.063 seconds cold / 0.069 seconds cached**, without those Chromium-specific throttles. Switching to 100 cards took around 0.21 seconds in the separate local Chromium check. The initial index stays below 1 MB gzip and contains no full histories; artwork and opened details load separately.

The verified public snapshot was built October 19, 2026 at 20:47:18 UTC. It contains 21,256 base cards and 27,470 printing records, 7,256 fresh aggregate research prices, 7,158 history-ready aggregate records, 4,793 unmatched records and 15,082 missing/ambiguous variant records. The vintage audit withholds 93 cached identity/printing problems. NM coverage is 0/27,470 and LP coverage is 0/27,470. The separate legacy aggregate diagnostics show 0 strict signals, 1,092 Wait, 5,462 Watch and 20,916 Insufficient Data. These counts are dated snapshot observations, not permanently fixed totals.

A later backend repair (`c8b308db`) also passes all 81 unit tests: successful exact-price reverification clears an obsolete review marker while replacing any mismatched-product history with the newly verified series. Daily and authenticated priority refreshes continue through the existing workflow; they do not create condition prices or authorize new providers.

Reusable cloud startup instructions were updated for the 81-test suite, three mobile workflows and condition/manual-comp rules. They were saved as a draft; publishing that reusable cloud environment in Environment settings is separate from the already completed website deployment. Synthetic source/price fixtures run only inside tests and never enter site data.
