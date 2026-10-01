# Data pipeline (branch `data`)

Builds `data/fixture.real.js` (same shape as `demo/fixture.js`, plus `sub`, `why`, `attribution`) from live Dealroom data.
Each person uses their OWN key; Dealroom data and `.env` are never committed (`data/` is gitignored; hackathon terms forbid redistribution).

```bash
cp <your>.env .env                  # DEALROOM_CLIENT_ID / DEALROOM_CLIENT_SECRET
python3 backend/smoke_test.py       # 5 PASS lines = key + every hop works
python3 backend/build_macro.py       # market-need layer: Dealroom supply + BoE Bank Rate + World Bank + UK stress snapshot -> data/macro.json, merged into fixture
python3 backend/test_data.py        # after build_fixture.py: 19 integrity checks + 3 live path re-verifications
python3 backend/crawl_companies.py  # 394 EU Financial Inclusion cos + rounds + investors (~3 min)
python3 backend/crawl_matched.py    # launch-year-matched fintech / venture comparison cohorts (~5 min)
python3 backend/crawl_lps.py        # ~394 institutional EU LPs and the GPs each backs (~2 min)
python3 backend/build_market.py      # market-level FI share of European VC / fintech VC (Dealroom analytics, default filters)
python3 backend/build_fixture.py    # classify sub-themes, LP->GP->company paths, attribution -> data/fixture.real.js
```
Standard library only. Responses are cached in `data/cache/`, so reruns are fast.
To preview: `build_macro.py` also writes `demo/real-fixture.local.js` (gitignored; picked up by `demo/fixture.js` as `window.REAL_FIXTURE`), then `cd demo && python3 -m http.server 8000` and open http://localhost:8000.
`demo/app.js` was minimally edited to take `years` / `windowTag` from the fixture; `demo/real-overrides.js` replaces the static verdict and marks exit rate n/c (comparison cohorts have no exit data).

## Method
- Theme: Dealroom sector tag `taxonomy_id` 2282901 "financial inclusion", HQ Europe (`hq_location` 76). Sub-themes: keyword rules (`SUBS` in build_fixture.py), unreviewed.
- Graph: Theme -> Company -> GP (investors on the company's funding rounds) -> LP. LP->GP edges come from `/investors/{id}/lp-funds`, which lists the GPs an LP backs (not a GP's LPs), so LPs are crawled and inverted. LP universe = European LP-role investors of type fund of funds, pension, sovereign wealth, family office, other.
- Attribution: companies launched 2012-2022; comparison cohorts are random samples matched to FI on launch year; bootstrap 95% CIs.

## Findings (2026-10-01 crawl)
- 394 FI companies; 1,174 investors; 179 are backed by an institutional EU LP; 134 FI companies reachable; 153 LPs connect to FI. Top: British Business Bank (34 cos / 21 GPs), KfW Capital, Export and Investment Fund of Denmark, British Patient Capital.
- FI follow-on 59% [54-64] vs fintech 55% [50-61] vs venture 51% [46-56]; median step-up 1.6x vs 1.57x vs 2.0x. FI is NOT distinguishable from fintech.
- Concentration: top 3 FI companies (SumUp, Teya, Marshmallow) = 54% of valuation, top 10% = 84%. Result is fintech beta plus a few winners, not a theme premium.

## Caveats (say these in the demo)
- "FI" tag includes large general fintechs (SumUp, Teya, Marshmallow); HQ in Europe != serving Europe (e.g. Moniepoint).
- Exit rates are NOT comparable: comparison cohorts were sampled VC-backed and carry no exit data. Don't claim an exit-rate result.
- LP-GP links carry no commitment size/date. "Indirect exposure" = paths, not ownership.
- demo/index.html still says "fictional fixture" and its readout text is static; change both before presenting real data.

## Macro / market-need panel (`demo/macro-panel.js`)
Adds a "4 · Market need" tab; self-contained (reads `DEMO_FIXTURE.macro`, does not touch `app.js`; one `<script>` line in `demo/index.html`).
All sources are normalised to `{geography, date, metric, value, source}`: Dealroom FI funding / rounds / active investors / company formation (UK and Europe), Bank of England Bank Rate (live, IADB CSV),
World Bank (GDP growth, unemployment, inflation, GDP per capita, Global Findex account ownership for GBR/USA/DEU/FRA), and the curated UK stress snapshot in `consumer_demand_signals.csv`.
Capital gap = growth in StepChange need signals (Aug-26 vs Aug-25) minus growth in UK FI VC funding (2025 vs 2024): indicative only, periods differ.
Not available: US consumer-stress series (FRED unreachable from the build machine), historical BoE credit series, other FCA Financial Lives indicators.

## Interface modules (demo/, all optional layers over app.js; real-data mode only)
- `insights.js`: "Is financial inclusion outperforming?" card with a toggle: share of funding (FI as % of European VC / fintech VC, market-level), follow-on rate by asset class (with 95% intervals), valuation increase by asset class.
- `company-explorer.js`: company-driven network. Search/click a company and only its investors (GPs) and the LPs behind them load; sub-theme filter; top-N caps with "Show all".
- `connections.js`: Warm paths. Connect Gmail (read-only `gmail.metadata`, From/To/Cc/Date only, processed in the browser, nothing stored) or use the labelled sample mailbox; scores each LP from contacts at the LP and at the GPs it backs. Needs your own Google OAuth client ID (setup steps are in the card). Not tested against a real mailbox.
- `polish.js`: answer strip (thesis verdict derived from the data), wording cleanup. `macro-panel.js`, `real-overrides.js` as before.
Run: `python3 backend/serve_demo.py` then open http://localhost:8000.

## Deploying (Cloudflare Pages)
`python3 backend/make_dist.py` builds `dist/` (code + synthetic fixture only; it verifies no Dealroom data or credentials are inside). Do NOT deploy `demo/real-fixture.local.js`: the key terms forbid publishing or redistributing Dealroom data.
Dashboard route (no install): Cloudflare > Workers & Pages > Create > Pages > Upload assets > drag the `dist` folder.
CLI route: `brew install node && npx wrangler login && npx wrangler pages deploy dist --project-name=inclusive-alpha`.
