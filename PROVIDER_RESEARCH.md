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
