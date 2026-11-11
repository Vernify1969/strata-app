// Live Stripe keys are refused in this build even after the security tests pass.
// Test payments and printable QR sheets stay off until the security tests have passed.

export function liveKeyProblem(secret, publishable) {
  const values = [secret, publishable].filter(Boolean);
  if (values.some(value => value.startsWith("sk_live") || value.startsWith("pk_live") || value.startsWith("rk_live"))) {
    return "Live Stripe keys are refused. Use test keys only.";
  }
  if (secret && !secret.startsWith("sk_test")) return "The Stripe secret must be a test key starting with sk_test_.";
  if (publishable && !publishable.startsWith("pk_test")) return "The Stripe publishable key must be a test key starting with pk_test_.";
  return "";
}

export function securityGateOpen(config) {
  if (config && config.securityGate === true) return true;
  if (config && config.securityGate === false) return false;
  return process.env.SECURITY_GATE === "passed";
}
