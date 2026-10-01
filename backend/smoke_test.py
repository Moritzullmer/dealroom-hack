"""Run: python3 backend/smoke_test.py  -> checks each hop of Theme -> Company -> GP -> LP."""
import dr
FI, EUROPE = 2282901, 76
def check(name, ok, detail=""): print(("PASS " if ok else "FAIL ") + name, detail); return ok

tok = dr.token(); check("1 auth token", len(tok) > 500)
cos = dr.get("/data/companies", filter=f"and(taxonomy_id[in_any]:{FI},hq_location[in_any]:{EUROPE})", limit=3, include_total="true")
check("2 theme -> companies", cos["page"]["total"] > 100, f"total={cos['page']['total']}")
cid = cos["data"][0]["uuid"]
invs = dr.get(f"/data/companies/{cid}/investors", limit=10)["data"]
check("3 company -> GPs", len(invs) > 0, f"{len(invs)} investors for {cos['data'][0]['name']}")
lps = dr.get("/data/investors", filter=f"and(roles[in_any]:limited_partner,hq_location[in_any]:{EUROPE})", limit=3, include_total="true")
check("4 LP universe", lps["page"]["total"] > 1000, f"total={lps['page']['total']}")
lp = lps["data"][0]; held = dr.get(f"/data/investors/{lp['uuid']}/lp-funds", limit=5)["data"]
check("5 LP -> GPs it backs", len(held) > 0 and "investor" in held[0], f"{lp['name']} backs {len(held)}+")
