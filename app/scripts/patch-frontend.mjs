import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, "../../index.html"), "utf8");
let html = source;

function swap(from, to, label) {
  if (!html.includes(from)) throw new Error("Missing patch: " + label);
  html = html.replace(from, to);
}

swap(
  `  .shell {
    display: grid; grid-template-columns: 248px minmax(0, 1fr);
    width: min(1440px, 100%);
    margin-inline: auto;
    min-height: 100vh;
    background: var(--bg);
    box-shadow: 0 0 0 1px var(--line), 0 24px 60px rgba(15, 23, 42, 0.06);
  }`,
  `  .shell {
    display: grid; grid-template-columns: 248px minmax(0, 1fr);
    width: 100%;
    max-width: none;
    margin: 0;
    min-height: 100vh;
    background: var(--bg);
  }
  .shell[data-screen="welcome"],
  .shell[data-screen="signin"],
  .shell[data-screen="register"],
  .shell[data-screen="checkmail"],
  .shell[data-screen="forgot"],
  .shell[data-screen="reset"],
  .shell[data-screen="terms"] { grid-template-columns: minmax(0, 1fr); }
  .workspace { min-width: 0; width: 100%; }
  .welcome-layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.8fr); gap: 28px; width: 100%; align-items: stretch; }
  .welcome-layout .hero { min-height: 280px; display: flex; flex-direction: column; justify-content: center; }`,
  "desktop content column"
);

swap(
  "  body { background: #E4ECF6; }",
  "  body { background: var(--bg); }",
  "full-bleed background"
);

swap(
  ".home-layout { display: block; }",
  ".home-layout { display: block; }\n.diary { scroll-margin-top: 96px; }",
  "diary scroll"
);

swap(
  "  .main { padding: 32px 32px 56px; max-width: none; width: auto; }",
  "  .main { padding: 32px 32px 56px; max-width: none; width: 100%; }",
  "full-width main"
);

swap(
  ".hero h1 { font-size: 2.45rem; text-shadow: 0 8px 24px rgba(0,0,0,.18); }",
  ".hero h1 { font-size: 2.45rem; text-shadow: 0 8px 24px rgba(0,0,0,.18); overflow-wrap: break-word; }\n.hero p { overflow-wrap: break-word; }\n.auth-panel { width: 100%; margin: 0; }\n.auth-panel .card { max-width: 720px; }\n.signed-as { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }\n.demo-pair { display: grid; gap: 12px; }\n@media (min-width: 640px) { .demo-pair { grid-template-columns: 1fr 1fr; } }\n.demo-account { border: 1px solid var(--line); border-radius: 14px; padding: 14px; background: var(--field); }\n.demo-account h2 { font-size: 1.05rem; }\n.rail .sign-out-tab { color: var(--ink); font-weight: 700; margin-top: 8px; }\n.header-sign-out { width: auto; flex: none; min-height: 36px; padding: 0 10px; font-size: 0.85rem; }\n@media (min-width: 900px) { .header-sign-out { display: none; } }\n@media (max-width: 899px) { .topbar:has(.signed-as) .brand > span:last-child { display: none; } .signed-label { display: none; } .topbar .roles { display: none; } }",
  "hero wrapping"
);

swap(
  '<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>\n<script>',
  '<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>\n<script src="/wire.js"></script>\n<script>',
  "wire script"
);

swap(
  "    seq: 1\n  };",
  "    seq: 1,\n    remote: false,\n    account: null,\n    auth: { kind: \"manager\", role: \"building_manager\", name: \"\", email: \"\", mobile: \"\", password: \"\", confirm: \"\", businessName: \"\", agree: false, current: \"\", token: \"\", keep: true },\n    pendingEmail: \"\",\n    checkMessage: \"\"\n  };",
  "state fields"
);

swap(
  'if (!m.consent) items.push("Agree to prepay approved quotes");',
  'if (!m.consent) items.push("Agree to pay approved payment requests through Stripe");',
  "profile checklist"
);

swap(
  '<label class="check"><input type="checkbox" data-field="manager.consent"\' + (m.consent ? " checked" : "") + \'> <span>I consent to prepay approved quotes, or pay the invoice, within 48 hours before a job starts. Strata App holds the money until the job is complete.</span></label>\' +',
  '<label class="check"><input type="checkbox" data-field="manager.consent"\' + (m.consent ? " checked" : "") + \'> <span>I consent to pay approved payment requests through Stripe within the agreed terms. Strata App does not hold the money.</span></label>\' +',
  "consent sentence"
);

