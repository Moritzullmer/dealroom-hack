"""Minimal Dealroom API client: cached token, 5 rps throttle, disk cache."""
import os, json, time, hashlib, urllib.request, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "data", "cache"); os.makedirs(CACHE, exist_ok=True)
BASE = "https://api.beta.dealroom.app"

def _env():
    e = {}
    for l in open(os.path.join(ROOT, ".env")):
        if "=" in l and not l.startswith("#"):
            k, v = l.strip().split("=", 1); e[k] = v
    return e
ENV = _env(); CID = ENV["DEALROOM_CLIENT_ID"]
_tok = {"v": None}; _last = [0.0]

def token():
    if _tok["v"]: return _tok["v"]
    f = os.path.join(CACHE, "token.json")
    if os.path.exists(f):
        t = json.load(open(f))
        if t["exp"] > time.time() + 300: _tok["v"] = t["tok"]; return t["tok"]
    body = json.dumps({"client_id": CID, "client_secret": ENV["DEALROOM_CLIENT_SECRET"],
        "audience": "https://api.beta.dealroom.app", "grant_type": "client_credentials"}).encode()
    r = urllib.request.Request("https://accounts.dealroom.co/oauth/token", body, {"Content-Type": "application/json"})
    tok = json.load(urllib.request.urlopen(r))["access_token"]
    json.dump({"tok": tok, "exp": time.time() + 80000}, open(f, "w")); os.chmod(f, 0o600)
    _tok["v"] = tok; return tok

def get(path, **params):
    q = urllib.parse.urlencode(params, safe="[]():,")
    url = f"{BASE}{path}" + (f"?{q}" if q else "")
    cf = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest() + ".json")
    if os.path.exists(cf): return json.load(open(cf))
    for attempt in range(5):
        wait = 0.22 - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        r = urllib.request.Request(url, headers={"Authorization": f"Bearer {token()}", "X-Client-Id": CID})
        try:
            d = json.load(urllib.request.urlopen(r)); json.dump(d, open(cf, "w")); return d
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(float(e.headers.get("Retry-After", 1))); continue
            raise RuntimeError(f"{e.code} {url} {e.read()[:300]}")
