# Provider coverage and commercial-use review — Issue #2

Reviewed October 19, 2026. No accounts were registered, keys requested, subscriptions purchased, or commercial arrangements changed. TickerMint remains the existing daily personal-research source. This review distinguishes direct observations from claims in the issue that still require independent confirmation.

## Findings and integration decision

| Source | History / granularity | Evidence and current access | Decision |
| --- | --- | --- | --- |
| TickerMint | Existing saved exact English printing series start February 8, 2024. Current imports have no condition-specific offer, listing depth or sales-count field. Daily snapshots are not live transactions. | Existing observations verified in the app. Developer, terms and store-repricing pages returned HTTP 403 in this cloud environment. Issue #2 reports noncommercial Free/Developer and commercial API Pro $49/month / Business $149/month; those current prices and grants remain unconfirmed here. | Keep the existing daily research workflow. **Provider-fed resale pricing is disabled** until the applicable commercial license is independently verified and the user approves any change. |
| Scrydex | Issue identifies `/pokemon/v1/cards/{id}/price_history`, variant/condition filters and date ranges. Earliest accessible observation, exact edition mapping, US price metric, vintage coverage, sample density and bulk limits remain unverified. | No authorized Scrydex binding exists. Official history/pricing/terms documentation returned HTTP 403. No authenticated history request was attempted and no pre-2024 claim is made. | Best candidate to investigate for condition-specific supplemental history, **not integrated**. A generic adapter and separately labeled history-import boundary are ready. |
| JustTCG | Issue reports tracking began March 2025. Could crosscheck current condition/variant prices; does not establish pre-2024 history. | Changelog returned HTTP 403; current rate limits, bulk retention and commercial/redistribution terms unverified. | No integration. A current crosscheck would remain a separate metric/condition/source segment. |
| PriceCharting | Issue says official API/CSV expose current prices only. Public historical charts do not confer API access or scraping rights. | Official API documentation returned HTTP 403. API cost, exact-printing matching, condition meanings and commercial export rights unverified. | No integration and no historical-chart scraping. Would be a separate current comparison only after terms and access verification. |
| TCGplayer | Official Market Price help describes averages based on recent actual sales, rather than an asking-price listing. That does not make a downstream raw-printing aggregate an executable condition-specific offer. | Market definition help page returned HTTP 200. Developer getting-started page returned HTTP 403. Issue reports new public API keys are no longer granted; no authorized new access exists in this task. | Exact-product links and user manual checks only. No API registration or unapproved scraping. |

## Authorized Scrydex evaluation still needed

Before activation, obtain an approved existing credential through secure workflow secrets and confirm the applicable contract; do not put keys in the browser, repository, report, or chat. No paid trial is authorized by the current task.

With provider authorization and a verified permitted plan, use a bounded, logged sample: Base Set Charizard Unlimited / First Edition / Shadowless; Jungle and Neo holos; Legendary Collection reverse; EX-era Gold Star; modern IR/SIR. Check NM, LP, MP, HP and damaged independently. Request the documented date range and record the first actual observation returned, missing dates, source metric, currency, edition, condition, pricing-update cadence and API pagination. Check at least one period before February 2024 only if the documented plan permits it; an empty response is not evidence of older coverage. Avoid interpolating or manufacturing daily observations. Confirm bulk/export rates, history retention, attribution, commercial resale decision use, public redistribution, caching/offline rights, termination deletion requirements and allowed live-comp access. A current quote alone does not verify archival coverage.

`scripts/import-source.mjs` accepts only a separately approved provider configuration with verified coverage and explicit approval. Each `PriceSource` observation includes exact ID/printing/edition/language/condition, provider, metric, observed date, fetched date, coverage start, quality and terms/provenance. Historical segments remain separate by provider, condition and metric. No legacy series has been imported. Disagreement compares only the same identity, condition, metric and observation date; a raw aggregate and an NM comp are not comparable.

Vendor Mode therefore uses **visibly manual condition comps and manual trend inputs**. It does not feed TickerMint prices or set returns into resale calculations. The general Set Market Pulse remains daily personal research. Current-comp buttons open provider/product links for manual checks; static GitHub Pages has no secret-bearing on-demand service. Adding such a service or changing provider licensing requires separate approval.

## Research evidence and sources