swap(
  '"<p class=\\"small muted\\">Strata App holds the money until the job is finished, then releases 100%. There is no retention. Managers pay the approved quote and no service fee.</p></div></div>";',
  '"<p class=\\"small muted\\">Stripe holds and moves the money. Strata App does not hold it. The fee is taken from the contractor only. Managers pay no fee. Refunds, disputes and unpaid-deposit expiry are not built yet.</p></div></div>";',
  "owner money sentence"
);

swap(
  '["buildings", "Buildings", 0],',
  '["buildings", state.manager.role === "property" ? "Properties" : "Buildings", 0],',
  "properties tab"
);

swap(
  `    if (detail) {
      bar = '<button class="back-btn" type="button" data-act="back" aria-label="Back">' + icon("back") + " Back</button><h1 class=\\"top-title\\">" + esc(state.title || "Back") + "</h1>";
    } else {
      bar = brandMark() + '<div class="section-label">' + esc(section || "Strata App") + '</div><div class="spacer"></div><div class="roles" role="group" aria-label="Choose who you are"><button type="button" data-act="role" data-role="manager" aria-pressed="' + (state.role === "manager" ? "true" : "false") + '">Manager</button><button type="button" data-act="role" data-role="contractor" aria-pressed="' + (state.role === "contractor" ? "true" : "false") + '">Contractor</button></div>';
    }`,
  `    const onAuth = ["welcome", "signin", "register", "checkmail", "forgot", "reset", "terms"].indexOf(state.screen) !== -1;
    if (onAuth) {
      bar = brandMark();
    } else if (detail) {
      bar = '<button class="back-btn" type="button" data-act="back" aria-label="Back">' + icon("back") + " Back</button><h1 class=\\"top-title\\">" + esc(state.title || "Back") + "</h1>";
    } else if (state.account) {
      bar = brandMark() + '<p class="signed-as"><span class="signed-label">Signed in as </span>' + esc(state.account.name) + '</p><div class="spacer"></div><div class="roles"><span class="pill pill-muted">' + esc(state.account.roleLabel) + "</span></div>";
    } else {
      bar = brandMark() + '<div class="section-label">' + esc(section || "Strata App") + '</div><div class="spacer"></div><div class="roles" role="group" aria-label="Choose who you are"><button type="button" data-act="role" data-role="manager" aria-pressed="' + (state.role === "manager" ? "true" : "false") + '">Manager</button><button type="button" data-act="role" data-role="contractor" aria-pressed="' + (state.role === "contractor" ? "true" : "false") + '">Contractor</button></div>';
    }`,
  "header role"
);

swap(
  `    const emergencyBtn = state.screen === "emergency" ? "" : '<button class="header-emergency" type="button" data-act="emergency" aria-label="Emergency">' + icon("alert") + '<span class="em-label">Emergency</span></button>';
    return '<div class="shell" data-role="' + state.role + '" data-screen="' + state.screen + '">' +
      '<aside class="rail">' + brandMark() + tabsHtml("rail") + "</aside>" +
      '<div><header class="topbar">' + bar + (detail ? '<div class="spacer"></div>' : "") + '<div class="header-actions">' + themeBtn + emergencyBtn + "</div></header><p class=\\"samplebar\\">Sample data. The people, buildings and jobs are fictional.</p>" +
      '<main class="main" id="main"><div class="stage"><div class="skel" aria-hidden="true"><span></span><span></span><span></span></div>' + screenHtml() + "</div></main></div></div>" +
      '<nav class="tabbar" aria-label="Sections">' + tabsHtml("bar") + "</nav>";`,
  `    const emergencyBtn = onAuth || state.screen === "emergency" ? "" : '<button class="header-emergency" type="button" data-act="emergency" aria-label="Emergency">' + icon("alert") + '<span class="em-label">Emergency</span></button>';
    const demoBanner = state.demo ? '<p class="samplebar">Demo, test data only. Payments are simulated and QR sheets cannot be printed.</p>' : "";
    const sample = demoBanner + (onAuth ? "" : '<p class="samplebar">' + (state.account ? esc(state.account.banner || "Signed in.") : "Sample data. The people, buildings and jobs are fictional.") + "</p>");
    const menuSignOut = state.account ? '<button class="tab sign-out-tab" type="button" data-act="sign-out" aria-label="Sign out of this device"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg><span class="tab-label">Sign out</span></button>' : "";
    const headerSignOut = state.account ? '<button class="btn btn-secondary header-sign-out" type="button" data-act="sign-out">Sign out</button>' : "";
    const rail = onAuth ? "" : '<aside class="rail">' + brandMark() + tabsHtml("rail") + menuSignOut + "</aside>";
    const nav = onAuth ? "" : '<nav class="tabbar" aria-label="Sections">' + tabsHtml("bar") + "</nav>";
    return '<div class="shell" data-role="' + state.role + '" data-screen="' + state.screen + '">' +
      rail +
      '<div class="workspace"><header class="topbar">' + bar + (detail && !onAuth ? '<div class="spacer"></div>' : "") + '<div class="header-actions">' + themeBtn + headerSignOut + emergencyBtn + "</div></header>" + sample +
      '<main class="main" id="main"><div class="stage"><div class="skel" aria-hidden="true"><span></span><span></span><span></span></div>' + screenHtml() + "</div></main></div></div>" +
      nav;`,
  "shell chrome"
);

