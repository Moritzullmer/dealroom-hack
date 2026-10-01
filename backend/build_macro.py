"""Macro / market-need layer. One schema for every source: {geography, date, metric, value, source}.
Sources: Dealroom (live, from crawl), Bank Rate (BoE IADB, live), World Bank (data/worldbank.json, pulled live),
UK consumer-stress signals (consumer_demand_signals.csv: StepChange / BoE / UK Finance / FCA, curated static).
Run after build_fixture.py:  python3 backend/build_macro.py   -> data/macro.json and merges `macro` into data/fixture.real.js"""
import csv, json, os, collections, urllib.request, dr
D = os.path.join(dr.ROOT, "data")
M = []
def add(geo, date, metric, value, source, **extra):
    if value is not None: M.append(dict(geography=geo, date=str(date), metric=metric, value=value, source=source, **extra))

# 1) Dealroom: FI capital supply by year (Europe and UK subset), from the crawled FI cohort
cs = [c for c in json.load(open(f"{D}/companies.json")) if c["group"] == "fi"]
for geo, pick in (("EUR", lambda c: True), ("GBR", lambda c: c["country"] == "United Kingdom")):
    funding, rounds, gps, formed = collections.Counter(), collections.Counter(), collections.defaultdict(set), collections.Counter()
    for c in cs:
        if not pick(c): continue
        if c["launch_date"]: formed[int(str(c["launch_date"])[:4])] += 1
        for r in c["rounds"]:
            if r["is_vc"] is False or not r["year"]: continue          # venture rounds only (is_vc_round)
            funding[r["year"]] += r["amount"] or 0; rounds[r["year"]] += 1
            for i in r["investors"]: gps[r["year"]].add(i["uuid"])
    for y in range(2015, 2027):
        add(geo, y, "fi_vc_funding_usd", funding[y], "Dealroom"); add(geo, y, "fi_funding_rounds", rounds[y], "Dealroom")
        add(geo, y, "fi_active_investors", len(gps[y]), "Dealroom"); add(geo, y, "fi_company_formation", formed[y], "Dealroom")

# 2) Bank of England Bank Rate (live, monthly -> year-end value)
try:
    u = "https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2015&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N"
    rows = list(csv.reader(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read().decode().splitlines()))[1:]
    last = {}
    for d, v in rows: last[d[-4:]] = (d, float(v))
    for y, (d, v) in last.items(): add("GBR", y, "bank_rate_pct", v, "Bank of England", observed=d)
    boe_ok = True
except Exception as e: boe_ok = False; print("BoE failed:", e)

# 3) World Bank (pulled live via browser; stored as data/worldbank.json)
wb = os.path.join(D, "worldbank.json")
if not os.path.exists(wb):   # no cached pull: use the team's connector (macro_sources.fetch_world_bank); fails soft if the API is unreachable
    try:
        import sys; sys.path.insert(0, dr.ROOT); import macro_sources as ms
        rows = ms.fetch_world_bank(["GBR", "USA", "DEU", "FRA"], 2011, 2025)
        json.dump({"source": "World Bank via macro_sources.py", "rows": [[r["country"], str(r["year"]), r["metric"], r["value"]] for r in rows]}, open(wb, "w"))
    except Exception as e: print("World Bank fetch failed:", str(e)[:100])
wb_ok = os.path.exists(wb)
if wb_ok:
    for geo, y, name, v in json.load(open(wb))["rows"]: add(geo, y, name, v, "World Bank")

# 4) UK consumer stress snapshot (curated static; partner's CSV)
sig = os.path.join(dr.ROOT, "consumer_demand_signals.csv")
for r in csv.DictReader(open(sig, encoding="utf-8-sig")):
    cmp = float(r["comparison_value"]) if r["comparison_value"].replace(".", "", 1).isdigit() else None
    add(r["country"], r["period"], r["metric"], float(r["value"]), r["source"], comparison_period=r["comparison_period"] or None, comparison_value=cmp, unit=r["unit"], role=r["signal_role"])

# 4b) FI share of European VC / fintech VC (market-level, backend/build_market.py)
ms = os.path.join(D, "market_share.json"); market = json.load(open(ms)) if os.path.exists(ms) else None
if market:
    for i, y in enumerate(market["years"]):
        add("EUR", y, "fi_vc_funding_market_usd", market["funding_usd"]["fi"][i], "Dealroom analytics"); add("EUR", y, "europe_vc_funding_usd", market["funding_usd"]["europe_vc"][i], "Dealroom analytics")
        add("EUR", y, "fintech_vc_funding_usd", market["funding_usd"]["fintech"][i], "Dealroom analytics")
        add("EUR", y, "fi_share_of_europe_vc_pct", market["fi_share_of_europe_vc_pct"][i], "Dealroom analytics"); add("EUR", y, "fi_share_of_fintech_vc_pct", market["fi_share_of_fintech_vc_pct"][i], "Dealroom analytics")

