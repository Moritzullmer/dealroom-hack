"""Stage 3: institutional European LPs and the GPs each one backs (lp-funds).
Run: python3 backend/crawl_lps.py -> data/lp_holdings.json"""
import json, os, dr
from crawl_companies import page_all, EUROPE
TYPES = ["fund_of_funds", "pension_fund", "sovereign_wealth_fund", "family_office", "other"]
OUT = os.path.join(dr.ROOT, "data", "lp_holdings.json")

if __name__ == "__main__":
    lps = {}
    for t in TYPES:
        for x in page_all("/data/investors", 500, filter=f"and(roles[in_any]:limited_partner,hq_location[in_any]:{EUROPE},investor_type[in_any]:{t})"):
            lps[x["uuid"]] = {"uuid": x["uuid"], "name": x["name"], "type": t, "country": next((l.get("country", {}).get("name") for l in x.get("locations", []) if l.get("role") == "hq"), None),
                              "tagline": x.get("tagline"), "domain": x.get("domain")}
    print("LPs", len(lps))
    for n, lp in enumerate(lps.values(), 1):
        rows = page_all(f"/data/investors/{lp['uuid']}/lp-funds", 1000)
        lp["gps"] = [{"uuid": r["investor"]["uuid"], "name": r["investor"]["name"], "domain": r["investor"].get("domain")} for r in rows]
        if n % 50 == 0: print(f"{n}/{len(lps)}", flush=True)
    json.dump(list(lps.values()), open(OUT, "w"), indent=1)
    print("wrote", OUT, "LPs with holdings:", sum(1 for l in lps.values() if l["gps"]))