swap(
  `      success: successScreen
    };`,
  `      success: successScreen,
      welcome: authScreen,
      signin: authScreen,
      register: authScreen,
      checkmail: authScreen,
      forgot: authScreen,
      reset: authScreen,
      terms: authScreen,
      password: passwordScreen
    };`,
  "auth screens"
);

swap(
  `  function screenHtml() {`,
  `  function authScreen() {
    const a = state.auth;
    const kindBtn = (id, label) => '<button class="chip" type="button" data-act="auth-kind" data-kind="' + id + '" aria-pressed="' + (a.kind === id ? "true" : "false") + '">' + label + "</button>";
    const roleBtn = (id, label) => '<button class="chip" type="button" data-act="auth-role" data-role="' + id + '" aria-pressed="' + (a.role === id ? "true" : "false") + '">' + label + "</button>";
    if (state.screen === "welcome") {
      return '<div class="welcome-layout"><section class="hero"><p class="eyebrow">Strata App</p><h1>Maintenance quotes for buildings and properties</h1><p>Managers post the work. Licensed contractors nearby make an offer. Stripe holds any money. Strata App does not.</p></section><div class="stack">' +
        '<button class="btn btn-primary" type="button" data-act="auth-goto" data-screen="register">Create an account</button>' +
        '<button class="btn btn-secondary" type="button" data-act="auth-goto" data-screen="signin">Sign in</button>' +
        (state.demo ? '<div class="card stack"><p><strong>Two demo accounts. Pick one.</strong></p><div class="demo-pair"><div class="demo-account"><h2>Manager</h2><p><strong>Mina Costa</strong></p><p class="small">mina.costa@harbour.example</p><p class="small">Password Harbour1</p></div><div class="demo-account"><h2>Contractor</h2><p><strong>Sam Okonkwo</strong></p><p class="small">sam@plumbing.example</p><p class="small">Password Pipes123</p></div></div><p class="small">A new account shows its confirmation link on this screen. No email is sent. Sample building: Harbour View Apartments. The Lift 1 report page is /r/demo-lift-1.</p></div>' : "") +
        '<div class="card stack"><p>Building managers and OC managers look after apartment buildings and common property. Property managers look after private rental properties. Contractors do the work. An account is one of these, not more than one.</p><p class="small muted">The terms and privacy summary are a draft for a solicitor to review.</p><button class="btn btn-ghost" type="button" data-act="auth-goto" data-screen="terms">Read the terms and privacy summary</button></div></div></div>';
    }
    if (state.screen === "terms") {
      return '<div class="stack auth-panel"><div class="card stack"><h1>Terms and privacy summary</h1><p class="demo">Draft for a solicitor to review</p>' +
        "<p>Strata App is a tool. It is not the contractor's employer. The contract is between the manager or owners corporation and the contractor.</p>" +
        "<p>Stripe holds and moves money. Strata App does not hold it, does not judge the quality of the work, and does not decide disputes.</p>" +
        "<p>You agree to pay approved payment requests through Stripe within the agreed terms. Managers pay no platform fee. The contractor fee is 15% of each payment, with GST on that fee switched off until the platform is registered.</p>" +
        "<p>We collect the account details you type, and, on a public maintenance report, the description, photographs and contact details you choose to give. Reporter details are not passed to a contractor.</p>" +
        '<button class="btn btn-secondary" type="button" data-act="auth-goto" data-screen="register">Back</button></div></div>';
    }
    if (state.screen === "checkmail") {
      return '<div class="stack auth-panel"><section class="hero"><p class="eyebrow">Check your email</p><h1>Confirm the address, then sign in</h1><p>' + esc(state.checkMessage || "Open the confirmation link.") + "</p></section>" +
        (state.verifyLink ? '<a class="btn btn-primary" href="' + esc(state.verifyLink) + '">Open the confirmation link</a>' : "") +
        '<button class="btn btn-secondary" type="button" data-act="auth-resend">Send the link again</button>' +
        '<button class="btn btn-primary" type="button" data-act="auth-goto" data-screen="signin">Sign in</button></div>';
    }
    if (state.screen === "signin") {
      return '<div class="stack auth-panel"><h1>Sign in</h1><div class="card stack">' +
        '<label class="field" for="f-auth-email">Email<input id="f-auth-email" type="email" name="username" autocomplete="username" data-field="auth.email" value="' + esc(a.email) + '"></label>' +
        '<label class="field" for="f-auth-password">Password<input id="f-auth-password" type="password" name="password" autocomplete="current-password" data-field="auth.password" value="' + esc(a.password) + '"></label>' +
        '<label class="check"><input type="checkbox" data-field="auth.keep"' + (a.keep !== false ? " checked" : "") + "> <span>Keep me signed in on this device</span></label>" +
        '<p class="small muted">Your name, buildings and notices stay on your account, so signing in on any device brings them back. This box only keeps this device signed in. The password is not saved in the app.</p>' +
        '<button class="btn btn-primary" type="button" data-act="auth-signin">Sign in</button>' +
        '<button class="btn btn-ghost" type="button" data-act="auth-goto" data-screen="forgot">Forgot your password?</button></div></div>';
    }
    if (state.screen === "forgot") {
      return '<div class="stack auth-panel"><h1>Forgot your password?</h1><div class="card stack">' +
        field("Email", "email", "auth.email", a.email) +
        '<button class="btn btn-primary" type="button" data-act="auth-forgot">Send a reset link</button>' +
        '<button class="btn btn-ghost" type="button" data-act="auth-goto" data-screen="signin">Back to sign in</button></div></div>';
    }
    if (state.screen === "reset") {
      return '<div class="stack auth-panel"><h1>Choose a new password</h1><div class="card stack">' +
        field("New password", "password", "auth.password", a.password) +
        field("Confirm password", "password", "auth.confirm", a.confirm) +
        '<p class="small muted">At least 8 characters, with letters and a number, and not containing the email.</p>' +
        '<button class="btn btn-primary" type="button" data-act="auth-reset">Update password</button></div></div>';
    }
    const roles = a.kind === "manager"
      ? '<span class="field">Your role</span><div class="row" role="group" aria-label="Your role">' + roleBtn("building_manager", "Building manager") + roleBtn("oc_manager", "OC manager") + roleBtn("property_manager", "Property manager") + '</div><p class="small muted">These are different roles. The account is one or the other.</p>'
      : "";
    return '<div class="stack auth-panel"><h1>Create an account</h1><div class="card stack">' +
      '<span class="field">I am a</span><div class="row" role="group" aria-label="Account kind">' + kindBtn("manager", "Manager") + kindBtn("contractor", "Contractor") + "</div>" +
      roles +
      (a.kind === "contractor" ? field("Business name", "text", "auth.businessName", a.businessName) : "") +
      field("Full name", "text", "auth.name", a.name) +
      field("Email", "email", "auth.email", a.email) +
      field("Mobile", "tel", "auth.mobile", a.mobile) +
      field("Password", "password", "auth.password", a.password) +
      field("Confirm password", "password", "auth.confirm", a.confirm) +
      '<label class="check"><input type="checkbox" data-field="auth.agree"' + (a.agree ? " checked" : "") + '> <span>I agree to the terms and the privacy summary.</span></label>' +
      '<button class="btn btn-ghost" type="button" data-act="auth-goto" data-screen="terms">Read the terms and privacy summary</button>' +
      '<button class="btn btn-primary" type="button" data-act="auth-register">Create an account</button></div></div>';
  }
  function passwordScreen() {
    const a = state.auth;
    return '<div class="stack auth-panel"><h1>Change password</h1><div class="card stack">' +
      field("Current password", "password", "auth.current", a.current || "") +
      field("New password", "password", "auth.password", a.password) +
      field("Confirm password", "password", "auth.confirm", a.confirm) +
      '<button class="btn btn-primary" type="button" data-act="change-password">Change password</button></div></div>';
  }
  function screenHtml() {`,
  "auth screen functions"
);

