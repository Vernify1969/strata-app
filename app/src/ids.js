import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function newId() {
  return randomBytes(16).toString("hex");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function tokensMatch(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function emailOk(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function normalEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function mobileOk(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function abnOk(value) {
  const digits = String(value || "").replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const nums = digits.split("").map(Number);
  nums[0] -= 1;
  const sum = nums.reduce((total, digit, index) => total + digit * ABN_WEIGHTS[index], 0);
  return sum % 89 === 0;
}

export function publicUser(row) {
  const managerRole = {
    building_manager: "building",
    oc_manager: "oc",
    property_manager: "property"
  }[row.role] || "";
  const side = row.role === "contractor" ? "contractor" : "manager";
  const roleLabel = {
    building_manager: "Building manager",
    oc_manager: "OC manager",
    property_manager: "Property manager",
    contractor: "Contractor",
    platform_owner: "Platform owner"
  }[row.role] || row.role;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    roleLabel,
    side: row.role === "platform_owner" ? "manager" : side,
    managerRole,
    name: row.name,
    mobile: row.mobile,
    businessName: row.business_name,
    abn: row.abn,
    payment: row.payment_method,
    consent: !!row.consent,
    emailVerified: !!row.email_verified_at,
    organisationId: row.organisation_id,
    world: row.world,
    createdAt: row.created_at
  };
}

export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function sessionCookie(token, { keep, secure }) {
  const bits = [`strata_session=${encodeURIComponent(token)}`, "HttpOnly", "SameSite=Lax", "Path=/"];
  if (secure) bits.push("Secure");
  if (keep) bits.push(`Max-Age=${60 * 60 * 24 * 30}`);
  return bits.join("; ");
}

export function clearSessionCookie(secure) {
  const bits = ["strata_session=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}