# 5) Capital gap (indicative): growth in underlying need vs growth in FI capital supply
def S(geo, metric, date): return next((m["value"] for m in M if m["geography"] == geo and m["metric"] == metric and m["date"] == str(date)), None)
stress = [("stepchange_full_advice_completions", "pct"), ("stepchange_credit_for_living_costs", "pp"), ("stepchange_clients_with_credit_card_debt", "pp"),
          ("stepchange_clients_with_personal_loan_debt", "pp"), ("boe_credit_card_borrowing_annual_growth", "level")]
sig_rows = [m for m in M if m["geography"] == "GBR" and m["metric"] == "stepchange_full_advice_completions" and m.get("comparison_value")]
def yoy(m): return (m["value"] / m["comparison_value"] - 1) * 100 if m["comparison_value"] else None
cmp_rows = {m["metric"]: m for m in M if m["geography"] == "GBR" and m["source"] == "stepchange" and m.get("comparison_value")}
rel = {k: ((v["value"] / v["comparison_value"] - 1) * 100) for k, v in cmp_rows.items()}   # relative % change per stress signal, Aug-26 vs Aug-25
demand_growth = round(sum(rel.values()) / len(rel), 1) if rel else None
f24, f25 = S("GBR", "fi_vc_funding_usd", 2024), S("GBR", "fi_vc_funding_usd", 2025)
supply_growth = round((f25 / f24 - 1) * 100, 1) if f24 and f25 else None
gap = {"demand_signals_up": sum(1 for v in rel.values() if v > 0), "demand_signals_total": len(rel), "demand_growth_pct": demand_growth,
       "demand_period": "Aug-2026 vs Aug-2025 (StepChange clients)", "supply_growth_pct": supply_growth, "supply_period": "FI VC funding 2025 vs 2024 (UK-HQ FI cohort, Dealroom)",
       "capital_gap_pp": round(demand_growth - supply_growth, 1) if demand_growth is not None and supply_growth is not None else None,
       "reading": None}
if gap["capital_gap_pp"] is not None:
    gap["reading"] = ("Need indicators are rising while FI capital " + ("fell" if supply_growth < 0 else "grew more slowly") + ": a positive gap points toward under-supplied capital, but this is indicative evidence only."
                      if gap["capital_gap_pp"] > 0 else "FI capital is growing faster than need indicators: no supply gap visible.")
sources = {"Dealroom": "live crawl", "Bank of England": "live" if boe_ok else "unavailable", "World Bank": "live (pulled via browser)" if wb_ok else "UNAVAILABLE (timed out)",
           "StepChange/FCA/UK Finance/BoE snapshot": "static, curated 2026-10-01", "US data": "World Bank macro + Findex only (no US consumer-stress series)"}
caveats = ["Capital gap compares periods that differ (Aug-26 vs Aug-25 stress; 2025 vs 2024 funding) and mixes a survey-based advice sample with VC totals: indicative, not a model.",
           "StepChange measures people seeking debt advice, not all UK consumers. Credit growth can reflect access as well as distress.",
           "Dealroom funding is the sum of venture rounds in the crawled FI cohort (hq Europe/UK); Dealroom's Mature and Outside-Tech default filters could not be applied at company level.",
           "Only the August 2026 StepChange / BoE / UK Finance snapshot is loaded; historical series and other FCA Financial Lives indicators are not yet extracted.",
           "2026 funding is a partial year, and the latest full year (2025) is probably still under-reported in Dealroom (late-added rounds), which biases supply growth down and the gap up."]
fx_market = market
macro = {"schema": "geography,date,metric,value,source", "sources": sources, "capitalGap": gap, "caveats": caveats, "observations": M}
json.dump(macro, open(f"{D}/macro.json", "w"), indent=1)
fp = f"{D}/fixture.real.js"; t = open(fp).read(); fx = json.loads(t[t.index("= ") + 2:].rstrip().rstrip(";")); fx["macro"] = macro; fx["market"] = market
open(fp, "w").write("// Generated from a live Dealroom crawl. Do not commit (data terms).\nwindow.DEMO_FIXTURE = " + json.dumps(fx, indent=1) + ";\n")
open(os.path.join(dr.ROOT, "demo", "real-fixture.local.js"), "w").write("// Local Dealroom snapshot (gitignored; data terms). Generated by backend/build_macro.py\nwindow.REAL_FIXTURE = " + json.dumps(fx) + ";\n")
print(len(M), "observations;", json.dumps(sources, indent=1)); print(json.dumps(gap, indent=1))