swap(
  `'<p class="small muted">You have ' + state.buildings.length + (state.buildings.length === 1 ? " building" : " buildings") + " saved.</p>" +
      '<button class="owner-link" type="button" data-act="owner">Owner settings (demo)</button></div>';`,
  `'<p class="small muted">You have ' + state.buildings.length + (state.buildings.length === 1 ? " building" : " buildings") + " saved.</p>" +
      '<div class="card stack"><h2>My account</h2><p class="small">' + esc(state.account ? state.account.email : m.email) + " · " + esc(state.account ? state.account.roleLabel : "Not signed in") + "</p>" +
      '<button class="btn btn-secondary" type="button" data-act="open-password">Change password</button>' +
      '<button class="btn btn-secondary" type="button" data-act="download-data">Download my data</button>' +
      '<button class="btn btn-secondary" type="button" data-act="privacy-request" data-kind="copy">Send a privacy request</button>' +
      '<button class="btn btn-ghost" type="button" data-act="sign-out">Sign out of this device</button>' +
      '<p class="small muted">A privacy reply is aimed for within 30 days. Some records must be kept. A solicitor must confirm that period.</p></div>' +
      '<div class="card stack"><h2>Signed-in devices</h2><p class="small muted">Each device has its own sign-in. Signing out of this device leaves the others signed in.</p>' +
      devicesHtml() +
      '<button class="btn btn-secondary" type="button" data-act="sign-out-all">Sign out of all devices</button></div>' +
      (state.account && state.account.role === "platform_owner" ? '<button class="owner-link" type="button" data-act="owner">Owner settings</button>' : "") + "</div>";`,
  "account card"
);

