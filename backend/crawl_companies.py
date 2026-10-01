"""Stage 1+2: FI / fintech / venture cohorts (Europe) + funding rounds (which also carry the GPs).
Run: python3 backend/crawl_companies.py   -> data/companies.json  (cached, resumable)"""
import json, os, dr
FI, FINTECH, EUROPE = 2282901, 126403, 76
N_COMPARE = 150
OUT = os.path.join(dr.ROOT, "data", "companies.json")

def page_all(path, cap, **p):
    out, cursor = [], None
    while len(out) < cap:
        q = dict(p, limit=min(100, cap - len(out)))
        if cursor: q["cursor"] = cursor
        d = dr.get(path, **q); out += d["data"]; cursor = d["page"].get("next_cursor")
        if not cursor or not d["data"]: break
    return out[:cap]

def tag_ids(c): return {t["id"] for t in c.get("taxonomy", [])}

def cohort(group):
    geo = f"hq_location[in_any]:{EUROPE}"
    if group == "fi":
        return page_all("/data/companies", 1000, filter=f"and(taxonomy_id[in_any]:{FI},{geo})")
    if group == "fintech":
        f = f"and(taxonomy_id[in_any]:{FINTECH},taxonomy_id[nin_any]:{FI},classification[in_any]:vc_backed,launch_date[gte]:2012,{geo})"
        return page_all("/data/companies", N_COMPARE, filter=f)
    rows = page_all("/data/companies", N_COMPARE * 3, filter=f"and(classification[in_any]:vc_backed,launch_date[gte]:2012,{geo})")
    return [c for c in rows if not tag_ids(c) & {FINTECH, FI}][:N_COMPARE]

def slim(c, group):
    loc = next((l for l in c.get("locations", []) if l.get("role") == "hq"), {})
    return {"uuid": c["uuid"], "name": c["name"], "group": group, "domain": c.get("domain"),
            "tagline": c.get("tagline"), "about": (c.get("about") or "")[:600],
            "country": (loc.get("country") or {}).get("name"), "launch_date": c.get("launch_date"),
            "status": c.get("status"), "exit_date": c.get("exit_date"),
            "tags": [t["name"] for t in c.get("taxonomy", []) if t.get("type") in ("sector", "sub_industry", "industry")]}

def rounds_for(uuid):
    rs = page_all(f"/data/companies/{uuid}/funding-rounds", 200)
    return [{"year": r["year"], "month": r.get("month"), "amount": r.get("amount"), "valuation": r.get("valuation"),
             "round": r.get("standardized_round") or r.get("round_type"), "is_vc": r.get("is_vc_round"), "is_exit": r.get("is_exit"),
             "investors": [{"uuid": i["investor"]["uuid"], "name": i["investor"]["name"], "lead": i.get("is_lead")} for i in r.get("investors", [])]}
            for r in rs]

if __name__ == "__main__":
    seen, companies = set(), []
    for g in ("fi", "fintech", "venture"):
        rows = cohort(g); print(g, len(rows))
        for c in rows:
            if c["uuid"] in seen: continue
            seen.add(c["uuid"]); companies.append(slim(c, g))
    for n, c in enumerate(companies, 1):
        c["rounds"] = rounds_for(c["uuid"])
        if n % 50 == 0: print(f"rounds {n}/{len(companies)}", flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(companies, open(OUT, "w"), indent=1)
    print("wrote", OUT, len(companies))
