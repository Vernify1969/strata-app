import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  const key = Buffer.from(await scrypt(password, salt, expected.length, SCRYPT));
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}

export function passwordProblem(password, email) {
  const value = String(password || "");
  if (value.length < 8) return "Use at least 8 characters, with letters and a number.";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Use at least 8 characters, with letters and a number.";
  const mail = String(email || "").trim().toLowerCase();
  if (mail && value.toLowerCase().includes(mail)) return "The password must not contain the email address.";
  return "";
}

let dummyHash = "";
export async function dummyPasswordHash() {
  if (!dummyHash) dummyHash = await hashPassword("not-a-real-password");
  return dummyHash;
}
