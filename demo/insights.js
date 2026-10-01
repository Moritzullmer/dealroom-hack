/* "Is financial inclusion outperforming?" insight card, added above the existing chart in #analysis.
   Toggle: share of funding (FI as % of European VC / fintech VC) | follow-on rate by asset class | valuation increase by asset class.
   Reads DEMO_FIXTURE.market (market-level, backend/build_market.py) and DEMO_FIXTURE.companies (cohort samples). Self-contained. */
(function () {
  "use strict";
  var d = window.DEMO_FIXTURE, root = document.getElementById("analysis");
  if (!d || !d.market || !root) return;
  var m = d.market, yrs = m.years, esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var PAL = { fi: "#7957d5", fintech: "#3482bd", venture: "#9aaabc", credit: "#2f9e6e", credit_underwriting: "#0e9aa7", sme_finance: "#3b6fd4", financial_health: "#8a9a2b", insurance: "#64748b", remittances: "#9c6644", inclusive_banking: "#1e3a5f", other_fi: "#94a3b8" };
  var state = { view: "share", base: "vc" };

  /* ---------- numbers ---------- */
  function at(series, y) { return series[yrs.indexOf(y)]; }
  function chg(series, a, b) { var x = at(series, a), y = at(series, b); return x ? (y / x - 1) * 100 : null; }
  var fi = m.funding_usd.fi, eu = m.funding_usd.europe_vc, ft = m.funding_usd.fintech, last = m.partialYear - 1;   // latest full year
  var insight = (function () {
    var s25 = at(m.fi_share_of_europe_vc_pct, last), s21 = at(m.fi_share_of_europe_vc_pct, 2021), f25 = at(m.fi_share_of_fintech_vc_pct, last), f21 = at(m.fi_share_of_fintech_vc_pct, 2021);
    return { s25: s25, s21: s21, f25: f25, f21: f21, dFi: chg(fi, 2021, last), dEu: chg(eu, 2021, last), dFt: chg(ft, 2021, last) };
  })();

  function wilson(k, n) { if (!n) return [0, 0]; var z = 1.96, p = k / n, den = 1 + z * z / n, c = p + z * z / (2 * n), w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - w) / den, (c + w) / den]; }
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); if (!a.length) return null; var i = Math.floor(a.length / 2); return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2; }
  function perf(list) {
    var vc = list.map(function (c) { return c.rounds.length; }), k = vc.filter(function (x) { return x > 1; }).length;
    var steps = list.map(function (c) { var p = c.rounds.filter(function (r) { return r.valuation > 0; }); return p.length > 1 ? p[p.length - 1].valuation / p[p.length - 2].valuation : null; }).filter(Boolean);
    var ci = wilson(k, list.length), ms = median(steps);
    return { n: list.length, followOn: list.length ? k / list.length * 100 : null, lo: ci[0] * 100, hi: ci[1] * 100, stepN: steps.length, stepUp: ms == null ? null : (ms - 1) * 100 };
  }
  var comp = d.companies.filter(function (c) { return !c.excludeFromStats; });
  var classes = [{ label: "All Financial Inclusion", color: PAL.fi, list: comp.filter(function (c) { return c.group === "fi"; }) }]
    .concat((d.subthemes || []).map(function (s) { return { label: "  " + s.label, color: PAL[s.id] || PAL.fi, list: comp.filter(function (c) { return c.group === "fi" && c.sub === s.id; }) }; }))
    .concat([{ label: "European fintech (excl. FI)", color: PAL.fintech, list: comp.filter(function (c) { return c.group === "fintech"; }) }, { label: "European VC (excl. fintech)", color: PAL.venture, list: comp.filter(function (c) { return c.group === "venture"; }) }]);
  classes.forEach(function (c) { c.p = perf(c.list); });

  /* ---------- charts ---------- */
  function colChart(values, color) {
    var W = 720, H = 250, L = 44, R = 12, T = 22, B = 30, n = values.length, max = Math.max.apply(null, values.filter(function (v) { return v != null; })) * 1.15, bw = (W - L - R) / n;
    var s = ['<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="FI share of funding by year">'];
    for (var g = 0; g <= 4; g++) { var gy = T + (H - T - B) * (1 - g / 4); s.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="#e5ecf3"/><text x="' + (L - 6) + '" y="' + (gy + 3) + '" text-anchor="end" font-size="10" fill="#5b6f84">' + (max * g / 4).toFixed(1) + "%</text>"); }
    values.forEach(function (v, i) {
      if (v == null) return; var h = (H - T - B) * v / max, x = L + i * bw + bw * .18, y = H - B - h, partial = yrs[i] === m.partialYear;
      s.push('<rect x="' + x + '" y="' + y + '" width="' + bw * .64 + '" height="' + h + '" rx="3" fill="' + color + '" opacity="' + (partial ? .35 : 1) + '"><title>' + yrs[i] + ": " + v.toFixed(2) + "%" + (partial ? " (partial year)" : "") + "</title></rect>");
      s.push('<text x="' + (x + bw * .32) + '" y="' + (y - 5) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#213547">' + v.toFixed(1) + "</text>");
      s.push('<text x="' + (x + bw * .32) + '" y="' + (H - 11) + '" text-anchor="middle" font-size="10" fill="#5b6f84">' + yrs[i] + (partial ? "*" : "") + "</text>");
    });
    return s.join("") + "</svg>";
  }
  function rowChart(rows, key, fmt, axisMax) {
    var vals = rows.map(function (r) { return r.p[key]; }).filter(function (v) { return v != null; }), mx = axisMax || Math.max.apply(null, vals) * 1.1, lo = Math.min(0, Math.min.apply(null, vals));
    var rng = mx - lo;
    return '<div class="ins-rows">' + rows.map(function (r) {
      var v = r.p[key], low = r.p.n < 20, w = v == null ? 0 : Math.max(1.5, (Math.max(v, 0) - Math.max(lo, 0)) / rng * 100), whisk = "";
      if (key === "followOn" && v != null) whisk = '<i class="ins-ci" style="left:' + r.p.lo / mx * 100 + "%;width:" + (r.p.hi - r.p.lo) / mx * 100 + '%" title="95% interval ' + r.p.lo.toFixed(0) + "–" + r.p.hi.toFixed(0) + '%"></i>';
      return '<div class="ins-row' + (r.label.charAt(0) === " " ? " sub" : "") + '"><span class="ins-lab">' + esc(r.label.trim()) + '<small>n=' + (key === "stepUp" ? r.p.stepN + " priced" : r.p.n) + (low ? " · low n" : "") + '</small></span><span class="ins-track"><b style="width:' + w + "%;background:" + r.color + ";opacity:" + (low ? .45 : 1) + '"></b>' + whisk + '</span><span class="ins-val">' + (v == null ? "–" : fmt(v)) + "</span></div>";
    }).join("") + "</div>";
  }

  function subNote(ft2) {
    var subs = classes.slice(1, -2).filter(function (c) { return c.p.n >= 20; }), above = subs.filter(function (c) { return c.p.lo > ft2.followOn; }), below = subs.filter(function (c) { return c.p.hi < ft2.followOn; });
    var f = function (a) { return a.map(function (c) { return c.label.trim() + " (" + c.p.followOn.toFixed(0) + "%)"; }).join(", "); };
    return (above.length ? " Clearly above fintech: " + f(above) + "." : "") + (below.length ? " Clearly below: " + f(below) + "." : "") + (!above.length && !below.length ? " No sub-theme is clearly above or below." : "") + " With " + subs.length + " sub-themes tested, treat a single outlier cautiously.";
  }
  /* ---------- card ---------- */
  var card = document.createElement("div"); card.className = "card ins-card"; card.id = "insight-card";
  root.insertBefore(card, root.firstChild);
  var css = document.createElement("style");
  css.textContent = ".ins-card{padding:0}.ins-head{padding:18px 20px 6px}.ins-head h2{margin:0 0 4px;font-size:18px}.ins-seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;margin:10px 20px 0}.ins-seg button{border:0;background:#fff;padding:8px 13px;font:inherit;font-size:13px;font-weight:700;color:#40566c;cursor:pointer;border-right:1px solid var(--line)}.ins-seg button:last-child{border-right:0}.ins-seg button[aria-pressed=true]{background:var(--navy);color:#fff}.ins-sub{display:inline-flex;gap:6px;margin:10px 20px 0 12px}.ins-sub button{border:1px solid var(--line);background:#fff;border-radius:99px;padding:5px 11px;font:inherit;font-size:12px;font-weight:700;color:#40566c;cursor:pointer}.ins-sub button[aria-pressed=true]{background:#efeafc;border-color:#7957d5;color:#4b2fa0}.ins-body{padding:6px 20px 16px}.ins-big{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0 4px}.ins-big div{background:#f5f8fb;border-radius:10px;padding:10px 12px}.ins-big strong{display:block;font-size:22px;line-height:1.15}.ins-big span{font-size:11.5px;color:#52667b}.ins-read{margin:10px 0 0;padding:11px 13px;border-left:3px solid #7957d5;background:#f4f1fd;border-radius:0 8px 8px 0;font-size:14px;line-height:1.45;color:#1d2b3a}.ins-note{font-size:11.5px;color:#5b6f84;margin:8px 0 0}.ins-rows{margin-top:8px}.ins-row{display:grid;grid-template-columns:minmax(150px,230px) 1fr 64px;gap:10px;align-items:center;margin:7px 0;font-size:13px}.ins-row.sub .ins-lab{padding-left:14px;font-weight:500}.ins-lab{font-weight:700;color:#213547}.ins-lab small{display:block;font-size:11px;font-weight:500;color:#5b6f84}.ins-track{position:relative;height:16px;background:#eef2f6;border-radius:5px}.ins-track b{position:absolute;left:0;top:0;bottom:0;border-radius:5px}.ins-ci{position:absolute;top:5px;height:6px;border:1.5px solid #213547;border-top:0;border-bottom:0;background:linear-gradient(#213547,#213547) center/100% 1.5px no-repeat}.ins-val{text-align:right;font-weight:800}.ins-card svg{width:100%;height:auto;display:block}@media(max-width:700px){.ins-big{grid-template-columns:1fr}.ins-row{grid-template-columns:120px 1fr 52px}}";
  document.head.appendChild(css);
  function pctS(x, dp) { return x == null ? "–" : x.toFixed(dp == null ? 1 : dp) + "%"; }
  function signed(x) { return (x >= 0 ? "+" : "") + x.toFixed(0) + "%"; }

  function render() {
    var body = "", head;
    if (state.view === "share") {
      var series = state.base === "vc" ? m.fi_share_of_europe_vc_pct : m.fi_share_of_fintech_vc_pct, baseName = state.base === "vc" ? "European VC" : "European fintech VC";
      head = '<div class="ins-sub" role="group" aria-label="Share of">' + ["vc|of European VC", "ft|of European fintech VC"].map(function (o) { var p = o.split("|"); return '<button type="button" data-base="' + p[0] + '" aria-pressed="' + (state.base === p[0]) + '">' + p[1] + "</button>"; }).join("") + "</div>";
      body = '<div class="ins-big"><div><strong>' + pctS(state.base === "vc" ? insight.s25 : insight.f25, 2) + '</strong><span>FI share of ' + baseName + ", " + last + '</span></div><div><strong>' + pctS(state.base === "vc" ? insight.s21 : insight.f21, 2) + '</strong><span>same share in 2021 (peak funding year)</span></div><div><strong>' + signed(insight.dFi) + '</strong><span>FI funding 2021→' + last + " vs " + signed(state.base === "vc" ? insight.dEu : insight.dFt) + " for " + baseName + "</span></div></div>" +
        colChart(series, PAL.fi) +
        '<p class="ins-read"><strong>Insight:</strong> Financial Inclusion took ' + pctS(insight.s25, 2) + " of European VC in " + last + " (" + pctS(insight.f25, 1) + " of fintech VC), down from " + pctS(insight.s21, 2) + " / " + pctS(insight.f21, 1) + " in 2021. FI funding fell " + Math.abs(insight.dFi).toFixed(0) + "% against " + Math.abs(insight.dEu).toFixed(0) + "% for European VC overall, so the theme is receiving a shrinking slice of a shrinking market.</p>" +
        '<p class="ins-note">Market-level totals from Dealroom analytics: venture rounds, HQ in Europe region, Mature and Outside Tech excluded. FI = sector tag; fintech = industry tag. * ' + m.partialYear + " is a partial year (lighter bar).</p>";
    } else {
      var key = state.view === "follow" ? "followOn" : "stepUp", fmt = key === "followOn" ? function (v) { return v.toFixed(0) + "%"; } : function (v) { return (v >= 0 ? "+" : "") + v.toFixed(0) + "%"; };
      var allFi = classes[0].p, ft2 = classes[classes.length - 2].p, vc2 = classes[classes.length - 1].p;
      head = "";
      body = '<p class="ins-note" style="margin-top:12px">' + (key === "followOn" ? "Share of companies with 2+ venture rounds (whisker: 95% interval). Launched 2012–2022, so every group has had time to raise again." : "Median increase from the previous priced round to the latest, in % (companies with 2+ priced rounds only).") + "</p>" + rowChart(classes, key, fmt) +
        '<p class="ins-read"><strong>Reading:</strong> ' + (key === "followOn"
          ? "All FI: " + pctS(allFi.followOn, 0) + " vs " + pctS(ft2.followOn, 0) + " for other European fintech and " + pctS(vc2.followOn, 0) + " for other VC. " + (allFi.lo > ft2.hi ? "FI sits above the fintech interval." : allFi.hi < ft2.lo ? "FI sits below the fintech interval." : "The intervals overlap, so FI as a whole is not distinguishable from fintech.") + subNote(ft2)
          : "All FI: " + (allFi.stepUp == null ? "–" : signed(allFi.stepUp)) + " median step-up vs " + (ft2.stepUp == null ? "–" : signed(ft2.stepUp)) + " for other fintech and " + (vc2.stepUp == null ? "–" : signed(vc2.stepUp)) + " for other VC. Valuation data exists for only a subset of companies; treat differences as directional.") + "</p>";
    }
    card.innerHTML = '<div class="ins-head"><h2>Is financial inclusion outperforming?</h2><div class="small muted">Where the money is going, and how the asset class performs against fintech and VC.</div></div>' +
      '<div class="ins-seg" role="group" aria-label="View">' + [["share", "Share of funding"], ["follow", "Follow-on rounds"], ["step", "Valuation increase"]].map(function (o) { return '<button type="button" data-view="' + o[0] + '" aria-pressed="' + (state.view === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div>" + head + '<div class="ins-body">' + body + "</div>";
  }
  card.addEventListener("click", function (e) {
    var v = e.target.closest("[data-view]"), b = e.target.closest("[data-base]");
    if (v) { state.view = v.dataset.view; render(); } else if (b) { state.base = b.dataset.base; render(); }
  });
  render();
  window.insightState = state;
})();
