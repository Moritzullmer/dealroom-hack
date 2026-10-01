/* Company-driven network: pick (or search) a company and the graph loads only that company's path
   FI theme -> company -> its round investors (GPs) -> the LPs that back those GPs.
   Also: sub-theme filter + top-N caps for LP / theme views. Uses app.js's focusUI / focusRefresh and its [data-node] click routing. */
(function () {
  "use strict";
  var d = window.DEMO_FIXTURE, ui = window.focusUI, host = document.querySelector("#network .cy-wrap");
  if (!d || !d.realData || !ui || !host) return;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var PAL = { credit: "#2f9e6e", credit_underwriting: "#0e9aa7", sme_finance: "#3b6fd4", financial_health: "#8a9a2b", insurance: "#64748b", remittances: "#9c6644", inclusive_banking: "#1e3a5f", other_fi: "#94a3b8" };
  var fiCos = (d.graphCompanies || d.companies).filter(function (c) { return c.group === "fi" && c.gps.length; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  function lpsOf(c) { return d.lps.filter(function (l) { return l.gps.some(function (g) { return c.gps.indexOf(g) !== -1; }); }); }
  var best = fiCos.map(function (c) { return { c: c, n: lpsOf(c).length }; }).sort(function (a, b) { return b.n - a.n; })[0];

  function pick(id) {      // reuse app.js routing: its body click handler opens whatever [data-node] was clicked
    var b = document.createElement("button"); b.dataset.node = id; b.style.display = "none"; document.body.appendChild(b); b.click(); b.remove();
  }
  var bar = document.createElement("div"); bar.className = "ce-bar";
  bar.innerHTML = '<div class="ce-row"><label class="ce-search"><span>Company</span><input id="ce-input" list="ce-list" placeholder="Search ' + fiCos.length + ' FI companies…" autocomplete="off"></label>' +
    '<datalist id="ce-list">' + fiCos.map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join("") + "</datalist>" +
    '<div class="ce-try"><span>Try</span>' + fiCos.map(function (c) { return { c: c, n: lpsOf(c).length }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 4).map(function (o) { return '<button type="button" data-co="' + o.c.id + '">' + esc(o.c.name) + "</button>"; }).join("") + "</div></div>" +
    '<div class="ce-row ce-filters" id="ce-filters"><span>Sub-theme</span><button type="button" data-sub="" aria-pressed="true">All</button>' + (d.subthemes || []).map(function (s) { return '<button type="button" data-sub="' + s.id + '" aria-pressed="false"><i style="background:' + (PAL[s.id] || "#999") + '"></i>' + esc(s.label) + "</button>"; }).join("") + "</div>" +
    '<div class="ce-row ce-status"><span id="ce-status"></span><button type="button" id="ce-more"></button></div>';
  host.parentNode.insertBefore(bar, host);

  var css = document.createElement("style");
  css.textContent = ".ce-bar{padding:12px 18px;border-bottom:1px solid var(--line);background:#fbfcfe}.ce-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:4px 0}.ce-search{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#52667b}.ce-search input{font:inherit;font-size:14px;padding:8px 11px;border:1px solid #b8c6d4;border-radius:8px;min-width:250px;color:#132438;background:#fff}.ce-search input:focus{outline:2px solid #3482bd;outline-offset:1px}.ce-try{display:flex;gap:6px;align-items:center;font-size:12px;color:#52667b}.ce-try button,.ce-filters button,#ce-more{border:1px solid var(--line);background:#fff;border-radius:99px;padding:5px 11px;font:inherit;font-size:12px;font-weight:700;color:#40566c;cursor:pointer}.ce-filters{font-size:12px;color:#52667b}.ce-filters button{display:inline-flex;align-items:center;gap:6px}.ce-filters i{width:9px;height:9px;border-radius:50%}.ce-filters button[aria-pressed=true]{background:#132438;border-color:#132438;color:#fff}.ce-status{font-size:12.5px;color:#34495e}#ce-more{border-color:#7957d5;color:#4b2fa0}#ce-more:empty{display:none}.ce-bar.company-mode .ce-filters{display:none}";
  document.head.appendChild(css);

  var input = document.getElementById("ce-input");
  function byName(v) { v = v.trim().toLowerCase(); return fiCos.filter(function (c) { return c.name.toLowerCase() === v; })[0] || fiCos.filter(function (c) { return c.name.toLowerCase().indexOf(v) === 0; })[0]; }
  input.addEventListener("change", function () { var c = byName(input.value); if (c) pick(c.id); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") { var c = byName(input.value); if (c) pick(c.id); } });
  bar.addEventListener("click", function (e) {
    var co = e.target.closest("[data-co]"), sub = e.target.closest("[data-sub]");
    if (co) pick(co.dataset.co);
    else if (sub) { ui.sub = sub.dataset.sub || null; bar.querySelectorAll("[data-sub]").forEach(function (b) { b.setAttribute("aria-pressed", String((b.dataset.sub || null) === ui.sub)); }); window.focusRefresh(); }
    else if (e.target.id === "ce-more") { var all = !ui.cap; ui.cap = all ? 15 : 0; ui.lpCap = all ? 12 : 0; window.focusRefresh(); }
  });

  document.addEventListener("focus-updated", function () {
    var vis = ui.shown, one = vis === 1 && ui.total === 1, st = document.getElementById("ce-status"), more = document.getElementById("ce-more");
    bar.classList.toggle("company-mode", one);
    var capped = (ui.total > ui.shown) || (ui.lpTotal > ui.lpShown);
    st.textContent = one ? "Showing the path for one company: its investors and the LPs behind them." : "Showing " + ui.shown + " of " + ui.total + " companies and " + ui.lpShown + " of " + ui.lpTotal + " LPs on this path.";
    more.textContent = capped ? "Show all" : (ui.cap ? "" : "Show top only");
    if (one) { var n = window.cy_selected_name; }
  });

  // legend + heading for the new flow
  var lg = document.querySelector("#network .legend");
  if (lg) lg.innerHTML = '<span><i class="dot" style="background:#7957d5"></i>Theme</span>' + (d.subthemes || []).map(function (s) { return '<span><i class="dot" style="background:' + (PAL[s.id] || "#999") + '"></i>' + esc(s.label) + "</span>"; }).join("") + '<span><i class="dot" style="background:#d18c27"></i>Round investor (GP)</span><span><i class="dot" style="background:#cf5a83"></i>Limited partner</span>';
  var h = document.querySelector("#network .network-grid h2"); if (h) h.textContent = "Financial Inclusion → company → investors (GPs) → LPs";
  var sm = document.querySelector("#network .network-grid .card-head .small"); if (sm) sm.textContent = "Search or click a company to load only its investors and the LPs behind them. Click an LP to see every FI company it can reach.";

  if (best) { input.value = best.c.name; pick(best.c.id); }
})();
