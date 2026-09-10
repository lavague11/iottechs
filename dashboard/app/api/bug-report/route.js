import { cookies } from "next/headers";
import { parseToken, parseAccessToken } from "../../../lib/auth";
import { createBugReport, listBugReports, resolveBugReport } from "../../../lib/db";

// The site-wide "Report a bug" button POSTs here (description + optional screenshot URL). Anyone using
// the app can file one; we capture who (if signed in) for context. Staff read/resolve them at /bugs.
async function getSession() {
  const jar = await cookies();
  const raw = jar.get("iot_session")?.value;
  if (raw) { const tok = await parseToken(raw); if (tok?.role) return tok; }
  const acc = jar.get("iot_access")?.value;
  if (acc) { const at = await parseAccessToken(acc); if (at?.role) return { role: at.role, viaPin: true }; }
  return null;
}
const isStaff = (tok) => tok && ["admin", "manager"].includes(tok.role);

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { /* empty */ }
  const tok = await getSession();
  const reporter = tok ? (tok.name || tok.email || tok.role) : "anonymous";
  const r = createBugReport({
    url: body.url, path: body.path, description: body.description,
    imageUrl: body.imageUrl || null,
    imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : undefined,
    context: body.context && typeof body.context === "object" ? body.context : undefined,
    reporter,
    role: tok?.role || "guest",
    userAgent: req.headers.get("user-agent") || null,
  });
  if (r?.error) return Response.json({ error: r.error }, { status: 400 });
  return Response.json({ ok: true, id: r.id });
}

// Staff-only: list (for the /bugs portal) and resolve/reopen.
export async function GET() {
  const tok = await getSession();
  if (!isStaff(tok)) return Response.json({ error: "Staff only." }, { status: 403 });
  return Response.json({ ok: true, bugs: listBugReports() });
}
export async function PATCH(req) {
  const tok = await getSession();
  if (!isStaff(tok)) return Response.json({ error: "Staff only." }, { status: 403 });
  const { id, resolved } = await req.json();
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 });
  const r = resolveBugReport(id, !!resolved, tok.name || tok.email || tok.role);
  return Response.json(r);
}
