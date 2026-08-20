// Twilio Verify — phone-number 2FA for login. The office holds the three creds in the app_secrets
// vault (Development ▸ API Keys): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID.
// We call the Verify REST API directly (no SDK): Twilio generates, sends, and checks the one-time
// code and handles expiry + rate-limiting. Everything degrades gracefully to "not configured" when a
// secret is missing, so the login flow can fall back to a password.
import { secretValue } from "./db";

function creds() {
  return {
    sid:     secretValue("TWILIO_ACCOUNT_SID"),
    token:   secretValue("TWILIO_AUTH_TOKEN"),
    service: secretValue("TWILIO_VERIFY_SERVICE_SID"),
  };
}

// True only when all three creds are present — otherwise SMS 2FA is unavailable and callers fall back.
export function twilioVerifyConfigured() {
  const c = creds();
  return !!(c.sid && c.token && c.service);
}

const authHeader = (c) => "Basic " + Buffer.from(`${c.sid}:${c.token}`).toString("base64");

// Normalize a US phone to E.164 (+1XXXXXXXXXX). Already-"+"-prefixed international numbers pass through.
// Returns "" when it doesn't look like a phone number.
export function toE164(raw) {
  const s = String(raw || "").trim();
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  let d = s.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? "+1" + d : "";
}

// Send a verification code to the phone. Returns { ok } or { ok:false, error }.
export async function startVerification(e164) {
  const c = creds();
  if (!c.sid || !c.token || !c.service) return { ok: false, error: "SMS verification isn't set up." };
  try {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${c.service}/Verifications`, {
      method: "POST",
      headers: { Authorization: authHeader(c), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: e164, Channel: "sms" }).toString(),
    });
    if (!res.ok) return { ok: false, error: "Couldn't send the code — check the number and try again." };
    return { ok: true };
  } catch { return { ok: false, error: "Couldn't reach the text-message service." }; }
}

// Check the code the user entered. Returns { ok:true } only when Twilio reports status "approved".
export async function checkVerification(e164, code) {
  const c = creds();
  if (!c.sid || !c.token || !c.service) return { ok: false, error: "SMS verification isn't set up." };
  try {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${c.service}/VerificationCheck`, {
      method: "POST",
      headers: { Authorization: authHeader(c), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: e164, Code: String(code || "") }).toString(),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok && j.status === "approved", status: j.status || "failed" };
  } catch { return { ok: false, error: "Couldn't reach the text-message service." }; }
}
