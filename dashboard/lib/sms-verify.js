// SMS phone-number 2FA — provider-agnostic. Supports Twilio Verify and Telnyx Verify; the office
// holds the creds in the app_secrets vault (Development ▸ API Keys) and can switch providers by just
// changing which keys are filled in (or setting SMS_PROVIDER explicitly). Both providers generate,
// send, and check the one-time code and handle expiry + rate-limiting. Everything degrades gracefully
// to "not configured" so the login flow can fall back to a password.
//
//   Twilio: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_VERIFY_SERVICE_SID
//   Telnyx: TELNYX_API_KEY + TELNYX_VERIFY_PROFILE_ID
import { secretValue } from "./db";

const twilioReady = () => !!(secretValue("TWILIO_ACCOUNT_SID") && secretValue("TWILIO_AUTH_TOKEN") && secretValue("TWILIO_VERIFY_SERVICE_SID"));
const telnyxReady = () => !!(secretValue("TELNYX_API_KEY") && secretValue("TELNYX_VERIFY_PROFILE_ID"));

// Which provider to use: an explicit SMS_PROVIDER wins; otherwise auto-detect (Telnyx preferred when
// both happen to be set). Returns null when nothing is configured.
export function smsProvider() {
  const explicit = String(secretValue("SMS_PROVIDER") || "").trim().toLowerCase();
  if (explicit === "telnyx" && telnyxReady()) return "telnyx";
  if (explicit === "twilio" && twilioReady()) return "twilio";
  if (telnyxReady()) return "telnyx";
  if (twilioReady()) return "twilio";
  return null;
}
export function smsVerifyConfigured() { return smsProvider() !== null; }

// Normalize a US phone to E.164 (+1XXXXXXXXXX). Already-"+"-prefixed numbers pass through; "" if invalid.
export function toE164(raw) {
  const s = String(raw || "").trim();
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  let d = s.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? "+1" + d : "";
}

// ---- Twilio Verify ----
const twilioAuth = () => "Basic " + Buffer.from(`${secretValue("TWILIO_ACCOUNT_SID")}:${secretValue("TWILIO_AUTH_TOKEN")}`).toString("base64");
async function twilioStart(e164) {
  const svc = secretValue("TWILIO_VERIFY_SERVICE_SID");
  const res = await fetch(`https://verify.twilio.com/v2/Services/${svc}/Verifications`, {
    method: "POST", headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, Channel: "sms" }).toString(),
  });
  return res.ok ? { ok: true } : { ok: false, error: "Couldn't send the code — check the number and try again." };
}
async function twilioCheck(e164, code) {
  const svc = secretValue("TWILIO_VERIFY_SERVICE_SID");
  const res = await fetch(`https://verify.twilio.com/v2/Services/${svc}/VerificationCheck`, {
    method: "POST", headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, Code: String(code || "") }).toString(),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok && j.status === "approved", status: j.status || "failed" };
}

// ---- Telnyx Verify ----
const telnyxAuth = () => "Bearer " + secretValue("TELNYX_API_KEY");
async function telnyxStart(e164) {
  const res = await fetch("https://api.telnyx.com/v2/verifications/sms", {
    method: "POST", headers: { Authorization: telnyxAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({ phone_number: e164, verify_profile_id: secretValue("TELNYX_VERIFY_PROFILE_ID") }),
  });
  return res.ok ? { ok: true } : { ok: false, error: "Couldn't send the code — check the number and try again." };
}
async function telnyxCheck(e164, code) {
  const res = await fetch(`https://api.telnyx.com/v2/verifications/by_phone_number/${encodeURIComponent(e164)}/actions/verify`, {
    method: "POST", headers: { Authorization: telnyxAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({ code: String(code || ""), verify_profile_id: secretValue("TELNYX_VERIFY_PROFILE_ID") }),
  });
  const j = await res.json().catch(() => ({}));
  const status = j?.data?.response_code || j?.data?.status || "failed";   // Telnyx → "accepted" | "rejected"
  return { ok: res.ok && (status === "accepted" || status === "approved"), status };
}

// ---- Dispatch ----
export async function startVerification(e164) {
  try {
    const p = smsProvider();
    if (p === "telnyx") return await telnyxStart(e164);
    if (p === "twilio") return await twilioStart(e164);
    return { ok: false, error: "SMS verification isn't set up." };
  } catch { return { ok: false, error: "Couldn't reach the text-message service." }; }
}
export async function checkVerification(e164, code) {
  try {
    const p = smsProvider();
    if (p === "telnyx") return await telnyxCheck(e164, code);
    if (p === "twilio") return await twilioCheck(e164, code);
    return { ok: false, error: "SMS verification isn't set up." };
  } catch { return { ok: false, error: "Couldn't reach the text-message service." }; }
}
