// Who may read / sign an e-sign document. Resolves the caller from the same two cookies every other
// project surface uses (iot_session login, iot_access project PIN) and applies the SAME ownership rule
// (customerOwnsProjectAccount: email OR phone) — so a customer is never rejected here after being
// granted the project view, and a stranger is never let in.
import { parseToken, parseAccessToken } from "../auth.js";
import { customerOwnsProjectAccount } from "../db.js";

function cookieOf(header, name) {
  const part = String(header || "").split(";").find((c) => c.trim().startsWith(name + "="));
  return part ? part.trim().slice(name.length + 1) : null;
}

// → { role, id?, email?, accessId?, viaPin? } | null
export async function callerFromCookies(cookieHeader) {
  const raw = cookieOf(cookieHeader, "iot_session");
  if (raw) { const t = await parseToken(raw.trim()); if (t?.role) return t; }
  const acc = cookieOf(cookieHeader, "iot_access");
  if (acc) { const a = await parseAccessToken(acc.trim()); if (a?.role) return { role: a.role, accessId: a.accessId, viaPin: true }; }
  return null;
}

const STAFF_READ = new Set(["admin", "manager", "sales"]);
const SIGNERS = new Set(["customer", "admin", "manager"]);   // mirrors selectOptionAction

// Read the project's proposal documents. The document carries customer-facing retail pricing and the
// signature, so techs / vendors / read-only roles are excluded even with a PIN (role-visibility pass).
export function mayReadSignDoc(tok, accessId) {
  if (!tok) return false;
  if (STAFF_READ.has(tok.role)) return true;
  if (tok.role !== "customer") return false;
  if (tok.viaPin) return String(tok.accessId) === String(accessId);
  return customerOwnsProjectAccount(accessId, { userId: tok.id, email: tok.email });
}

// May this caller SIGN on this project (same population as accepting an option).
export function maySignProposal(tok, accessId) {
  if (!tok || !SIGNERS.has(tok.role)) return false;
  if (tok.role === "customer") return mayReadSignDoc(tok, accessId);
  if (tok.viaPin) return String(tok.accessId) === String(accessId);
  return true;
}
