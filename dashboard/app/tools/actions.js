"use server";

import { getSessionUser } from "../../lib/session";
import { createDocument, searchDocuments, listDocuments, deleteDocument } from "../../lib/db";
import { DOC_READERS } from "../../lib/doc-readers";

// The whole document-tools suite is admin/manager only.
async function requireManager() {
  const u = await getSessionUser();
  return u?.id && ["admin", "manager"].includes(u.role) ? u : null;
}

// Persist a captured document into the library. `fields` is the reader's flat object;
// subject/number are derived from the reader schema so search stays consistent.
export async function saveDocumentAction({ docType, fields, score, accessId }) {
  const actor = await requireManager();
  if (!actor) return { error: "Admin or manager only." };
  const schema = DOC_READERS[docType];
  if (!schema) return { error: "Unknown document type." };
  const f = fields && typeof fields === "object" ? fields : {};
  const subject_name = String(f[schema.subjectKey] || "").trim() || null;
  const doc_number = String(f[schema.numberKey] || "").trim() || null;
  const { id } = createDocument({
    doc_type: docType,
    subject_name,
    doc_number,
    fields: f,
    score: Number(score) || 0,
    access_id: accessId ? String(accessId).trim() : null,
    captured_by: actor.name || actor.email || "staff",
  });
  return { ok: true, id };
}

export async function searchDocumentsAction(q) {
  if (!(await requireManager())) return { error: "Admin or manager only." };
  return { ok: true, results: searchDocuments(q) };
}

export async function recentDocumentsAction(type) {
  if (!(await requireManager())) return { error: "Admin or manager only." };
  return { ok: true, results: listDocuments({ type: type || undefined, limit: 25 }) };
}

export async function deleteDocumentAction(id) {
  if (!(await requireManager())) return { error: "Admin or manager only." };
  deleteDocument(id);
  return { ok: true };
}
