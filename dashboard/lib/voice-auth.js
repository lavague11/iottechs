// S3 — authorization for the voice routes (/api/tts, /api/transcribe). Allows STAFF (the staff assistant
// gate, aiGate) OR a CUSTOMER who owns the named project when the customer assistant is on — WITHOUT widening
// aiGate (which would hand customers the staff STT/TTS surface). Keys stay server-side; this only decides who
// may invoke the route. `project` is the accessId the customer is bound to (from the request body/form).
import { headers } from "next/headers";
import { secretValue, customerOwnsProjectAccount } from "./db.js";
import { aiGate } from "./ai-authz.js";

export async function voiceAllowed(project = null) {
  const cookie = (await headers()).get("cookie") || "";
  const get = (n) => cookie.split(";").find((c) => c.trim().startsWith(n + "="))?.split("=").slice(1).join("=");
  const { parseToken, parseAccessToken } = await import("./auth.js");
  const raw = get("iot_session");
  const tok = raw ? await parseToken(raw.trim()).catch(() => null) : null;
  // Staff: the existing assistant gate (admin/manager/sales/tech + AI_COMMANDS). Unchanged.
  if (aiGate(tok, secretValue("AI_COMMANDS") === "on").ok) return true;
  // Customer voice: ONLY when the customer assistant is on AND the caller owns the named project.
  if (secretValue("AI_CUSTOMER") === "on" && project) {
    if (tok?.role === "customer" && customerOwnsProjectAccount(String(project), { userId: tok.id, email: tok.email })) return true;
    const acc = get("iot_access");
    const at = acc ? await parseAccessToken(acc.trim()).catch(() => null) : null;
    if (at?.role === "customer" && String(at.accessId) === String(project)) return true;
  }
  return false;
}
