(function () {
  const ROLE = {
    building: "building_manager",
    oc: "oc_manager",
    property: "property_manager"
  };

  function hooks() { return window.StrataWire.hooks; }

  function rememberedEmail() {
    try {
      const value = localStorage.getItem("strata-last-email") || "";
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
    } catch (err) {
      return "";
    }
  }

  function rememberEmail(email) {
    try { localStorage.setItem("strata-last-email", email); } catch (err) { /* this browser cannot store the email */ }
  }

  function isoDay(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function shiftCal(cal, dir) {
    cal.month += Number(dir) || 0;
    if (cal.month < 0) { cal.month = 11; cal.year -= 1; }
    if (cal.month > 11) { cal.month = 0; cal.year += 1; }
  }

  async function call(method, path, body) {
    const res = await fetch(path, {
      method: method,
      headers: { "content-type": "application/json", "x-requested-with": "StrataApp" },
      body: body == null ? undefined : JSON.stringify(body)
    });
    let json = {};
    try { json = await res.json(); } catch (e) { json = {}; }
    return { ok: res.ok, status: res.status, json: json };
  }

  function applyAccount() {
    const state = hooks().state;
    const me = state.account;
    if (!me) return;
    state.role = me.role === "contractor" ? "contractor" : "manager";
    if (me.role === "contractor") {
      const person = state.contractors.find(item => item.id === "c-sam");
      if (person) person.name = me.name;
      state.meId = "c-sam";
      return;
    }
    state.manager.name = me.name;
    state.manager.email = me.email;
    state.manager.phone = me.mobile || "";
    state.manager.company = me.businessName || "";
    state.manager.role = me.managerRole || "";
    state.manager.abn = me.abn || "";
    state.manager.consent = !!me.consent;
    state.manager.payment = me.payment || "";
  }

  function toClientBuilding(item) {
    return {
      id: item.id,
      name: item.name,
      streetNumber: item.streetNumber,
      street: item.street,
      suburb: item.suburb,
      postcode: item.postcode,
      lat: item.lat == null ? -37.8136 : item.lat,
      lng: item.lng == null ? 144.9631 : item.lng,
      oc: item.oc || "",
      ocAbn: "",
      limit: item.limit,
      tier1: item.tier1,
      q1: item.q1,
      tier2: item.tier2,
      q2: item.q2,
      tier3: item.tier3,
      q3: item.q3,
      quotesWanted: item.quotesWanted,
      open: item.open,
      close: item.close,
      weekends: !!item.weekends,
      access: item.access || "",
      captureM: item.captureM || 150,
      sample: false
    };
  }

  async function loadBuildings() {
    const state = hooks().state;
    if (!state.account || state.account.role === "contractor" || state.account.role === "platform_owner") return;
    const res = await call("GET", "/api/buildings");
    if (!res.ok) return;
    state.buildings = (res.json.buildings || []).map(toClientBuilding);
    if (state.preferredBuildingId && !state.buildings.some(item => item.id === state.preferredBuildingId)) state.preferredBuildingId = "";
    state.waiting = (res.json.waiting || []).map(item => ({
      id: item.id,
      name: item.name,
      suburb: item.suburb,
      postcode: item.postcode,
      streetNumber: "",
      street: "",
      lat: item.lat == null ? 0 : item.lat,
      lng: item.lng == null ? 0 : item.lng
    }));
  }

  async function loadJobs() {
    const state = hooks().state;
    const res = await call("GET", "/api/jobs");
    if (!res.ok) return;
    state.jobs = (res.json.jobs || []).map(job => Object.assign({
      photos: [], video: null, safetyNote: "", parking: "", parkingNote: "", siteRules: "",
      timeMode: "morning", exactTime: "", flexible: false, deadline: "", materials: "contractor",
      insurance: 20, swms: false, notice: "", lift: "", reference: "", otherTrade: "",
      safetyOnSite: [null, null, null, null, null], contractorAlert: false, alertSeen: false,
      paidAt: null, payMethod: null, releasedAt: null, reviewStartedAt: null, farDemo: false,
      arrival: null, eta: null, arrivalAt: null, arrivalDistance: null, arrivalConfirmed: false
    }, job, {
      evidence: job.evidence || { before: [], after: [], fix1: [], fix2: [] },
      challenges: job.challenges || [],
      timeline: (job.timeline || []).map(event => ({ at: Date.parse(event.t) || Date.now(), text: (event.who ? event.who + ": " : "") + (event.x || "") }))
    }));
    state.quotes = res.json.quotes || [];
    const people = res.json.contractors || [];
    if (state.account && state.account.role === "contractor") {
      state.meId = state.account.id;
      if (!people.some(person => person.id === state.account.id)) {
        people.push({
          id: state.account.id, name: state.account.name, trades: state.myTrades || ["plumbing"],
          years: 1, gst: true, abn: state.account.abn || "", licence: "To be checked",
          licenceUntil: "2099-01-01", insuranceUntil: "2099-01-01", cover: 20,
          description: state.account.businessName || "", consentPublic: true, bankLast4: "0000",
          guideDone: false, sample: false, basePostcode: state.basePostcode || ""
        });
      }
    }
    state.contractors = people;
  }

  async function loadArea() {
    const res = await call("GET", "/api/area");
    if (res.ok) hooks().state.owner.postcodes = res.json.postcodes || [];
  }

  async function loadNotes() {
    const state = hooks().state;
    if (!state.account || state.account.role === "contractor") {
      state.notes = [];
      return;
    }
    const res = await call("GET", "/api/notes");
    state.noteDraft = state.noteDraft || "";
    state.noteDay = state.noteDay || "all";
    state.notes = (res.json.notes || []).map(note => ({
      id: note.id,
      date: note.notice_on || String(note.created_at).slice(0, 10),
      at: Date.parse(note.created_at),
      author: note.author_name,
      text: note.body,
      sample: false
    }));
  }

  function applyPreferences(prefs) {
    const state = hooks().state;
    if (!prefs) return;
    if (Number.isInteger(prefs.calYear) && prefs.calMonth >= 0 && prefs.calMonth <= 11) {
      state.cal.year = prefs.calYear;
      state.cal.month = prefs.calMonth;
    }
    if (Number.isInteger(prefs.noteYear) && prefs.noteMonth >= 0 && prefs.noteMonth <= 11) {
      state.noteCal = { year: prefs.noteYear, month: prefs.noteMonth };
    }
    if (prefs.noteDay) state.noteDay = prefs.noteDay;
    if (prefs.buildingId) state.preferredBuildingId = prefs.buildingId;
  }

  window.StrataWire = {
    hooks: null,
    saveTimer: 0,
    buildingTimer: 0,
    async boot(api) {
      this.hooks = api;
      const now = new Date();
      if (!api.state.cal.year) {
        api.state.cal.year = now.getFullYear();
        api.state.cal.month = now.getMonth();
      }
      if (!api.state.offerCal.year) {
        api.state.offerCal.year = now.getFullYear();
        api.state.offerCal.month = now.getMonth();
      }
      const params = new URLSearchParams(location.search);
      const state = api.state;
      state.auth = state.auth || { kind: "manager", role: "building_manager", name: "", email: "", mobile: "", password: "", confirm: "", businessName: "", agree: false, current: "", token: "" };
      if (!state.auth.email) state.auth.email = rememberedEmail();
      if (location.pathname === "/reset") state.auth.token = params.get("token") || "";
      try {
        const health = await fetch("/api/health");
        const info = await health.json();
        api.state.demo = !!info.demo;
      } catch (err) {
        api.state.demo = false;
      }
      await this.refresh();
      if (params.get("verified") === "1") api.toast("Email confirmed. You can sign in.");
      if (params.get("verify") === "invalid") api.toast("That confirmation link has expired. Ask for a new one.");
    },
    async refresh() {
      const api = hooks();
      const res = await call("GET", "/api/me");
      api.state.remote = true;
      if (!res.ok) {
        api.state.account = null;
        api.state.jobs = [];
        api.state.buildings = [];
        api.state.notes = [];
        api.state.devices = [];
        api.state.screen = location.pathname === "/reset" ? "reset" : (api.state.screen === "checkmail" ? "checkmail" : "welcome");
        api.render();
        return;
      }
      api.state.account = res.json.user;
      api.state.account.banner = res.json.banner;
      api.state.devices = res.json.devices || [];
      applyPreferences(res.json.preferences);
      if (res.json.user.role === "contractor") {
        api.seed();
        applyAccount();
      } else if (res.json.user.role === "platform_owner") {
        api.state.buildings = [];
        api.state.jobs = [];
        api.state.quotes = [];
        api.state.contractors = [];
        applyAccount();
      } else {
        api.state.jobs = [];
        api.state.quotes = [];
        api.state.contractors = [];
        applyAccount();
        await loadArea();
        await loadBuildings();
        await loadJobs();
      }
      if (res.json.user.role === "contractor") await loadJobs();
      await loadNotes();
      if (["welcome", "signin", "register", "verify", "forgot", "reset", "checkmail", "terms"].indexOf(api.state.screen) !== -1) {
        api.state.screen = "home";
        api.state.history = [];
      }
      api.render();
    },
    handle(act, t) {
      const api = hooks();
      const state = api.state;
      if (!state.auth) state.auth = { kind: "manager", role: "building_manager", name: "", email: "", mobile: "", password: "", confirm: "", businessName: "", agree: false, current: "", token: "" };
      if (act === "auth-goto") {
        state.screen = t.dataset.screen;
        state.history = [];
        state.title = "";
        api.render();
        return true;
      }
      if (act === "auth-kind") {
        state.auth.kind = t.dataset.kind;
        if (t.dataset.kind === "contractor") state.auth.role = "contractor";
        if (t.dataset.kind === "manager" && state.auth.role === "contractor") state.auth.role = "building_manager";
        api.render();
        return true;
      }
      if (act === "auth-role") { state.auth.role = t.dataset.role; api.render(); return true; }
      if (act === "auth-register") { this.register(); return true; }
      if (act === "auth-signin") { this.signin(); return true; }
      if (act === "auth-forgot") { this.forgot(); return true; }
      if (act === "auth-reset") { this.reset(); return true; }
      if (act === "auth-resend") { this.resend(); return true; }
      if (act === "sign-out") { this.signOut(); return true; }
      if (act === "sign-out-all") { this.signOutAll(); return true; }
      if (act === "note-today") {
        const now = new Date();
        state.noteCal = { year: now.getFullYear(), month: now.getMonth() };
        state.noteDay = isoDay(now);
        this.schedulePrefs();
        api.render();
        return true;
      }
      if (act === "note-day") {
        state.noteDay = t.dataset.date;
        this.schedulePrefs();
        api.render();
        return true;
      }
      if (act === "note-nav") {
        if (!state.noteCal) state.noteCal = { year: new Date().getFullYear(), month: new Date().getMonth() };
        shiftCal(state.noteCal, t.dataset.dir);
        this.schedulePrefs();
        api.render();
        return true;
      }
      if (act === "cal-nav" && state.remote && state.cal) {
        shiftCal(state.cal, t.dataset.dir);
        this.schedulePrefs();
        api.render();
        return true;
      }
      if (act === "cal-day" && state.remote && state.cal) {
        state.cal.selected = t.dataset.date;
        this.schedulePrefs();
        api.render();
        return true;
      }
      if (act === "open-password") { state.screen = "password"; state.title = "Change password"; api.render(); return true; }
      if (act === "change-password") { this.changePassword(); return true; }
      if (act === "download-data") { this.download(); return true; }
      if (act === "privacy-request") { this.privacy(t.dataset.kind); return true; }
      if (act === "set-manager-role" && state.remote) { this.setRole(t.dataset.value); return true; }
      if (act === "add-note" && state.remote) { this.addNote(); return true; }
      if (act === "submit-work" && state.remote) { this.submitWork(t.dataset.id); return true; }
      if (act === "accept" && state.remote) { this.acceptWork(t.dataset.id); return true; }
      if ((act === "save-building" || act === "join-wait") && state.remote) { this.saveBuilding(); return true; }
      if (act === "owner" && state.account && state.account.role !== "platform_owner") {
        api.toast("Only the platform owner can open these settings.");
        return true;
      }
      return false;
    },
    scheduleProfile() {
      const self = this;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(function () { self.saveProfile(); }, 400);
    },
    async register() {
      const api = hooks();
      const auth = api.state.auth;
      const res = await call("POST", "/api/register", {
        kind: auth.kind,
        role: auth.kind === "contractor" ? "contractor" : auth.role,
        name: auth.name,
        email: auth.email,
        mobile: auth.mobile,
        businessName: auth.businessName,
        password: auth.password,
        confirm: auth.confirm,
        agree: auth.agree
      });
      if (!res.ok) { api.toast(res.json.error || "The account could not be created."); return; }
      api.state.pendingEmail = auth.email;
      api.state.checkMessage = res.json.message;
      api.state.verifyLink = res.json.devLink || "";
      api.state.screen = "checkmail";
      api.render();
    },
    async signin() {
      const api = hooks();
      const auth = api.state.auth;
      const res = await call("POST", "/api/login", { email: auth.email, password: auth.password, keep: auth.keep !== false });
      if (!res.ok) { api.toast(res.json.error || "The email or password is not right."); return; }
      rememberEmail(auth.email);
      auth.password = "";
      api.toast("Signed in.");
      await this.refresh();
    },
    async forgot() {
      const api = hooks();
      const res = await call("POST", "/api/forgot-password", { email: api.state.auth.email });
      api.toast(res.json.message || res.json.error || "If an account uses that email, a reset link is on its way.");
    },
    async resend() {
      const api = hooks();
      const res = await call("POST", "/api/resend-verification", { email: api.state.pendingEmail || api.state.auth.email });
      if (res.json.devLink) api.state.verifyLink = res.json.devLink;
      api.toast(res.json.message || "If that account is waiting, a new link is on its way.");
      if (res.json.devLink) api.render();
    },
    async reset() {
      const api = hooks();
      const auth = api.state.auth;
      const res = await call("POST", "/api/reset-password", { token: auth.token, password: auth.password, confirm: auth.confirm });
      if (!res.ok) { api.toast(res.json.error || "That reset link has expired."); return; }
      auth.password = "";
      auth.confirm = "";
      api.toast(res.json.message);
      api.state.screen = "signin";
      history.replaceState(null, "", "/");
      api.render();
    },
    async signOut() {
      await call("POST", "/api/logout", {});
      hooks().state.screen = "welcome";
      await this.refresh();
      hooks().toast("Signed out of this device.");
    },
    async signOutAll() {
      await call("POST", "/api/me/sessions/sign-out-all", {});
      hooks().state.screen = "welcome";
      await this.refresh();
      hooks().toast("Signed out of every device.");
    },
    schedulePrefs() {
      const self = this;
      clearTimeout(this.prefTimer);
      this.prefTimer = setTimeout(function () { self.savePrefs(); }, 300);
    },
    async savePrefs() {
      const state = hooks().state;
      if (!state.account || state.account.role === "contractor" || state.account.role === "platform_owner") return;
      const now = new Date();
      const noteCal = state.noteCal || { year: now.getFullYear(), month: now.getMonth() };
      const res = await call("PATCH", "/api/me/preferences", {
        buildingId: state.preferredBuildingId || "",
        calYear: state.cal && state.cal.year ? state.cal.year : now.getFullYear(),
        calMonth: state.cal && state.cal.month != null ? state.cal.month : now.getMonth(),
        noteYear: noteCal.year,
        noteMonth: noteCal.month,
        noteDay: state.noteDay && state.noteDay !== "all" ? state.noteDay : ""
      });
      if (!res.ok) hooks().toast(res.json.error || "Those preferences were not saved.");
    },
    async setRole(value) {
      const api = hooks();
      const role = ROLE[value];
      if (!role) return;
      const res = await call("PATCH", "/api/me", { role: role });
      if (!res.ok) { api.toast(res.json.error || "That role cannot be changed."); return; }
      api.state.account = Object.assign({}, api.state.account, res.json.user);
      api.state.account.banner = res.json.banner || api.state.account.banner;
      api.state.manager.role = res.json.user.managerRole;
      api.render({ keepScroll: true });
    },
    async saveProfile() {
      const api = hooks();
      if (!api.state.account || api.state.role !== "manager") return;
      const m = api.state.manager;
      const body = {
        name: m.name,
        mobile: m.phone,
        businessName: m.company,
        abn: m.abn,
        payment: m.payment,
        consent: !!m.consent
      };
      if (ROLE[m.role]) body.role = ROLE[m.role];
      const res = await call("PATCH", "/api/me", body);
      if (!res.ok) api.toast(res.json.error || "Could not save the profile.");
    },
    async changePassword() {
      const api = hooks();
      const auth = api.state.auth;
      const res = await call("POST", "/api/change-password", { current: auth.current, password: auth.password, confirm: auth.confirm });
      if (!res.ok) { api.toast(res.json.error || "The password was not changed."); return; }
      auth.current = "";
      auth.password = "";
      auth.confirm = "";
      api.toast(res.json.message);
      api.state.screen = "profile";
      api.state.title = "";
      api.render();
    },
    scheduleBuilding(id) {
      const self = this;
      clearTimeout(this.buildingTimer);
      this.buildingTimer = setTimeout(function () { self.saveBuildingFields(id); }, 500);
    },
    async saveBuildingFields(id) {
      const api = hooks();
      const building = api.state.buildings.find(item => item.id === id);
      if (!building) return;
      const body = {
        open: building.open,
        close: building.close,
        weekends: !!building.weekends,
        access: building.access,
        captureM: building.captureM
      };
      if (api.state.manager.role === "property") body.quotesWanted = Number(building.quotesWanted || 1);
      else {
        body.tier1 = building.tier1 != null ? building.tier1 : building.limit;
        body.tier2 = building.tier2;
        body.tier3 = building.tier3;
        body.q1 = building.q1;
        body.q2 = building.q2;
        body.q3 = building.q3;
      }
      const res = await call("PATCH", "/api/buildings/" + id, body);
      if (!res.ok) api.toast((res.json && res.json.error) || "The building was not updated.");
    },
    async postDraft() {
      const api = hooks();
      const draft = api.state.draft;
      const res = await call("POST", "/api/jobs", {
        buildingId: draft.buildingId,
        title: draft.title,
        area: draft.area,
        tradeId: draft.tradeId,
        instructions: draft.instructions,
        urgency: draft.urgency,
        deadline: draft.date,
        safety: draft.safety,
        photoCount: (draft.photos || []).length,
        date: draft.date,
        ownerApproval: !!draft.ownerApproval
      });
      if (!res.ok) { api.toast((res.json && res.json.error) || "The request was not sent."); return; }
      api.state.draft = null;
      await loadJobs();
      api.state.history = [];
      api.state.screen = "job";
      api.state.ctx = { id: res.json.job.id };
      api.state.title = res.json.job.title;
      api.toast("Request posted.");
      api.render();
    },
    async sendOffer(jobId) {
      const api = hooks();
      const offer = api.state.offer || {};
      const person = api.state.contractors.find(item => item.id === api.state.meId) || {};
      const trades = person.trades && person.trades.length ? person.trades : ["plumbing"];
      const postcode = person.basePostcode || api.state.basePostcode || "";
      if (!/^\d{4}$/.test(postcode)) { api.toast("Add the postcode you work from on your profile."); return; }
      await call("PATCH", "/api/me/work", { trades: trades, basePostcode: postcode, gst: person.gst !== false });
      const scope = String(offer.scope || "").split(/\n/).map(line => line.trim()).filter(Boolean);
      const res = await call("POST", "/api/jobs/" + jobId + "/quotes", {
        price: Number(offer.price),
        scope: scope,
        date: offer.date,
        time: offer.time || "09:00",
        duration: offer.duration || "2h",
        note: offer.note || "",
        depositType: offer.depositType || "none"
      });
      if (!res.ok) { api.toast((res.json && res.json.error) || "The offer was not sent."); return; }
      await loadJobs();
      api.toast("Offer sent.");
      api.render();
    },
    async submitWork(jobId) {
      const api = hooks();
      const res = await call("POST", "/api/jobs/" + jobId + "/submit-work", {});
      if (!res.ok) { api.toast((res.json && res.json.error) || "The work was not handed in."); return; }
      await loadJobs();
      api.toast("Work submitted. The manager has 72 hours.");
      api.render();
    },
    async acceptWork(jobId) {
      const api = hooks();
      const res = await call("POST", "/api/jobs/" + jobId + "/accept", {});
      if (!res.ok) { api.toast((res.json && res.json.error) || "The work was not accepted."); return; }
      await loadJobs();
      api.toast("Work accepted. The final invoice follows. Stripe has not released the money.");
      api.render();
    },
    async pay(jobId) {
      const api = hooks();
      const res = await call("POST", "/api/jobs/" + jobId + "/payments", { idempotencyKey: "pay-" + jobId });
      if (!res.ok) { api.toast((res.json && res.json.error) || "The payment was not started."); return; }
      api.toast(res.json.simulated ? "Demo only. No card was charged. The test payment is marked paid so you can see the next step." : (res.json.paid ? "Stripe has confirmed the payment." : "Stripe is holding this request. It is not paid until Stripe confirms it."));
      await loadJobs();
      api.render();
    },
    async doApprove(quoteId) {
      const api = hooks();
      const quote = api.state.quotes.find(item => item.id === quoteId);
      if (!quote) return;
      const res = await call("POST", "/api/jobs/" + quote.jobId + "/approve", { quoteId: quoteId });
      if (!res.ok) { api.toast((res.json && res.json.error) || "The quote was not approved."); return; }
      await loadJobs();
      api.toast(res.json.stage === "approved" ? "Approved. The payment before the start is not paid yet." : "Approved. Nothing is paid before the work. Stripe has not been asked for money.");
      const booked = api.state.jobs.find(item => item.id === quote.jobId);
      api.state.history = [];
      api.state.screen = "job";
      api.state.ctx = { id: quote.jobId };
      api.state.title = booked ? booked.title : "Job";
      api.render();
    },
    async saveBuilding() {
      const api = hooks();
      const place = api.state.newBuilding || {};
      const res = await call("POST", "/api/buildings", {
        name: place.name,
        streetNumber: place.number,
        street: place.street,
        suburb: place.suburb,
        postcode: place.postcode,
        ocPlan: place.oc
      });
      if (!res.ok) { api.toast((res.json && res.json.error) || "The building was not saved."); return; }
      api.toast(res.json.waiting ? res.json.message : (api.state.manager.role === "property" ? "Property saved." : "Building saved."));
      await loadBuildings();
      api.state.history = [];
      api.state.screen = "buildings";
      api.state.title = "";
      api.render();
    },
    async addNote() {
      const api = hooks();
      const text = String(api.state.noteDraft || "").trim();
      if (!text) { api.toast("Write a short note first."); return; }
      const res = await call("POST", "/api/notes", { text: text, date: api.state.noteDay || "" });
      if (!res.ok) { api.toast(res.json.error || "The note was not saved."); return; }
      api.state.noteDraft = "";
      await loadNotes();
      api.toast("Notice added.");
      api.render();
    },
    async download() {
      const api = hooks();
      const res = await call("GET", "/api/me/export");
      if (!res.ok) { api.toast(res.json.error || "The file could not be prepared."); return; }
      const blob = new Blob([JSON.stringify(res.json, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "strata-app-my-data.json";
      link.click();
      api.toast("Your data file has been downloaded.");
    },
    async privacy(kind) {
      const api = hooks();
      const res = await call("POST", "/api/privacy-requests", { kind: kind || "copy", detail: "" });
      api.toast(res.ok ? res.json.message : (res.json.error || "The request was not saved."));
    }
  };
})();
