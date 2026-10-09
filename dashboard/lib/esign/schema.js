// E-sign storage (additive, idempotent). Called from db.js init() right after the proposals table is
// ensured — `db` is the raw DatabaseSync handle. Nothing here drops or rewrites existing data.
//
//   sign_documents  immutable PDF bytes (BLOB) + sha256. kind: unsigned | signed | certificate.
//                   A row is never updated except `voided` (history is kept, never erased).
//   sign_sessions   one signing attempt: a random expiring token (stored HASHED) layered on top of the
//                   PIN/login grant, bound to proposal + version + doc sha256 + content fingerprint.
//   sign_events     append-only audit trail (UPDATE/DELETE are rejected by triggers).
//   proposals.*     unsigned_doc_id / signed_doc_id / sign_status point the existing row at its documents
//                   — the proposal row stays the single record; there is no second proposal system.
export const SIGN_KINDS = ["unsigned", "signed", "certificate"];

export function ensureEsignSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sign_documents (
      id                TEXT PRIMARY KEY,
      proposal_id       INTEGER NOT NULL,
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
  db.exec("CREATE INDEX IF NOT EXISTS idx_sign_documents_proposal ON sign_documents(proposal_id, kind)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sign_sessions (
      id                TEXT PRIMARY KEY,
      token_hash        TEXT NOT NULL UNIQUE,
      proposal_id       INTEGER NOT NULL,
      project_access_id TEXT NOT NULL,
      version           INTEGER NOT NULL,
      option_key        TEXT NOT NULL,
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
  db.exec("CREATE INDEX IF NOT EXISTS idx_sign_sessions_proposal ON sign_sessions(proposal_id, state)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sign_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      proposal_id       INTEGER,
      session_id        TEXT,
      kind              TEXT NOT NULL,
      detail            TEXT,
      actor             TEXT,
      ip                TEXT,
      ua                TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_sign_events_proposal ON sign_events(proposal_id)");
  // Append-only: the audit trail is evidence, so it can't be edited or erased through the app.
  db.exec(`CREATE TRIGGER IF NOT EXISTS sign_events_no_update BEFORE UPDATE ON sign_events BEGIN SELECT RAISE(ABORT, 'sign_events is append-only'); END`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS sign_events_no_delete BEFORE DELETE ON sign_events BEGIN SELECT RAISE(ABORT, 'sign_events is append-only'); END`);
  // Documents are immutable too: only `voided` may change.
  db.exec(`CREATE TRIGGER IF NOT EXISTS sign_documents_immutable BEFORE UPDATE OF bytes, sha256, kind, proposal_id, project_access_id, version, mime ON sign_documents BEGIN SELECT RAISE(ABORT, 'sign_documents bytes are immutable'); END`);

  const cols = db.prepare("PRAGMA table_info(proposals)").all().map((c) => c.name);
  if (!cols.includes("unsigned_doc_id")) db.exec("ALTER TABLE proposals ADD COLUMN unsigned_doc_id TEXT");
  if (!cols.includes("signed_doc_id"))   db.exec("ALTER TABLE proposals ADD COLUMN signed_doc_id TEXT");
  if (!cols.includes("sign_status"))     db.exec("ALTER TABLE proposals ADD COLUMN sign_status TEXT");   // null | viewed | signing | signed
}
