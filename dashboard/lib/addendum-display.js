// Display-only helpers for addenda inside the Proposal view. NOTHING here is persisted: the A1/A2 label is
// derived from the position in the stored addendums[] array at render time (no new field on the blob, no
// table). Filenames are untouched (lib/doc-filename.js owns those). Pure — no money, no I/O.

// "A1" for the first entry of the stored array, "A2" for the second… Position, not a stored number.
// addendumNumberLabel takes the 1-based number instead, and is THE one place the "A" scheme is spelled
// — lib/doc-filename.js names downloads through it (B4), so a file can never disagree with the row
// above it in the UI.
export const addendumNumberLabel = (n) => `A${+n || 1}`;
export const addendumLabel = (index) => addendumNumberLabel((+index || 0) + 1);

// Month + day only ("Nov 20"); empty for a missing/unparseable date.
export function shortDate(d) {
  if (!d) return "";
  const t = new Date(String(d).includes(" ") && !String(d).includes("T") ? String(d).replace(" ", "T") : d);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Terse status of one addendum record (matches the snapshot badge language).
export function addendumStatusLabel(a) {
  if (!a) return "";
  if (a.edited) return "Edited";
  if (a.status === "approved") return "Signed";
  if (a.status === "voided") return "Voided";
  if (a.status === "declined") return "Declined";
  return "Pending";
}

// "A1 · Nov 20 · Signed" — the date is the signing date once signed, otherwise when it was sent/created.
export function addendumRowText(a, index) {
  const when = shortDate(a?.status === "approved" ? (a.signedAt || a.sentAt) : a?.sentAt);
  return [addendumLabel(index), when, addendumStatusLabel(a)].filter(Boolean).join(" · ");
}

// "+ Addendum" exists only once a proposal version has actually been signed — absent (not disabled) before.
// `meta` is the working proposal row; `hasSignedVersion` lets a caller that knows the history say so too.
export function proposalIsSigned(meta, hasSignedVersion = false) {
  return !!(hasSignedVersion || meta?.signed_at || meta?.signed_name || meta?.status === "accepted");
}
export const canStartAddendum = ({ signed, canBuild }) => !!signed && !!canBuild;

// Proposal portal card: "Signed · 1 addendum" when done and any exist; nothing extra otherwise.
// `done` is passed explicitly because the done WORD is the card's to choose (the Proposal says
// "Signed", not "Completed") — matching on the literal label silently dropped the count the moment
// that word changed. It defaults to the old literal so existing callers keep their behaviour.
export function proposalCardAction(base, addendumCount, done = base === "Completed") {
  const n = +addendumCount || 0;
  if (!n || !done) return base;
  return `${base} · ${n} addendum${n === 1 ? "" : "s"}`;
}
