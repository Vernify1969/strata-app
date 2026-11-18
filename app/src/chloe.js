import { audit } from "./db.js";
import { newId } from "./ids.js";
import { moneySettings } from "./payments.js";
import { HAIKU, SONNET, completeAi, estimateAudCents, redactContacts } from "./ai.js";
import { citedAnswer, ensureSources, searchSources, sourceNeedsReview } from "./regulations.js";

const LABEL = "Draft – check before using";
const WEB_LABEL = "From the web (checked today)";
const AUD_PER_USD = 1.55;

export function publicSearchQuery(message, hidden = []) {
  let text = redactContacts(String(message || ""));
  for (const secret of hidden) {
    const word = String(secret || "").trim();
    if (word.length > 2) text = text.replaceAll(word, " ");
  }
  text = text
    .replace(/\b(?:unit|apartment|apt)\s*\d+\b/gi, " ")
    .replace(/\b\d{1,5}\s+[A-Za-z]+\s+(?:street|st|road|rd|avenue|ave|lane|drive|dr)\b/gi, " ")
    .replace(/[^A-Za-z0-9 ?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return text;
}

export function webSearchCents(requests) {
  const usd = (Number(requests) || 0) * 10 / 1000;
  return Math.ceil(usd * AUD_PER_USD * 100);
}

const DEFAULT_NAME = "Chloe";
const DEFAULT_GREETING = "Hi, I'm {name}, your AI assistant. How can I help you today?";

export function cleanAssistantName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z ]{1,20}$/.test(name)) return "";
  return name;
}

export function cleanTone(value) {
  return value === "short" ? "short" : "friendly";
}

function readPrefs(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function personaFor(db, user) {
  const settings = moneySettings(db);
  const prefs = readPrefs(user.preferences);
  const name = cleanAssistantName(prefs.assistantName) || cleanAssistantName(settings.assistantName) || DEFAULT_NAME;
  const tone = prefs.assistantTone ? cleanTone(prefs.assistantTone) : cleanTone(settings.assistantTone);
  const template = settings.assistantGreeting || DEFAULT_GREETING;
  const greeting = template.includes("{name}") ? template.replaceAll("{name}", name) : `Hi, I'm ${name}, your AI assistant. How can I help you today?`;
  return { name, tone, greeting, chips: chipsFor(user.role) };
}

function chipsFor(role) {
  if (role === "contractor") return ["What's waiting for me?", "Draft a quote", "Draft a reply", "Check documents"];
  if (role === "platform_owner") return ["What needs attention?", "Draft a reply"];
  if (role === "property_manager") return ["What's waiting?", "Draft a reply", "Check a tenancy question"];
  return ["What's waiting?", "Compare quotes", "Draft a reply", "Check documents"];
}

function monthKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit" }).format(new Date());
}

function capFor(settings, role) {
  if (role === "platform_owner") return null;
  if (role === "contractor") return settings.contractorAiCapCents;
  return settings.aiCapCents;
}

function isRegulation(text) {
  return /\b(act|regulation|esm|essential safety|fire|lift|fence|pool|lease|asbestos|ncc|class|ohs|epa|gas|electric|backflow|planning|disability|dangerous goods|tenancy|worksafe|vba|strata|owners corporation)\b/i.test(text);
}

function buildingClassFor(db, user, buildingId) {
  if (!buildingId) return "";
  const row = db.prepare(`SELECT buildings.building_class FROM buildings
    LEFT JOIN building_assignments ON building_assignments.building_id = buildings.id AND building_assignments.user_id = ?
    WHERE buildings.id = ? AND (buildings.organisation_id = ? OR building_assignments.user_id IS NOT NULL)`).get(user.id, buildingId, user.organisation_id);
  return row?.building_class || "";
}

function ownJobs(db, user) {
  if (user.role === "contractor") {
    return db.prepare("SELECT id, title, stage, area FROM jobs WHERE stage = 'open' OR contractor_user_id = ? ORDER BY created_at DESC LIMIT 8").all(user.id);
  }
  if (user.role === "platform_owner") {
    return db.prepare("SELECT id, title, stage FROM jobs ORDER BY created_at DESC LIMIT 8").all();
  }
  return db.prepare(`SELECT jobs.id, jobs.title, jobs.stage, jobs.area FROM jobs
    JOIN building_assignments ON building_assignments.building_id = jobs.building_id
    WHERE jobs.organisation_id = ? AND building_assignments.user_id = ? ORDER BY jobs.created_at DESC LIMIT 8`).all(user.organisation_id, user.id);
}

