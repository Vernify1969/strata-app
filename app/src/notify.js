import { audit } from "./db.js";
import { newId } from "./ids.js";

const MANAGER_EVENTS = [
  ["quote", "A quote arrives"],
  ["work", "The contractor hands in work to review"],
  ["pay", "A payment is due or overdue"],
  ["report", "A new QR report arrives"],
  ["late", "An invoice is late"],
  ["msg", "A message arrives"],
  ["expiry", "A contractor’s licence or insurance is about to end"]
];

const CONTRACTOR_EVENTS = [
  ["job", "A new job near me"],
  ["offer", "My offer is accepted or declined"],
  ["pay", "A payment is released"],
  ["review", "The manager accepts or challenges my work"],
  ["msg", "A message arrives"],
  ["expiry", "My licence or insurance is about to expire"]
];

export const HELP_QUESTIONS = [
  ["How do I send a request?", "On Home, tap a service, say where the problem is, add photos, choose when, then send. Contractors in the area can see it straight away."],
  ["What does it cost?", "Managers pay nothing. Contractors pay a 15% fee on each job, taken from their payment. Stripe holds the money. TaskSpeck Strata never holds it."],
  ["What if the work is not right?", "You have 72 hours to accept the work or challenge it with photos. If the 72 hours end on a weekend or public holiday, the review stays open until 5 pm on the next working day. TaskSpeck Strata keeps the evidence but does not decide who is right."],
  ["Can I change a request?", "Yes, until the first quote arrives. After that, cancel it and send a new one, or ask the contractors a question in the messages."],
  ["What if no one quotes?", "The request shows the date quotes are wanted by. You can extend it by two days."],
  ["How do I stop being notified?", "Open Profile, then Notification settings. Urgent and emergency alerts always stay on, and always come by email."],
  ["How do I get or delete my data?", "Open Profile, then My data and privacy. You can download what the app holds about you, or send a privacy request to get a copy, correct it or delete it. Some records must be kept, such as tax records and the other person’s side of a job."]
];

export function supportEmail(config = {}) {
  return config.supportEmail || process.env.SUPPORT_EMAIL || "support@your-domain.example";
}

export function pushKeys(config = {}) {
  const publicKey = config.vapidPublicKey || process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = config.vapidPrivateKey || process.env.VAPID_PRIVATE_KEY || "";
  const subject = config.vapidSubject || process.env.VAPID_SUBJECT || "mailto:" + supportEmail(config);
  return { publicKey, privateKey, subject, configured: !!(publicKey && privateKey) };
}

export function helpContent(config = {}) {
  return {
    emergency: "In an emergency call 000. TaskSpeck Strata is not an emergency service.",
    supportEmail: supportEmail(config),
    supportNote: "This address is a placeholder until the real support address exists.",
    questions: HELP_QUESTIONS.map(([question, answer]) => ({ question, answer }))
  };
}

export function eventList(role) {
  return role === "contractor" ? CONTRACTOR_EVENTS : MANAGER_EVENTS;
}

export function readPrefs(row) {
  const channels = parseJson(row?.notify_channels, { email: true, sms: false, push: true });
  const events = parseJson(row?.notify_events, {});
  return {
    channels: {
      email: channels.email !== false,
      sms: channels.sms === true,
      push: channels.push !== false
    },
    events
  };
}

export function planNotice(prefs, event, urgent = false) {
  if (urgent) return { email: true, sms: false, push: prefs.channels.push !== false, inApp: true };
  if (prefs.events[event] === false) return { email: false, sms: false, push: false, inApp: false };
  return {
    email: prefs.channels.email !== false,
    sms: false,
    push: prefs.channels.push !== false,
    inApp: true
  };
}