swap(
  `  function diaryPanel() {
    const notes = state.notes || [];
    const dates = [];
    notes.forEach(n => { if (dates.indexOf(n.date) === -1) dates.push(n.date); });
    dates.sort((a, b) => b.localeCompare(a));
    const filter = state.noteDay || "all";
    const shownDates = filter === "all" ? dates : dates.filter(d => d === filter);
    const options = '<option value="all"' + (filter === "all" ? " selected" : "") + ">Every day</option>" +
      dates.map(d => '<option value="' + d + '"' + (filter === d ? " selected" : "") + ">" + esc(diaryDateLabel(d)) + "</option>").join("");
    const groups = shownDates.map(d => {
      const items = notes.filter(n => n.date === d).slice().sort((a, b) => b.at - a.at);
      return '<section><h3 class="diary-day">' + esc(diaryDateLabel(d)) + "</h3>" + items.map(n =>
        '<article class="diary-item"><p class="small diary-meta"><strong>' + esc(n.author) + "</strong><span>" + esc(fmtStamp(n.at)) + "</span>" + (n.sample ? '<span class="pill pill-muted">Sample</span>' : "") + "</p><p>" + esc(n.text) + "</p></article>"
      ).join("") + "</section>";
    }).join("") || '<p class="muted">Nothing for this day.</p>';
    return '<aside class="diary" aria-labelledby="diary-title"><div class="card diary-card"><div class="between"><h2 id="diary-title">Notices and comments</h2><span class="pill pill-muted">Sample</span></div>' +
      '<p class="small muted">Handover notes for managers who share this profile. Sample entries are fictional.</p>' +
      '<label class="field" for="diary-day">Choose a day<select id="diary-day" data-field="note.day">' + options + "</select></label>" +
      '<div class="diary-list">' + groups + "</div>" +
      '<label class="field" for="diary-text">Add a notice<textarea id="diary-text" data-field="note.draft" placeholder="What should the next manager know?">' + esc(state.noteDraft || "") + "</textarea></label>" +
      '<button class="btn btn-primary" type="button" data-act="add-note">Add notice</button></div></aside>';
  }`,
  `  function devicesHtml() {
    const rows = (state.devices || []).map(device => '<p class="small"><strong>' + esc(device.label) + "</strong> · " + (device.current ? "This device" : "Another device") + (device.keep ? " · Kept for 30 days" : " · Until this browser closes") + "</p>").join("");
    return rows || '<p class="small muted">This device is the only sign-in.</p>';
  }
  function diaryPanel() {
    const notes = state.notes || [];
    const today = todayISO();
    if (!state.noteCal) state.noteCal = { year: new Date().getFullYear(), month: new Date().getMonth() };
    if (!state.noteDay || state.noteDay === "all") state.noteDay = today;
    const selected = state.noteDay;
    const dots = {};
    notes.forEach(note => { if (note.date) dots[note.date] = { booked: true }; });
    const items = notes.filter(note => note.date === selected).slice().sort((a, b) => b.at - a.at);
    const list = items.map(note =>
      '<article class="diary-item"><p class="small diary-meta"><strong>' + esc(note.author) + "</strong><span>" + esc(fmtStamp(note.at)) + "</span>" + (note.sample ? '<span class="pill pill-muted">Sample</span>' : "") + "</p><p>" + esc(note.text) + "</p></article>"
    ).join("") || '<p class="muted">Nothing on ' + esc(diaryDateLabel(selected)) + ".</p>";
    return '<aside class="diary" aria-labelledby="diary-title"><div class="card diary-card"><div class="between"><h2 id="diary-title">Notices and comments</h2>' + (state.account ? "" : '<span class="pill pill-muted">Sample</span>') + "</div>" +
      '<p class="small muted">' + (state.account ? "The name is taken from the signed-in account. It is not typed, and another organisation cannot see these notes." : "Handover notes for managers who share this profile. Sample entries are fictional.") + "</p>" +
      '<div class="row"><button class="btn btn-secondary" type="button" data-act="note-today">Today</button><span class="small">' + esc(diaryDateLabel(selected)) + "</span></div>" +
      renderMonth({ year: state.noteCal.year, month: state.noteCal.month, selected: selected, dots: dots, pick: "note-day", nav: "note-nav", mark: "has a notice", disable: () => "" }) +
      '<div class="diary-list">' + list + "</div>" +
      '<label class="field" for="diary-text">Add a notice for ' + esc(diaryDateLabel(selected)) + '<textarea id="diary-text" data-field="note.draft" placeholder="What should the next manager know?">' + esc(state.noteDraft || "") + "</textarea></label>" +
      '<p class="small muted">It will be saved as ' + esc((state.account && state.account.name) || state.manager.name || "the signed-in manager") + ".</p>" +
      '<button class="btn btn-primary" type="button" data-act="add-note">Add notice</button></div></aside>';
  }`,
  "notices calendar"
);

