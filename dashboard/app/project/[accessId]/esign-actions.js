"use server";

// Server actions for the PDF-first proposal signer (lib/esign/). Every action re-derives the caller from
// the cookies and re-checks ownership — the client's props are display-only and never trusted.
import { headers } from "next/headers";
import { callerFromCookies, maySignProposal } from "../../../lib/esign/access";
import { ensureProposalUnsigned } from "../../../lib/esign/proposal-source";

async function caller() {
  const h = await headers();
  return callerFromCookies(h.get("cookie"));
}

// Public view of a stored document — never the bytes (those come through the gated /api/proposal-doc/[id]).
const docView = (d) => ({ id: d.id, sha256: d.sha256, version: d.version, fileName: d.meta?.fileName || null, pageCount: d.meta?.pageCount || 0, fields: d.meta?.fields || [], option: d.meta?.option || null });

// Open the document the customer is about to sign: generates + stores the unsigned PDF the first time
// (or when the proposal content changed), returns its id/hash and the field layout for the viewer.
export async function prepareSignDocAction(accessId, optKey) {
  const tok = await caller();
  if (!tok) return { error: "Session expired — unlock the project again to sign." };
  if (!maySignProposal(tok, accessId)) return { error: tok.role === "customer" ? "Not your project." : `Signing is for the customer (you're signed in as ${tok.role}).` };
  let r;
  try { r = ensureProposalUnsigned(accessId, String(optKey || ""), { by: tok.role }); }
  catch (e) { return { error: e?.code === "NOT_SIGNABLE" ? e.message : "Couldn't prepare the document." }; }
  if (r.error) return { error: r.error };
  return { ok: true, doc: docView(r.doc) };
}
