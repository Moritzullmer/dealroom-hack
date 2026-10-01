"""Stage 4: classify FI sub-themes, build LP->GP->company paths, attribution stats, emit data/fixture.real.js
(same shape as demo/fixture.js DEMO_FIXTURE, plus extra fields: sub, why, attribution).
Run: python3 backend/build_fixture.py"""
import json, os, re, statistics, collections, dr
D = os.path.join(dr.ROOT, "data")
TOP_LPS = 10**6   # every LP with an FI path, so the company-driven graph can reach all of them
RANK_SHOWN = 25
SUBS = [  # first match wins; keyword rules on tagline/about/tags
    ("remittances", r"remittance|cross-border (payment|transfer)|money transfer|send money|diaspora"),
    ("insurance", r"insur|micro.?insurance|insurtech"),
    ("sme_finance", r"\bsme\b|small business|working capital|merchant|invoice|business loan|business bank|sole trader|freelanc"),
    ("credit_underwriting", r"credit scor|underwrit|thin.?file|open banking.*(lend|credit)|alternative data|affordab"),
    ("credit", r"\bcredit\b|\bloan|lending|borrow|mortgage|\bbnpl\b|buy now|overdraft|microfinance|micro.?loan"),
    ("financial_health", r"financial (health|wellbeing|wellness|education|literacy)|budget|saving|debt (advice|help)|money management|personal finance|financial planning"),
    ("inclusive_banking", r"neobank|digital bank|bank account|unbanked|underbanked|underserved|inclusive|mobile money|wallet|payments?"),
]
def classify(c):
    txt = " ".join([c.get("tagline") or "", c.get("about") or "", " ".join(c.get("tags", []))]).lower()
    for name, rx in SUBS:
        if re.search(rx, txt): return name
    return "other_fi"

def vintage(c):
    y = int(str(c["launch_date"])[:4]) if c["launch_date"] else 0
    return 2012 <= y <= 2022
SUB_LABEL = {"credit": "Consumer credit", "credit_underwriting": "Credit scoring & underwriting", "sme_finance": "SME finance", "financial_health": "Financial health & education",
             "insurance": "Insurance", "remittances": "Remittances & cross-border", "inclusive_banking": "Inclusive banking & payments", "other_fi": "Other FI"}
def mm(x): return round(x / 1e6, 2) if x else None
def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

cs = json.load(open(f"{D}/companies.json")); lps = json.load(open(f"{D}/lp_holdings.json"))
for c in cs: c["sub"] = classify(c) if c["group"] == "fi" else None
fi = [c for c in cs if c["group"] == "fi"]

# GP -> FI companies (investors from funding rounds)
gp_name, gp2co = {}, collections.defaultdict(set)
for c in fi:
    for r in c["rounds"]:
        for i in r["investors"]: gp2co[i["uuid"]].add(c["uuid"]); gp_name[i["uuid"]] = i["name"]
byid = {c["uuid"]: c for c in cs}

gp_domain = {g["uuid"]: g.get("domain") for l in lps for g in l["gps"]}
ranked = []
for l in lps:
    gs = [g for g in l["gps"] if g["uuid"] in gp2co]
    if not gs: continue
    cos = set().union(*[gp2co[g["uuid"]] for g in gs])
    subs = collections.Counter(byid[u]["sub"] for u in cos)
    ranked.append({"lp": l, "gps": gs, "cos": cos, "subs": subs, "score": (len(cos), len(gs))})
ranked.sort(key=lambda r: r["score"], reverse=True)
top = ranked[:TOP_LPS]
top_gp_ids = {g["uuid"] for r in top for g in r["gps"]}

def rounds_out(c):
    out = [{"year": r["year"], "amount": mm(r["amount"]) or 0, "valuation": mm(r["valuation"])} for r in sorted(c["rounds"], key=lambda r: (r["year"] or 0, r["month"] or 0)) if r["year"] and r["is_vc"] is not False]
    return out
def company_out(c):
    gps = sorted({f"gp-{i['uuid'][:8]}" for r in c["rounds"] for i in r["investors"] if i["uuid"] in top_gp_ids})
    o = {"id": c["uuid"][:8], "name": c["name"], "group": c["group"], "product": c["tagline"], "sub": c["sub"], "country": c["country"], "gps": gps, "rounds": rounds_out(c)}
    if c["group"] == "fi" and not vintage(c): o["excludeFromStats"] = True
    if c["exit_date"]: o["exit"] = {"year": int(str(c["exit_date"])[:4]), "type": "exit"}
    return o

def angle(r):
    s = [k.replace("_", " ") for k, _ in r["subs"].most_common(2)]
    return f"Already holds {len(r['gps'])} managers that backed {len(r['cos'])} European FI companies, mostly {' and '.join(s)}. Ask how it sees thematic exposure vs. generalist VC and whether a dedicated FI fund fits its allocation."
fixture = {
    "asOf": __import__("datetime").date.today().isoformat(),
    "theme": {"id": "theme-fi", "label": "Financial inclusion (Europe)"},
    "companies": [company_out(c) for c in cs],
    "gps": [{"id": f"gp-{u[:8]}", "name": gp_name[u], "domain": gp_domain.get(u)} for u in sorted(top_gp_ids)],
    "lps": [{"id": f"lp-{r['lp']['uuid'][:8]}", "name": r["lp"]["name"], "domain": r["lp"].get("domain"), "type": r["lp"]["type"].replace("_", " "),
             "gps": [f"gp-{g['uuid'][:8]}" for g in r["gps"]], "fiCompanies": len(r["cos"]), "subthemes": dict(r["subs"]), "angle": angle(r),
             "why": [{"gp": g["name"], "companies": sorted(byid[u]["name"] for u in gp2co[g["uuid"]])} for g in r["gps"]]} for r in top],
}

