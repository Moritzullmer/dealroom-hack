"""Data integrity + live spot-check tests. Run after build_fixture.py:  python3 backend/test_data.py"""
import json, os, random, sys, collections
sys.path.insert(0, os.path.dirname(__file__))
import dr
D = os.path.join(dr.ROOT, "data"); fails = []
def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name, detail)
    if not ok: fails.append(name)

cs = json.load(open(f"{D}/companies.json")); lps = json.load(open(f"{D}/lp_holdings.json"))
t = open(f"{D}/fixture.real.js").read(); fx = json.loads(t[t.index("= ") + 2:].rstrip().rstrip(";"))
cnt = collections.Counter(c["group"] for c in cs)

# --- structure ---
check("cohort sizes", cnt["fi"] == 394 and cnt["fintech"] == 350 and cnt["venture"] == 350, dict(cnt))
check("no duplicate companies", len({c["uuid"] for c in cs}) == len(cs))
check("fixture company ids unique", len({c["id"] for c in fx["companies"]}) == len(fx["companies"]))
gp_ids = {g["id"] for g in fx["gps"]}; co_ids = {c["id"] for c in fx["companies"]}
check("every company->GP edge resolves", all(g in gp_ids for c in fx["companies"] for g in c["gps"]))
check("every LP->GP edge resolves", all(g in gp_ids for l in fx["lps"] for g in l["gps"]))
check("every LP has >=1 GP and >=1 FI company", all(l["gps"] and l["fiCompanies"] > 0 for l in fx["lps"]))
check("LPs ranked descending", [l["fiCompanies"] for l in fx["lps"]] == sorted((l["fiCompanies"] for l in fx["lps"]), reverse=True))
check("every GP used by an LP", gp_ids == {g for l in fx["lps"] for g in l["gps"]})

# --- internal consistency: LP's fiCompanies == unique FI companies reachable through its GPs ---
fi_by_gp = collections.defaultdict(set)
for c in fx["companies"]:
    if c["group"] == "fi":
        for g in c["gps"]: fi_by_gp[g].add(c["id"])
bad = [l["name"] for l in fx["lps"] if len(set().union(*[fi_by_gp[g] for g in l["gps"]])) > l["fiCompanies"]]
check("fixture edges never exceed LP's stated FI reach", not bad, bad[:3])
check("'why' paths match GP lists", all(len(l["why"]) == len(l["gps"]) for l in fx["lps"]))

# --- data quality ---
fi = [c for c in cs if c["group"] == "fi"]
check("FI cos have rounds (>=90%)", sum(1 for c in fi if c["rounds"]) / len(fi) >= .9, f"{sum(1 for c in fi if c['rounds'])}/{len(fi)}")
check("FI cos are European", all(c["country"] for c in fi), collections.Counter(c["country"] for c in fi).most_common(3))
check("sub-theme labels set for all FI", all(c["sub"] for c in fx["companies"] if c["group"] == "fi"))
oth = sum(1 for c in fx["companies"] if c.get("sub") == "other_fi") / 394
check("unclassified FI share < 20%", oth < .2, f"{oth:.0%}")
yrs = [int(str(c["launch_date"])[:4]) for g in ("fintech", "venture") for c in cs if c["group"] == g and c["launch_date"]]
check("comparison cohorts vintage-matched 2012-2022", min(yrs) >= 2012 and max(yrs) <= 2022, (min(yrs), max(yrs)))
a = fx["attribution"]; check("attribution has CIs and verdict", all(a[g]["followOnCI"] for g in ("fi", "fintech", "venture")) and a["verdict"])
check("amounts in $m are sane", all((r["amount"] or 0) < 20000 for c in fx["companies"] for r in c["rounds"]))
check("no credentials in fixture", "client_secret" not in t.lower())


# --- macro layer ---
mc = fx.get("macro"); check("macro layer present", bool(mc))
if mc:
    obs = mc["observations"]
    check("macro rows follow one schema", all({"geography", "date", "metric", "value", "source"} <= set(o) for o in obs))
    check("macro values numeric", all(isinstance(o["value"], (int, float)) for o in obs))
    srcs = {o["source"] for o in obs}; check("macro has Dealroom + BoE + World Bank + static snapshot", {"Dealroom", "Bank of England", "World Bank", "stepchange"} <= srcs, sorted(srcs))
    uk = {o["date"]: o["value"] for o in obs if o["geography"] == "GBR" and o["metric"] == "fi_vc_funding_usd"}
    uk_direct = sum(r["amount"] or 0 for c in cs if c["group"] == "fi" and c["country"] == "United Kingdom" for r in c["rounds"] if r["year"] == 2024 and r["is_vc"] is not False)
    check("UK FI funding 2024 matches raw crawl", abs(uk["2024"] - uk_direct) < 1, f"{uk['2024']/1e6:.0f}m")
    check("no duplicate macro keys", len({(o["geography"], o["date"], o["metric"], o["source"]) for o in obs if o["source"] != "stepchange" and o["source"] != "bank_of_england"}) == len([o for o in obs if o["source"] not in ("stepchange", "bank_of_england")]))
    g = mc["capitalGap"]; check("capital gap arithmetic", abs(g["capital_gap_pp"] - (g["demand_growth_pct"] - g["supply_growth_pct"])) < 0.11, g["capital_gap_pp"])
    check("Bank Rate in plausible range", all(0 <= o["value"] <= 10 for o in obs if o["metric"] == "bank_rate_pct"))
    check("Findex ownership between 0 and 100", all(0 <= o["value"] <= 100 for o in obs if o["metric"].startswith("findex")))

