// The read gate for stored e-sign documents, kept as a plain function so it can be exercised under
// node --test; app/api/proposal-doc/[id]/route.js is a thin wrapper around it.
//
// Unlike /api/media this is NOT public-by-link: the proposal carries pricing and the signature, so the
// caller must be signed in (or hold the project PIN grant) AND be one of the project's own people.
// Anything else is a flat 404 — no distinction between "doesn't exist" and "not yours", so ids can't be
// probed.
import { getDocument } from "./store.js";
import { callerFromCookies, mayReadSignDoc } from "./access.js";

export async function serveSignDocument(id, cookieHeader) {
  const miss = { status: 404, body: "Not found", headers: { "Cache-Control": "no-store" } };
  const docId = String(id || "");
  if (!/^[0-9a-f]{32}$/.test(docId)) return miss;
  const doc = getDocument(docId);
  if (!doc) return miss;
  const tok = await callerFromCookies(cookieHeader);
  if (!mayReadSignDoc(tok, doc.project_access_id)) return miss;
  // A voided document stays in the audit trail but is only served to the office.
  if (doc.voided && !["admin", "manager"].includes(tok.role)) return miss;
  const name = String(doc.meta?.fileName || `proposal-${doc.kind}.pdf`).replace(/[^\w.\- ]+/g, "_");
  return {
    status: 200, body: doc.bytes, sha256: doc.sha256,
    headers: {
      "Content-Type": doc.mime || "application/pdf",
      "Content-Length": String(doc.bytes.length),
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-SHA256": doc.sha256,
    },
  };
}
