# Dealroom probe findings (2026-10-01)

Client: `backend/dr.py` (cached token, 5 rps throttle, disk cache in data/cache). Secrets in `.env` (gitignored).
All list responses: `{data:[...], page:{total,limit,next_cursor}}`; IDs are **uuids**.

## Theme -> Companies
- Native tag: `taxonomy_id` 2282901 = "financial inclusion" (1,862 entities globally).
- Europe = `hq_location[in_any]:76`. Filter: `and(taxonomy_id[in_any]:2282901,hq_location[in_any]:76)` -> **394 companies**.
- Related tags for sub-themes: Microfinance 2138901, Micro Insurance 2134401, Credit Scoring 1351301, Financial Education 2177801, Bank 1183001. "remittance" has no tag -> use keyword rules on tagline/about.
- Caveat: HQ-in-Europe != serving Europe (e.g. Moniepoint is London HQ, serves Africa).

## Company -> GPs
- `/data/companies/{uuid}/investors` -> rows `{is_lead, rounds_count, last_round_date, investor:{uuid,name,...}}`.
- Also `/funding-rounds`, `/valuations` per company (for attribution).

## GP <-> LP  (direction matters!)
- `/data/investors/{id}/lp-funds` = GPs that THIS investor backs **as an LP** (BII: 177, IFC: 325). Rows nested under `.investor`.
- It does NOT return a GP's LPs. To get LPs of a GP we invert: crawl LP-role investors, intersect their lp-funds with our GP set.
- LP universe: `/data/investors?filter=roles[in_any]:limited_partner` -> 8,857 global, **2,798 in Europe** (~10 min crawl).
- Filter `lp_investor_id` also exists (GPs backed by a given LP).
- No commitment amount/date: rank by reach, not cheque size.
- "LP" role is noisy: includes VC firms (Index, Atomico, Seedcamp as LPs of micro-VCs). Filter by `investor_type` to get institutional LPs.

## Smoke test (40 largest EU FI companies, 100 EU LPs)
470 distinct investors on 40 companies; 35/100 LPs overlap. Top: Bpifrance, British Business Bank, AP1-4, Partners Group, British Patient Capital, Schroders Capital, Tesi.
