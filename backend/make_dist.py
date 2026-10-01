"""Build dist/ for static hosting (Cloudflare Pages) WITHOUT any Dealroom data, and verify that.
The key terms forbid publishing/redistributing Dealroom data, so the public build ships only the code + the synthetic fixture.
Run: python3 backend/make_dist.py"""
import os, re, shutil, sys, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, "demo"), os.path.join(ROOT, "dist")
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
for f in sorted(os.listdir(SRC)):
    if f.startswith(".") or f in ("real-fixture.local.js",) or not f.endswith((".html", ".js", ".css", ".svg", ".png", ".ico")): continue
    shutil.copy(os.path.join(SRC, f), os.path.join(OUT, f))
open(os.path.join(OUT, "_headers"), "w").write("/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: no-cache\n")
# ---- verification: nothing from the Dealroom crawl may be in the bundle ----
bad = []
real_names = set()
for p, key in ((os.path.join(ROOT, "data", "companies.json"), "name"),):
    if os.path.exists(p): real_names = {c[key] for c in json.load(open(p)) if len(c[key]) > 5}
synthetic = open(os.path.join(OUT, "fixture.js")).read()
for f in os.listdir(OUT):
    t = open(os.path.join(OUT, f), errors="ignore").read()
    if f == "real-fixture.local.js": bad.append("real fixture file present")
    if re.search(r"DEALROOM_CLIENT_(ID|SECRET)|client_secret|github_pat_|AIza", t): bad.append(f"{f}: credential-like string")
    if f == "fixture.js":
        leaks = [n for n in real_names if n in t]
        if leaks: bad.append(f"fixture.js contains real company names: {leaks[:5]}")
        if '"realData"' in t and "true" in t[t.index('"realData"'):t.index('"realData"') + 20]: bad.append("fixture.js marked realData")
size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print("dist/:", ", ".join(sorted(os.listdir(OUT))), f"({size/1024:.0f} KB)")
if bad: print("FAILED:", *bad, sep="\n  "); sys.exit(1)
print("verified: no Dealroom data, no credentials; synthetic fixture only")
