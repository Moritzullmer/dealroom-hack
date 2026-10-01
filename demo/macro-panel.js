/* "Market need" tab: demand/stress signals vs FI capital supply. Self-contained: reads window.DEMO_FIXTURE.macro
   (normalised rows {geography,date,metric,value,source}), adds a tab + panel, touches nothing in app.js. */
(function () {
  "use strict";
  var macro = (window.DEMO_FIXTURE || {}).macro;
  if (!macro) return;
  var obs = macro.observations, gap = macro.capitalGap;
  function get(geo, metric) { return obs.filter(function (o) { return o.geography === geo && o.metric === metric; }); }
  function fmtUsd(v) { return v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "bn" : "$" + Math.round(v / 1e6) + "m"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  function bars(rows, fmt, color) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    return '<div class="mp-bars">' + rows.map(function (r) {
      return '<div class="mp-bar"><span class="mp-lab">' + esc(r.date) + '</span><span class="mp-track"><i style="width:' + Math.max(2, r.value / max * 100) + '%;background:' + color + '"></i></span><span class="mp-val">' + fmt(r.value) + '</span></div>';
    }).join("") + '</div>';
  }
  var fundingRows = get("GBR", "fi_vc_funding_usd").filter(function (o) { return +o.date >= 2018 && +o.date <= 2025; });
  var rateRows = get("GBR", "bank_rate_pct").filter(function (o) { return +o.date >= 2018; });
  var findex = get("GBR", "findex_account_ownership").concat(get("USA", "findex_account_ownership"));
  var snap = obs.filter(function (o) { return o.geography === "GBR" && o.comparison_value != null && o.source === "stepchange"; });

  var stress = snap.map(function (o) {
    var d = o.value - o.comparison_value;
    return '<tr><td>' + esc(o.metric.replace(/^stepchange_/, "").replace(/_/g, " ")) + '</td><td>' + o.value + ' <span class="small muted">' + esc(o.unit) + '</span></td><td>' + o.comparison_value + '</td><td class="' + (d > 0 ? "mp-up" : "mp-down") + '">' + (d > 0 ? "▲ " : "▼ ") + Math.abs(d).toFixed(o.unit.indexOf("percent") >= 0 ? 0 : 0) + '</td></tr>';
  }).join("");

  var html = '<div class="card"><div class="card-head"><div><h2>Is the underlying need there?</h2><div class="small muted">Market need (stress, exclusion) versus where FI venture capital is actually going.</div></div><span class="tag">Indicative, not a model</span></div>' +
    '<div class="kpis">' +
    '<div class="kpi"><div class="small muted">NEED INDICATORS RISING</div><strong>' + gap.demand_signals_up + ' of ' + gap.demand_signals_total + '</strong><div class="small muted">' + esc(gap.demand_period) + '</div></div>' +
    '<div class="kpi"><div class="small muted">AVG GROWTH IN NEED SIGNALS</div><strong>' + (gap.demand_growth_pct > 0 ? "+" : "") + gap.demand_growth_pct + '%</strong><div class="small muted">StepChange clients, UK</div></div>' +
    '<div class="kpi"><div class="small muted">FI VC FUNDING GROWTH</div><strong>' + (gap.supply_growth_pct > 0 ? "+" : "") + gap.supply_growth_pct + '%</strong><div class="small muted">' + esc(gap.supply_period) + '</div></div>' +
    '<div class="kpi"><div class="small muted">CAPITAL GAP (need − supply)</div><strong>' + (gap.capital_gap_pp > 0 ? "+" : "") + gap.capital_gap_pp + ' pp</strong><div class="small muted">positive = under-supplied</div></div></div>' +
    '<p class="note"><strong>Reading:</strong> ' + esc(gap.reading || "") + '</p></div>' +
    '<div class="analysis-grid"><div class="card"><div class="card-head"><h2>FI venture funding, UK-HQ cohort</h2><span class="small muted">Dealroom, venture rounds, USD</span></div>' + bars(fundingRows, fmtUsd, "#7957d5") + '</div>' +
    '<div class="card"><div class="card-head"><h2>Bank Rate, year-end</h2><span class="small muted">Bank of England, %</span></div>' + bars(rateRows, function (v) { return v.toFixed(2) + "%"; }, "#3482bd") + '</div></div>' +
    '<div class="analysis-grid"><div class="card"><div class="card-head"><h2>UK consumer stress, Aug 2026 vs Aug 2025</h2><span class="small muted">StepChange advice clients (not all consumers)</span></div><div style="overflow:auto"><table class="metric-table"><thead><tr><th>Signal</th><th>Now</th><th>Year ago</th><th>Change</th></tr></thead><tbody>' + stress + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-head"><h2>Account ownership (Global Findex)</h2><span class="small muted">% of adults 15+, World Bank</span></div>' +
    (findex.length ? '<table class="metric-table"><thead><tr><th>Country</th><th>Year</th><th>%</th></tr></thead><tbody>' + findex.sort(function (a, b) { return a.geography.localeCompare(b.geography) || b.date - a.date; }).slice(0, 8).map(function (o) { return '<tr><td>' + o.geography + '</td><td>' + o.date + '</td><td>' + o.value.toFixed(1) + '</td></tr>'; }).join("") + '</tbody></table>' : '<p class="note">World Bank data not loaded.</p>') + '</div></div>' +
    '<div class="card"><h3>Sources and caveats</h3><ul class="small">' + Object.keys(macro.sources).map(function (k) { return '<li><strong>' + esc(k) + ':</strong> ' + esc(macro.sources[k]) + '</li>'; }).join("") + '</ul><ul class="small muted">' + macro.caveats.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join("") + '</ul></div>';

  var style = document.createElement("style");
  style.textContent = ".mp-bars{padding:8px 4px}.mp-bar{display:grid;grid-template-columns:44px 1fr 70px;gap:8px;align-items:center;font-size:12px;margin:5px 0}.mp-track{background:#eef2f6;border-radius:4px;height:14px;overflow:hidden}.mp-track i{display:block;height:100%}.mp-val{text-align:right;font-weight:600}.mp-up{color:#b3261e;font-weight:700}.mp-down{color:#1a7f4b;font-weight:700}";
  document.head.appendChild(style);
  var firstTab = document.querySelector(".tab"); if (!firstTab) return;
  var tab = document.createElement("button"); tab.className = firstTab.className.replace("active", "").trim(); tab.dataset.panel = "marketneed"; tab.textContent = "1 · Market need";
  firstTab.parentNode.insertBefore(tab, firstTab.parentNode.firstChild);   // Market need is the first tab
  var panel = document.createElement("section"); panel.className = "panel"; panel.id = "marketneed"; panel.innerHTML = html;
  document.getElementById("prospects").insertAdjacentElement("afterend", panel);
  tab.addEventListener("click", function () {
    document.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("active", x === tab); });
    document.querySelectorAll(".panel").forEach(function (x) { x.classList.toggle("active", x === panel); });
  });
})();
