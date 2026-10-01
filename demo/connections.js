/* "Warm paths": connect Gmail (read-only, metadata only) and score how well you already know each LP / its GPs.
   PRIVACY: only From/To/Cc/Date headers are read (scope gmail.metadata: no bodies, no subjects). Everything is processed in this page;
   nothing is uploaded or stored, the access token lives in memory only. "Sample mailbox" generates clearly labelled synthetic data.
   Score (0-100) per contact = (40% volume you sent + 35% volume they sent back + 25% two-way balance) x recency discount (1.0 recent, down to 0.55 when long quiet). */
(function () {
  "use strict";
  var d = window.DEMO_FIXTURE, panel = document.getElementById("prospects"), table = document.getElementById("lp-table");
  if (!d || !d.realData || !panel || !table) return;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var FREE = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|gmx|web|proton|protonmail|aol|msn|qq|163|mail)\./i;
  var NOREPLY = /(no-?reply|donotreply|notifications?|mailer-daemon|newsletter|bounce|support@|info@)/i;
  var state = { scores: null, sort: "relevance", shown: 25, sample: false, myDomain: null };

  /* ---------- domain index ---------- */
  var norm = function (x) { return String(x || "").toLowerCase().replace(/^www\./, "").trim(); };
  var gpById = {}; d.gps.forEach(function (g) { gpById[g.id] = g; });
  var index = {};   // domain -> [{kind,id}]
  d.lps.forEach(function (l) { if (l.domain) (index[norm(l.domain)] = index[norm(l.domain)] || []).push({ kind: "lp", id: l.id }); });
  d.gps.forEach(function (g) { if (g.domain) (index[norm(g.domain)] = index[norm(g.domain)] || []).push({ kind: "gp", id: g.id }); });
  function lookup(email) {
    var dom = norm(email.split("@")[1]); if (!dom || FREE.test(dom + ".")) return [];
    var hits = []; Object.keys(index).forEach(function (k) { if (dom === k || dom.slice(-(k.length + 1)) === "." + k) hits = hits.concat(index[k]); });
    return hits;
  }

  /* ---------- scoring (pure; unit-tested in test_connections.html) ---------- */
  function parseAddrs(h) {
    var out = [], re = /(?:"?([^"<>,]*)"?\s*)?<([^>]+)>|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g, m;
    while ((m = re.exec(h || ""))) out.push({ email: (m[2] || m[3]).toLowerCase().trim(), name: (m[1] || "").trim() });
    return out;
  }
  function contactStrength(c, now) {
    var vol = Math.min(1, Math.log(1 + c.sent) / Math.log(11)), back = Math.min(1, Math.log(1 + c.recv) / Math.log(6));
    var days = Math.max(0, (now - c.last) / 86400000), rec = Math.exp(-days / 365), bal = c.sent && c.recv ? Math.min(c.sent, c.recv) / Math.max(c.sent, c.recv) : 0;
    var eng = Math.min(1, (c.sent + c.recv) / 4);                   // balance only counts once there is real traffic
    return Math.round(100 * (.40 * vol + .35 * back + .25 * bal * eng) * (.55 + .45 * rec));   // a quiet relationship is discounted, never zeroed
  }
  function analyse(messages, myEmail, now) {
    now = now || Date.now(); var me = norm((myEmail || "").split("@")[1]), contacts = {};
    messages.forEach(function (m) {
      var t = m.date ? Date.parse(m.date) : now;
      var add = function (a, key) {
        if (!a.email || NOREPLY.test(a.email) || (myEmail && a.email === myEmail.toLowerCase())) return;
        if (me && norm(a.email.split("@")[1]) === me) return;       // colleagues are not warm paths
        var c = contacts[a.email] = contacts[a.email] || { email: a.email, name: a.name, sent: 0, recv: 0, last: 0 };
        c[key]++; if (a.name && !c.name) c.name = a.name; if (t > c.last) c.last = t;
      };
      if (m.dir === "sent") parseAddrs(m.to).concat(parseAddrs(m.cc)).forEach(function (a) { add(a, "sent"); });
      else parseAddrs(m.from).forEach(function (a) { add(a, "recv"); });
    });
    var per = {};   // entity id -> best contacts
    Object.keys(contacts).forEach(function (e) {
      var c = contacts[e]; c.score = contactStrength(c, now);
      lookup(e).forEach(function (h) { (per[h.kind + ":" + h.id] = per[h.kind + ":" + h.id] || []).push(c); });
    });
    var res = {}, found = 0;
    d.lps.forEach(function (l) {
      var direct = (per["lp:" + l.id] || []).slice().sort(function (a, b) { return b.score - a.score; });
      var via = [];
      l.gps.forEach(function (g) { (per["gp:" + g] || []).forEach(function (c) { via.push({ gp: gpById[g] ? gpById[g].name : g, c: c }); }); });
      via.sort(function (a, b) { return b.c.score - a.c.score; });
      var dS = direct.length ? direct[0].score : 0, iS = via.length ? Math.round(via[0].c.score * .6) : 0, tot = Math.min(100, Math.round(Math.max(dS, iS) + .25 * Math.min(dS, iS)));
      res[l.id] = { score: tot, direct: direct.slice(0, 5), via: via.slice(0, 5), dS: dS, iS: iS, gpsReached: via.reduce(function (s, v) { return s.indexOf(v.gp) === -1 ? s.concat(v.gp) : s; }, []).length };
      if (tot) found++;
    });
    return { byLp: res, contacts: Object.keys(contacts).length, lpsWithPath: found };
  }
  window.ConnectionScore = { analyse: analyse, contactStrength: contactStrength, parseAddrs: parseAddrs };

  /* ---------- sample mailbox (synthetic, labelled) ---------- */
  function sampleMessages() {
    var out = [], now = Date.now(), day = 86400000, ranked = d.lps.slice(0, 25);
    var mk = function (dom, name) { return '"' + name + '" <' + name.toLowerCase().replace(/\W+/g, ".") + "@" + dom + ">"; };
    function add(dom, name, sent, recv, lastDays) {
      for (var i = 0; i < sent; i++) out.push({ dir: "sent", to: mk(dom, name), date: new Date(now - (lastDays + i * 23) * day).toUTCString() });
      for (var j = 0; j < recv; j++) out.push({ dir: "recv", from: mk(dom, name), date: new Date(now - (lastDays + j * 31) * day).toUTCString() });
    }
    // direct contacts at LPs (strong / medium / weak)
    [[0, "Alex Sample", 9, 7, 12], [1, "Priya Sample", 4, 2, 70], [3, "Sam Sample", 2, 0, 240], [5, "Lena Sample", 6, 4, 25]].forEach(function (p) { if (ranked[p[0]] && ranked[p[0]].domain) add(ranked[p[0]].domain, p[1], p[2], p[3], p[4]); });
    // contacts at GPs that many LPs back: these create warm intro paths to several LPs at once
    var backers = {}; d.lps.forEach(function (l) { l.gps.forEach(function (g) { backers[g] = (backers[g] || 0) + 1; }); });
    var gps = d.gps.filter(function (g) { return g.domain; }).sort(function (a, b) { return (backers[b.id] || 0) - (backers[a.id] || 0); });
    [["Jordan Sample", 14, 11, 4], ["Riley Sample", 5, 3, 60], ["Casey Sample", 3, 1, 150], ["Morgan Sample", 1, 1, 400], ["Taylor Sample", 7, 6, 20]].forEach(function (p, i) { if (gps[i]) add(gps[i].domain, p[0], p[1], p[2], p[3]); });
    out.push({ dir: "sent", to: "newsletter@example.com", date: new Date().toUTCString() });
    out.push({ dir: "recv", from: "noreply@example.com", date: new Date().toUTCString() });
    return out;
  }

  /* ---------- Gmail (metadata scope) ---------- */
  var GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
  var token = null;
  function loadGIS() { return new Promise(function (res, rej) { if (window.google && google.accounts && google.accounts.oauth2) return res(); var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.onload = res; s.onerror = function () { rej(new Error("Could not load Google sign-in")); }; document.head.appendChild(s); }); }
  function connect(clientId) {
    return loadGIS().then(function () { return new Promise(function (res, rej) {
      google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: "https://www.googleapis.com/auth/gmail.metadata", callback: function (r) { if (r.error) rej(new Error(r.error_description || r.error)); else { token = r.access_token; res(); } } }).requestAccessToken();
    }); });
  }
  function api(path) { return fetch(GMAIL + path, { headers: { Authorization: "Bearer " + token } }).then(function (r) { if (!r.ok) throw new Error("Gmail API " + r.status); return r.json(); }); }
  function listIds(label, max) {
    var ids = [];
    return (function page(tok) {
      return api("/messages?labelIds=" + label + "&maxResults=500" + (tok ? "&pageToken=" + tok : "")).then(function (j) { ids = ids.concat((j.messages || []).map(function (m) { return m.id; })); return j.nextPageToken && ids.length < max ? page(j.nextPageToken) : ids.slice(0, max); });
    })();
  }
  function fetchHeaders(ids, dir, onTick) {
    var out = [], i = 0, conc = 8;
    function worker() { if (i >= ids.length) return Promise.resolve(); var id = ids[i++]; return api("/messages/" + id + "?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date").then(function (m) {
      var h = {}; ((m.payload || {}).headers || []).forEach(function (x) { h[x.name.toLowerCase()] = x.value; });
      out.push({ dir: dir, from: h.from, to: h.to, cc: h.cc, date: h.date || (m.internalDate ? new Date(+m.internalDate).toUTCString() : null) }); onTick(); return worker(); }); }
    return Promise.all(Array.apply(null, Array(conc)).map(worker)).then(function () { return out; });
  }
  function scan(max, setStatus) {
    var done = 0, total = 0;
    return api("/profile").then(function (p) { state.me = p.emailAddress; return Promise.all([listIds("SENT", max), listIds("INBOX", max)]); }).then(function (l) {
      total = l[0].length + l[1].length; var tick = function () { done++; if (done % 25 === 0) setStatus("Reading headers… " + done + " / " + total); };
      return fetchHeaders(l[0], "sent", tick).then(function (a) { return fetchHeaders(l[1], "recv", tick).then(function (b) { return a.concat(b); }); });
    });
  }

  /* ---------- UI ---------- */
  var card = document.createElement("div"); card.className = "card wp-card";
  var saved = ""; try { saved = localStorage.getItem("wp_client_id") || ""; } catch (e) {}
  card.innerHTML = '<div class="card-head"><div><h2>Warm paths: who do you already know?</h2><div class="small muted">Connect Gmail to score your existing relationship with each LP, or with the GPs behind it.</div></div><span class="tag">Read-only · metadata only</span></div>' +
    '<div class="wp-body"><div class="wp-actions"><button type="button" class="action-button" id="wp-connect">Connect Gmail</button><button type="button" class="wp-ghost" id="wp-sample">Try with a sample mailbox</button><button type="button" class="wp-ghost" id="wp-setup-toggle">Setup</button><button type="button" class="wp-ghost" id="wp-disconnect" hidden>Disconnect</button><span class="wp-status" id="wp-status" role="status"></span></div>' +
    '<div class="wp-setup" id="wp-setup" hidden><p><strong>One-time setup (2 minutes, free):</strong> in Google Cloud Console create a project, enable the <em>Gmail API</em>, configure the OAuth consent screen (add yourself as a test user), and create an <em>OAuth client ID</em> of type <em>Web application</em> with authorised JavaScript origin <code>' + esc(location.origin) + '</code>. Paste the client ID below.</p><label>Client ID <input id="wp-client" type="text" placeholder="123456789-abc.apps.googleusercontent.com" value="' + esc(saved) + '"></label></div>' +
    '<ul class="wp-privacy"><li>Reads only <b>From / To / Cc / Date</b> headers of your latest sent and received messages (scope <code>gmail.metadata</code>): no message bodies, no subjects.</li><li>Processed in this browser tab. Nothing is uploaded or stored; the access token is kept in memory and discarded when you close the tab or disconnect.</li><li>Score per contact (0-100): 40% how much you wrote, 35% how much they wrote back, 25% two-way balance (once there are 4+ emails), all discounted up to 45% as the last contact gets older. An LP scores on people at its own domain, and at the GPs it backs (a warm intro path, discounted 40%).</li></ul>' +
    '<div class="wp-result" id="wp-result" hidden></div></div>';
  var layout = panel.querySelector(".rank-layout"); panel.insertBefore(card, layout);
  var css = document.createElement("style");
  css.textContent = ".wp-body{padding:14px 18px 16px}.wp-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.wp-ghost{border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 13px;font:inherit;font-size:13px;font-weight:700;color:#40566c;cursor:pointer}.wp-status{font-size:13px;color:#34495e;margin-left:6px}.wp-setup{margin-top:12px;padding:12px;background:#f5f8fb;border-radius:10px;font-size:13px;line-height:1.5}.wp-setup input{display:block;width:100%;margin-top:6px;padding:9px;font:inherit;border:1px solid #b8c6d4;border-radius:8px}.wp-privacy{margin:12px 0 0;padding-left:18px;font-size:12px;color:#52667b;line-height:1.55}.wp-result{margin-top:12px;padding:12px 14px;border-left:3px solid #1c9b78;background:#eefaf5;border-radius:0 8px 8px 0;font-size:13.5px}.wp-sample-flag{display:inline-block;background:#fff3cd;color:#7a5a00;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:800;margin-right:6px}.wp-bar{display:inline-block;width:64px;height:8px;background:#e5ecf3;border-radius:4px;vertical-align:middle;overflow:hidden}.wp-bar i{display:block;height:100%;background:#1c9b78}.wp-score{font-weight:800;margin-left:6px}.wp-tag{font-size:11px;font-weight:800;border-radius:99px;padding:2px 8px;margin-left:6px}.wp-strong{background:#d9f3e7;color:#0f6b46}.wp-med{background:#fdf0cf;color:#7a5a00}.wp-weak{background:#eef2f6;color:#52667b}.wp-sort{display:flex;gap:6px;align-items:center;margin:0 0 10px;font-size:12px;color:#52667b}.wp-sort button{border:1px solid var(--line);background:#fff;border-radius:99px;padding:5px 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;color:#40566c}.wp-sort button[aria-pressed=true]{background:#132438;color:#fff;border-color:#132438}.wp-contacts{margin:6px 0 0;padding-left:16px;font-size:12.5px}.wp-contacts li{margin:3px 0}";
  document.head.appendChild(css);
  var $ = function (id) { return document.getElementById(id); }, setStatus = function (t) { $("wp-status").textContent = t; };
  $("wp-setup-toggle").addEventListener("click", function () { $("wp-setup").hidden = !$("wp-setup").hidden; });

  function label(s) { return s >= 60 ? ["Strong", "wp-strong"] : s >= 30 ? ["Medium", "wp-med"] : s > 0 ? ["Weak", "wp-weak"] : null; }
  function apply(result, sample) {
    state.scores = result.byLp; state.sample = sample; state.sort = "warm";
    var r = $("wp-result"); r.hidden = false;
    var top = d.lps.filter(function (l) { return result.byLp[l.id].score; }).sort(function (a, b) { return result.byLp[b.id].score - result.byLp[a.id].score; }).slice(0, 3);
    r.innerHTML = (sample ? '<span class="wp-sample-flag">SAMPLE DATA, not your email</span>' : "") + "<strong>" + result.contacts + "</strong> external contacts found; <strong>" + result.lpsWithPath + "</strong> of " + d.lps.length + " LPs have a direct or GP-mediated warm path." + (top.length ? " Warmest: " + top.map(function (l) { return "<b>" + esc(l.name) + "</b> (" + result.byLp[l.id].score + ")"; }).join(", ") + "." : "");
    decorate(); sortRows(); if (window.connBlock) window.connBlock();
    $("wp-disconnect").hidden = sample; setStatus(sample ? "Showing a synthetic mailbox." : "Connected as " + (state.me || "your account") + ".");
  }
  var th = null;
  function decorate() {
    var head = table.querySelector("thead tr"); if (head && !head.querySelector(".wp-th")) { var h = document.createElement("th"); h.className = "wp-th"; h.textContent = "Warm path"; head.appendChild(h); }
    table.querySelectorAll("tbody tr").forEach(function (row) {
      var c = row.querySelector(".wp-td"); if (!c) { c = document.createElement("td"); c.className = "wp-td"; row.appendChild(c); }
      var s = state.scores && state.scores[row.dataset.lp], lb = s && label(s.score);
      c.innerHTML = !state.scores ? '<span class="small muted">connect Gmail</span>' : lb ? '<span class="wp-bar"><i style="width:' + s.score + '%"></i></span><span class="wp-score">' + s.score + '</span><span class="wp-tag ' + lb[1] + '">' + lb[0] + "</span>" : '<span class="small muted">none</span>';
    });
    if (!document.querySelector(".wp-sort")) {
      var s = document.createElement("div"); s.className = "wp-sort"; s.innerHTML = 'Sort by <button type="button" data-sort="relevance" aria-pressed="true">FI relevance</button><button type="button" data-sort="warm" aria-pressed="false">Warm path</button><button type="button" data-sort="combined" aria-pressed="false">Combined</button>';
      table.parentNode.parentNode.insertBefore(s, table.parentNode);
      s.addEventListener("click", function (e) { var b = e.target.closest("[data-sort]"); if (b) { state.sort = b.dataset.sort; sortRows(); } });
    }
  }
  var base = null;
  function sortRows() {
    var body = table.querySelector("tbody"); if (!body) return; var rows = Array.prototype.slice.call(body.querySelectorAll("tr"));
    if (!base) base = rows.slice();
    var reach = {}; d.lps.forEach(function (l) { reach[l.id] = l.fiCompanies || 0; });
    var maxR = Math.max.apply(null, Object.keys(reach).map(function (k) { return reach[k]; })) || 1;
    var key = function (r) { var id = r.dataset.lp, w = state.scores && state.scores[id] ? state.scores[id].score : 0; return state.sort === "warm" ? w * 1000 + reach[id] : state.sort === "combined" ? (w + 100 * reach[id] / maxR) : -base.indexOf(r); };
    rows.sort(function (a, b) { return key(b) - key(a); });
    rows.forEach(function (r, i) { body.appendChild(r); r.style.display = i < state.shown ? "" : "none"; var rk = r.querySelector(".rank"); if (rk) rk.textContent = i + 1; });
    document.querySelectorAll(".wp-sort button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.sort === state.sort)); });
    var more = document.getElementById("wp-more");
    if (!more) { more = document.createElement("button"); more.id = "wp-more"; more.type = "button"; more.className = "wp-ghost"; more.style.margin = "10px 0 0"; table.parentNode.appendChild(more); more.addEventListener("click", function () { state.shown = state.shown === 25 ? rows.length : 25; sortRows(); }); }
    more.textContent = state.shown === 25 ? "Show all " + rows.length + " LPs" : "Show top 25 only";
  }
  decorate(); sortRows();

  $("wp-sample").addEventListener("click", function () { apply(analyse(sampleMessages(), null, Date.now()), true); });
  $("wp-connect").addEventListener("click", function () {
    var cid = $("wp-client").value.trim();
    if (!cid) { $("wp-setup").hidden = false; setStatus("Paste your Google OAuth client ID first (setup steps below)."); $("wp-client").focus(); return; }
    try { localStorage.setItem("wp_client_id", cid); } catch (e) {}
    setStatus("Opening Google sign-in…");
    connect(cid).then(function () { return scan(600, setStatus); }).then(function (msgs) { apply(analyse(msgs, state.me, Date.now()), false); }).catch(function (e) { setStatus("Could not connect: " + e.message); });
  });
  $("wp-disconnect").addEventListener("click", function () {
    if (token && window.google) google.accounts.oauth2.revoke(token, function () {}); token = null; state.scores = null; $("wp-result").hidden = true; $("wp-disconnect").hidden = true; state.sort = "relevance"; decorate(); sortRows(); setStatus("Disconnected. Nothing was stored.");
  });

  /* connection detail inside the LP detail card */
  var detail = document.getElementById("lp-detail");
  function connBlock() {
    if (!detail || !state.scores) return; var old = detail.querySelector(".wp-detail"); if (old) old.remove();
    var sel = table.querySelector("tr.selected"), id = sel && sel.dataset.lp, s = id && state.scores[id]; if (!s) return;
    var lis = s.direct.map(function (c) { return "<li><b>" + esc(c.name || c.email) + "</b> at the LP · " + c.sent + " sent / " + c.recv + " received · last " + new Date(c.last).toISOString().slice(0, 10) + " · score " + c.score + "</li>"; }).concat(s.via.slice(0, 3).map(function (v) { return "<li>via <b>" + esc(v.gp) + "</b>: " + esc(v.c.name || v.c.email) + " · " + v.c.sent + " sent / " + v.c.recv + " received · score " + v.c.score + "</li>"; }));
    var blk = document.createElement("div"); blk.className = "detail-block wp-detail"; blk.innerHTML = "<strong>Your connection" + (state.sample ? ' <span class="wp-sample-flag">SAMPLE</span>' : "") + "</strong><p><b>" + s.score + "</b> / 100" + (s.dS ? " · direct " + s.dS : "") + (s.iS ? " · via GPs " + s.iS : "") + "</p>" + (lis.length ? '<ul class="wp-contacts">' + lis.join("") + "</ul>" : '<p class="small muted">No emails with this LP or its GPs.</p>');
    detail.insertBefore(blk, detail.children[2] || null);
  }
  if (detail) new MutationObserver(function () { if (state.scores && !detail.querySelector(".wp-detail")) connBlock(); }).observe(detail, { childList: true });
  window.connBlock = connBlock;
})();
