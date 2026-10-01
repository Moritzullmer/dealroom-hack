/* Presentation polish for the real-data build: answer strip (thesis verdict on every tab), ranking-first on narrow screens,
   consistent vocabulary, one cohort definition in the labels. Pure DOM/CSS, derived from DEMO_FIXTURE: no hard-coded numbers. */
(function () {
  "use strict";
  var d = window.DEMO_FIXTURE; if (!d || !d.realData) return;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var css = document.createElement("style");
  css.textContent = ".ans-head{margin:14px 0 8px;display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px}.ans-head h2{margin:0;font-size:22px;color:#132438}.ans-head span{font-size:13px;color:#52667b}.ans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 4px}.ans>div{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 15px;box-shadow:var(--shadow)}.ans small{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#52667b;margin-bottom:5px}.ans strong{display:block;font-size:17px;line-height:1.25;color:#132438}.ans p{margin:6px 0 0;font-size:12.5px;line-height:1.45;color:#40566c}.ans .k-ok{color:#0f6b46}.ans .k-warn{color:#8a5a00}.ans .k-no{color:#a02c2c}@media(max-width:980px){.ans{grid-template-columns:1fr}.rank-layout .detail-card{order:2}}";
  document.head.appendChild(css);

  var m = d.market, gap = (d.macro || {}).capitalGap, att = d.attribution || {}, lps = d.lps.slice(0, 3);
  var yrs = m ? m.years : [], last = m ? m.partialYear - 1 : 0, ix = function (y) { return yrs.indexOf(y); };
  var shareNow = m ? m.fi_share_of_europe_vc_pct[ix(last)] : null, shareThen = m ? m.fi_share_of_europe_vc_pct[ix(2021)] : null;
  var fiFollow = att.fi && att.fi.followOnCI, ftFollow = att.fintech && att.fintech.followOnCI;
  var overlap = fiFollow && ftFollow ? !(fiFollow[0] > ftFollow[1] || fiFollow[1] < ftFollow[0]) : null;
  var needUp = gap ? gap.demand_signals_up + " of " + gap.demand_signals_total : null;

  var capital = shareNow == null ? ["Capital", "n/a", ""] : shareNow < shareThen ? ["k-warn", "Under-weighted and shrinking", "FI took " + shareNow.toFixed(2) + "% of European VC in " + last + " vs " + shareThen.toFixed(2) + "% in 2021."] : ["k-ok", "Holding its share", "FI took " + shareNow.toFixed(2) + "% of European VC in " + last + "."];
  var perf = overlap === null ? ["", "n/a", ""] : overlap ? ["k-warn", "No premium over fintech", "Follow-on rate is statistically indistinguishable from other European fintech; value is concentrated in a few winners."] : ["k-ok", "Outperforming fintech", "Follow-on rate sits outside the fintech interval."];
  var need = gap && gap.capital_gap_pp != null ? [gap.capital_gap_pp > 0 ? "k-ok" : "k-warn", needUp + " need indicators rising", "UK consumer stress " + (gap.demand_growth_pct > 0 ? "+" : "") + gap.demand_growth_pct + "% vs FI funding " + (gap.supply_growth_pct > 0 ? "+" : "") + gap.supply_growth_pct + "% (indicative gap " + (gap.capital_gap_pp > 0 ? "+" : "") + gap.capital_gap_pp + "pp)."] : ["", "n/a", ""];
  var verdict = (gap && gap.capital_gap_pp > 0 && overlap) ? "Thesis: partly supported" : (gap && gap.capital_gap_pp > 0 && overlap === false) ? "Thesis: supported" : "Thesis: not clearly supported";
  var strip = document.createElement("section"); strip.className = "ans"; strip.setAttribute("aria-label", "Summary for a EUR 100m European Financial Inclusion fund");
  var head = document.createElement("div"); head.className = "ans-head"; head.innerHTML = "<h2>" + esc(verdict) + "</h2><span>" + esc("for a EUR 100m European Financial Inclusion fund · " + [gap ? (gap.capital_gap_pp > 0 ? "need is rising faster than capital" : "capital is keeping pace with need") : "", shareNow == null ? "" : shareNow < shareThen ? "FI's share of VC is shrinking" : "FI holds its share of VC", overlap === null ? "" : overlap ? "outperformance vs fintech is not shown" : "FI outperforms fintech"].filter(Boolean).join(", ")) + "</span>";
  strip.innerHTML = '<div><small>Market need</small><strong class="' + need[0] + '">Need: ' + esc(need[1]) + '</strong><p>' + esc(need[2]) + '</p></div>' +
    '<div><small>Capital &amp; performance</small><strong class="' + capital[0] + '">' + esc(capital[1]) + '</strong><p>' + esc(capital[2]) + ' ' + esc(perf[1] + ": " + perf[2]) + '</p></div>' +
    '<div><small>Top LPs to investigate</small><strong>' + lps.map(function (l) { return esc(l.name); }).join(", ") + '</strong><p>Each reaches ' + lps.map(function (l) { return l.fiCompanies; }).join(" / ") + ' FI companies through managers it backs. Click a row on tab 4 for the path.</p></div>';
  var tabs = document.querySelector(".tabs"); if (tabs) { tabs.parentNode.insertBefore(head, tabs); tabs.parentNode.insertBefore(strip, tabs); }

  /* vocabulary and leftover prototype wording */
  function setText(sel, txt, nth) { var els = document.querySelectorAll(sel); var el = els[nth || 0]; if (el) el.textContent = txt; }
  var cards = document.querySelectorAll("#analysis > .card"); if (cards[1]) { var h = cards[1].querySelector("h2"); if (h) h.textContent = "Funding by cohort, 2018–2025"; var sm = cards[1].querySelector(".card-head .small"); if (sm) sm.textContent = "Venture rounds in the crawled cohorts, USD millions. Cohorts are nested: FI sits inside fintech, which sits inside VC overall."; }
  var n = d.companies.filter(function (c) { return c.group === "fi" && !c.excludeFromStats; }).length, all = d.companies.filter(function (c) { return c.group === "fi"; }).length;
  var note = document.querySelector("#analysis .note"); if (note) note.textContent = "Statistics use companies launched 2012–2022 (FI n=" + n + " of " + all + " tagged) so cohorts have had equal time to raise again. Follow-on = 2+ venture rounds; step-up = median latest vs prior priced round; concentration = top 3 latest valuations / all. These are database signals, not realised investor returns.";
  document.querySelectorAll("#metric-table .small.muted").forEach(function (e) { e.textContent = "inspect"; });
  var cc = document.querySelector("#analysis .analysis-grid .card-head .small"); if (cc) cc.textContent = "Nested cohorts: FI ⊂ fintech ⊂ VC";
  var lh = document.querySelector("#prospects .card-head h2"); if (lh && /LP links/.test(lh.textContent)) lh.textContent = "Top LPs to investigate";

  /* LP table: collapse long investor chip lists so rows are scannable */
  var tcss = document.createElement("style");
  tcss.textContent = "#lp-table td details{display:inline}#lp-table td details summary{display:inline-block;cursor:pointer;font-size:12px;font-weight:700;color:#4b2fa0;padding:4px 7px;list-style:none}#lp-table td details summary::-webkit-details-marker{display:none}#lp-table td details[open] summary{display:block;margin-top:2px}";
  document.head.appendChild(tcss);
  document.querySelectorAll("#lp-table tbody tr").forEach(function (row) {
    var cell = row.cells[2]; if (!cell) return;
    var chips = Array.prototype.slice.call(cell.querySelectorAll("button.entity-link")); if (chips.length <= 3) return;
    var det = document.createElement("details"), sum = document.createElement("summary"); sum.textContent = "+" + (chips.length - 3) + " more";
    det.appendChild(sum); chips.slice(3).forEach(function (c) { det.appendChild(c); }); cell.appendChild(det);
    det.addEventListener("click", function (e) { e.stopPropagation(); });
  });

  /* open on Market need (tab order: Market need, FI vs. peers, Network, LPs) */
  var first = document.querySelector('.tab[data-panel="marketneed"]'); if (first) first.click();
})();
