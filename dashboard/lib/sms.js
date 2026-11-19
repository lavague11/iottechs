// Outbound SMS. The app already holds Twilio credentials for login 2FA (lib/sms-verify.js), but Verify
// can only send ITS OWN codes — it cannot carry a message of ours. This is the plain Messages API, so a
// customer can be texted a link and a technician can be nudged.
//
// It needs one thing the vault does not have yet: a from-number (TWILIO_SMS_FROM). Until that is set
// this is a no-op that says so, exactly like emailEnabled() — nothing is faked, nothing throws, and a
// caller can always tell whether the message actually went.
import { secretValue } from "./db.js";
import { toE164 } from "./sms-verify.js";

export function smsEnabled() {
  return !!(secretValue("TWILIO_ACCOUNT_SID") && secretValue("TWILIO_AUTH_TOKEN") && secretValue("TWILIO_SMS_FROM"));
}

// Returns { ok } or { ok:false, reason }. Never throws: a message that cannot be sent must not take
// down the action that asked for it (a sign-off request still stands if the text fails).
export async function sendSms({ to, body }) {
  const sid = secretValue("TWILIO_ACCOUNT_SID");
  const token = secretValue("TWILIO_AUTH_TOKEN");
  const from = secretValue("TWILIO_SMS_FROM");
  if (!sid || !token || !from) return { ok: false, reason: "not-configured" };
  const num = toE164(to);
  if (!num) return { ok: false, reason: "bad-number" };
  const text = String(body || "").slice(0, 600);
  if (!text) return { ok: false, reason: "empty" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: num, From: from, Body: text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `twilio-${res.status}`, detail: detail.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 200) };
  }
}