swap(
  'if (dots.booked) label += ", booked job";',
  'if (dots.booked) label += ", " + (opts.mark || "booked job");',
  "calendar mark"
);

swap(
  "const b = building(preset.buildingId) || state.buildings[0];",
  "const b = building(preset.buildingId) || building(state.preferredBuildingId) || state.buildings[0];",
  "remembered building"
);

swap(
  `      if (key === "buildingId") {
        const b = building(value);
        if (b) { state.draft.access = b.access; state.draft.invoiceTo = b.oc; state.draft.invoiceAbn = b.ocAbn; }
      }`,
  `      if (key === "buildingId") {
        const b = building(value);
        if (b) { state.draft.access = b.access; state.draft.invoiceTo = b.oc; state.draft.invoiceAbn = b.ocAbn; }
        state.preferredBuildingId = value;
        if (state.remote && window.StrataWire) window.StrataWire.schedulePrefs();
      }`,
  "save chosen building"
);

swap(
  ".home-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }",
  ".home-layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; align-items: start; }\n  .diary { scroll-margin-top: 88px; }\n  .diary .day { min-height: 36px; min-width: 0; padding: 2px; font-size: 13px; }\n  .diary .cal-card { padding: 10px; }\n  .diary .icon-btn { min-height: 36px; padding: 0 8px; }",
  "notices column"
);

