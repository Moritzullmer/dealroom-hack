/* When the fixture says exits are not comparable across cohorts (comparison cohorts carry no exit data), don't show a
   misleading "FI leads on exit rate" verdict: use the data-driven verdict and mark exit rate n/c for the comparison cohorts. */
(function () {
  "use strict";
  var d = window.REAL_FIXTURE; if (!d || d.exitComparable !== false) return;
  var v = document.getElementById("verdict");
  if (v && d.verdictText) v.textContent = d.verdictText + " Exit rate is not compared: comparison cohorts carry no exit data. Cohorts are vintage-matched (launched 2012-2022) random samples; differences within the confidence intervals are not meaningful.";
  document.querySelectorAll("#metric-table .cohort-row").forEach(function (row) {
    if (row.dataset.group !== "fi") row.cells[5].innerHTML = '<span class="small muted" title="Comparison cohorts have no exit data">n/c</span>';
  });
  document.querySelectorAll(".kpi, .card.kpi").forEach(function (k) {
    var l = k.querySelector(".label"); if (l && /exit/i.test(l.textContent)) { var dt = k.querySelector(".detail"); if (dt) dt.textContent += " · not compared across cohorts"; }
  });
})();
