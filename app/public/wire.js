(function () {
  const ROLE = {
    building: "building_manager",
    oc: "oc_manager",
    property: "property_manager"
  };

  function hooks() { return window.StrataWire.hooks; }

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
    if (me.role === "property_manager") {
      state.buildings = [];
      state.jobs = [];
      state.quotes = [];
      state.waiting = [];
      state.account.banner = "Signed in as " + me.name + ", property manager. This account is for private properties only, so the sample apartment buildings are not loaded.";
      return;
    }
    if (me.role === "platform_owner") {
      state.buildings = [];
      state.jobs = [];
      state.quotes = [];
      state.account.banner = "Signed in as the platform owner. These settings are not shown to managers or contractors.";
      return;
    }
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
      date: String(note.created_at).slice(0, 10),
      at: Date.parse(note.created_at),
      author: note.author_name,
      text: note.body,
      sample: false
    }));
  }

  window.StrataWire = {
    hooks: null,
    saveTimer: 0,
    async boot(api) {
      this.hooks = api;
      const params = new URLSearchParams(location.search);
      const state = api.state;
      state.auth = state.auth || { kind: "manager", role: "building_manager", name: "", email: "", mobile: "", password: "", confirm: "", businessName: "", agree: false, current: "", token: "" };
      if (location.pathname === "/reset") state.auth.token = params.get("token") || "";
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
        api.state.screen = location.pathname === "/reset" ? "reset" : (api.state.screen === "checkmail" ? "checkmail" : "welcome");
        api.render();
        return;
      }
      api.state.account = res.json.user;
      api.state.account.banner = res.json.banner;
      api.seed();
      applyAccount();
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
      if (act === "open-password") { state.screen = "password"; state.title = "Change password"; api.render(); return true; }
      if (act === "change-password") { this.changePassword(); return true; }
      if (act === "download-data") { this.download(); return true; }
      if (act === "privacy-request") { this.privacy(t.dataset.kind); return true; }
      if (act === "set-manager-role" && state.remote) { this.setRole(t.dataset.value); return true; }
      if (act === "add-note" && state.remote) { this.addNote(); return true; }
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
      api.state.screen = "checkmail";
      api.render();
    },
    async signin() {
      const api = hooks();
      const auth = api.state.auth;
      const res = await call("POST", "/api/login", { email: auth.email, password: auth.password, keep: auth.keep !== false });
      if (!res.ok) { api.toast(res.json.error || "The email or password is not right."); return; }
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
      api.toast(res.json.message || "If that account is waiting, a new link is on its way.");
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
      hooks().toast("Signed out.");
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
    async addNote() {
      const api = hooks();
      const text = String(api.state.noteDraft || "").trim();
      if (!text) { api.toast("Write a short note first."); return; }
      const res = await call("POST", "/api/notes", { text: text });
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
