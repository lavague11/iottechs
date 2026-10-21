// Prepare the unsigned proposal PDF WITH the customer's survey / mockup appendix, before the signer opens
// the session. The appendix is multi-MB client-rendered images (and nested arrays) that a server action
// can't carry, so it rides a POST body here (a route handler, no 1–8 MB action cap). We re-derive the
// caller from cookies and re-check they may sign — the body is display content, not authority. Everything
// in it is bounded + validated by cleanAppendix before it enters a signed document.
import { callerFromCookies, maySignProposal } from "../../../../lib/esign/access";
import { ensureProposalUnsigned } from "../../../../lib/esign/proposal-source";

export const runtime = "nodejs";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const accessId = String(body?.accessId || "");
  const optKey = String(body?.optKey || "");
  const appendix = body?.appendix || null;
  const caller = await callerFromCookies(req.headers.get("cookie"));
  if (!caller || !maySignProposal(caller, accessId)) return json({ error: "You can't sign this proposal." }, 403);
  let r;
  try { r = ensureProposalUnsigned(accessId, optKey, { by: caller.role, appendix }); }
  catch (e) { console.error("[esign/prepare]", e?.message, e?.stack); return json({ error: "Couldn't prepare the document." }, 500); }
  if (r?.error) return json({ error: r.error }, 400);
  return json({ ok: true, hasSurvey: !!r.doc.meta?.hasSurvey, hasMockup: !!r.doc.meta?.hasMockup });
}