swap(
  `    if (field.indexOf("manager.") === 0) {
      const key = field.split(".")[1];
      state.manager[key] = key === "consent" ? !!value : value;
      return true;
    }`,
  `    if (field.indexOf("auth.") === 0) {
      const key = field.split(".")[1];
      state.auth[key] = key === "agree" || key === "keep" ? !!value : value;
      return key === "agree" || key === "keep";
    }
    if (field.indexOf("manager.") === 0) {
      const key = field.split(".")[1];
      state.manager[key] = key === "consent" ? !!value : value;
      if (state.remote && window.StrataWire) window.StrataWire.scheduleProfile();
      return true;
    }`,
  "auth fields"
);

swap(
  `    const act = t.dataset.act;
    const keep = ["distance", "find-trade", "sort", "find-view", "toggle-filters", "show-booked", "people-trade", "pin"].indexOf(act) !== -1;`,
  `    const act = t.dataset.act;
    if (window.StrataWire && window.StrataWire.handle(act, t)) return;
    const keep = ["distance", "find-trade", "sort", "find-view", "toggle-filters", "show-booked", "people-trade", "pin"].indexOf(act) !== -1;`,
  "wire clicks"
);

swap(
  `    if (act === "role") {
      state.role = t.dataset.role;`,
  `    if (act === "role") {
      if (state.account) { toast("This account stays as " + state.account.roleLabel + "."); return; }
      state.role = t.dataset.role;`,
  "role lock"
);

swap(
  `      state.role = "contractor";
      state.screen = "find";`,
  `      if (!state.account) state.role = "contractor";
      state.screen = "find";`,
  "search role"
);

swap(
  "You have 48 hours (",
  "You have 72 hours (",
  "review sentence"
);

swap(
  "48 * 3600000",
  "72 * 3600000",
  "review clock"
);

swap(
  'Skip the 48 hours <span class="demo">Demo</span>',
  'End the review <span class="demo">Demo</span>',
  "skip label"
);

swap(
  "The manager has 48 hours.",
  "The manager has 72 hours.",
  "submit toast"
);

swap(
  "The manager has another 48 hours.",
  "The manager has another 72 hours.",
  "fix toast"
);

swap(
  "They have 48 hours to accept or challenge.",
  "They have 72 hours to accept or challenge. If that lands on a weekend or public holiday, it stays open until 5 pm on the next working day.",
  "contractor review"
);

swap(
  "The 48 hours ended with no response, so the work was accepted.",
  "The 72 hours ended with no response, so the work was accepted.",
  "skip log"
);

swap(
  `  loadTheme();
  seed();
  seedNotes();
  applyTheme();
  render();`,
  `  loadTheme();
  applyTheme();
  if (window.StrataWire) {
    window.StrataWire.boot({ state: state, render: render, toast: toast, seed: seed, seedNotes: seedNotes });
  } else {
    seed();
    seedNotes();
    render();
  }`,
  "boot"
);

swap(
  "<h1>Buildings</h1>",
  "<h1>' + (state.manager.role === \"property\" ? \"Properties\" : \"Buildings\") + '</h1>",
  "buildings heading"
);

swap(
  'field("Approval limit without committee", "number", "building." + b.id + ".limit", b.limit) +',
  '(state.manager.role === "property" ? field("Quotes you usually want", "number", "building." + b.id + ".quotesWanted", b.quotesWanted || 1) : field("Budget 1, up to $", "number", "building." + b.id + ".tier1", b.tier1 != null ? b.tier1 : b.limit) + field("Quotes for budget 1", "number", "building." + b.id + ".q1", b.q1 || 1) + field("Budget 2, up to $", "number", "building." + b.id + ".tier2", b.tier2 != null ? b.tier2 : 4999) + field("Quotes for budget 2", "number", "building." + b.id + ".q2", b.q2 || 2) + field("Budget 3, up to $", "number", "building." + b.id + ".tier3", b.tier3 != null ? b.tier3 : 30000) + field("Quotes for budget 3", "number", "building." + b.id + ".q3", b.q3 || 3)) +',
  "three budgets"
);

swap(
  `'<label class="field">Suburb<select data-field="new.suburb">' + opts + "</select></label>" +
      field("OC or plan number", "text", "new.oc", n.oc) +
      field("Approval limit without committee", "number", "new.limit", n.limit) +`,
  `field("Suburb", "text", "new.suburb", n.suburb) +
      field("Postcode", "text", "new.postcode", n.postcode || "") +
      field(state.manager.role === "property" ? "Property type" : "OC or plan number", "text", "new.oc", n.oc) +`,
  "postcode entry"
);

