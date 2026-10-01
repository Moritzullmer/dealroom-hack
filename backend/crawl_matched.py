"""Replace fintech/venture comparison cohorts with launch-year-matched random samples (2012-2022) of the FI cohort.
Run: python3 backend/crawl_matched.py   (rewrites comparison rows in data/companies.json)"""
import json, os, random, collections
import dr
from crawl_companies import page_all, slim, rounds_for, tag_ids, FI, FINTECH, EUROPE, OUT
random.seed(7)
cs = json.load(open(OUT)); fi = [c for c in cs if c["group"] == "fi"]
want = collections.Counter(int(str(c["launch_date"])[:4]) for c in fi if c["launch_date"] and 2012 <= int(str(c["launch_date"])[:4]) <= 2022)
keep = [c for c in fi]; seen = {c["uuid"] for c in keep}
for group in ("fintech", "venture"):
    for y, n in sorted(want.items()):
        base = f"hq_location[in_any]:{EUROPE},classification[in_any]:vc_backed,launch_date[gte]:{y},launch_date[lte]:{y}"
        f = f"and(taxonomy_id[in_any]:{FINTECH},taxonomy_id[nin_any]:{FI},{base})" if group == "fintech" else f"and({base})"
        pool = page_all("/data/companies", 300, filter=f)
        if group == "venture": pool = [c for c in pool if not tag_ids(c) & {FINTECH, FI}]
        pool = [c for c in pool if c["uuid"] not in seen]
        pick = random.sample(pool, min(n, len(pool)))
        for c in pick:
            seen.add(c["uuid"]); r = slim(c, group); r["rounds"] = rounds_for(c["uuid"]); keep.append(r)
        print(group, y, f"{len(pick)}/{n} (pool {len(pool)})", flush=True)
json.dump(keep, open(OUT, "w"), indent=1)
print({g: sum(1 for c in keep if c["group"] == g) for g in ("fi", "fintech", "venture")})