export async function deliverNotice(db, mail, config, { userId, email, event, urgent = false, subject, text }) {
  const row = userId ? db.prepare("SELECT id, email, notify_channels, notify_events FROM users WHERE id = ?").get(userId) : null;
  const prefs = readPrefs(row);
  const plan = planNotice(prefs, event, urgent);
  const to = email || row?.email || "";
  let emailed = false;
  if (plan.email && to && mail) {
    await mail.send({ to, subject, text });
    emailed = true;
  }
  if (plan.inApp && userId) {
    db.prepare("INSERT INTO notifications (id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(newId(), userId, text, new Date().toISOString());
  }
  const pushed = plan.push ? await sendPush(db, config, userId, { title: subject, body: text }) : 0;
  return { emailed, pushed, sms: false };
}

export function registerNotifyRoutes(app, { db, config, sendError, requireUser, requireJson }) {
  app.get("/api/help", (_req, res) => {
    res.json(helpContent(config));
  });

  app.get("/api/push/vapid", (_req, res) => {
    const keys = pushKeys(config);
    res.json({ configured: keys.configured, publicKey: keys.configured ? keys.publicKey : "" });
  });

  app.get("/api/me/notifications", requireUser, (req, res) => {
    const prefs = readPrefs(req.user);
    res.json({
      channels: prefs.channels,
      events: eventState(req.user.role, prefs.events),
      urgentAlwaysEmail: true,
      smsSends: false
    });
  });

  app.patch("/api/me/notifications", requireJson, requireUser, (req, res) => {
    if (req.body?.events && Object.prototype.hasOwnProperty.call(req.body.events, "urgent")) {
      return sendError(res, 400, "Urgent and emergency alerts always stay on, and they always come by email.");
    }
    const current = readPrefs(req.user);
    const channels = {
      email: req.body?.channels?.email == null ? current.channels.email : !!req.body.channels.email,
      sms: req.body?.channels?.sms == null ? current.channels.sms : !!req.body.channels.sms,
      push: req.body?.channels?.push == null ? current.channels.push : !!req.body.channels.push
    };
    const allowed = new Set(eventList(req.user.role).map(item => item[0]));
    const events = { ...current.events };
    const incoming = req.body?.events || {};
    for (const key of Object.keys(incoming)) {
      if (!allowed.has(key)) return sendError(res, 400, "That notice is not one you can change.");
      events[key] = !!incoming[key];
    }
    db.prepare("UPDATE users SET notify_channels = ?, notify_events = ? WHERE id = ?").run(JSON.stringify(channels), JSON.stringify(events), req.user.id);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "notify.updated", subjectType: "user", subjectId: req.user.id, detail: { channels } });
    const saved = readPrefs(db.prepare("SELECT notify_channels, notify_events FROM users WHERE id = ?").get(req.user.id));
    res.json({ channels: saved.channels, events: eventState(req.user.role, saved.events), urgentAlwaysEmail: true, smsSends: false });
  });

  app.post("/api/me/push", requireJson, requireUser, (req, res) => {
    const keys = pushKeys(config);
    const demo = req.body?.demo === true || !keys.configured;
    const endpoint = demo ? "" : String(req.body?.endpoint || "");
    const p256dh = demo ? "" : String(req.body?.keys?.p256dh || "");
    const authKey = demo ? "" : String(req.body?.keys?.auth || "");
    if (!demo && (!endpoint.startsWith("https://") || !p256dh || !authKey)) {
      return sendError(res, 400, "A push subscription needs an https address and its keys.");
    }
    const id = newId();
    db.prepare("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth_key, demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id, req.user.id, endpoint, p256dh, authKey, demo ? 1 : 0, new Date().toISOString()
    );
    res.status(201).json({
      id,
      stored: true,
      delivered: false,
      message: demo ? "Push is saved on this account. It is sent when push keys are configured." : "Push is saved on this phone."
    });
  });

  app.delete("/api/me/push", requireUser, (req, res) => {
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(req.user.id);
    res.json({ removed: true });
  });
}

function eventState(role, events) {
  const out = {};
  for (const [key] of eventList(role)) out[key] = events[key] !== false;
  return out;
}

async function sendPush(db, config, userId, payload) {
  const keys = pushKeys(config);
  if (!keys.configured || !userId) return 0;
  const rows = db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ? AND demo = 0 AND endpoint != ''").all(userId);
  if (!rows.length) return 0;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  let sent = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } }, JSON.stringify(payload));
      sent += 1;
    } catch (err) {
      const status = err && err.statusCode;
      if (status === 404 || status === 410) db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(row.id);
    }
  }
  return sent;
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}