The environment network draft preserves the existing policy and adds official provider documentation and Playwright download domains. Saving a draft does not prove those sites are accessible or their terms verified. The repeatable `scripts/research-providers.py` reads public documentation only, preserves normal TLS verification, and records responses, content hashes and relevant excerpts. A second direct attempt from the GitHub-hosted runner in run 39306639575 returned HTTP 403 for all ten official documentation URLs, including Scrydex and TickerMint. The local TCGplayer market-definition response was 200. These access failures remain explicitly unverified; the runner did not establish any license grant. No bot challenge is solved or bypassed.

- https://tickermint.cards/developers
- https://tickermint.cards/terms
- https://tickermint.cards/developers/for/store-repricing
- https://scrydex.com/docs/pokemon/price-history
- https://scrydex.com/docs/getting-started/prices
- https://scrydex.com/terms
- https://justtcg.com/docs/changelog
- https://www.pricecharting.com/api-documentation
- https://docs.tcgplayer.com/docs/getting-started
- https://help.tcgplayer.com/hc/en-us/articles/213588017-TCGplayer-Market-Price

## NM / LP follow-up — October 19, 2026

Normal browsing now defaults to NM, with a persistent LP option. Neither view accepts TickerMint aggregate prices. There are currently **zero verified authorized NM observations and zero LP observations**. The public vintage-audit.html and vintage-audit.json reports compare 38 actual printing identities in both conditions (76 rows); they explicitly report unavailable condition prices. This does **not** satisfy the requested 20 independently verified condition-price comparisons, which remain blocked on authorized data access.

| Service | Vintage / First Edition / Shadowless | NM / LP and history | Rates / batch | Cost / commercial use | Decision |
| --- | --- | --- | --- | --- | --- |
| TickerMint, existing daily feed | Thirty actual printing series checked live across Base, Jungle, Fossil, Team Rocket, Neo, Legendary Collection and EX examples. Base Shadowless and First Edition share some product IDs but have separate printing keys. | Observed printing averages are not NM or LP. Actual sampled histories begin February 8, 2024; some First Edition quotes are stale. | Existing deduplication, whole-set CSV, global rate gate, retries, checkpoints retained. | Official developer and terms pages returned HTTP 403. Existing personal research continues; commercial Vendor integration remains disabled. | Retain as separate aggregate research. Five ordinary Unlimited bindings corrected from actual responses. |
| Scrydex | Per-variant support is described in the user-supplied requirements; independent vintage identity and coverage verification is pending. | Requested condition/date filters cannot yet be validated against authorized responses. Earliest actual history and NM/LP sample accuracy remain unknown. | Unverified; do not invent endpoint limits or claim batch support. | History docs, pricing and terms returned HTTP 403. Current prices and commercial rights unverified. | No integration, new account, paid request or subscription. |
| JustTCG | Condition/printing support is described in the user-supplied requirements; independent vintage and Shadowless tests are pending. | NM/LP fields, actual historical start and accuracy remain unverified here. | Unverified; batching will require official documentation and authorized validation. | Cards docs, pricing and terms returned HTTP 403. Current prices and commercial rights unverified. | No integration, new account, paid request or subscription. |

Nine official documentation/pricing/terms pages were read with normal TLS. Eight returned HTTP 403; TCGplayer’s official condition guide returned HTTP 200. Results, timestamps and source snippets are in data/condition_provider_research.json. No storefronts, listings or charts were scraped. TCGplayer standards are linked beside the condition selector and Vendor inspector. NM does not mean graded Mint/Gem Mint; condition must be inspected by the user.

A provider must pass authorization and terms review, exact English card/set/number/printing/edition identification, at least 20 vintage printing/condition samples, historical-date and rate/batch checks, and source-discrepancy review before its data is imported. Secrets belong in GitHub Actions settings, never public files or chat. Imported NM/LP observations require explicit card name, set ID/name, collector number, direct HTTPS reference, observation/retrieval dates and exact condition. Separate sources and metrics are never spliced. The latest verified observation is used; equal-date ties use source preference then source name. Values are never averaged or selected for being highest. Comparable same-date sources differing by the selected 15% or 20% threshold are marked Price Needs Review and withheld from opportunities.

The condition-only proposed 35/25/15/15/10 model and fixed 80+, 70–79 and 55–69 bands have a chronological evaluation runner, but **zero eligible condition histories**. They remain experimental. Aggregate-history results cannot establish an NM/LP buying edge. The old strict aggregate threshold of 90 remains unchanged in its separate diagnostics. Only a real entered offer within the condition-matched Vendor maximum may display Buy Now at This Price.
