# PokéRadar — iPhone-ready (2008+ Pokémon cards)

This project includes a mobile-first site, automated catalog discovery, and an intended daily pricing workflow. This archive is **not published** and live pricing has **not been verified**.

## Publishing without manually uploading files on iPhone

The ordinary ChatGPT GitHub connector is read-only, even when you have connected the correct account. Reconnecting it will not grant code-push rights. OpenAI documents **Codex** as the service for generating and pushing changes to GitHub.

1. Open Codex in ChatGPT (if available on your plan) and connect the GitHub repository `jacobhalvorson1998-ops/Pokeradar`.
2. Give Codex this ZIP or these project files, and ask it to unpack them into the repository root, commit the files, set up GitHub Pages Actions deployment, and run the tests.
3. In the GitHub repository go to Settings > Pages, select **GitHub Actions** as the source (if not already configured). Check Actions for workflow permission prompts.
4. Ask Codex to run the initial data-sync workflow and confirm an actual successful deployment before it reports a working link.

**Target, not yet verified as live:** https://jacobhalvorson1998-ops.github.io/Pokeradar/

## Content and data limitations

- Covers English card sets released 2008+, with **no fixed 153-card limit**. An existing starter list remains while progressive discovery collects more cards.
- Includes IR, SIR, alternate arts, Galarian Gallery / Trainer Gallery, and notable older chase rarities. Older cards get extra weighting; default sort prioritizes older cards.
- Intended raw Near Mint price filter under $100, with unverified prices clearly marked pending.
- Catalog and artwork: TCGdex. Intended pricing: TickerMint's TCGplayer-derived raw market aggregates. The pricing provider's access terms, API limits and matching must be confirmed during initial deployment.
- Price recommendations require fresh real history; the app must not invent prices or claim live updates before a successful run.
- The workflow discovers and prices cards progressively. It cannot guarantee all cards are present or priced after one run.

## Test commands

`node --test tests/sync.test.mjs`

`node --check site/app.js`