# --- attribution (does FI add anything beyond fintech, or is it a few winners?) ---
import random
random.seed(11)
def vintage_ok(c):
    y = int(str(c["launch_date"])[:4]) if c["launch_date"] else 0
    return 2012 <= y <= 2022
def sorted_rounds(c): return sorted([r for r in c["rounds"] if r["is_vc"] is not False], key=lambda r: (r["year"] or 0, r["month"] or 0))
def latest(c): return next((r["valuation"] for r in reversed(sorted_rounds(c)) if r["valuation"]), None)
def step(c):
    v = [r["valuation"] for r in sorted_rounds(c) if r["valuation"]]
    return v[-1] / v[-2] if len(v) >= 2 and v[-2] else None
def boot(vals, fn, n=2000):
    if len(vals) < 5: return None
    s = sorted(fn(random.choices(vals, k=len(vals))) for _ in range(n)); return [round(s[int(.025 * n)], 3), round(s[int(.975 * n)], 3)]
def stats(x):
    flags = [1 if len(sorted_rounds(c)) > 1 else 0 for c in x]
    steps = [v for v in map(step, x) if v]
    vals = sorted([v for v in map(latest, x) if v], reverse=True)
    k = max(1, round(len(vals) * .1))
    return {"n": len(x), "followOn": round(sum(flags) / len(x), 3), "followOnCI": boot(flags, lambda v: sum(v) / len(v)),
            "medianStepUp": round(statistics.median(steps), 2) if steps else None,
            "medianStepUpCI": boot(steps, statistics.median), "withValuation": len(vals),
            "top3ShareOfValue": round(sum(vals[:3]) / sum(vals), 3) if vals else None,
            "top10pctShareOfValue": round(sum(vals[:k]) / sum(vals), 3) if vals else None,
            "medianValuationM": mm(statistics.median(vals)) if vals else None,
            "meanOverMedianValuation": round(statistics.mean(vals) / statistics.median(vals), 1) if vals else None}
cohort = lambda g: [c for c in cs if c["group"] == g and vintage_ok(c)]
att = {g: stats(cohort(g)) for g in ("fi", "fintech", "venture")}
att["fi_by_subtheme"] = {sub: stats([c for c in cohort("fi") if c["sub"] == sub]) for sub in sorted({c["sub"] for c in fi})}
# selection: share of FI value held by top 3 companies, and what FI looks like without them
fi_c = [c for c in cohort("fi") if latest(c)]; top3 = sorted(fi_c, key=latest, reverse=True)[:3]
att["fi_ex_top3"] = stats([c for c in cohort("fi") if c not in top3]); att["fi_top3_names"] = [c["name"] for c in top3]
def verdict(a):
    f, t, v = a["fi"], a["fintech"], a["venture"]
    lo = lambda d: d["followOnCI"][0] if d["followOnCI"] else None; hi = lambda d: d["followOnCI"][1] if d["followOnCI"] else None
    sep = "FI follow-on rate sits outside the fintech 95% CI" if (lo(f) > hi(t) or hi(f) < lo(t)) else "FI follow-on rate is not distinguishable from fintech"
    return f"{sep}; FI top-3 hold {round(f['top3ShareOfValue']*100)}% of valuation vs {round(t['top3ShareOfValue']*100)}% fintech and {round(v['top3ShareOfValue']*100)}% venture."
att["verdict"] = verdict(att)
fixture["attribution"] = att
# --- fields the demo's real-data mode (demo/app.js, isReal) expects ---
all_vc = [r for c in cs for r in c["rounds"] if r["is_vc"] is not False]
fixture.update({
    "realData": True, "geography": "Europe (HQ)", "years": list(range(2018, 2026)), "windowTag": "USD millions · 2018-2025",
    "window": "Venture rounds to " + __import__("datetime").date.today().isoformat()[:7],
    "coverage": {"transactions": len(all_vc), "lpsWithFiCompanyLinks": len(ranked)},
    "taxonomy": {"financialInclusionSector": 2282901, "fintechIndustry": 126403},
    "lpCoverage": "Institutional European LPs only (fund of funds, pension, sovereign wealth, family office, other: 394 screened). LP-to-GP links are Dealroom-recorded relationships with no commitment size, date or vintage. Top 25 shown.",
    "graphCompanies": [c for c in fixture["companies"] if c["group"] == "fi" and c["gps"]],
    "exitComparable": False,
})
fixture["verdictText"] = att.get("verdict", "")
fi_v = [c for c in fi if vintage(c)]
fixture["subthemes"] = [{"id": k, "label": SUB_LABEL[k], "companies": sum(1 for c in fi if c["sub"] == k)} for k in SUB_LABEL if any(c["sub"] == k for c in fi)]
fixture["rankShown"] = RANK_SHOWN
fixture["caveats"] = ["Comparison cohorts were sampled as VC-backed, launched 2012+, first 150 returned: not randomised; exits not comparable.", "HQ in Europe does not imply serving European customers.", "LP-GP links are known relationships without commitment size or date."]
open(f"{D}/fixture.real.js", "w").write("// Generated from a live Dealroom crawl. Do not commit (data terms).\nwindow.DEMO_FIXTURE = " + json.dumps(fixture, indent=1) + ";\n")
print("sub-themes:", dict(collections.Counter(c["sub"] for c in fi)))
print(json.dumps(att, indent=1))
print("top LPs:"); [print(" ", l["name"], l["fiCompanies"], len(l["gps"]), l["subthemes"]) for l in fixture["lps"][:6]]
