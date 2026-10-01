"""Market-level VC funding flowing into Financial Inclusion, as a share of European VC and of European fintech VC.
Uses /analytics/timeseries (metric vc_funding) with the Dealroom defaults from the analysis guide:
venture rounds only (the metric), Mature excluded (growth_stage 412), Outside Tech excluded (taxonomy 1102801),
VC funding attributed by HQ, Europe = region 76. FI = sector tag 2282901; fintech = industry tag 126403.
Run: python3 backend/build_market.py -> data/market_share.json"""
import json, os, time, dr
GEO, DEF = "hq_location[in_any]:76", "growth_stage[nin_any]:412,taxonomy_id[nin_any]:1102801"
SERIES = {"europe_vc": [f"and({GEO},{DEF})"],
          "fintech": [f"and({GEO},{DEF},taxonomy_id[in_any]:126403)", f"and({GEO},taxonomy_id[nin_any]:1102801,growth_stage[nin_any]:412,taxonomy_id[in_any]:126403)"],
          "fi": [f"and({GEO},{DEF},taxonomy_id[in_any]:2282901)"]}
def fetch(filters):
    last = None
    for f in filters:                       # the API occasionally 500s on one spelling of a filter; retry another
        for _ in range(3):
            try: return {r["year"]: r["value"] for r in dr.get("/analytics/timeseries", metric="vc_funding", year_min="2015", year_max="2026", filter=f)["data"]}
            except Exception as e: last = e; time.sleep(2)
    raise last
if __name__ == "__main__":
    raw = {k: fetch(v) for k, v in SERIES.items()}
    years = sorted(raw["europe_vc"])
    pct = lambda a, b: [round(raw[a].get(y, 0) / raw[b][y] * 100, 2) if raw[b].get(y) else None for y in years]
    out = {"years": years, "partialYear": max(years), "currency": "USD", "geography": "Europe region (HQ), id 76",
           "definitions": {"europe_vc": "All European VC (Mature and Outside Tech excluded)", "fintech": "Fintech industry (126403)", "fi": "Financial Inclusion sector tag (2282901)"},
           "funding_usd": {k: [raw[k].get(y) for y in years] for k in raw},
           "fi_share_of_europe_vc_pct": pct("fi", "europe_vc"), "fi_share_of_fintech_vc_pct": pct("fi", "fintech")}
    json.dump(out, open(os.path.join(dr.ROOT, "data", "market_share.json"), "w"), indent=1)
    for y, a, b in zip(years, out["fi_share_of_europe_vc_pct"], out["fi_share_of_fintech_vc_pct"]): print(y, f"FI {raw['fi'][y]/1e6:7.0f}m  = {a}% of Europe VC, {b}% of fintech")
