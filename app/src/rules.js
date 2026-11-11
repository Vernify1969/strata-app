const DAY = 86400000;
const REVIEW_MS = 72 * 3600000;

export function feeOfCents(cents, feePercent = 15, gstOnFee = false) {
  const fee = Math.round(cents * feePercent / 100);
  const gst = gstOnFee ? Math.round(fee / 10) : 0;
  return { fee, gst, net: cents - fee - gst };
}

export function gstInCents(cents) {
  return Math.round(cents / 11);
}

export function depositCents(priceCents, type) {
  if (type === "full") return priceCents;
  const pct = Number(type);
  if (pct === 25 || pct === 30 || pct === 50) return Math.round(priceCents * pct / 100);
  return 0;
}

export function approvalFor(input) {
  const have = input.quoteCount || 0;
  const emergency = String(input.urgency || "").toLowerCase() === "emergency";
  const approvals = input.approvals || {};
  if (input.world === "private") {
    const ownerBlock = input.ownerApproval && input.ownerDecision !== "approved";
    return {
      ok: !ownerBlock && have >= 1,
      tier: 1,
      name: "Your approval",
      need: 1,
      have,
      quotesOK: true,
      missing: ownerBlock ? ["Owner approval"] : [],
      notSet: false
    };
  }
  const tiers = input.tiers;
  const tiersReady = tiers && tiers.length === 3 && tiers.every(tier => tier.limitCents > 0 && tier.quotes >= 1);
  if (emergency && input.emLimitCents > 0 && input.priceCents <= input.emLimitCents) {
    return { ok: have >= 1, tier: 0, name: "Emergency approval", need: 1, have, quotesOK: have >= 1, missing: [], notSet: false };
  }
  if (!tiersReady) {
    if (emergency) return { ok: have >= 1, tier: 0, name: "Emergency approval", need: 1, have, quotesOK: have >= 1, missing: [], notSet: false };
    return { ok: false, tier: 0, name: "Budgets not set", need: 0, have, quotesOK: false, missing: [], notSet: true };
  }
  const price = input.priceCents;
  const tier = price <= tiers[0].limitCents ? 1 : price <= tiers[1].limitCents ? 2 : price <= tiers[2].limitCents ? 3 : 4;
  const need = emergency ? 1 : tiers[Math.min(tier, 3) - 1].quotes;
  const missing = [];
  if (tier >= 2) {
    if (input.role === "oc_manager") { if (!approvals.bm) missing.push("Building Manager approval"); }
    else if (!approvals.oc) missing.push("OC Manager approval");
  }
  if (tier >= 3 && !approvals.cm) missing.push("Committee approval");
  if (tier >= 4 && !approvals.gm) missing.push("General meeting approval");
  const fewer = !emergency && have < need && String(input.fewerReason || "").trim().length >= 3 && have >= 1;
  const quotesOK = have >= need || fewer;
  return { ok: quotesOK && missing.length === 0, tier, name: tier === 4 ? "Above the committee budget" : "Budget " + tier, need, have, quotesOK, missing, notSet: false, fewer };
}

export function invoiceDecision({ invoiceCents, approvedCents, paidCents }) {
  if (invoiceCents > approvedCents) {
    return { hold: true, kind: "above", overCents: invoiceCents - approvedCents, dueCents: 0 };
  }
  if (paidCents > 0 && invoiceCents < paidCents) {
    return { hold: true, kind: "below", underCents: paidCents - invoiceCents, dueCents: 0 };
  }
  return { hold: false, kind: "", dueCents: Math.max(0, invoiceCents - paidCents) };
}

export function hasContact(text) {
  const value = String(text || "");
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(value)) return true;
  const phones = value.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
  return phones.some(part => part.replace(/\D/g, "").length >= 8 && !/\d{4}-\d{2}-\d{2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(part));
}

function zonedParts(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(ms));
  const bag = {};
  for (const part of parts) if (part.type !== "literal") bag[part.type] = part.value;
  return {
    iso: `${bag.year}-${bag.month}-${bag.day}`,
    hour: Number(bag.hour),
    minute: Number(bag.minute)
  };
}

function addIsoDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isWorkingDay(iso, holidays) {
  const day = weekday(iso);
  if (day === 0 || day === 6) return false;
  return !(holidays || []).includes(iso);
}

function zonedTimeToMs(iso, hm, timeZone) {
  const [year, month, day] = iso.split("-").map(Number);
  const [hour, minute] = hm.split(":").map(Number);
  let ms = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i += 1) {
    const parts = zonedParts(ms, timeZone);
    const [gotHour, gotMinute] = [parts.hour, parts.minute];
    const want = Date.UTC(year, month - 1, day, hour, minute);
    const got = Date.UTC(Number(parts.iso.slice(0, 4)), Number(parts.iso.slice(5, 7)) - 1, Number(parts.iso.slice(8, 10)), gotHour, gotMinute);
    const diff = want - got;
    if (!diff) break;
    ms += diff;
  }
  return ms;
}

export function reviewEndsAt(startMs, holidays, timeZone = "Australia/Melbourne") {
  const raw = startMs + REVIEW_MS;
  const parts = zonedParts(raw, timeZone);
  if (isWorkingDay(parts.iso, holidays)) {
    return { at: new Date(raw).toISOString(), extended: false, localDay: parts.iso };
  }
  let day = parts.iso;
  do { day = addIsoDays(day, 1); } while (!isWorkingDay(day, holidays));
  return { at: new Date(zonedTimeToMs(day, "17:00", timeZone)).toISOString(), extended: true, localDay: day };
}

export function depositAllowed(type, capPercent) {
  if (capPercent == null || capPercent === "") return true;
  const cap = Number(capPercent);
  if (type === "none" || !type) return true;
  if (type === "full") return cap >= 100;
  return Number(type) <= cap;
}
