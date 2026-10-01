(function () {
  "use strict";

  var data = window.REAL_FIXTURE || window.DEMO_FIXTURE;
  var isReal = !!data.realData;
  var entities = {};
  var cy = null;
  var colors = { fi: "#7957d5", fintech: "#3482bd", vc: "#9aaabc" };
  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  data.companies.forEach(function (x) { entities[x.id] = x; });
  data.gps.forEach(function (x) { entities[x.id] = x; });
  data.lps.forEach(function (x) { entities[x.id] = x; });

  function money(value) { return value == null || !Number.isFinite(Number(value)) ? "n/a" : "$" + Math.round(value) + "m"; }
  function percent(value) { return Math.round(value * 100) + "%"; }
  function byGroup(group) {
    return data.companies.filter(function (c) {
      if (c.excludeFromStats) return false;
      return group === "fi" ? c.group === "fi" : group === "fintech" ? c.group !== "venture" : true;
    });
  }
  function latestValue(company) {
    var priced = company.rounds.filter(function (r) { return r.valuation > 0; });
    return priced.length ? priced[priced.length - 1].valuation : null;
  }
  function median(values) {
    values = values.slice().sort(function (a, b) { return a - b; });
    if (!values.length) return null;
    var mid = Math.floor(values.length / 2);
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  }
  function cohortStats(group) {
    var companies = byGroup(group);
    var years = data.years ? data.years : isReal ? (function () { var a = [], y = 2025, m = 4; for (var i = 0; i < 18; i++) { a.push(y + "-" + String(m).padStart(2, "0")); if (++m === 13) { m = 1; y++; } } return a; })() : [2022, 2023, 2024, 2025];
    var funding = years.map(function (period) {
      return companies.reduce(function (sum, company) {
        return sum + company.rounds.filter(function (round) { return (isReal && !data.years) ? (round.year + "-" + String(round.month).padStart(2, "0")) === period : round.year === period; })
          .reduce(function (subtotal, round) { return subtotal + (round.amount || 0); }, 0);
      }, 0);
    });
    var steps = companies.map(function (company) {
      var priced = company.rounds.filter(function (r) { return r.valuation > 0; });
      if (priced.length < 2) return null;
      var prev = priced[priced.length - 2].valuation;
      var last = priced[priced.length - 1].valuation;
      return prev && last ? last / prev : null;
    }).filter(function (x) { return x !== null; });
    var values = companies.map(latestValue).filter(function (x) { return x !== null; }).sort(function (a, b) { return b - a; });
    var totalValue = values.reduce(function (sum, x) { return sum + x; }, 0);
    var followOnCount = companies.filter(function (c) { return c.rounds.length > 1; }).length;
    var exitCount = companies.filter(function (c) { return !!c.exit; }).length;
    return {
      group: group, companies: companies, years: years, funding: funding,
      followOn: companies.length ? followOnCount / companies.length : 0, followOnCount: followOnCount,
      stepUp: median(steps) || 0, stepUpCount: steps.length, exits: companies.length ? exitCount / companies.length : 0, exitCount: exitCount,
      top3: totalValue ? values.slice(0, 3).reduce(function (sum, x) { return sum + x; }, 0) / totalValue : 0
    };
  }
  var cohorts = [
    { id: "fi", label: "FI companies" },
    { id: "fintech", label: "All European fintech" },
    { id: "vc", label: "VC overall" }
  ];
  var stats = {};
  cohorts.forEach(function (c) { stats[c.id] = cohortStats(c.id); });

  function exposure(lp) {
    var companies = data.companies.filter(function (c) {
      return c.group === "fi" && c.gps.some(function (gp) { return lp.gps.indexOf(gp) !== -1; });
    });
    var links = companies.reduce(function (sum, c) {
      return sum + c.gps.filter(function (gp) { return lp.gps.indexOf(gp) !== -1; }).length;
    }, 0);
    return { companies: companies, links: links };
  }
  var rankedLPs = data.lps.map(function (lp) {
    var x = exposure(lp);
    return { lp: lp, companies: x.companies, links: x.links };
  }).filter(function (row) { return !isReal || row.companies.length > 0; }).sort(function (a, b) {
    return b.companies.length - a.companies.length || b.links - a.links || a.lp.name.localeCompare(b.lp.name);
  });

  function setView(view) {
    document.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("active", x.dataset.panel === view); });
    document.querySelectorAll(".panel").forEach(function (x) { x.classList.toggle("active", x.id === view); });
    if (view === "network" && cy) cy.resize();
  }
  function linkButton(id, label) {
    return '<button class="entity-link" type="button" data-node="' + esc(id) + '">' + esc(label) + '</button>';
  }
  // Focused view: only the active path is shown, laid out in columns (theme | FI companies | investors | LP).
  var ROW = 40;
  function otherEnd(e, n) { return e.source().id() === n.id() ? e.target() : e.source(); }
  function layoutFocused() {
    var vis = cy.nodes().not(".hidden"), cols = [[], [], [], []], rank = {};
    vis.forEach(function (n) { cols[n.hasClass("theme") ? 0 : n.hasClass("lp") ? 3 : n.hasClass("gp") ? 2 : 1].push(n); });
    function label(n) { return String(n.data("label")).toLowerCase(); }
    function reorder(col, byCol) {   // barycentre ordering to cut edge crossings
      col.forEach(function (n) {
        var s = 0, c = 0;
        n.connectedEdges().not(".hidden").forEach(function (e) { var o = otherEnd(e, n); if (rank[o.id()] !== undefined && cols[byCol].indexOf(o) !== -1) { s += rank[o.id()]; c++; } });
        n._m = c ? s / c : 1e9;
      });
      col.sort(function (a, b) { return a._m - b._m || label(a).localeCompare(label(b)); });
      col.forEach(function (n, i) { rank[n.id()] = i; });
    }
    cols[2].sort(function (a, b) { return label(a).localeCompare(label(b)); }); cols[2].forEach(function (n, i) { rank[n.id()] = i; });
    reorder(cols[1], 2); reorder(cols[2], 1); reorder(cols[1], 2); reorder(cols[3], 2);
    var H = Math.max(6, Math.max.apply(null, cols.map(function (c) { return c.length; }))) * ROW, X = [0, 310, 610, 900];
    cols.forEach(function (col, ci) { col.forEach(function (n, i) { n.position({ x: X[ci], y: (i + .5) * H / col.length }); }); });
    var box = document.getElementById("cy"), z = Math.min(1, (box.clientWidth - 56) / 1060);
    box.style.height = Math.max(300, Math.round(H * z) + 64) + "px";
    cy.resize(); cy.fit(vis, 28);
  }
  var focusUI = window.focusUI = { sub: null, cap: 15, lpCap: 12, last: null, total: 0, shown: 0, lpTotal: 0, lpShown: 0 };
  function markPath(nodes, edges) {
    if (!cy) return;
    focusUI.last = { nodes: nodes, edges: edges };
    var keepN = {}, keepE = {};
    nodes.forEach(function (id) { keepN[id] = true; }); edges.forEach(function (id) { keepE[id] = true; });
    cy.batch(function () {
      cy.elements().removeClass("faded path selected hl dim hidden");
      cy.nodes().forEach(function (n) { if (keepN[n.id()]) n.addClass("path"); else n.addClass("hidden"); });
      // sub-theme filter, then keep the largest N companies (by latest valuation) unless "all" is chosen
      var cos = cy.nodes(".fi-company").not(".hidden"), pool = focusUI.sub ? cos.filter(function (n) { return n.data("sub") === focusUI.sub; }) : cos;
      cos.not(pool).addClass("hidden");
      focusUI.total = pool.length;
      if (focusUI.cap && pool.length > focusUI.cap) {
        var ranked = pool.toArray().sort(function (a, b) { var ea = entities[a.id()], eb = entities[b.id()]; return (latestValue(eb) || 0) - (latestValue(ea) || 0); });
        ranked.slice(focusUI.cap).forEach(function (n) { n.addClass("hidden"); });
        pool = cy.collection(ranked.slice(0, focusUI.cap));
      }
      focusUI.shown = pool.length;
      // LP cap: keep the LPs with the most visible investor links (ties: broader FI reach)
      var lpsAll = cy.nodes(".lp").not(".hidden"); focusUI.lpTotal = lpsAll.length;
      if (focusUI.lpCap && lpsAll.length > focusUI.lpCap) {
        var rl = lpsAll.toArray().sort(function (a, b) { return b.connectedEdges().not(".hidden").length - a.connectedEdges().not(".hidden").length || ((entities[b.id()] || {}).fiCompanies || 0) - ((entities[a.id()] || {}).fiCompanies || 0); });
        rl.slice(focusUI.lpCap).forEach(function (n) { n.addClass("hidden"); });
      }
      focusUI.lpShown = cy.nodes(".lp").not(".hidden").length;
      cy.edges().forEach(function (e) { if (keepE[e.id()] && !e.source().hasClass("hidden") && !e.target().hasClass("hidden")) e.addClass("path"); else e.addClass("hidden"); });
      // investors with no visible company link are dropped; so is a theme node with nothing under it
      cy.nodes(".gp").not(".hidden").forEach(function (g) { if (g.connectedEdges().not(".hidden").filter(function (e) { return e.source().hasClass("fi-company") || e.target().hasClass("fi-company"); }).length === 0 && cos.length) g.addClass("hidden"); });
      cy.edges().forEach(function (e) { if (e.source().hasClass("hidden") || e.target().hasClass("hidden")) e.addClass("hidden"); });
      cy.nodes(".lp").not(".hidden").forEach(function (l) { if (l.connectedEdges().not(".hidden").length === 0 && cos.length) l.addClass("hidden"); });
    });
    layoutFocused();
    document.dispatchEvent(new CustomEvent("focus-updated"));
  }
  window.focusRefresh = function () { if (focusUI.last) markPath(focusUI.last.nodes, focusUI.last.edges); };
  function addCompanyPath(company, nodes, edges) {
    nodes.push(company.id);
    if (company.group === "fi") {
      nodes.push(data.theme.id);
      edges.push("class-" + company.id);
    }
    company.gps.forEach(function (gp) {
      nodes.push(gp);
      edges.push("portfolio-" + company.id + "-" + gp);
      data.lps.filter(function (lp) { return lp.gps.indexOf(gp) !== -1; }).forEach(function (lp) {
        nodes.push(lp.id);
        edges.push("commit-" + gp + "-" + lp.id);
      });
    });
  }

  function openLP(id) {
    var lp = entities[id];
    var e = exposure(lp);
    var nodes = [lp.id];
    var edges = [];
    lp.gps.forEach(function (gp) {
      nodes.push(gp);
      edges.push("commit-" + gp + "-" + lp.id);
    });
    e.companies.forEach(function (company) {
      nodes.push(company.id, data.theme.id);
      edges.push("class-" + company.id);
      company.gps.filter(function (gp) { return lp.gps.indexOf(gp) !== -1; }).forEach(function (gp) {
        edges.push("portfolio-" + company.id + "-" + gp);
      });
    });
    markPath(nodes, edges);
    var relationshipLabel = isReal ? "Dealroom recorded limited partner · known manager links" : lp.type + " · fictional LP";
    var nextQuestion = isReal ? "Confirm the fund vehicle, commitment status and vintage before attributing portfolio exposure." : "Confirm the fund-level LP commitment, fund vintage and company classification before attributing exposure.";
    var outreachAngle = lp.angle || "Ask whether the manager links shown map to an active commitment and explore the investor’s financial-inclusion thesis.";
    document.getElementById("why-panel").innerHTML =
      '<h3>' + esc(lp.name) + '</h3><p class="hint">' + esc(relationshipLabel) + '</p>' +
      '<div class="pathbox"><div class="path-line">' + esc(lp.name) + ' <span class="arrow">→</span> ' +
      lp.gps.map(function (gp) { return linkButton(gp, entities[gp].name); }).join(" ") +
      ' <span class="arrow">→</span> ' + e.companies.length + ' classified FI companies</div>' +
      '<div style="margin-top:9px"><span class="pill">' + e.links + (isReal ? ' investor–company paths' : ' GP–company links') + '</span></div><ul class="company-list">' +
      e.companies.map(function (c) { return '<li>' + linkButton(c.id, c.name) + '<span class="muted"> · ' + esc(c.product || '') + '</span></li>'; }).join("") + '</ul></div>' +
      '<div class="detail-block"><strong>Why it surfaced</strong><p class="why">' + (isReal ? 'Dealroom lists this LP against the linked investor firms; those firms also appear on funding rounds for these classified FI companies. This does not establish a specific fund commitment or company ownership.' : 'Its fictional GP commitments connect to ' + e.companies.length + ' unique fixture companies classified in the FI theme. This is indirect portfolio exposure only.') + '</p></div>' +
      '<div class="detail-block"><strong>Outreach angle</strong><p>' + esc(outreachAngle) + '</p></div>' +
      '<div class="detail-block"><strong>Next validation</strong><p>' + esc(nextQuestion) + '</p></div>' +
      '<div class="detail-block"><button class="action-button" data-trace="' + lp.id + '">Trace this LP in the network</button></div>';
    document.getElementById("lp-detail").innerHTML =
      '<h3>' + esc(lp.name) + '</h3><div class="meta">' + esc(lp.type || 'Limited partner') + ' · ' + lp.gps.length + (isReal ? ' linked investor firms' : ' associated GPs in fixture') + '</div>' +
      '<div class="detail-block"><strong>' + (isReal ? 'Linked investor firms' : 'Relevant GPs') + '</strong><p>' + lp.gps.map(function (gp) { return linkButton(gp, entities[gp].name); }).join(" ") + '</p></div>' +
      '<div class="detail-block"><strong>FI company count</strong><p><b>' + e.companies.length + '</b> unique companies</p></div>' +
      '<div class="detail-block"><strong>Indirect portfolio links</strong><p><b>' + e.links + '</b> GP–company paths; this is not LP ownership or invested value.</p></div>' +
      '<div class="detail-block"><strong>Why relevant</strong><p class="why">' + (isReal ? 'A recorded LP-to-investor-firm link intersects with funding-round investor links to the FI cohort.' : 'A path from this LP through its fictional managers reaches companies classified in the inclusion theme.') + '</p></div>' +
      '<div class="detail-block"><strong>Suggested outreach</strong><p>' + esc(outreachAngle) + '</p></div>' +
      '<div class="detail-block"><button class="action-button" data-trace="' + lp.id + '">Trace this LP in the network</button></div>';
    document.querySelectorAll(".rank-table tbody tr").forEach(function (row) {
      row.classList.toggle("selected", row.dataset.lp === lp.id);
    });
  }

  function openGP(id) {
    var gp = entities[id];
    var companies = data.companies.filter(function (c) { return c.gps.indexOf(id) !== -1; });
    var fi = companies.filter(function (c) { return c.group === "fi"; });
    var lps = data.lps.filter(function (lp) { return lp.gps.indexOf(id) !== -1; });
    var nodes = [id, data.theme.id];
    var edges = [];
    companies.forEach(function (c) { addCompanyPath(c, nodes, edges); });
    markPath(nodes, edges);
    document.getElementById("why-panel").innerHTML = '<h3>' + esc(gp.name) + '</h3><p class="hint">' + (isReal ? 'Investor recorded on a Dealroom funding round' : 'General Partner · fictional fixture') + '</p>' +
      '<div class="detail-block"><strong>FI portfolio (' + fi.length + ')</strong><p>' + (fi.length ? fi.map(function (c) { return linkButton(c.id, c.name); }).join(" ") : "No FI companies in this fixture") + '</p></div>' +
      '<div class="detail-block"><strong>Other portfolio companies</strong><p>' + companies.filter(function (c) { return c.group !== "fi"; }).map(function (c) { return linkButton(c.id, c.name); }).join(" ") + '</p></div>' +
      '<div class="detail-block"><strong>Connected LPs</strong><p>' + lps.map(function (lp) { return linkButton(lp.id, lp.name); }).join(" ") + '</p></div>' +
      '<div class="detail-block"><strong>Interpretation</strong><p>' + (isReal ? 'These are round investor links. The data does not establish an LP commitment to a particular fund.' : 'These are illustrative portfolio edges. A real LP commitment must be verified at fund level.') + '</p></div>';
  }

  function openCompany(id) {
    var c = entities[id];
    var visibleInvestors = c.gps.filter(function (gp) { return !!entities[gp]; });
    var hiddenInvestorCount = c.gps.length - visibleInvestors.length;
    var nodes = [];
    var edges = [];
    addCompanyPath(c, nodes, edges);
    markPath(nodes, edges);
    var roundText = c.rounds.map(function (r) { return r.year + ': ' + money(r.amount) + ' round, ' + money(r.valuation) + ' valuation'; }).join("; ");
    document.getElementById("why-panel").innerHTML = '<h3>' + esc(c.name) + '</h3><p class="hint">Portfolio company · ' + (c.group === "fi" ? "classified in the FI theme" : c.group === "fintech" ? "European fintech comparison" : "VC overall comparison") + '</p>' +
      '<div class="detail-block"><strong>Product description</strong><p>' + esc(c.product || "No description recorded") + '</p></div>' +
      '<div class="detail-block"><strong>Theme classification</strong><p>' + (c.group === "fi" ? linkButton(data.theme.id, isReal ? "Dealroom Financial Inclusion sector" : "Financial inclusion") : (isReal ? "Not tagged with the FI sector ID in this snapshot" : "Not tagged as FI in this fixture")) + '</p></div>' +
      '<div class="detail-block"><strong>Funding progression</strong><p>' + esc(roundText) + '</p></div>' +
      '<div class="detail-block"><strong>' + (isReal ? 'Round investors in the graph' : 'Associated GPs') + '</strong><p>' + visibleInvestors.map(function (gp) { return linkButton(gp, entities[gp].name); }).join(" ") + (isReal && hiddenInvestorCount ? '<span class="muted"> ' + hiddenInvestorCount + ' other recorded investors are outside the displayed graph sample.</span>' : '') + '</p></div>' +
      '<div class="detail-block"><strong>Exit event</strong><p>' + (c.exit ? esc(c.exit.type) + ' · ' + c.exit.year : (isReal ? "No matching Dealroom exit record in this pull" : "No exit recorded in fixture")) + '</p></div>';
  }

  function openTheme() {
    var fi = byGroup("fi");
    var nodes = [data.theme.id];
    var edges = [];
    fi.forEach(function (c) { addCompanyPath(c, nodes, edges); });
    markPath(nodes, edges);
    document.getElementById("why-panel").innerHTML = '<h3>' + esc(data.theme.label) + '</h3><p class="hint">' + (isReal ? 'Dealroom sector classification' : 'Illustrative classification theme') + '</p>' +
      '<div class="detail-block"><strong>Companies (' + fi.length + ')</strong><p>' + fi.map(function (c) { return linkButton(c.id, c.name); }).join(" ") + '</p></div>' +
      '<div class="detail-block"><strong>Classification</strong><p>' + (isReal ? ('Dealroom Financial Inclusion sector ID ' + data.taxonomy.financialInclusionSector + '; company matches are tagged records, not a manual product-level impact review.') : 'These fictional labels are for the demo only. A live build needs an auditable inclusion taxonomy and reviewed company-level evidence.') + '</p></div>';
  }

  function openCohort(group, period) {
    var cohort = stats[group];
    setView("network");
    var nodes = [data.theme.id];
    var edges = [];
    var scopedCompanies = period ? cohort.companies.filter(function (c) {
      return c.rounds.some(function (r) { return (r.year + "-" + String(r.month).padStart(2, "0")) === period; });
    }) : cohort.companies;
    var visibleCompanies = (data.graphCompanies || data.companies).filter(function (c) {
      var inGroup = group === "fi" ? c.group === "fi" : group === "fintech" ? c.group !== "venture" : true;
      var inPeriod = !period || !isReal || c.rounds.some(function (r) { return (r.year + "-" + String(r.month).padStart(2, "0")) === period; });
      return inGroup && inPeriod;
    });
    visibleCompanies.forEach(function (c) { addCompanyPath(c, nodes, edges); });
    markPath(nodes, edges);
    document.getElementById("why-panel").innerHTML = '<h3>' + cohorts.filter(function (c) { return c.id === group; })[0].label + '</h3>' +
      '<p class="hint">' + (period ? period + ' · ' : '') + scopedCompanies.length + (isReal ? ' companies in the full cohort · ' + visibleCompanies.length + ' shown in the clickable graph' : ' fixture companies · click any company, GP or LP to continue exploring') + '</p>' +
      '<div class="detail-block"><strong>' + (isReal ? 'Companies shown in graph' : 'Companies') + '</strong><p>' + visibleCompanies.map(function (c) { return linkButton(c.id, c.name); }).join(" ") + '</p></div>' +
      '<div class="detail-block"><strong>Follow-on / step-up / exits / top-3 share</strong><p>' + percent(cohort.followOn) + ' · ' + cohort.stepUp.toFixed(1) + '× · ' + percent(cohort.exits) + ' · ' + percent(cohort.top3) + '</p></div>';
  }

  function openNode(id) {
    if (id === data.theme.id) return openTheme();
    var entity = entities[id];
    if (!entity) return;
    if (data.lps.some(function (x) { return x.id === id; })) return openLP(id);
    if (data.gps.some(function (x) { return x.id === id; })) return openGP(id);
    return openCompany(id);
  }

  function renderRankedLPs() {
    var table = document.getElementById("lp-table");
    if (!rankedLPs.length) {
      table.innerHTML = '<tbody><tr><td class="small muted">No LP to GP fund commitments are included in the available transaction records. This view stays empty instead of inferring LP exposure from company investors.</td></tr></tbody>';
      document.getElementById("lp-detail").innerHTML = '<h3>LP links to investigate</h3><div class="meta">The current Dealroom extract establishes round investor to company links only. Fund level LP commitments require a separate relationship query.</div>';
      return;
    }
    table.innerHTML = '<thead><tr><th>#</th><th>LP</th><th>' + (isReal ? 'Linked investor firms' : 'Relevant GPs') + '</th><th>FI companies</th><th>' + (isReal ? 'Investor paths' : 'Indirect links') + '</th></tr></thead><tbody>' +
      rankedLPs.map(function (row, i) {
        return '<tr data-lp="' + esc(row.lp.id) + '"><td><span class="rank">' + (i + 1) + '</span></td><td><span class="lp-name">' + esc(row.lp.name) + '</span><div class="small muted">' + esc(row.lp.type || 'Limited partner') + '</div></td><td>' + row.lp.gps.map(function (gp) { return linkButton(gp, entities[gp].name); }).join(" ") + '</td><td><b>' + row.companies.length + '</b></td><td>' + row.links + '</td></tr>';
      }).join("") + '</tbody>';
    table.querySelectorAll("tbody tr").forEach(function (row) {
      row.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        openLP(row.dataset.lp);
      });
    });
    openLP(rankedLPs[0].lp.id);
  }

  function applyRealLabels() {
    if (!isReal) return;
    document.querySelector(".fixture").textContent = "Dealroom data · local snapshot";
    document.querySelector(".stamp").textContent = data.window + " · " + data.coverage.transactions.toLocaleString() + " VC rounds · retrieved " + data.asOf;
    document.querySelector(".intro p").textContent = "Explore Dealroom companies in the Financial Inclusion sector and compare their recorded venture funding signals with European fintech and European VC.";
    document.querySelector(".network-grid h2").textContent = "Financial Inclusion → companies → round investors";
    document.querySelector(".network-grid .small").textContent = "Click an LP, company or investor. LP-to-investor-firm links and funding-round investor links are recorded by Dealroom; a specific fund commitment is not identified.";
    document.querySelector(".network-grid .tag").textContent = data.geography;
    document.querySelector(".legend span:nth-last-child(2)").innerHTML = '<i class="dot" style="background:#d18c27"></i>Round investor';
    document.querySelector(".legend span:last-child").innerHTML = '<i class="dot" style="background:#cf5a83"></i>Limited partner';
    document.querySelector("#analysis .card-head .small").textContent = "All reported rounds and comparison metrics use " + data.window + " records; USD amounts.";
    document.querySelector("#analysis .card-head .tag").textContent = (data.windowTag || "USD millions · 18 months");
    document.querySelector("#analysis .note").textContent = "Follow-on = companies with 2+ VC rounds in the window; step-up = median latest/prior recorded valuation where both are present; exits = observed Dealroom exit transactions matched to these companies; concentration = top 3 latest recorded valuations / all latest recorded valuations. These are database signals, not realized investor returns.";
    document.querySelector("#prospects .card-head h2").textContent = "LP links to investigate";
    document.querySelector("#prospects .card-head .small").textContent = data.coverage.lpsWithFiCompanyLinks + " LPs have known links to round investors that also appear on FI company rounds; these candidates come from the displayed investor set.";
    document.querySelector("#prospects .card-head .tag").textContent = "Known links · fund vintage unknown";
    document.querySelector("#prospects .note").textContent = data.lpCoverage;
    document.querySelector("main > .footer").textContent = "Source: Dealroom API. Snapshot retrieved " + data.asOf + ". HQ country from the Dealroom headquarters location; Europe region ID 76. FI classification uses sector ID " + data.taxonomy.financialInclusionSector + "; fintech uses industry ID " + data.taxonomy.fintechIndustry + ". Displayed graph is a readable sample; cohort statistics use the full extract.";
  }

  function renderAnalytics() {
    var width = 720, height = 260, left = 58, right = 18, top = 16, bottom = 36;
    var maxRaw = Math.max.apply(null, stats.vc.funding);
    var max = Math.max(1, Math.ceil(maxRaw / (maxRaw > 500 ? 1000 : 50)) * (maxRaw > 500 ? 1000 : 50));
    var x = function (i) { return left + i * (width - left - right) / Math.max(1, stats.vc.years.length - 1); };
    var y = function (v) { return top + (height - top - bottom) * (1 - v / max); };
    var svg = ['<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Click a cohort point to explore companies">'];
    for (var i = 0; i <= 4; i++) {
      var val = max * i / 4, yy = y(val);
      svg.push('<line x1="' + left + '" x2="' + (width - right) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e7edf3"/><text x="' + (left - 8) + '" y="' + (yy + 4) + '" text-anchor="end" fill="#70839a" font-size="10">$' + Math.round(val) + 'm</text>');
    }
    cohorts.forEach(function (cohort) {
      var s = stats[cohort.id];
      svg.push('<polyline fill="none" stroke="' + colors[cohort.id] + '" stroke-width="3" points="' + s.funding.map(function (v, j) { return x(j) + ',' + y(v); }).join(" ") + '"/>');
      s.funding.forEach(function (v, j) {
        svg.push('<circle class="chart-point" data-group="' + cohort.id + '" data-year="' + s.years[j] + '" tabindex="0" role="button" aria-label="' + cohort.label + ' funding in ' + s.years[j] + ': ' + money(v) + '. Click to explore." cx="' + x(j) + '" cy="' + y(v) + '" r="5" fill="' + colors[cohort.id] + '"/><title>' + cohort.label + ' · ' + s.years[j] + ' · ' + money(v) + '</title>');
      });
    });
    stats.fi.years.forEach(function (yr, i) { if (!isReal || data.years || i % 3 === 0 || i === stats.fi.years.length - 1) svg.push('<text x="' + x(i) + '" y="' + (height - 9) + '" text-anchor="middle" fill="#70839a" font-size="9">' + yr + '</text>'); });
    svg.push('</svg>');
    document.getElementById("funding-chart").innerHTML = svg.join("");
    document.querySelectorAll(".chart-point").forEach(function (point) {
      var activate = function () { openCohort(point.dataset.group, point.dataset.year); };
      point.addEventListener("click", activate);
      point.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    });
    document.getElementById("kpis").innerHTML =
      '<div class="card kpi"><div class="label">FI follow-on rate</div><div class="value">' + percent(stats.fi.followOn) + '</div><div class="detail">' + stats.fi.followOnCount + ' of ' + stats.fi.companies.length + ' companies</div></div>' +
      '<div class="card kpi"><div class="label">FI median step-up</div><div class="value">' + stats.fi.stepUp.toFixed(1) + '×</div><div class="detail">' + stats.fi.stepUpCount + ' companies with 2 priced rounds</div></div>' +
      '<div class="card kpi"><div class="label">FI exit rate</div><div class="value">' + percent(stats.fi.exits) + '</div><div class="detail">' + stats.fi.exitCount + ' exits of ' + stats.fi.companies.length + ' companies</div></div>' +
      '<div class="card kpi"><div class="label">Top 3 valuation share</div><div class="value">' + percent(stats.fi.top3) + '</div><div class="detail">Concentration in latest known valuations</div></div>';
    var table = '<thead><tr><th>Cohort</th><th>Companies</th><th>Funding ' + stats.fi.years[0] + ' → ' + stats.fi.years[stats.fi.years.length - 1] + '</th><th>Follow-on</th><th>Median step-up</th><th>Exit rate</th><th>Top 3 share</th></tr></thead><tbody>';
    cohorts.forEach(function (c) {
      var s = stats[c.id];
      table += '<tr class="cohort-row" data-group="' + c.id + '" tabindex="0" role="button"><td><strong>' + c.label + '</strong><div class="small muted">click to inspect companies</div></td><td>' + s.companies.length + '</td><td>' + money(s.funding[0]) + ' → ' + money(s.funding[s.funding.length - 1]) + '</td><td>' + percent(s.followOn) + '</td><td>' + s.stepUp.toFixed(1) + '×</td><td>' + percent(s.exits) + '</td><td>' + percent(s.top3) + '</td></tr>';
    });
    document.getElementById("metric-table").innerHTML = table + '</tbody>';
    document.querySelectorAll(".cohort-row").forEach(function (row) {
      var activate = function () { openCohort(row.dataset.group); };
      row.addEventListener("click", activate);
      row.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    });
    var fi = stats.fi, ft = stats.fintech;
    var wins = [];
    if (fi.followOn > ft.followOn) wins.push("follow-on rate");
    if (fi.stepUp > ft.stepUp) wins.push("median valuation step-up");
    if (fi.exits > ft.exits) wins.push("exit rate");
    var verdict = wins.length ? "FI leads the observed fintech cohort on " + wins.join(", ") + "." : "FI does not lead the observed fintech cohort on follow-on rate, median step-up or exit rate.";
    document.getElementById("verdict").textContent = verdict + " The top three FI companies account for " + percent(fi.top3) + " of recorded cohort valuation. " + (isReal ? ("FI has " + fi.companies.length + " tagged companies, " + fi.stepUpCount + " paired valuations and " + fi.exitCount + " matched exit records. These are Dealroom database signals, not realized LP returns.") : "This synthetic sample cannot support an investment conclusion.");
  }

  function graphElements() {
    var elements = [{ data: { id: data.theme.id, label: data.theme.label }, position: { x: 90, y: 345 }, classes: "theme" }];
    (data.graphCompanies || data.companies).forEach(function (c, i) {
      elements.push({ data: { id: c.id, label: c.name, sub: c.sub || "" }, position: { x: 345, y: 42 + i * 46 }, classes: (c.group === "fi" ? "fi-company" : "peer-company") + (c.sub ? " sub-" + c.sub : "") });
      if (c.group === "fi") elements.push({ data: { id: "class-" + c.id, source: data.theme.id, target: c.id }, classes: "classification" });
      c.gps.forEach(function (gp) { elements.push({ data: { id: "portfolio-" + c.id + "-" + gp, source: c.id, target: gp }, classes: "portfolio" }); });
    });
    data.gps.forEach(function (gp, i) { elements.push({ data: { id: gp.id, label: gp.name }, position: { x: 665, y: 170 + i * 70 }, classes: "gp" }); });
    data.lps.forEach(function (lp, i) {
      elements.push({ data: { id: lp.id, label: lp.name }, position: { x: 925, y: 105 + i * 170 }, classes: "lp" });
      lp.gps.forEach(function (gp) { elements.push({ data: { id: "commit-" + gp + "-" + lp.id, source: gp, target: lp.id }, classes: "commitment" }); });
    });
    return elements;
  }
  function initGraph() {
    if (!window.cytoscape) {
      document.getElementById("cy").innerHTML = '<p style="padding:20px">Cytoscape.js could not load. Connect to the internet and reload this page.</p>';
      return;
    }
    cy = window.cytoscape({ container: document.getElementById("cy"), elements: graphElements(), layout: { name: "preset", fit: true, padding: 35 }, minZoom: .45, maxZoom: 1.4,
      style: [
        { selector: "node", style: { label: "data(label)", "text-wrap": "wrap", "text-max-width": "140px", "font-size": 11, "font-weight": 700, color: "#fff", "text-valign": "center", "text-halign": "center", width: 150, height: 28, shape: "round-rectangle", "border-width": 1, "border-color": "rgba(10,30,50,.14)" } },
        { selector: "node.theme", style: { "background-color": "#7957d5", width: 112, height: 68, shape: "hexagon", "font-size": 12 } },
        { selector: "node.fi-company", style: { "background-color": "#1c9b78" } },
        { selector: "node.sub-credit", style: { "background-color": "#2f9e6e" } },
        { selector: "node.sub-credit_underwriting", style: { "background-color": "#0e9aa7" } },
        { selector: "node.sub-sme_finance", style: { "background-color": "#3b6fd4" } },
        { selector: "node.sub-financial_health", style: { "background-color": "#8a9a2b" } },
        { selector: "node.sub-insurance", style: { "background-color": "#64748b" } },
        { selector: "node.sub-remittances", style: { "background-color": "#9c6644" } },
        { selector: "node.sub-inclusive_banking", style: { "background-color": "#1e3a5f" } },
        { selector: "node.sub-other_fi", style: { "background-color": "#94a3b8" } },
        { selector: "node.peer-company", style: { "background-color": "#3482bd", height: 32, "font-size": 10 } },
        { selector: "node.gp", style: { "background-color": "#d18c27", color: "#35250c" } },
        { selector: "node.lp", style: { "background-color": "#cf5a83" } },
        { selector: "edge", style: { width: 1.5, "line-color": "#b8c6d4", "target-arrow-color": "#b8c6d4", "target-arrow-shape": "triangle", "curve-style": "bezier", "arrow-scale": .75 } },
        { selector: "edge.classification", style: { "line-color": "#7957d5", "target-arrow-color": "#7957d5", "line-style": "dashed", width: 1, opacity: .3 } },
        { selector: "edge.path", style: { width: 1.6, "line-color": "#27a77e", "target-arrow-color": "#27a77e", opacity: .55, "z-index": 10 } },
        { selector: "edge.classification.path", style: { width: 1, opacity: .3, "line-color": "#7957d5", "target-arrow-color": "#7957d5" } },
        { selector: ".hidden", style: { display: "none" } },
        { selector: "edge.hl", style: { width: 3.2, opacity: 1, "z-index": 20 } },
        { selector: "node.dim, edge.dim", style: { opacity: .18 } },
        { selector: "node.path", style: { "border-width": 3, "border-color": "#27a77e", "z-index": 10 } },
        { selector: "node.selected", style: { "border-width": 4, "border-color": "#14263c" } }
      ]
    });
    cy.on("tap", "node", function (event) { openNode(event.target.id()); });
    cy.on("mouseover", "node", function (event) {
      var n = event.target, keep = n.connectedEdges().not(".hidden");
      cy.batch(function () { cy.elements().not(".hidden").addClass("dim"); keep.removeClass("dim").addClass("hl"); keep.connectedNodes().removeClass("dim"); n.removeClass("dim"); });
    });
    cy.on("mouseout", "node", function () { cy.elements().removeClass("dim hl"); });
  }

  document.querySelectorAll(".tab").forEach(function (button) {
    button.addEventListener("click", function () { setView(button.dataset.panel); });
  });
  document.body.addEventListener("click", function (event) {
    var nodeButton = event.target.closest("[data-node]");
    if (nodeButton) { openNode(nodeButton.dataset.node); return; }
    var traceButton = event.target.closest("[data-trace]");
    if (traceButton) { setView("network"); openLP(traceButton.dataset.trace); return; }
  });
  applyRealLabels();
  renderAnalytics();
  renderRankedLPs();
  initGraph();
  if (rankedLPs.length) openLP(rankedLPs[0].lp.id);
})();