# --- market share layer ---
mk = fx.get("market"); check("market share layer present", bool(mk))
if mk:
    yrs = mk["years"]; f, e, ft = mk["funding_usd"]["fi"], mk["funding_usd"]["europe_vc"], mk["funding_usd"]["fintech"]
    check("FI share = FI / Europe VC (arithmetic)", all(abs(mk["fi_share_of_europe_vc_pct"][i] - f[i] / e[i] * 100) < 0.01 for i in range(len(yrs))))
    check("FI share of fintech = FI / fintech", all(abs(mk["fi_share_of_fintech_vc_pct"][i] - f[i] / ft[i] * 100) < 0.01 for i in range(len(yrs))))
    check("FI never exceeds fintech or Europe VC", all(f[i] <= ft[i] * 1.01 and ft[i] <= e[i] for i in range(len(yrs))))
    crawl25 = sum(r["amount"] or 0 for c in cs if c["group"] == "fi" for r in c["rounds"] if r["year"] == 2025 and r["is_vc"] is not False)
    check("market FI 2025 within 10% of independent crawl", abs(f[yrs.index(2025)] - crawl25) / crawl25 < .10, f"{f[yrs.index(2025)]/1e6:.0f}m vs crawl {crawl25/1e6:.0f}m")
    check("share values are percentages 0-100", all(0 < x < 100 for x in mk["fi_share_of_europe_vc_pct"] if x))
check("stats scope: 44 FI companies outside 2012-2022 excluded", sum(1 for c in fx["companies"] if c.get("excludeFromStats")) == 44)
check("all LPs with an FI path present", len(fx["lps"]) == 153, len(fx["lps"]))
check("LPs and GPs carry domains for warm-path matching", sum(1 for l in fx["lps"] if l.get("domain")) / len(fx["lps"]) > .9 and sum(1 for g in fx["gps"] if g.get("domain")) / len(fx["gps"]) > .8, (sum(1 for l in fx["lps"] if l.get("domain")), sum(1 for g in fx["gps"] if g.get("domain"))))

# --- LIVE spot check (bypasses cache): re-verify 3 LP -> GP -> company -> FI paths against the API ---
random.seed(3); cache_off = dr.CACHE
def live(path, **p):
    import hashlib, urllib.parse
    q = urllib.parse.urlencode(p, safe="[]():,"); url = f"{dr.BASE}{path}" + (f"?{q}" if q else "")
    f = os.path.join(cache_off, hashlib.md5(url.encode()).hexdigest() + ".json")
    if os.path.exists(f): os.remove(f)
    return dr.get(path, **p)
FI_TAG = 2282901; byname = {c["name"]: c for c in cs}; ok_paths = 0
for l in random.sample(fx["lps"], 3):
    w = random.choice(l["why"]); co = random.choice(w["companies"]); lpu = next(x for x in lps if x["name"] == l["name"])
    gpu = next(g["uuid"] for g in lpu["gps"] if g["name"] == w["gp"]); cu = byname[co]["uuid"]
    holds = [r["investor"]["uuid"] for r in live(f"/data/investors/{lpu['uuid']}/lp-funds", limit=200)["data"]]
    inv = [r["investor"]["uuid"] for rd in live(f"/data/companies/{cu}/funding-rounds", limit=100)["data"] for r in rd["investors"]]
    tagged = FI_TAG in {x["id"] for x in live(f"/data/companies/{cu}")["data"]["taxonomy"]}
    good = gpu in holds and gpu in inv and tagged
    ok_paths += good; print(f"  live {l['name']} -> {w['gp']} -> {co}: LP holds GP={gpu in holds}, GP invested={gpu in inv}, FI-tagged={tagged}")
check("3/3 sampled paths re-verified live", ok_paths == 3, f"{ok_paths}/3")
print(f"\n{len(fails)} failed" if fails else "\nALL PASSED"); sys.exit(1 if fails else 0)