function searchHistory(db, user, query) {
  if (user.role === "platform_owner") return { notes: [], jobs: [] };
  const words = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 5).slice(0, 5);
  const notes = [];
  const jobs = [];
  for (const word of words) {
    const like = "%" + word + "%";
    notes.push(...db.prepare("SELECT body FROM notes WHERE organisation_id = ? AND lower(body) LIKE ? ORDER BY created_at DESC LIMIT 2").all(user.organisation_id, like));
    jobs.push(...db.prepare("SELECT title, stage FROM jobs WHERE organisation_id = ? AND lower(title) LIKE ? ORDER BY created_at DESC LIMIT 2").all(user.organisation_id, like));
  }
  return {
    notes: notes.map(row => redactContacts(row.body).slice(0, 180)),
    jobs: jobs.map(row => ({ title: redactContacts(row.title), stage: row.stage }))
  };
}

function dutiesFor(db, user) {
  if (!["building_manager", "oc_manager", "property_manager"].includes(user.role)) return [];
  return db.prepare(`SELECT building_duties.kind, building_duties.due_on, buildings.name FROM building_duties
    JOIN buildings ON buildings.id = building_duties.building_id
    JOIN building_assignments ON building_assignments.building_id = buildings.id
    WHERE building_duties.organisation_id = ? AND building_assignments.user_id = ? AND building_duties.due_on <= date('now', '+60 day')
    ORDER BY building_duties.due_on`).all(user.organisation_id, user.id);
}

function memoryFor(db, user) {
  return db.prepare("SELECT id, body, created_at FROM ai_memory WHERE user_id = ? AND organisation_id = ? ORDER BY created_at DESC LIMIT 12").all(user.id, user.organisation_id);
}

function examplesFor(db, user) {
  if (!user.organisation_id || user.role === "platform_owner") return [];
  return db.prepare("SELECT vote, correction FROM ai_feedback WHERE organisation_id = ? AND correction != '' ORDER BY created_at DESC LIMIT 3").all(user.organisation_id)
    .map(row => redactContacts(row.correction).slice(0, 160));
}

function composeReply({ message, regulation, history, jobs, duties, memory, persona }) {
  if (regulation) {
    const cited = citedAnswer(regulation.sources);
    return {
      text: cited.text,
      citations: cited.citations,
      disclaimer: cited.disclaimer,
      sourced: cited.sourced
    };
  }
  const bits = [];
  if (persona.tone === "short") bits.push("Here is the short version.");
  else bits.push("Happy to help. This is a draft for you to check.");
  if (/remember/i.test(message)) bits.push("I have saved that for you. You can delete it in Profile.");
  if (jobs.length && /wait|quote|job/i.test(message)) {
    bits.push("From your own jobs: " + jobs.map(job => job.title + " (" + job.stage + ")").join("; ") + ".");
  }
  if (history && (history.notes.length || history.jobs.length)) {
    bits.push("From your organisation's history only: " + [...history.jobs.map(job => job.title), ...history.notes].slice(0, 3).join("; ") + ".");
  }
  if (duties.length) {
    bits.push("Suggestion only: " + duties.map(duty => duty.kind + " for " + duty.name + " is dated " + duty.due_on).join("; ") + ". Nothing has been booked.");
  }
  if (memory.length && /remember|what do you know/i.test(message)) {
    bits.push("Things you asked me to remember: " + memory.map(item => item.body).join("; ") + ".");
  }
  if (!jobs.length && /which job|quote/i.test(message)) bits.push("Which job should I use?");
  if (bits.length === 1) bits.push("Tell me the job or the question, and I will draft from your own records. I will not send, approve, pay or book anything.");
  return { text: bits.join(" "), citations: [], disclaimer: "", sourced: false };
}

function wantsCurrentWeb(message) {
  return /\b(latest|current|today|look up|search|official site|what applies)\b/i.test(message);
}