swap(
  "const outside = s && !inRadius(s.lat, s.lng);",
  "const outside = state.owner.postcodes ? (n.postcode && state.owner.postcodes.indexOf(String(n.postcode)) === -1) : (s && !inRadius(s.lat, s.lng));",
  "postcode coverage"
);

swap(
  'state.newBuilding = { name: "", number: "", street: "", suburb: "Balwyn", oc: "", limit: 4999 };',
  'state.newBuilding = { name: "", number: "", street: "", suburb: "", postcode: "", oc: "", limit: 4999 };',
  "blank building"
);

swap(
  "  function postDraft() {",
  "  function postDraft() {\n    if (state.remote && window.StrataWire) return window.StrataWire.postDraft();",
  "post draft"
);
swap(
  "  function sendOffer(jobId) {",
  "  function sendOffer(jobId) {\n    if (state.remote && window.StrataWire) return window.StrataWire.sendOffer(jobId);",
  "send offer"
);
swap(
  "  function doApprove(quoteId) {",
  "  function doApprove(quoteId) {\n    if (state.remote && window.StrataWire) return window.StrataWire.doApprove(quoteId);",
  "approve"
);
swap(
  "  function doPay(jobId) {",
  "  function doPay(jobId) {\n    if (state.remote && window.StrataWire) return window.StrataWire.pay(jobId);",
  "block fake pay"
);
swap(
  `      '<h2>Trades I offer</h2><div class="row">' + trades + "</div>" +`,
  `      field("Postcode you work from", "text", "me.postcode", c.basePostcode || "") +
      '<h2>Trades I offer</h2><div class="row">' + trades + "</div>" +
      '<button class="btn btn-ghost" type="button" data-act="sign-out">Sign out</button>' +`,
  "contractor postcode"
);
swap(
  `      if (key === "description") c.description = value;
      if (key === "years") c.years = Number(value) || 0;
      if (key === "consent") c.consentPublic = !!value;`,
  `      if (key === "description") c.description = value;
      if (key === "years") c.years = Number(value) || 0;
      if (key === "postcode") c.basePostcode = value;
      if (key === "consent") c.consentPublic = !!value;`,
  "postcode field"
);
swap(
  `      if (key === "weekends") b.weekends = !!value;
      else if (key === "limit" || key === "captureM") b[key] = Number(value);
      else b[key] = value;
      return true;`,
  `      if (key === "weekends") b.weekends = !!value;
      else if (key === "limit" || key === "captureM" || key === "tier1" || key === "tier2" || key === "tier3" || key === "q1" || key === "q2" || key === "q3" || key === "quotesWanted") b[key] = Number(value);
      else b[key] = value;
      if (state.remote && window.StrataWire) window.StrataWire.scheduleBuilding(id);
      return true;`,
  "save building fields"
);

swap(
  'areaField("What is included (one item per line)", "offer.scope", o.scope) +',
  `'<span class="field">Payment before the start</span><div class="row" role="group" aria-label="Payment before the start">' +
      [["none", "Paid after the work"], ["25", "25% deposit"], ["30", "30% deposit"], ["50", "50% deposit"]].map(pair => '<button class="chip" type="button" data-act="deposit-type" data-v="' + pair[0] + '" aria-pressed="' + ((o.depositType || "none") === pair[0] ? "true" : "false") + '">' + pair[1] + "</button>").join("") + "</div>" +
      areaField("What is included (one item per line)", "offer.scope", o.scope) +`,
  "deposit choice"
);
swap(
  'if (act === "send-offer") return sendOffer(t.dataset.id);',
  'if (act === "deposit-type") { if (state.offer) state.offer.depositType = t.dataset.v; render({ keepScroll: true }); return; }\n    if (act === "send-offer") return sendOffer(t.dataset.id);',
  "deposit click"
);

swap(
  "I agree to prepay this quote. Strata App holds the money until the job is complete.",
  "I agree to pay this through Stripe. Stripe holds the money. Strata App does not.",
  "approve consent"
);

const out = path.resolve(here, "../public/index.html");
fs.writeFileSync(out, html);
console.log("wrote", out, "bytes", html.length);
