// Addendum storage — ADDITIVE AND REVERSIBLE (docs/blocked.md B2 + B3).
//
// Today an addendum lives as an entry in an `addendums[]` array inside ONE project_tool_data JSON blob
// per project. It has no version history (B3) and it cannot use the e-sign path, because
// `sign_documents.kind` has a CHECK constraint and an immutability trigger and `sign_sessions.proposal_id`
// is NOT NULL — a second document kind would mean rebuilding the table that holds signed contractual
// PDFs (B2). The owner's instruction is explicit: never drop, truncate or rewrite that table.
//
// So nothing here touches `sign_documents`, `sign_sessions` or `sign_events`. They keep working exactly
// as they do for proposals. Addenda get a PARALLEL store of their own — B2's option 2 — and the JSON
// blob remains the live source of truth until the owner decides to switch over. The tables below are
// additive and currently WRITE-ONLY from the backfill: nothing in the app reads them yet, so creating
// them changes no behaviour and no figure.
//
// DOWN MIGRATION (complete, and safe precisely because nothing reads these yet):
//
//   DROP TABLE IF EXISTS addendum_sign_sessions;
//   DROP TABLE IF EXISTS addendum_sign_documents;
//   DROP TABLE IF EXISTS addendum_versions;
//   DROP TABLE IF EXISTS addendums;
//
// There is no data to restore afterwards: every row in these tables is derived from the JSON blob,
// which the backfill never modifies. `scripts/migrate-addendum-store.mjs --down` runs exactly that.

export const ADDENDUM_SIGN_KINDS = ["unsigned", "signed", "certificate"];

export function ensureAddendumSchema(db) {
  // One row per addendum, keyed by the blob's own id so the backfill is idempotent and a row can
  // always be traced back to the entry it came from.
  db.exec(`
    CREATE TABLE IF NOT EXISTS addendums (
      id                TEXT PRIMARY KEY,
      project_access_id TEXT NOT NULL,
      seq               INTEGER NOT NULL,
      title             TEXT,
      status            TEXT,
      discount          REAL NOT NULL DEFAULT 0,
      items_json        TEXT NOT NULL DEFAULT '[]',
      signed_name       TEXT,
      signed_at         TEXT,
      signed_fingerprint TEXT,
      created_at        TEXT,
      source            TEXT NOT NULL DEFAULT 'blob',
      synced_at         TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_addendums_project ON addendums(project_access_id, seq)");

  // B3: row-per-version. A1/A2 numbering lives here (seq on `addendums`, version here), so the
  // numbering question can be answered without touching the blob.
  db.exec(`
    CREATE TABLE IF NOT EXISTS addendum_versions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      addendum_id       TEXT NOT NULL,
      project_access_id TEXT NOT NULL,
      version           INTEGER NOT NULL,
      payload_json      TEXT NOT NULL,
      fingerprint       TEXT,
      sent_at           TEXT,
      signed_name       TEXT,
      signed_at         TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_addendum_versions_unique ON addendum_versions(addendum_id, version)");

  // B2: the parallel document store. Same shape and the same immutability promise as sign_documents,
  // but its OWN table — `sign_documents` is never altered, never rebuilt, and stays authoritative for
  // proposals.
  db.exec(`
    CREATE TABLE IF NOT EXISTS addendum_sign_documents (
      id                TEXT PRIMARY KEY,
      addendum_id       TEXT NOT NULL,
      project_access_id TEXT NOT NULL,
      version           INTEGER NOT NULL DEFAULT 1,
      kind              TEXT NOT NULL CHECK (kind IN ('unsigned','signed','certificate')),
      mime              TEXT NOT NULL DEFAULT 'application/pdf',
      sha256            TEXT NOT NULL,
      bytes             BLOB NOT NULL,
      meta              TEXT,
      created_by        TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      voided            INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_addendum_sign_documents ON addendum_sign_documents(addendum_id, kind)");
  db.exec(`CREATE TRIGGER IF NOT EXISTS addendum_sign_documents_immutable
           BEFORE UPDATE OF bytes, sha256, kind, addendum_id, project_access_id, version, mime
           ON addendum_sign_documents
           BEGIN SELECT RAISE(ABORT, 'addendum_sign_documents bytes are immutable'); END`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS addendum_sign_sessions (
      id                TEXT PRIMARY KEY,
      token_hash        TEXT NOT NULL UNIQUE,
      addendum_id       TEXT NOT NULL,
      project_access_id TEXT NOT NULL,
      version           INTEGER NOT NULL,
      doc_id            TEXT NOT NULL,
      doc_sha256        TEXT NOT NULL,
      fingerprint       TEXT NOT NULL,
      signer_role       TEXT,
      signer_user_id    INTEGER,
      signer_email      TEXT,
      via_pin           INTEGER NOT NULL DEFAULT 0,
      state             TEXT NOT NULL DEFAULT 'open',
      void_reason       TEXT,
      expires_at        INTEGER NOT NULL,
      values_json       TEXT,
      ip                TEXT,
      ua                TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      completed_at      TEXT
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_addendum_sign_sessions ON addendum_sign_sessions(addendum_id, state)");
}

// The exact inverse, for scripts/migrate-addendum-store.mjs --down.
export function dropAddendumSchema(db) {
  db.exec("DROP TABLE IF EXISTS addendum_sign_sessions");
  db.exec("DROP TABLE IF EXISTS addendum_sign_documents");
  db.exec("DROP TABLE IF EXISTS addendum_versions");
  db.exec("DROP TABLE IF EXISTS addendums");
}

// PURE: the rows a project's addendum blob maps onto. Reads the blob, returns rows — it never writes,
// and it never alters the blob. `seq` is 1-based in blob order, which is what an "A1 / A2" scheme
// would number from; the owner's B4 decision picks the LABEL, not this ordering.
export function addendumRowsFromBlob(accessId, raw) {
  let j;
  try { j = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return []; }
  const list = Array.isArray(j?.addendums) ? j.addendums : [];
  return list.map((a, i) => ({
    id: String(a?.id || `${accessId}-${i + 1}`),
    project_access_id: String(accessId),
    seq: i + 1,
    title: a?.title || null,
    status: a?.status || null,
    discount: +a?.discount || 0,
    items_json: JSON.stringify(Array.isArray(a?.items) ? a.items : []),
    signed_name: a?.signedName || null,
    signed_at: a?.signedAt || null,
    signed_fingerprint: a?.signedFingerprint || null,
    created_at: a?.at || null,
  }));
}
