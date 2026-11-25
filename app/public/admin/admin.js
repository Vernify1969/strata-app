(function () {
  const nav = [
    ["dashboard", "Dashboard"],
    ["users", "Users"],
    ["organisations", "Organisations"],
    ["buildings", "Buildings"],
    ["jobs", "Jobs"],
    ["payments", "Payments"],
    ["mail", "Email"],
    ["messages", "Messages"],
    ["reports", "Reports"],
    ["documents", "Documents"],
    ["ai", "AI Assistant"],
    ["map", "Map"],
    ["settings", "Settings"],
    ["audit", "Activity"]
  ];
  const screen = document.getElementById("screen");
  const navEl = document.getElementById("nav");
  navEl.innerHTML = nav.map(([id, label]) => '<a class="item" href="#/' + id + '">' + label + "</a>").join("");
  document.getElementById("menu").addEventListener("click", () => document.querySelector(".side").classList.toggle("open"));

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { "content-type": "application/json", "x-requested-with": "StrataApp" },
      body: body == null ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json, text };
  }
  function dollars(cents) {
    return "A$" + (Number(cents || 0) / 100).toFixed(2);
  }
  function table(columns, rows, href) {
    const head = "<tr>" + columns.map((col) => "<th>" + esc(col.label) + "</th>").join("") + "</tr>";
    const body = rows.map((row) => "<tr>" + columns.map((col) => {
      const value = col.value ? col.value(row) : row[col.key];
      const cell = esc(value);
      return "<td>" + (col.link ? '<a href="' + href(row) + '">' + cell + "</a>" : cell) + "</td>";
    }).join("") + "</tr>").join("");
    return "<table>" + head + body + "</table>";
  }
  async function confirmed(path, body) {
    if (!window.confirm("Save this change?")) return null;
    const reason = window.prompt("Reason") || "";
    return api("POST", path, { ...body, confirm: true, reason });
  }
  function bars(items) {
    const max = Math.max(1, ...items.map((item) => Number(item.n || item.count || 0)));
    return '<div class="bar">' + items.map((item) => '<span title="' + esc(item.stage || item.month) + '" style="height:' + Math.max(4, (Number(item.n) / max) * 110) + 'px"></span>').join("") + "</div>";
  }

  async function draw() {
    const hash = location.hash.replace(/^#\//, "") || "dashboard";
    const [section, id] = hash.split("/");
    document.querySelectorAll(".side a").forEach((link) => {
      link.setAttribute("aria-current", link.getAttribute("href") === "#/" + section ? "page" : "false");
    });
    const pages = { dashboard, users, organisations, buildings, jobs, payments, mail, messages, reports, documents, ai, map, settings, audit };
    const fn = pages[section] || dashboard;
    screen.innerHTML = "<p>Loading…</p>";
      try {
      screen.innerHTML = await fn(id);
      if (section === "map") mountAdminMap();
    } catch (err) {
      screen.innerHTML = '<p class="bad">The admin console could not load this section.</p>';
    }
  }

  async function dashboard() {
    const res = await api("GET", "/api/admin/dashboard");
    if (!res.ok) return refused(res);
    const data = res.json;
    const cards = [
      ["Managers", data.managers],
      ["Contractors", data.contractors],
      ["Open jobs", data.openJobs],
      ["Open reports", data.openReports],
      ["Money held", dollars(data.moneyHeldCents)],
      ["Released", dollars(data.moneyReleasedCents)],
      ["Fees", dollars(data.feesEarnedCents)],
      ["New sign-ups", data.newSignups],
      ["Documents expiring", data.documentsExpiring],
      ["AI use", dollars(data.aiSpentCents)]
    ];
    return "<h1>Dashboard</h1><div class=\"cards\">" + cards.map(([label, value]) => '<article class="card"><span class="muted">' + label + "</span><strong>" + esc(value) + "</strong></article>").join("") + "</div>" +
      '<div class="charts"><section class="panel"><h2>Jobs</h2>' + bars(data.jobsByStage || []) + '</section><section class="panel"><h2>Sign-ups</h2>' + bars(data.signups || []) + "</section></div>" +
      "<h2>Needs attention</h2>" + ((data.attention || []).map((item) => '<p><a href="' + esc(item.href) + '">' + esc(item.text) + "</a></p>").join("") || "<p>Nothing is waiting.</p>") +
      '<p class="notice">' + esc(data.refunds) + "</p>";
  }

  function refused(res) {
    return '<h1>Admin console</h1><p class="notice">' + esc((res.json && res.json.error) || "Sign in as the platform owner.") + "</p>";
  }

  async function users(id) {
    if (id) return userDetail(id);
    const res = await api("GET", "/api/admin/users");
    if (!res.ok) return refused(res);
    return "<h1>Users</h1><p><a href=\"/api/admin/users.csv\">Export CSV</a></p>" +
      table([{ key: "name", label: "Name", link: true }, { key: "email", label: "Email" }, { key: "role", label: "Role" }, { key: "suspended", label: "Suspended", value: (row) => row.suspended ? "Yes" : "No" }], res.json.rows, (row) => "#/users/" + row.id);
  }

  async function userDetail(id) {
    const res = await api("GET", "/api/admin/users/" + id);
    if (!res.ok) return refused(res);
    const user = res.json.user;
    return '<h1>' + esc(user.name) + "</h1><p>" + esc(user.email) + " · " + esc(user.role) + "</p>" +
      '<form class="stack panel" id="user-form"><label class="field">Name<input name="name" value="' + esc(user.name) + '"></label>' +
      '<label class="field">Phone<input name="mobile" value="' + esc(user.mobile) + '"></label>' +
      '<label class="field">Company<input name="businessName" value="' + esc(user.businessName) + '"></label>' +
      '<label class="field">ABN<input name="abn" value="' + esc(user.abn) + '"></label>' +
      '<button type="submit">Save details</button></form>' +
      '<p><button type="button" id="suspend">' + (user.suspended ? "Reactivate" : "Suspend") + '</button> <button type="button" id="reset">Send password reset email</button> <button type="button" id="view">View as</button></p>' +
      "<h2>Strikes</h2>" + (res.json.strikes || []).map((row) => "<p>" + esc(row.reason) + "</p>").join("") +
      '<button type="button" id="strike">Add a strike</button>' +
      "<h2>Notes</h2>" + (res.json.notes || []).map((row) => "<p>" + esc(row.body) + "</p>").join("") +
      '<button type="button" id="note">Add a note</button>';
  }

  async function organisations() {
    const res = await api("GET", "/api/admin/organisations");
    if (!res.ok) return refused(res);
    return "<h1>Organisations</h1>" + table([{ key: "name", label: "Name" }, { key: "world", label: "World" }], res.json.rows);
  }

  async function buildings(id) {
    if (!id) {
      const res = await api("GET", "/api/admin/buildings");
      if (!res.ok) return refused(res);
      return "<h1>Buildings</h1>" + table([{ key: "name", label: "Name", link: true }, { key: "suburb", label: "Suburb" }, { key: "region_id", label: "Region" }], res.json.rows, (row) => "#/buildings/" + row.id);
    }
    const res = await api("GET", "/api/admin/buildings/" + id);
    if (!res.ok) return refused(res);
    const building = res.json.building;
    return '<h1>' + esc(building.name) + "</h1><p>" + esc(building.suburb) + " · " + esc(building.regionId) + "</p>" +
      "<h2>Managers</h2>" + (res.json.managers || []).map((row) => "<p>" + esc(row.name) + "</p>").join("") +
      "<h2>QR codes</h2>" + (res.json.places || []).map((row) => "<p>" + esc(row.name) + (row.active ? "" : " · Off") + ' <button type="button" data-place="' + esc(row.id) + '" data-on="' + (row.active ? "0" : "1") + '">' + (row.active ? "Disable" : "Enable") + "</button></p>").join("");
  }

  async function jobs(id) {
    if (!id) {
      const res = await api("GET", "/api/admin/jobs");
      if (!res.ok) return refused(res);
      return "<h1>Jobs</h1><p><a href=\"/api/admin/jobs.csv\">Export CSV</a></p>" +
        table([{ key: "title", label: "Title", link: true }, { key: "stage", label: "Status" }], res.json.rows, (row) => "#/jobs/" + row.id);
    }
    const res = await api("GET", "/api/admin/jobs/" + id);
    if (!res.ok) return refused(res);
    const job = res.json.job;
    return '<h1>' + esc(job.title) + "</h1><p>" + esc(job.stage) + "</p><p>" + esc(job.instructions) + "</p>" +
      "<h2>Timeline</h2>" + (res.json.timeline || []).map((row) => "<p>" + esc(row.at) + " · " + esc(row.body) + "</p>").join("") +
      "<h2>Quotes</h2>" + (res.json.quotes || []).map((row) => "<p>" + (row.price_cents / 100).toFixed(2) + " · " + esc(row.status) + "</p>").join("") +
      '<p><button type="button" id="cancel-job">Cancel job</button></p>';
  }

  async function payments() {
    const res = await api("GET", "/api/admin/payments");
    if (!res.ok) return refused(res);
    return "<h1>Payments</h1><p class=\"notice\">" + esc(res.json.refunds) + "</p><p><a href=\"/api/admin/payments.csv\">Export CSV</a></p>" +
      table([{ key: "invoice", label: "Invoice" }, { key: "ledger", label: "Ledger" }, { key: "amount_cents", label: "Amount", value: (row) => dollars(row.amount_cents) }, { key: "stripePaymentId", label: "Stripe id" }], res.json.rows);
  }

  async function mail() {
    const res = await api("GET", "/api/admin/mail");
    if (!res.ok) return refused(res);
    const drafts = await api("GET", "/api/admin/drafts");
    return "<h1>Email</h1>" + table([{ key: "created_at", label: "When" }, { key: "to_email", label: "To" }, { key: "subject", label: "Subject" }, { key: "status", label: "Status" }], res.json.rows) +
      "<h2>Drafts</h2>" + ((drafts.json && drafts.json.rows) || []).map((row) => "<p>" + esc(row.subject) + " · " + esc(row.status) + "</p>").join("");
  }

  async function messages() {
    const res = await api("GET", "/api/admin/messages");
    if (!res.ok) return refused(res);
    return "<h1>Messages</h1>" + table([{ key: "created_at", label: "When" }, { key: "author", label: "From" }, { key: "body", label: "Message" }], res.json.rows);
  }

  async function reports() {
    const res = await api("GET", "/api/admin/reports");
    if (!res.ok) return refused(res);
    return "<h1>Resident reports</h1>" + table([{ key: "reference", label: "Reference" }, { key: "building_name", label: "Building" }, { key: "status", label: "Status" }, { key: "description", label: "Description" }], res.json.rows);
  }

  async function documents() {
    const res = await api("GET", "/api/admin/documents");
    if (!res.ok) return refused(res);
    return "<h1>Documents</h1>" + (res.json.rows || []).map((row) => '<article class="panel"><h2>' + esc(row.contractor_name) + " · " + esc(row.kind) + "</h2><p>" + esc(row.badge) + "</p><p>Expiry " + esc(row.expiry_on || row.suggested_expiry || "none") + " · Number " + esc(row.licence_number || row.suggested_number || "none") + '</p><p><a href="/api/admin/documents/' + esc(row.id) + '/file">Preview</a></p></article>').join("");
  }

  async function ai() {
    const res = await api("GET", "/api/admin/ai");
    if (!res.ok) return refused(res);
    const data = res.json;
    const feedback = data.feedback || { up: 0, down: 0, corrections: 0 };
    return "<h1>AI Assistant</h1><p>Managers " + dollars(data.managerCapCents) + " · Contractors " + dollars(data.contractorCapCents) + " · Owner has no cap.</p>" +
      "<p>Feedback, with no names: " + feedback.up + " helpful, " + feedback.down + " not helpful, " + feedback.corrections + " corrections.</p>" +
      table([{ key: "name", label: "Name" }, { key: "role", label: "Role" }, { key: "spent_cents", label: "Spent", value: (row) => dollars(row.spent_cents) }], data.people || []) +
      "<h2>Log</h2>" + table([{ key: "created_at", label: "When" }, { key: "helper", label: "Helper" }, { key: "demo", label: "Sample", value: (row) => row.demo ? "Yes" : "No" }], data.logs || []);
  }

  function map() {
    return "<h1>Map</h1><p>Melbourne council areas. Jobs and buildings in the main app use the same map.</p><div id=\"admin-map\" style=\"height:360px;border-radius:12px\"></div><p class=\"muted\">Council areas: Australian Bureau of Statistics, ASGS Edition 3, Local Government Areas 2023, simplified, CC BY 4.0. Map data © OpenStreetMap contributors.</p>";
  }

  const METRO = ["Banyule", "Bayside", "Boroondara", "Brimbank", "Cardinia", "Casey", "Darebin", "Frankston", "Glen Eira", "Greater Dandenong", "Hobsons Bay", "Hume", "Kingston", "Knox", "Manningham", "Maribyrnong", "Maroondah", "Melbourne", "Melton", "Merri-bek", "Monash", "Moonee Valley", "Mornington Peninsula", "Nillumbik", "Port Phillip", "Stonnington", "Whitehorse", "Whittlesea", "Wyndham", "Yarra", "Yarra Ranges"];
  function mountAdminMap() {
    const el = document.getElementById("admin-map");
    if (!el || !window.L) return;
    const map = L.map(el).setView([-37.8136, 144.9631], 11);
    fetch("/api/map-tiles").then((res) => res.json()).catch(() => ({})).then((tiles) => {
      const url = tiles.url || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
      const layer = L.tileLayer(url, { maxZoom: tiles.maxZoom || 19, subdomains: url.indexOf("{s}") === -1 ? "a" : "abcd", attribution: tiles.attribution || "Tiles © Esri" });
      let failed = 0;
      layer.on("tileerror", () => { failed += 1; if (failed >= 4 && map.hasLayer(layer)) map.removeLayer(layer); });
      layer.addTo(map);
    });
    fetch("/maps/melbourne-lgas.geojson").then((res) => res.json()).then((data) => {
      const kept = { type: "FeatureCollection", features: (data.features || []).filter((feature) => METRO.indexOf(feature.properties && feature.properties.name) !== -1) };
      const councils = L.geoJSON(kept, { style: { color: "#0F766E", weight: 2, fillColor: "#99F6E4", fillOpacity: 0.12 } }).addTo(map);
      const label = () => councils.eachLayer((shape) => {
        const name = shape.feature && shape.feature.properties && shape.feature.properties.name;
        if (!name) return;
        const box = shape.getBounds();
        const nw = map.latLngToContainerPoint(box.getNorthWest());
        const se = map.latLngToContainerPoint(box.getSouthEast());
        const roomy = Math.abs(se.x - nw.x) > 80 && Math.abs(se.y - nw.y) > 36;
        shape.unbindTooltip();
        shape.bindTooltip(name, map.getZoom() >= 11 && roomy ? { permanent: true, direction: "center" } : { sticky: true });
      });
      map.on("zoomend", label);
      setTimeout(() => { map.invalidateSize(); label(); }, 0);
    });
  }

  async function settings() {
    const res = await api("GET", "/api/admin/settings");
    if (!res.ok) return refused(res);
    const data = res.json;
    return "<h1>Settings</h1><p>Fee " + esc(data.commissionPercent) + "% · Deposit " + esc(data.depositHours) + "h · Urgent " + esc(data.urgentDepositHours) + "h · Reminder check every " + esc(data.reminderCheckHours) + "h.</p>" +
      "<h2>Look</h2><p>One setting for the whole app. The current look is " + esc(data.designTheme || "clear") + ".</p>" +
      '<p><button class="btn look-choice" type="button" data-look="clear">Clear &amp; Calm</button> <button class="btn look-choice" type="button" data-look="warm">Warm Professional</button> <button class="btn look-choice" type="button" data-look="modern">Modern Dark-Accent</button></p>' +
      "<h2>Chloe</h2><p>Default name " + esc(data.assistantName || "Chloe") + ". Greeting: " + esc(data.assistantGreeting || "") + ". Tone: " + esc(data.assistantTone || "friendly") + ".</p>" +
      "<p>Web search is " + (data.webSearchEnabled === false ? "paused" : "on") + ". Chloe chooses when to search. There is no domain list.</p>" +
      '<button class="btn" type="button" id="web-emergency">' + (data.webSearchEnabled === false ? "Turn web search back on" : "Emergency: pause web search") + "</button>" +
      "<h2>Templates</h2>" + (data.templates || []).map((row) => "<p><strong>" + esc(row.name) + "</strong><br>" + esc(row.subject) + "</p>").join("") +
      "<h2>Postcodes</h2><p>" + (data.postcodes || []).slice(0, 20).map(esc).join(", ") + "</p>" +
      "<h2>Holidays</h2>" + (data.holidays || []).slice(0, 8).map((row) => "<p>" + esc(row.day) + " " + esc(row.name) + (row.note ? " · " + esc(row.note) : "") + "</p>").join("");
  }

  async function audit() {
    const res = await api("GET", "/api/admin/audit");
    if (!res.ok) return refused(res);
    return "<h1>Activity</h1><p><a href=\"/api/admin/audit.csv\">Export CSV</a></p>" +
      table([{ key: "at", label: "When" }, { key: "action", label: "Action" }, { key: "detail", label: "Detail" }], res.json.rows);
  }

  document.getElementById("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const q = document.getElementById("search").value.trim();
    const box = document.getElementById("results");
    if (q.length < 2) { box.hidden = true; return; }
    const res = await api("GET", "/api/admin/search?q=" + encodeURIComponent(q));
    if (!res.ok) { box.hidden = false; box.textContent = "Search is only available to the platform owner."; return; }
    const bits = [];
    (res.json.users || []).forEach((row) => bits.push('<a href="#/users/' + row.id + '">' + esc(row.name) + "</a>"));
    (res.json.buildings || []).forEach((row) => bits.push('<a href="#/buildings/' + row.id + '">' + esc(row.name) + "</a>"));
    (res.json.jobs || []).forEach((row) => bits.push('<a href="#/jobs/' + row.id + '">' + esc(row.title) + "</a>"));
    box.hidden = false;
    box.innerHTML = bits.join(" · ") || "No matches.";
  });

  screen.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const id = (location.hash.split("/")[2] || "");
    if (button.id === "suspend" && id) {
      const res = await confirmed("/api/admin/users/" + id + "/suspend", {});
      if (res && res.ok) draw();
    }
    if (button.id === "reset" && id) await confirmed("/api/admin/users/" + id + "/send-reset", {});
    if (button.id === "view" && id) {
      const res = await confirmed("/api/admin/users/" + id + "/view-as", {});
      if (res && res.ok) location.href = "/";
    }
    if (button.classList.contains("look-choice")) {
      if (!window.confirm("Save this look for the whole app?")) return;
      const reason = window.prompt("Reason") || "";
      const res = await api("PATCH", "/api/admin/settings", { designTheme: button.dataset.look, confirm: true, reason });
      if (!res.ok) window.alert((res.json && res.json.error) || "That look was not saved.");
      else draw();
      return;
    }
    if (button.id === "web-emergency") {
      const pause = button.textContent.indexOf("pause") !== -1;
      const res = await confirmed("/api/admin/web-search", { enabled: !pause });
      if (res && res.ok) draw();
    }
    if (button.id === "cancel-job" && id) {
      const res = await confirmed("/api/admin/jobs/" + id + "/cancel", {});
      if (res && res.ok) draw();
    }
    if (button.dataset.place) {
      const res = await confirmed("/api/admin/places/" + button.dataset.place + "/active", { active: button.dataset.on === "1" });
      if (res && res.ok) draw();
    }
  });

  screen.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.id !== "user-form") return;
    event.preventDefault();
    const id = location.hash.split("/")[2];
    if (!window.confirm("Save this change?")) return;
    const reason = window.prompt("Reason") || "";
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await api("PATCH", "/api/admin/users/" + id, { ...data, confirm: true, reason });
    if (!res.ok) window.alert((res.json && res.json.error) || "That change was not saved.");
  });

  window.addEventListener("hashchange", draw);
  if (!location.hash) location.hash = "#/dashboard";
  draw();
})();
