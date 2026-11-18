export const HAIKU = "claude-haiku-5-5";
export const SONNET = "claude-sonnet-5-5";

const USD = {
  [HAIKU]: { input: 0.1, output: 0.5 },
  [SONNET]: { input: 2, output: 10 }
};
const AUD_PER_USD = 1.55;

export const HELPERS = {
  triage: { model: HAIKU, title: "Triage a resident report" },
  "job-draft": { model: HAIKU, title: "Job description from a report" },
  "quote-compare": { model: SONNET, title: "Quote comparison" },
  committee: { model: HAIKU, title: "Committee summary" },
  "next-step": { model: HAIKU, title: "Next step" },
  "missing-info": { model: HAIKU, title: "Missing information" },
  "reply-draft": { model: HAIKU, title: "Reply draft" },
  "budget-warning": { model: HAIKU, title: "Budget warning" },
  handover: { model: HAIKU, title: "Handover notes" },
  paperwork: { model: SONNET, title: "Licence and insurance check" }
};

const DRAFT = "Draft. Nothing is approved, sent, booked, or paid until you confirm it. This is not legal advice.";

export function estimateAudCents(model, inputTokens, outputTokens) {
  const rate = USD[model] || USD[HAIKU];
  const usd = ((inputTokens || 0) * rate.input + (outputTokens || 0) * rate.output) / 1_000_000;
  return Math.ceil(usd * AUD_PER_USD * 100);
}

export function redactContacts(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?61|0)4\d{8}/g, "[phone removed]");
}

export function demoAnswer(helper) {
  const samples = {
    triage: "Category: lift. Urgency: routine. No likely duplicate in the short list you sent. Ask whether the door sticks open on every floor.",
    "job-draft": "The lift door stays open. Please check the door sensor and the ground-floor track. Photos were described, not treated as proof.",
    "quote-compare": "Quote A includes the washer. Quote B does not say whether GST is included, and it does not mention the track. The lower budget level applies if the total stays under the first limit.",
    committee: "One lift-door repair is waiting. Two offers are in. No decision has been made.",
    "next-step": "Look at the items that are waiting. Confirm each one yourself.",
    "missing-info": "Add where in the building the work is, and what the contractor should do.",
    "reply-draft": "Thank you for the report. A manager will look at it. If anyone is in danger, call 000.",
    "budget-warning": "Check this total against the building's three budgets before anyone approves it.",
    handover: "Open jobs and recent notices for this building are listed for the next manager. Confirm the details before you rely on them.",
    paperwork: "Holder, number, cover and expiry could not be read in sample mode. Compare the name and ABN with the profile yourself, and check the expiry and the cover minimum."
  };
  return `Demo AI (sample answers).\n\n${samples[helper] || "A short draft is ready for you to edit."}`;
}

export async function completeAi(config, request) {
  if (typeof config.aiComplete === "function") return config.aiComplete(request);
  if (!config.anthropicApiKey) {
    return { text: demoAnswer(request.helper), inputTokens: 0, outputTokens: 0, demo: true };
  }
  const content = [{ type: "text", text: request.user }];
  for (const image of (request.images || []).slice(0, 2)) {
    content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 500,
      system: request.system,
      messages: [{ role: "user", content }]
    })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = "The draft could not be prepared. Try again later.";
    const error = new Error(message);
    error.status = 502;
    throw error;
  }
  const text = (json.content || []).map(block => block.text || "").join("\n").trim();
  return {
    text: text || "No draft was returned.",
    inputTokens: json.usage?.input_tokens || 0,
    outputTokens: json.usage?.output_tokens || 0,
    demo: false
  };
}

export function draftEnvelope(helper, result) {
  return {
    draft: true,
    label: DRAFT,
    helper,
    title: HELPERS[helper].title,
    demo: !!result.demo,
    mode: result.demo ? "Demo AI (sample answers)" : "Anthropic draft",
    text: result.text,
    model: result.demo ? "" : result.model
  };
}