export async function lookupWeb(config, query) {
  if (!query) return null;
  if (typeof config.webSearch === "function") return config.webSearch({ query });
  if (!config.anthropicApiKey) return null;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: SONNET,
      max_tokens: 800,
      system: "Research the public question. Prefer official Australian and Victorian government sites, and open any other relevant page you need. Use web search and web fetch. Cite every source with its URL. Do not invent a rule. The question has already had names, addresses and contact details removed. Do not put private details into a search.",
      messages: [{ role: "user", content: query }],
      tools: [
        { type: "web_search_20260318", name: "web_search", max_uses: 3 },
        { type: "web_fetch_20260318", name: "web_fetch", max_uses: 3, citations: { enabled: true } }
      ]
    })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return { citations: [], searches: 0, text: "" };
  const citations = [];
  const seen = new Set();
  const add = (title, url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    citations.push({ title: title || url, url, section: "Web page" });
  };
  for (const block of json.content || []) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const item of block.content) add(item.title, item.url);
    }
    for (const cite of block.citations || []) add(cite.title, cite.url);
  }
  const text = (json.content || []).map(block => block.text || "").join("\n").trim();
  return {
    text,
    citations,
    searches: json.usage?.server_tool_use?.web_search_requests || 0,
    inputTokens: json.usage?.input_tokens || 0,
    outputTokens: json.usage?.output_tokens || 0
  };
}

export async function replyTo(db, config, user, body) {
  ensureSources(db);
  const message = redactContacts(String(body.message || "")).slice(0, 1000);
  if (message.length < 1) return { error: "Type a message.", status: 400 };
  const settings = moneySettings(db);
  const cap = capFor(settings, user.role);
  const month = monthKey();
  const spent = db.prepare("SELECT COALESCE(SUM(cost_cents), 0) AS n FROM ai_uses WHERE user_id = ? AND month = ? AND demo = 0").get(user.id, month).n;
  const live = !!config.anthropicApiKey;
  if (live && cap != null && spent >= cap) return { error: "This month's AI Assistant allowance is used.", status: 403 };
  const persona = personaFor(db, user);
  const buildingClass = buildingClassFor(db, user, String(body.buildingId || ""));
  let regulation = null;
  let web = null;
  const buildingName = body.buildingId ? db.prepare("SELECT name FROM buildings WHERE id = ?").get(String(body.buildingId))?.name : "";
  const publicQuery = publicSearchQuery(message, [user.name, user.business_name, user.email, buildingName]);
  if (isRegulation(message)) {
    regulation = { sources: searchSources(db, message, buildingClass) };
  }
  if (settings.webSearchEnabled && (regulation || wantsCurrentWeb(message))) {
    web = await lookupWeb(config, publicQuery);
  }
  const jobs = ownJobs(db, user);
  const history = /history|past|usually|typical cost|resolved/i.test(message) ? searchHistory(db, user, message) : null;
  const duties = dutiesFor(db, user);
  const memory = memoryFor(db, user);
  if (/\bremember\b/i.test(message)) {
    const fact = message.replace(/.*\bremember\b/i, "").replace(/^[\s:]+/, "").slice(0, 240);
    if (fact.length > 2 && user.role !== "platform_owner") {
      db.prepare("INSERT INTO ai_memory (id, user_id, organisation_id, body, created_at) VALUES (?, ?, ?, ?, ?)").run(newId(), user.id, user.organisation_id, fact, new Date().toISOString());
    }
  }
  let modelText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  if (live || typeof config.aiChat === "function") {
    const examples = examplesFor(db, user);
    const request = {
      helper: "chloe",
      model: SONNET,
      system: `${persona.name} drafts short answers. Tone: ${persona.tone}. Never send, approve, pay, quote or book. Never invent a legal rule. Regulation answers may only use the supplied sources. Examples from this organisation only: ${examples.join(" | ") || "none"}.`,
      user: message
    };
    if (typeof config.aiChat === "function") {
      const result = await config.aiChat(request);
      modelText = result.text || "";
      inputTokens = result.inputTokens || 0;
      outputTokens = result.outputTokens || 0;
    } else {
      const small = await completeAi(config, { ...request, model: HAIKU, user: "Classify in one word: regulation, work, or other. Message: " + message.slice(0, 200) });
      const result = await completeAi(config, request);
      modelText = result.text || "";
      inputTokens = (small.inputTokens || 0) + (result.inputTokens || 0);
      outputTokens = (small.outputTokens || 0) + (result.outputTokens || 0);
    }
  }
  const composed = composeReply({ message, regulation, history, jobs, duties, memory: memoryFor(db, user), persona });
  let text = composed.text;
  let citations = composed.citations;
  let disclaimer = composed.disclaimer;
  let fromWeb = false;
  if (web && web.citations && web.citations.length) {
    fromWeb = true;
    const webText = WEB_LABEL + "\n\n" + web.citations.map(item => `${item.title}. ${item.url}`).join("\n") + (web.text ? "\n\n" + web.text : "");
    text = regulation && regulation.sources.length ? composed.text + "\n\n" + webText : webText;
    citations = [...composed.citations, ...web.citations];
    disclaimer = "General information, not legal advice. Check the source or ask a qualified professional.";
    inputTokens += web.inputTokens || 0;
    outputTokens += web.outputTokens || 0;
  } else if (modelText && !regulation) text = modelText;
  if (regulation && !fromWeb) text = composed.text;
  const demo = !live;
  const searches = web?.searches || 0;
  const cost = demo ? 0 : estimateAudCents(SONNET, inputTokens, outputTokens) + webSearchCents(searches);
  db.prepare(`INSERT INTO ai_uses (id, user_id, helper, model, demo, month, input_tokens, output_tokens, cost_cents, subject_type, subject_id, created_at)
    VALUES (?, ?, 'chloe', ?, ?, ?, ?, ?, ?, 'chat', '', ?)`).run(
    newId(), user.id, demo ? "" : SONNET, demo ? 1 : 0, month, inputTokens, outputTokens, cost, new Date().toISOString()
  );
  const prefill = /draft|reply|quote/i.test(message) ? { field: "instructions", text: text.slice(0, 500) } : null;
  return {
    status: 200,
    body: {
      draft: true,
      label: LABEL,
      name: persona.name,
      tone: persona.tone,
      demo,
      mode: demo ? "Demo AI (sample answers)" : "Anthropic draft",
      text,
      citations,
      disclaimer,
      webLabel: fromWeb ? WEB_LABEL : "",
      searches,
      prefill,
      suggestions: duties,
      legal: !!regulation
    }
  };
}

export function registerChloeRoutes(app, { db, config, sendError, requireUser, requireJson }) {
  ensureSources(db);

  app.get("/api/ai/persona", requireUser, (req, res) => {
    ensureSources(db);
    res.json(personaFor(db, req.user));
  });

  app.post("/api/ai/chat", requireJson, requireUser, async (req, res) => {
    const result = await replyTo(db, config, req.user, req.body || {});
    if (result.error) return sendError(res, result.status, result.error);
    res.json(result.body);
  });

  app.get("/api/ai/memory", requireUser, (req, res) => {
    res.json({ memory: memoryFor(db, req.user) });
  });

  app.delete("/api/ai/memory/:id", requireUser, (req, res) => {
    const row = db.prepare("SELECT id FROM ai_memory WHERE id = ? AND user_id = ? AND organisation_id = ?").get(req.params.id, req.user.id, req.user.organisation_id);
    if (!row) return sendError(res, 404, "That memory was not found.");
    db.prepare("DELETE FROM ai_memory WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });

  app.post("/api/ai/feedback", requireJson, requireUser, (req, res) => {
    const vote = req.body?.vote === "down" ? "down" : req.body?.vote === "up" ? "up" : "";
    if (!vote) return sendError(res, 400, "Choose helpful or not helpful.");
    const correction = redactContacts(req.body?.correction).slice(0, 300);
    db.prepare("INSERT INTO ai_feedback (id, organisation_id, user_id, vote, correction, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      newId(), req.user.organisation_id || "", req.user.id, vote, correction, new Date().toISOString()
    );
    res.status(201).json({ ok: true });
  });

  app.patch("/api/me/assistant", requireJson, requireUser, (req, res) => {
    const prefs = readPrefs(req.user.preferences);
    if (req.body?.name != null) {
      const name = cleanAssistantName(req.body.name);
      if (!name) return sendError(res, 400, "The assistant name is 1 to 20 letters and spaces.");
      prefs.assistantName = name;
    }
    if (req.body?.tone != null) prefs.assistantTone = cleanTone(req.body.tone);
    db.prepare("UPDATE users SET preferences = ? WHERE id = ?").run(JSON.stringify(prefs), req.user.id);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    res.json(personaFor(db, user));
  });

  app.post("/api/buildings/:id/duties", requireJson, requireUser, (req, res) => {
    const building = db.prepare(`SELECT buildings.id, buildings.organisation_id FROM buildings
      JOIN building_assignments ON building_assignments.building_id = buildings.id
      WHERE buildings.id = ? AND building_assignments.user_id = ?`).get(req.params.id, req.user.id);
    if (!building) return sendError(res, 404, "That building is not on your account.");
    const kind = ["esm", "fire", "lift", "pool"].includes(req.body?.kind) ? req.body.kind : "";
    const due = String(req.body?.dueOn || "");
    if (!kind || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return sendError(res, 400, "Choose a kind and a date.");
    const id = newId();
    db.prepare("INSERT INTO building_duties (id, building_id, organisation_id, kind, due_on, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id, building.id, building.organisation_id, kind, due, "Suggestion only. Nothing is booked.", new Date().toISOString()
    );
    res.status(201).json({ id, kind, dueOn: due, suggestion: true });
  });

  app.get("/api/owner/sources", requireUser, (req, res) => {
    if (req.user.role !== "platform_owner") return sendError(res, 403, "Only the platform owner can open the sources.");
    ensureSources(db);
    const rows = db.prepare("SELECT id, title, url, section, excerpt, classes, topics, last_checked, reviewed FROM regulation_sources ORDER BY title").all();
    res.json({
      sources: rows.map(row => ({ ...row, classes: JSON.parse(row.classes || "[]"), topics: JSON.parse(row.topics || "[]"), needsReview: sourceNeedsReview(row.last_checked) })),
      reminder: "Review each source every 6 months."
    });
  });

  app.post("/api/owner/sources", requireJson, requireUser, (req, res) => {
    if (req.user.role !== "platform_owner") return sendError(res, 403, "Only the platform owner can add a source.");
    const url = String(req.body?.url || "");
    const title = String(req.body?.title || "").trim();
    const section = String(req.body?.section || "").trim();
    const excerpt = String(req.body?.excerpt || "").trim();
    if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url) || /localhost|127\.0\.0\.1|192\.168\./i.test(url)) {
      return sendError(res, 400, "Use a public https link.");
    }
    if (title.length < 3 || section.length < 3 || excerpt.length < 20) return sendError(res, 400, "Add a title, a section and a short excerpt.");
    const classes = Array.isArray(req.body?.classes) ? req.body.classes.map(String) : [];
    const topics = Array.isArray(req.body?.topics) ? req.body.topics.map(String) : [];
    const id = newId();
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(`INSERT INTO regulation_sources (id, title, url, section, excerpt, classes, topics, last_checked, reviewed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(id, title, url, section, excerpt, JSON.stringify(classes), JSON.stringify(topics), today, today);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.source_added", subjectType: "source", subjectId: id, detail: { url } });
    res.status(201).json({ id });
  });

  app.post("/api/owner/web-search", requireJson, requireUser, (req, res) => {
    if (req.user.role !== "platform_owner") return sendError(res, 403, "Only the platform owner can use the emergency switch.");
    if (req.body?.confirm !== true) return sendError(res, 400, "Confirm this change.");
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return sendError(res, 400, "Add a short reason.");
    const enabled = req.body?.enabled === true;
    db.prepare("UPDATE platform_settings SET web_search_enabled = ? WHERE id = 'main'").run(enabled ? 1 : 0);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: enabled ? "owner.web_search_on" : "owner.web_search_emergency_off", subjectType: "settings", subjectId: "web-search", detail: { reason, enabled } });
    res.json({ webSearchEnabled: enabled, emergency: !enabled });
  });

  app.post("/api/owner/sources/:id/review", requireJson, requireUser, (req, res) => {
    if (req.user.role !== "platform_owner") return sendError(res, 403, "Only the platform owner can review a source.");
    const row = db.prepare("SELECT id FROM regulation_sources WHERE id = ?").get(req.params.id);
    if (!row) return sendError(res, 404, "That source was not found.");
    const today = new Date().toISOString().slice(0, 10);
    db.prepare("UPDATE regulation_sources SET reviewed = 1, last_checked = ?, updated_at = ? WHERE id = ?").run(today, today, row.id);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.source_reviewed", subjectType: "source", subjectId: row.id, detail: { lastChecked: today } });
    res.json({ reviewed: true, lastChecked: today });
  });
}
