// ─────────────────────────────────────────────────────────────────────────────
// IOT TECHS — Proposal app local server
// Pure Node (no npm dependencies): node:http + node:sqlite
// Serves the proposal calculator and stores customers + full proposals.
// Run:  node server.js   then open http://localhost:3000
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DOCS_DIR = path.join(DATA_DIR, 'docs');   // customer document storage (not publicly listed)

// ── Config (API keys etc.) — env var wins, else config.json (git-ignored) ────
function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch (e) { /* none */ }
  return {
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || cfg.googleMapsApiKey || '',
    googleClientId:   process.env.GOOGLE_CLIENT_ID    || cfg.googleClientId   || '',  // "Sign in with Google"
  };
}
const CONFIG = loadConfig();
let GOOGLE_MODE = null; // cached 'new' | 'legacy' after first successful call

// ── Database ────────────────────────────────────────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'iot.db'));
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS customers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT,
    business    TEXT,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    created_at  TEXT,
    updated_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id   INTEGER,
    proposal_num  TEXT UNIQUE,
    client_label  TEXT,
    grand_total   REAL,
    status        TEXT,
    state_json    TEXT,
    created_at    TEXT,
    updated_at    TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS technicians (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT,
    phone       TEXT,
    email       TEXT,
    skills      TEXT DEFAULT '',
    active      INTEGER DEFAULT 1,
    created_at  TEXT,
    updated_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS work_orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id    INTEGER,
    proposal_num   TEXT,
    title          TEXT,
    technician_id  INTEGER,
    status         TEXT DEFAULT 'Unassigned',
    scheduled_date TEXT DEFAULT '',
    time_window    TEXT DEFAULT '',
    amount         REAL DEFAULT 0,
    notes          TEXT DEFAULT '',
    created_at     TEXT,
    updated_at     TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (technician_id) REFERENCES technicians(id)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tool          TEXT,
    label         TEXT,
    client        TEXT,
    total         REAL DEFAULT 0,
    status        TEXT DEFAULT 'Draft',
    snapshot_json TEXT DEFAULT '',
    edited_by     TEXT DEFAULT '',
    version       INTEGER DEFAULT 1,
    created_at    TEXT,
    updated_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS versions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type   TEXT,
    entity_id     INTEGER,
    version_no    INTEGER,
    snapshot_json TEXT DEFAULT '',
    total         REAL DEFAULT 0,
    label         TEXT DEFAULT '',
    edited_by     TEXT DEFAULT '',
    note          TEXT DEFAULT '',
    created_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS payroll (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    technician_id   INTEGER,
    technician_name TEXT,
    client          TEXT,
    location        TEXT,
    work_order_id   TEXT,
    job_date        TEXT,
    vehicle         TEXT,
    amount          REAL DEFAULT 0,
    status          TEXT DEFAULT 'Pending',
    snapshot_json   TEXT DEFAULT '',
    created_at      TEXT,
    updated_at      TEXT,
    FOREIGN KEY (technician_id) REFERENCES technicians(id)
  );

  CREATE TABLE IF NOT EXISTS project_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    kind        TEXT DEFAULT 'note',          -- 'note' = manual entry · 'event' = auto activity
    visibility  TEXT DEFAULT 'internal',      -- 'internal' = staff only · 'external' = visible to customer
    body        TEXT DEFAULT '',
    author      TEXT DEFAULT '',
    created_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    name        TEXT,
    filename    TEXT,                          -- stored basename on disk
    mime        TEXT DEFAULT 'application/pdf',
    size        INTEGER DEFAULT 0,
    visibility  TEXT DEFAULT 'external',        -- 'external' = customer can view/download
    source      TEXT DEFAULT 'upload',
    created_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS signature_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id   INTEGER,
    proposal_num  TEXT DEFAULT '',
    source_doc_id INTEGER,                       -- documents.id of the proposal PDF to present
    signed_doc_id INTEGER,                       -- documents.id of the returned signed PDF
    token         TEXT UNIQUE,                   -- unguessable public link token
    status        TEXT DEFAULT 'pending',        -- pending | viewed | signed | void
    signer_name   TEXT DEFAULT '',
    signer_email  TEXT DEFAULT '',
    total         REAL DEFAULT 0,
    created_at    TEXT,
    viewed_at     TEXT DEFAULT '',
    signed_at     TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    label       TEXT DEFAULT 'Payment',       -- Deposit · Balance · Progress payment …
    amount      REAL DEFAULT 0,
    method      TEXT DEFAULT '',              -- Zelle · Check · Card · Cash
    status      TEXT DEFAULT 'Paid',          -- 'Due' (scheduled) | 'Paid'
    note        TEXT DEFAULT '',
    due_date    TEXT DEFAULT '',
    paid_at     TEXT DEFAULT '',
    created_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE,
    pass_hash     TEXT,                        -- scrypt  salt:hash
    role          TEXT DEFAULT 'tech',         -- 'admin' | 'tech'
    name          TEXT DEFAULT '',
    technician_id INTEGER,                     -- links a tech login to a roster technician
    active        INTEGER DEFAULT 1,
    created_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER,
    created_at  TEXT,
    expires_at  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_logs_customer     ON project_logs(customer_id);
  CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
  CREATE INDEX IF NOT EXISTS idx_docs_customer     ON documents(customer_id);
  CREATE INDEX IF NOT EXISTS idx_sigreq_customer   ON signature_requests(customer_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sigreq_token ON signature_requests(token);
  CREATE INDEX IF NOT EXISTS idx_customers_name    ON customers(name);
  CREATE INDEX IF NOT EXISTS idx_customers_phone   ON customers(phone);
  CREATE INDEX IF NOT EXISTS idx_customers_email   ON customers(email);
  CREATE INDEX IF NOT EXISTS idx_proposals_cust    ON proposals(customer_id);
  CREATE INDEX IF NOT EXISTS idx_wo_customer       ON work_orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_wo_tech           ON work_orders(technician_id);
  CREATE INDEX IF NOT EXISTS idx_payroll_tech      ON payroll(technician_id);
  CREATE INDEX IF NOT EXISTS idx_versions_entity   ON versions(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_submissions_tool  ON submissions(tool);
`);

// Append a version snapshot for any entity (audit log + history). Returns version no.
function logVersion(entityType, entityId, { snapshot, total, label, editedBy, note }) {
  const last = db.prepare('SELECT MAX(version_no) v FROM versions WHERE entity_type=? AND entity_id=?').get(entityType, entityId);
  const vno = (last && last.v ? last.v : 0) + 1;
  db.prepare(`INSERT INTO versions (entity_type,entity_id,version_no,snapshot_json,total,label,edited_by,note,created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(entityType, entityId, vno,
         typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot || {}),
         Number(total) || 0, clean(label), clean(editedBy), clean(note), new Date().toISOString());
  return vno;
}

// Append a project log/note entry (activity timeline + customer-facing updates).
function addLog(customerId, { kind, visibility, body, author, project_id }) {
  const vis = (visibility === 'external') ? 'external' : 'internal';
  const k = (kind === 'event') ? 'event' : 'note';
  const r = db.prepare(`INSERT INTO project_logs (customer_id,project_id,kind,visibility,body,author,created_at)
                        VALUES (?,?,?,?,?,?,?)`)
    .run(Number(customerId), project_id != null ? Number(project_id) : null, k, vis, clean(body), clean(author), new Date().toISOString());
  return Number(r.lastInsertRowid);
}
// ── Multi-project resolvers ──────────────────────────────────────────────────
function mostRecentProjectId(customerId) { const r = db.prepare('SELECT id FROM projects WHERE customer_id=? ORDER BY updated_at DESC, id DESC LIMIT 1').get(Number(customerId)); return r ? Number(r.id) : null; }
function getProject(projectId) { return projectId == null ? null : db.prepare('SELECT * FROM projects WHERE id=?').get(Number(projectId)); }
// The path :id is treated as a CUSTOMER id (legacy + canonical); ?project=<pid> overrides to a specific project.
// This avoids the customer-id/project-id integer-namespace collision entirely.
function resolveProject(pathId, url) { const qp = url && url.searchParams.get('project'); if (qp) { const p = getProject(qp); if (p) return p; } const pid = mostRecentProjectId(pathId); return pid ? getProject(pid) : null; }
function touchProject(projectId) { db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now(), Number(projectId)); }

// ── Schema migration: add CRM lead fields to existing databases ──────────────
// Pipeline stages and lead metadata from the operational workflow map.
const LEAD_STATUSES = ['New', 'Contacted', 'Quoted', 'Follow-Up', 'Approved', 'Scheduled', 'In Progress', 'Completed', 'Closed'];
const OPEN_STATUSES = LEAD_STATUSES.filter(s => s !== 'Closed' && s !== 'Completed');
const WO_STATUSES = ['Unassigned', 'Assigned', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'];
const DEFAULT_CHECKLIST = [
  'Mounting & brackets', 'Cable runs / drops', 'Terminations', 'NVR / recorder configuration',
  'Camera programming & focus', 'Audio / access control', 'System testing & verification',
  'Cleanup & cable management', 'Customer walkthrough',
].map(label => ({ label, done: false }));
function ensureColumn(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}
ensureColumn('customers', 'status',        "TEXT DEFAULT 'New'");
ensureColumn('customers', 'temperature',   "TEXT DEFAULT 'Warm'");
ensureColumn('customers', 'source',        "TEXT DEFAULT ''");
ensureColumn('customers', 'closed_reason', "TEXT DEFAULT ''");
ensureColumn('customers', 'notes',         "TEXT DEFAULT ''");
// Proposal e-signature (customer acceptance captured on the project page)
ensureColumn('customers', 'signed_name',     "TEXT DEFAULT ''");
ensureColumn('customers', 'signed_at',       "TEXT DEFAULT ''");
ensureColumn('customers', 'signature_data',  "TEXT DEFAULT ''");
ensureColumn('customers', 'signed_proposal', "TEXT DEFAULT ''");
ensureColumn('customers', 'signed_total',    "REAL DEFAULT 0");
// Phase 3 — execution & QC fields on work orders (JSON for checklist/addendums)
ensureColumn('work_orders', 'checklist',   "TEXT DEFAULT ''");
ensureColumn('work_orders', 'addendums',   "TEXT DEFAULT ''");
ensureColumn('work_orders', 'qc_status',   "TEXT DEFAULT 'Pending'");
ensureColumn('work_orders', 'qc_notes',    "TEXT DEFAULT ''");
ensureColumn('work_orders', 'follow_up_date', "TEXT DEFAULT ''");   // follow-up reminders
ensureColumn('work_orders', 'follow_up_note', "TEXT DEFAULT ''");
ensureColumn('customers', 'access_token',  "TEXT DEFAULT ''");   // secure customer share link
ensureColumn('proposals', 'share_token',   "TEXT DEFAULT ''");   // public proposal-link token (/p/<token>)
ensureColumn('proposals', 'viewed_at',     "TEXT DEFAULT ''");   // first time the proposal link was opened
ensureColumn('customers', 'help_open',     "INTEGER DEFAULT 0");  // customer raised a help request
ensureColumn('customers', 'help_requested_at', "TEXT DEFAULT ''");
ensureColumn('customers', 'help_message',  "TEXT DEFAULT ''");
ensureColumn('customers', 'deposit_required', "REAL DEFAULT 0");   // deposit needed to start work (from proposal)
ensureColumn('customers', 'deposit_label',  "TEXT DEFAULT ''");
ensureColumn('customers', 'completion_approved', "INTEGER DEFAULT 0");  // customer signed off on the finished install
ensureColumn('customers', 'completion_approved_at', "TEXT DEFAULT ''");
ensureColumn('work_orders', 'reschedule_requested', "INTEGER DEFAULT 0");  // customer asked to move the install date
ensureColumn('work_orders', 'reschedule_note',      "TEXT DEFAULT ''");
ensureColumn('work_orders', 'tech_accepted',        "INTEGER DEFAULT 0");  // assigned tech accepted the job
ensureColumn('work_orders', 'tech_accepted_at',     "TEXT DEFAULT ''");
ensureColumn('work_orders', 'line_items',           "TEXT DEFAULT ''");    // snapshot of proposal line items the job is paid on
ensureColumn('customers', 'survey_date',            "TEXT DEFAULT ''");    // site survey appointment
ensureColumn('customers', 'survey_status',          "TEXT DEFAULT ''");    // '', 'scheduled', 'done', 'skipped'
ensureColumn('customers', 'stage_overrides',        "TEXT DEFAULT ''");    // admin manual "mark complete" per lifecycle stage (JSON)
ensureColumn('customers', 'survey_notes',           "TEXT DEFAULT ''");    // customer notes on the site-survey floor plans (from the proposal link)
ensureColumn('customers', 'survey_approved_at',     "TEXT DEFAULT ''");    // customer sign-off timestamp on the floor plans
ensureColumn('customers', 'survey_approved_name',   "TEXT DEFAULT ''");    // who approved the floor plans
ensureColumn('technicians', 'pay_structure',        "TEXT DEFAULT ''");    // per-tech component pay rates (JSON); default $52/camera if empty
ensureColumn('payments', 'ext_ref',        "TEXT DEFAULT ''");     // links a synced proposal-app payment
ensureColumn('users', 'email',             "TEXT DEFAULT ''");   // for "Sign in with Google" matching
ensureColumn('users', 'customer_id',       "INTEGER");           // links a 'customer' login to their project
ensureColumn('users', 'roles',             "TEXT DEFAULT ''");   // CSV of assigned roles (multi-role per person)
ensureColumn('sessions', 'active_role',    "TEXT DEFAULT ''");   // the role this session is currently acting as
// Backfill: existing single-role users get a matching roles list
db.prepare("UPDATE users SET roles=role WHERE COALESCE(roles,'')=''").run();
// Standalone (customer-less) site-survey share links — a self-contained HTML floor-plan page at /sv/<token>.
db.exec("CREATE TABLE IF NOT EXISTS survey_shares (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE, name TEXT DEFAULT '', html TEXT, customer_id INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)");

// ── Projects: a customer can have MANY projects, each with its own lifecycle/proposal/invoice/survey/work-order/docs. ──
// The per-project lifecycle state (formerly customer columns) lives here; `customers` keeps contact info.
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  name TEXT DEFAULT '', site_address TEXT DEFAULT '',
  status TEXT DEFAULT 'New', temperature TEXT DEFAULT 'Warm', source TEXT DEFAULT '', closed_reason TEXT DEFAULT '',
  signed_name TEXT DEFAULT '', signed_at TEXT DEFAULT '', signature_data TEXT DEFAULT '', signed_proposal TEXT DEFAULT '', signed_total REAL DEFAULT 0,
  deposit_required REAL DEFAULT 0, deposit_label TEXT DEFAULT '',
  completion_approved INTEGER DEFAULT 0, completion_approved_at TEXT DEFAULT '',
  survey_date TEXT DEFAULT '', survey_status TEXT DEFAULT '', survey_notes TEXT DEFAULT '', survey_approved_at TEXT DEFAULT '', survey_approved_name TEXT DEFAULT '',
  stage_overrides TEXT DEFAULT '',
  help_open INTEGER DEFAULT 0, help_requested_at TEXT DEFAULT '', help_message TEXT DEFAULT '',
  access_token TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
)`);
db.exec("CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id)");
// Child tables gain a nullable project_id (customer_id kept denormalized so existing queries still work).
['proposals','work_orders','documents','payments','project_logs','signature_requests','survey_shares'].forEach(function(t){ ensureColumn(t, 'project_id', 'INTEGER'); });
db.exec("CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_wo_project ON work_orders(project_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_logs_project ON project_logs(project_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_sigreq_project ON signature_requests(project_id)");
ensureColumn('customers', 'portal_token', "TEXT DEFAULT ''");   // customer-level portal link (lists all their projects)

const now = () => new Date().toISOString();
const clean = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)));
const BUSINESS_TZ = process.env.IOT_TZ || 'America/New_York';
const localDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date()); // YYYY-MM-DD, local
const genToken = () => crypto.randomBytes(24).toString('base64url');   // ~32 url-safe chars
const genSignToken = () => crypto.randomBytes(9).toString('base64url'); // 12 url-safe chars — short link, ~72 bits

// ── One-time, idempotent backfill: give every existing customer exactly ONE project carrying their current state,
// and stamp project_id onto all their child rows. Guarded so re-runs never duplicate. App behaves identically after.
(function backfillProjects() {
  const orphans = db.prepare("SELECT * FROM customers c WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.customer_id=c.id)").all();
  if (!orphans.length) return;
  const insProj = db.prepare(`INSERT INTO projects
    (customer_id,name,site_address,status,temperature,source,closed_reason,
     signed_name,signed_at,signature_data,signed_proposal,signed_total,
     deposit_required,deposit_label,completion_approved,completion_approved_at,
     survey_date,survey_status,survey_notes,survey_approved_at,survey_approved_name,
     stage_overrides,help_open,help_requested_at,help_message,access_token,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?,?)`);
  const stamp = {};
  ['proposals','work_orders','documents','payments','project_logs','signature_requests','survey_shares'].forEach(function(t){
    stamp[t] = db.prepare('UPDATE ' + t + ' SET project_id=? WHERE customer_id=? AND project_id IS NULL');
  });
  for (const c of orphans) {
    const r = insProj.run(c.id, (c.business || c.name || 'Project'), (c.address || ''),
      (c.status || 'New'), (c.temperature || 'Warm'), (c.source || ''), (c.closed_reason || ''),
      (c.signed_name || ''), (c.signed_at || ''), (c.signature_data || ''), (c.signed_proposal || ''), (c.signed_total || 0),
      (c.deposit_required || 0), (c.deposit_label || ''), (c.completion_approved || 0), (c.completion_approved_at || ''),
      (c.survey_date || ''), (c.survey_status || ''), (c.survey_notes || ''), (c.survey_approved_at || ''), (c.survey_approved_name || ''),
      (c.stage_overrides || ''), (c.help_open || 0), (c.help_requested_at || ''), (c.help_message || ''),
      (c.access_token || ''),                                   // keep the existing per-customer share token on the project
      (c.created_at || now()), (c.updated_at || now()));
    const pid = Number(r.lastInsertRowid);
    Object.keys(stamp).forEach(function(t){ stamp[t].run(pid, c.id); });
    if (!clean(c.portal_token)) db.prepare('UPDATE customers SET portal_token=? WHERE id=?').run(genToken(), c.id);
  }
  console.log('  Backfilled ' + orphans.length + ' customer(s) → projects');
})();

// ── Auth: scrypt password hashing, cookie sessions ──────────────────────────
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const SESSION_DAYS = 30;
function parseCookies(req) {
  const out = {}; const h = req.headers.cookie; if (!h) return out;
  h.split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
const authEnabled = () => db.prepare('SELECT COUNT(*) n FROM users WHERE active=1').get().n > 0;
// ── Multi-role helpers ──────────────────────────────────────────────────────
const ALL_ROLES = ['admin', 'manager', 'tech', 'customer'];
const ROLE_PRIORITY = { admin: 4, manager: 3, tech: 2, customer: 1 };
function parseRoles(csv) { return String(csv || '').split(',').map(s => s.trim()).filter(r => ALL_ROLES.includes(r)); }
function rolesCsv(arr) { return [...new Set((arr || []).map(s => String(s).trim()).filter(r => ALL_ROLES.includes(r)))].join(','); }
function highestRole(roles) { let best = '', bp = -1; (roles || []).forEach(r => { if ((ROLE_PRIORITY[r] || 0) > bp) { bp = ROLE_PRIORITY[r]; best = r; } }); return best; }

function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at > ?').get(sid, now());
  if (!s) return null;
  const u = db.prepare('SELECT id,username,role,roles,name,technician_id,customer_id,active FROM users WHERE id=? AND active=1').get(s.user_id);
  if (!u) return null;
  u.rolesList = parseRoles(u.roles || u.role);
  // active role = the session's chosen role if still valid, else the highest assigned
  let active = s.active_role;
  if (!u.rolesList.includes(active)) active = highestRole(u.rolesList);
  u.role = active || '';              // enforcement keys off this active role
  return u;
}
function createSession(userId, res, activeRole) {
  const token = crypto.randomBytes(32).toString('base64url');
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token,user_id,active_role,created_at,expires_at) VALUES (?,?,?,?,?)').run(token, userId, clean(activeRole), now(), exp);
  res.setHeader('Set-Cookie', 'sid=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + (SESSION_DAYS * 86400));
  return token;
}
// Convenience: open a session as a user's highest role
function loginUser(u, res) { return createSession(u.id, res, highestRole(parseRoles(u.roles || u.role))); }
function clearSession(req, res) {
  const sid = parseCookies(req).sid;
  if (sid) db.prepare('DELETE FROM sessions WHERE token=?').run(sid);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}
function publicUser(u) {
  if (!u) return null;
  const roles = u.rolesList || parseRoles(u.roles || u.role);
  return { id: u.id, username: u.username, role: u.role || highestRole(roles), roles: roles, name: u.name, technician_id: u.technician_id, customer_id: u.customer_id };
}

// Verify a Google "Sign in with Google" ID token (JWT, RS256) without any deps:
// fetch Google's public keys, check the signature + standard claims, return the payload.
let _gCerts = null, _gCertsExp = 0;
async function googleCerts() {
  if (_gCerts && Date.now() < _gCertsExp) return _gCerts;
  const data = await (await fetch('https://www.googleapis.com/oauth2/v3/certs')).json();
  _gCerts = {}; (data.keys || []).forEach(k => { _gCerts[k.kid] = k; });
  _gCertsExp = Date.now() + 3600e3;
  return _gCerts;
}
async function verifyGoogleIdToken(idToken) {
  try {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const jwk = (await googleCerts())[header.kid];
    if (!jwk) return null;
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'));
    if (!ok) return null;
    if (CONFIG.googleClientId && payload.aud !== CONFIG.googleClientId) return null;
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (!payload.email || payload.email_verified === false) return null;
    return payload;
  } catch (e) { return null; }
}

// Write a base64/dataURL payload to data/docs/<cid>/ and insert a documents row.
// Returns the new document id. Shared by the upload + signed-PDF endpoints.
function storeDocument(cid, projectId, { name, mime, data, visibility, source }) {
  // Accept raw base64 OR a full data URL with any params (e.g. data:application/pdf;filename=x.pdf;base64,...)
  let raw = typeof data === 'string' ? data : '';
  const bi = raw.indexOf('base64,');
  if (bi >= 0) raw = raw.slice(bi + 7);
  if (!raw) throw new Error('no file data');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) throw new Error('empty file');
  const nm = clean(name) || 'document';
  const vis = visibility === 'internal' ? 'internal' : 'external';
  const dir = path.join(DOCS_DIR, String(cid));     // files stay keyed on customer_id (no per-project dirs)
  fs.mkdirSync(dir, { recursive: true });
  const r = db.prepare(`INSERT INTO documents (customer_id,project_id,name,filename,mime,size,visibility,source,created_at)
                        VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(cid, projectId != null ? Number(projectId) : null, nm, '', clean(mime) || 'application/octet-stream', buf.length, vis, clean(source) || 'upload', now());
  const docId = Number(r.lastInsertRowid);
  const stored = docId + '__' + nm.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-60);
  fs.writeFileSync(path.join(dir, stored), buf);
  db.prepare('UPDATE documents SET filename=? WHERE id=?').run(stored, docId);
  return docId;
}

// Stream a document row's file to the response (inline, or attachment if download).
function streamDocument(doc, res, download) {
  const fp = path.join(DOCS_DIR, String(doc.customer_id), doc.filename || '');
  if (!fp.startsWith(DOCS_DIR) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('Missing file'); }
  // Content-Disposition headers must be ASCII; non-ASCII names (em-dashes, accents) go via RFC 5987 filename*.
  const rawName = (doc.name || 'document').replace(/[\r\n"\\]/g, '');
  const asciiName = rawName.replace(/[^\x20-\x7E]/g, '_');
  const dispo = (download ? 'attachment' : 'inline') + '; filename="' + asciiName + '"'
    + "; filename*=UTF-8''" + encodeURIComponent(rawName);
  res.writeHead(200, { 'Content-Type': doc.mime || 'application/octet-stream', 'Content-Disposition': dispo });
  fs.createReadStream(fp).pipe(res);
}

// Create a work order from a project's latest proposal. Returns the new WO id (or null).
function createWOFromLead(projectId) {
  const proj = getProject(projectId);
  if (!proj) return null;
  const cid = Number(proj.customer_id);
  const c = db.prepare('SELECT * FROM customers WHERE id=?').get(cid) || {};
  const p = db.prepare('SELECT * FROM proposals WHERE project_id=? ORDER BY updated_at DESC LIMIT 1').get(projectId);
  const ts = now();
  const title = (proj.name || c.business || c.name || 'Job') + ' — Installation';
  // Snapshot the proposal's universal line items so the WO (and tech pay) reflect the same scope
  const S = p && safeParse(p.state_json) ? safeParse(p.state_json).SECTIONS : null;
  const lineItems = JSON.stringify(lineItemsFrom(S));
  const r = db.prepare(`INSERT INTO work_orders (customer_id,project_id,proposal_num,title,status,amount,checklist,qc_status,line_items,created_at,updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(cid, Number(projectId), p ? p.proposal_num : '', title, 'Unassigned', p ? p.grand_total : 0,
         JSON.stringify(DEFAULT_CHECKLIST), 'Pending', lineItems, ts, ts);
  return Number(r.lastInsertRowid);
}

// Side-effects when a proposal is signed (drawn signature OR a signed PDF):
// record the signature on the customer, advance status to Approved, and AUTOMATE the
// close-out — a 50% deposit invoice and a work order, if none exist yet.
function applySignedSideEffects(projectId, { name, proposalNum, total, signatureData }) {
  const proj = getProject(projectId);
  if (!proj) return null;
  const cid = Number(proj.customer_id);
  const ts = now();
  db.prepare(`UPDATE projects SET signed_name=?, signed_at=?, signature_data=?, signed_proposal=?, signed_total=?, updated_at=? WHERE id=?`)
    .run(clean(name), ts, clean(signatureData).slice(0, 600000), clean(proposalNum), Number(total) || 0, ts, projectId);
  if (['New', 'Contacted', 'Quoted', 'Follow-Up'].includes(proj.status || 'New'))
    db.prepare('UPDATE projects SET status=? WHERE id=?').run('Approved', projectId);
  addLog(cid, { kind: 'event', visibility: 'external', body: 'Proposal accepted & signed by ' + clean(name), author: clean(name), project_id: projectId });
  // Auto deposit invoice — use the project's computed PRE-TAX deposit (deposit_required),
  // not a tax-inclusive guess, so it agrees with the deposit bar. Tagged ext_ref='auto:deposit'
  // for dedup; created only if no deposit line exists AND the deposit isn't already covered.
  const depositRequired = Math.round((Number(proj.deposit_required) || (Number(total) || 0) * 0.5) * 100) / 100;
  const paidSoFar = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE project_id=? AND status='Paid'").get(projectId).v;
  const hasDepositLine = db.prepare("SELECT 1 FROM payments WHERE project_id=? AND ext_ref='auto:deposit'").get(projectId);
  if (depositRequired > 0 && !hasDepositLine && paidSoFar < depositRequired - 0.005) {
    const remaining = Math.round((depositRequired - paidSoFar) * 100) / 100;
    db.prepare(`INSERT INTO payments (customer_id,project_id,label,amount,method,status,note,due_date,paid_at,ext_ref,created_at)
                VALUES (?,?,?,?,?, 'Due', ?,?,?,?,?)`)
      .run(cid, Number(projectId), 'Deposit to start', remaining, '', 'Auto-created on signing', '', '', 'auto:deposit', ts);
    addLog(cid, { kind: 'event', visibility: 'external', body: 'Deposit invoice created: $' + remaining.toLocaleString('en-US'), author: 'IOT Techs', project_id: projectId });
  }
  // Auto work order if none exists for this project
  const woCount = db.prepare('SELECT COUNT(*) n FROM work_orders WHERE project_id=?').get(projectId).n;
  if (!woCount && createWOFromLead(projectId))
    addLog(cid, { kind: 'event', visibility: 'internal', body: 'Work order auto-created on signing', author: 'System', project_id: projectId });
  // Mark any pending signature request for this project as signed
  db.prepare("UPDATE signature_requests SET status='signed', signed_at=? WHERE project_id=? AND status IN ('pending','viewed')").run(ts, projectId);
  return ts;
}

// ── Canonical project lifecycle — ONE source of truth every view renders ──────
// Returns an ordered ladder; the first stage whose condition isn't met is "current",
// everything before it is "done", everything after is "todo". Cumulative by design
// so admin / tech / customer always see the exact same position.
function computeLifecycle(c, wos, sum, sr) {
  wos = wos || []; sum = sum || {};
  const sched = wos.map(w => w.scheduled_date).filter(Boolean).sort()[0] || '';
  const assigned = wos.some(w => w.technician_id);
  const accepted = wos.some(w => w.technician_id && w.tech_accepted);
  const installed = wos.some(w => w.status === 'Completed') || c.status === 'Completed' || c.status === 'Closed';
  const qcPassed = wos.some(w => w.qc_status === 'Passed');
  const signed = !!c.signed_at || (sr && sr.status === 'signed');
  const sent = !!sr;
  const depositActive = (Number(sum.depositRequired) || 0) > 0;
  const depositSettled = !depositActive || !!sum.depositMet;        // paid or waived/skipped
  const balance = Number(sum.balance) || 0;
  const approved = !!c.completion_approved;
  const anyWO = wos.length > 0;

  // done = naturally complete; skip = bypassed/waived (shows YELLOW). Admin overrides force done.
  const defs = [
    { key: 'inquiry',           label: 'Inquiry',           done: true },
    { key: 'survey',            label: 'Site Survey',       done: c.survey_status === 'done', skip: c.survey_status === 'skipped', detail: c.survey_date || c.survey_status || '' },
    { key: 'proposal_sent',     label: 'Proposal Sent',     done: sent || signed },
    { key: 'proposal_signed',   label: 'Proposal Signed',   done: signed },
    { key: 'deposit',           label: 'Deposit',           done: signed && (!depositActive || (!!sum.depositMet && !sum.depositWaived)), skip: depositActive && !!sum.depositWaived, detail: depositActive ? (sum.depositWaived ? 'Skipped / Waived' : (sum.depositStatus || '')) : 'None required' },
    { key: 'work_order',        label: 'Work Order',        done: signed && depositSettled && anyWO },
    { key: 'tech_assigned',     label: 'Tech Assigned',     done: accepted, detail: assigned ? (accepted ? 'Accepted' : 'Awaiting tech') : 'Unassigned' },
    { key: 'scheduled',         label: 'Scheduled',         done: !!sched, detail: sched },
    { key: 'installation',      label: 'Installation',      done: installed },
    { key: 'qc',                label: 'Quality Check',     done: qcPassed },
    { key: 'customer_approval', label: 'Customer Approval', done: approved },
    { key: 'final_payment',     label: 'Final Payment',     done: approved && balance <= 0.005, detail: balance > 0 ? ('Balance $' + balance.toLocaleString('en-US')) : 'Paid in full' },
    { key: 'complete',          label: 'Complete',          done: approved && installed && balance <= 0.005 },
  ];
  const overrides = safeParse(c.stage_overrides) || {};
  const stages = defs.map(function (d) {
    const forced = !!overrides[d.key];
    return { key: d.key, label: d.label, detail: d.detail || '', _done: !!d.done || forced, _skip: !forced && !!d.skip };
  });
  let maxDone = -1; stages.forEach(function (s, i) { if (s._done) maxDone = i; });
  stages.forEach(function (s, i) {
    s.status = s._done ? 'done' : ((s._skip || i < maxDone) ? 'skipped' : 'todo');
  });
  let cur = stages.findIndex(function (s) { return s.status === 'todo'; });
  if (cur < 0) cur = stages.length - 1;            // everything done/skipped → sit on Complete
  if (stages[cur].status === 'todo') stages[cur].status = 'current';
  stages.forEach(function (s) { delete s._done; delete s._skip; });
  return { stages: stages, currentKey: stages[cur].key, currentIndex: cur, count: stages.length,
           skippedCount: stages.filter(function (s) { return s.status === 'skipped'; }).length };
}
// Addendums on a work order that still need an admin approve/decline decision
function pendingAddendumCount(wos) {
  return (wos || []).reduce((n, w) => {
    const adds = Array.isArray(w.addendums) ? w.addendums : (safeParse(w.addendums) || []);
    return n + adds.filter(a => a && a.status === 'proposed').length;
  }, 0);
}

// ── Technician compensation estimate ────────────────────────────────────────
// Driven by the AMOUNT OF CAMERAS AND DROPS in the proposal (the real job-size
// drivers), paid at the Pay Calculator's per-unit rates — so a tech sees their
// likely pay WITHOUT ever seeing the customer's pricing. Rates are easy to tune.
// Per-component technician pay. A camera = Cable Run + Termination + Mounting = $52;
// NVR Setup is a separate $15 per recorder. These defaults apply when a technician
// has no pay_structure defined at onboarding (the "$52/camera flat rate" fallback).
const DEFAULT_TECH_PAY = {
  cableRun:    28,   // $14 cable run + $14 cable management
  termination: 12,   // $10 termination + $2 testing
  mounting:    12,   // $10 mounting + $2 angle setup
  nvrSetup:    15,   // $8 mount + $4 HDD setup + $2 QR forwarding
};
// Resolve a technician's pay rates (their onboarding structure, else the $52/camera default)
function getTechRates(technicianId) {
  if (technicianId) {
    const t = db.prepare('SELECT pay_structure FROM technicians WHERE id=?').get(Number(technicianId));
    const r = t && clean(t.pay_structure) ? safeParse(t.pay_structure) : null;
    if (r && typeof r === 'object') return Object.assign({}, DEFAULT_TECH_PAY, r);
  }
  return Object.assign({}, DEFAULT_TECH_PAY);
}
function _enabledItems(section) { return (section && Array.isArray(section.items)) ? section.items.filter(it => it && it.enabled) : []; }
function _sumQty(items, re, exRe) {
  return items.filter(it => { const d = String(it.desc || '').toLowerCase(); return re.test(d) && !(exRe && exRe.test(d)); })
    .reduce((s, it) => s + (Number(it.qty) || 0), 0);
}
// Latest proposal SECTIONS for a customer
function sectionsFor(projectId) {
  const p = db.prepare('SELECT state_json FROM proposals WHERE project_id=? ORDER BY updated_at DESC LIMIT 1').get(projectId);
  const st = p && safeParse(p.state_json);
  return st && st.SECTIONS ? st.SECTIONS : null;
}
// The UNIVERSAL line items — every enabled item with a quantity, across ALL sections
// (equipment, labor, conduit, …). This same list drives the proposal, the work order,
// and the technician's pay, so nothing is silently dropped.
function lineItemsFrom(S) {
  if (!S || typeof S !== 'object') return [];
  const out = [];
  Object.keys(S).forEach(function (sec) {
    _enabledItems(S[sec]).forEach(function (it) {
      const qty = Number(it.qty) || 0;
      if (qty > 0) out.push({ desc: String(it.desc || ''), qty: qty, price: Number(it.price) || 0, enabled: true, section: sec });
    });
  });
  return out;
}
// Map a line item to the pay component it earns the technician (null = unpaid item).
function payComponentFor(desc) {
  const d = String(desc || '').toLowerCase();
  if (/speaker/.test(d)) return null;                            // speaker work isn't a paid component in this model
  if (/cat\s?6|cable\s*run|\bdrop\b/.test(d)) return 'cableRun';  // e.g. 'Cat6 Drop'
  if (/terminat/.test(d)) return 'termination';                  // 'Termination'
  if (/mount/.test(d) && /camera/.test(d)) return 'mounting';    // only 'Camera Mounting' (not 'Drilling Mount'/'Monitor & Mount')
  if (/\bnvr\b|network\s*video/.test(d)) return 'nvrSetup';      // 'NVR (8-Channel)'…
  return null;                                                   // 4K Camera, Programming, Waterproofing, HDD, PoE … = $0
}
const PAY_LABELS = { cableRun: 'Cable Run', termination: 'Termination', mounting: 'Mounting', nvrSetup: 'NVR Setup' };
// The universal line items for a customer's job — the WO snapshot if present, else the live proposal.
function lineItemsFor(projectId) {
  const wo = db.prepare("SELECT line_items FROM work_orders WHERE project_id=? AND status!='Cancelled' ORDER BY id DESC LIMIT 1").get(projectId);
  const woItems = wo && clean(wo.line_items) ? safeParse(wo.line_items) : null;
  if (woItems && woItems.length) return woItems;
  return lineItemsFrom(sectionsFor(projectId));
}
// Per-line-item technician pay: each item earns qty × its component rate (0 if not a paid component).
function techPayBreakdown(lineItems, rates) {
  rates = rates || DEFAULT_TECH_PAY;
  const rows = (lineItems || []).map(function (it) {
    const comp = payComponentFor(it.desc);
    const qty = Number(it.qty) || 0;
    const unit = comp ? (Number(rates[comp]) || 0) : 0;
    return { desc: String(it.desc || ''), qty: qty, payLabel: comp ? PAY_LABELS[comp] : '', unitPay: unit, pay: Math.round(qty * unit * 100) / 100 };
  });
  const total = rows.reduce(function (s, r) { return s + r.pay; }, 0);
  return { rows: rows, total: Math.round(total * 100) / 100 };
}
// Technician pay estimate for a customer's job, computed PER LINE ITEM at the tech's rates (or default).
function techCompEstimate(projectId, technicianId) {
  const items = lineItemsFor(projectId);
  if (!items.length) return { total: 0, items: [], lineItems: [], hasData: false,
    note: 'Estimate appears once the job is scoped (line items) in the proposal.' };
  const rates = getTechRates(technicianId);
  const b = techPayBreakdown(items, rates);
  const paid = b.rows.filter(function (r) { return r.pay > 0; });
  const perCam = rates.cableRun + rates.termination + rates.mounting;
  return { total: b.total, hasData: paid.length > 0,
    items: paid.map(function (r) { return { label: r.desc, qty: r.qty, rate: r.unitPay, amount: r.pay }; }),
    lineItems: b.rows,
    note: 'Paid per line item — Cable Run $' + rates.cableRun + ', Termination $' + rates.termination + ', Mounting $' + rates.mounting + ', NVR Setup $' + rates.nvrSetup + ' ($' + perCam + '/camera when all three apply). Final pay may vary with vehicle and deductions.' };
}

// ── Customer upsert ─────────────────────────────────────────────────────────
// If c.id is given, update that exact record (used by live auto-save so a lead
// keeps a stable identity as you type). Otherwise match by email/phone/name.
function upsertCustomer(c) {
  const name = clean(c.name), business = clean(c.business), phone = clean(c.phone),
        email = clean(c.email), address = clean(c.address);
  const ts = now();

  // Direct update by id — no fuzzy match, no duplicates while editing
  if (c.id) {
    const ex = db.prepare('SELECT * FROM customers WHERE id=?').get(Number(c.id));
    if (ex) {
      db.prepare(`UPDATE customers SET name=?, business=?, phone=?, email=?, address=?, updated_at=? WHERE id=?`)
        .run(name, business, phone, email, address, ts, ex.id);
      if (clean(c.source))      db.prepare('UPDATE customers SET source=? WHERE id=?').run(clean(c.source), ex.id);
      if (clean(c.temperature)) db.prepare('UPDATE customers SET temperature=? WHERE id=?').run(clean(c.temperature), ex.id);
      return Number(ex.id);
    }
  }

  let existing = null;
  if (email)   existing = db.prepare('SELECT * FROM customers WHERE lower(email)=lower(?)').get(email);
  if (!existing && phone)
               existing = db.prepare('SELECT * FROM customers WHERE phone=?').get(phone);
  if (!existing && name)
               existing = db.prepare('SELECT * FROM customers WHERE lower(name)=lower(?) AND lower(coalesce(address,\'\'))=lower(?)').get(name, address);

  if (existing) {
    db.prepare(`UPDATE customers SET name=?, business=?, phone=?, email=?, address=?, updated_at=? WHERE id=?`)
      .run(name || existing.name, business || existing.business, phone || existing.phone,
           email || existing.email, address || existing.address, ts, existing.id);
    // Optionally update lead source/temperature if provided (don't clobber with blanks)
    if (clean(c.source))      db.prepare('UPDATE customers SET source=? WHERE id=?').run(clean(c.source), existing.id);
    if (clean(c.temperature)) db.prepare('UPDATE customers SET temperature=? WHERE id=?').run(clean(c.temperature), existing.id);
    return Number(existing.id);
  }
  const r = db.prepare(`INSERT INTO customers (name,business,phone,email,address,status,temperature,source,closed_reason,notes,created_at,updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(name, business, phone, email, address,
         'New', clean(c.temperature) || 'Warm', clean(c.source) || '', '', '', ts, ts);
  return Number(r.lastInsertRowid);
}

// Create a dedicated, isolated customer profile for a brand-new self-signup login.
// Deliberately a fresh INSERT (no fuzzy email/name match) so signing up can never attach
// the new account to an existing customer's records.
function provisionCustomerForSignup(name, email) {
  const ts = now();
  const nm = clean(name) || clean(email) || 'New Customer';
  const r = db.prepare(`INSERT INTO customers (name,business,phone,email,address,status,temperature,source,closed_reason,notes,portal_token,created_at,updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(nm, nm, '', clean(email), '', 'New', 'Warm', 'Self-signup', '', '', genToken(), ts, ts);
  const customerId = Number(r.lastInsertRowid);
  // Seed an initial project so the customer lands on a real project page (not a 404) and can request work.
  db.prepare(`INSERT INTO projects (customer_id,name,site_address,status,source,access_token,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(customerId, nm, '', 'New', 'Self-signup', genToken(), ts, ts);
  return customerId;
}

// ── Proposal upsert (by proposal_num if present, else new row) ──────────────
function upsertProposal(customerId, projectId, p) {
  const ts = now();
  const num = clean(p.proposalNum);
  const stateJson = JSON.stringify(p.state || {});
  const total = Number(p.grandTotal) || 0;
  const label = clean(p.clientLabel);
  const status = clean(p.status) || 'saved';
  const pid = projectId != null ? Number(projectId) : null;

  let existing = num ? db.prepare('SELECT * FROM proposals WHERE proposal_num=?').get(num) : null;
  if (existing) {
    db.prepare(`UPDATE proposals SET customer_id=?, project_id=?, client_label=?, grand_total=?, status=?, state_json=?, updated_at=? WHERE id=?`)
      .run(customerId, pid != null ? pid : existing.project_id, label, total, status, stateJson, ts, existing.id);
    return Number(existing.id);
  }
  const r = db.prepare(`INSERT INTO proposals (customer_id,project_id,proposal_num,client_label,grand_total,status,state_json,created_at,updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(customerId, pid, num || null, label, total, status, stateJson, ts, ts);
  return Number(r.lastInsertRowid);
}

// Mirror the proposal app's recorded payments + required deposit into the central
// payments table so the dashboard + project page reflect money actually received.
function syncProposalToPayments(customerId, projectId, p) {
  const pid = projectId != null ? Number(projectId) : null;
  const state = (p && p.state) || {};
  const grand = Number(p.grandTotal) || 0;
  const struct = state.paymentStructure || '50/50';          // 50/50, 50/30/20 → 50% ; 100 → 100%
  const depositPct = struct === '100' ? 1 : 0.5;
  const inputs = state.inputs || {};
  const taxOn = inputs.taxToggle && inputs.taxToggle.value;
  const taxRate = (Number(inputs.taxRate && inputs.taxRate.value) || 0) / 100;
  const base = (taxOn && taxRate) ? grand / (1 + taxRate) : grand;   // deposit hits the pre-tax base
  const depositRequired = Math.round(depositPct * base * 100) / 100;
  if (pid != null) db.prepare('UPDATE projects SET deposit_required=?, deposit_label=? WHERE id=?')
    .run(depositRequired, (struct === '100' ? '100%' : '50%') + ' deposit to start', pid);

  const propPays = Array.isArray(state.payments) ? state.payments : [];
  const seen = new Set();
  propPays.forEach(pp => {
    const amt = Number(pp.amount) || 0; if (!amt) return;
    const ref = 'prop:' + (pp.id != null ? pp.id : ((pp.date || '') + ':' + amt));
    seen.add(ref);
    const method = clean(pp.method);
    const note = [clean(pp.reference), clean(pp.notes)].filter(Boolean).join(' · ');
    const paidAt = clean(pp.date) || now();
    const ex = db.prepare('SELECT id FROM payments WHERE project_id=? AND ext_ref=?').get(pid, ref);
    if (ex) db.prepare("UPDATE payments SET amount=?, method=?, status='Paid', note=?, paid_at=? WHERE id=?").run(amt, method, note, paidAt, ex.id);
    else db.prepare(`INSERT INTO payments (customer_id,project_id,label,amount,method,status,note,due_date,paid_at,ext_ref,created_at)
                     VALUES (?,?,?,?,?, 'Paid', ?,?,?,?,?)`).run(customerId, pid, 'Payment received', amt, method, note, '', paidAt, ref, now());
  });
  // Drop synced payments the calculator no longer has (scoped to this project)
  db.prepare("SELECT id, ext_ref FROM payments WHERE project_id=? AND ext_ref LIKE 'prop:%'").all(pid)
    .forEach(row => { if (!seen.has(row.ext_ref)) db.prepare('DELETE FROM payments WHERE id=?').run(row.id); });
}

// One-time backfill: proposals created before the payment-sync feature show $0 deposit
// and no mirrored payments until re-saved. Run the sync once over the latest proposal per
// customer so the whole back-catalog reflects real deposits + collected payments.
db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
if (!db.prepare("SELECT 1 FROM meta WHERE key='deposit_backfill_v1'").get()) {
  try {
    const rows = db.prepare(`SELECT p.customer_id, p.project_id, p.grand_total, p.state_json FROM proposals p
      JOIN (SELECT customer_id, MAX(updated_at) mx FROM proposals GROUP BY customer_id) latest
        ON latest.customer_id=p.customer_id AND latest.mx=p.updated_at`).all();
    rows.forEach(r => { try { syncProposalToPayments(r.customer_id, r.project_id || mostRecentProjectId(r.customer_id), { grandTotal: r.grand_total, state: safeParse(r.state_json) || {} }); } catch (e) {} });
    if (rows.length) console.log('  backfilled deposit/payments for ' + rows.length + ' existing proposal(s)');
  } catch (e) { console.error('backfill error', e.message); }
  db.prepare("INSERT INTO meta (key,value) VALUES ('deposit_backfill_v1', ?)").run(now());
}

// ── Standard Costs (price book) — one editable source of truth for default prices ──
// Seeded with the current prices so nothing changes until an admin edits them in Settings.
const DEFAULT_PRICE_BOOK = {
  camera: [
    { desc: '4K Camera', price: 70 }, { desc: 'Face Recognition', price: 40 },
    { desc: 'Cat6 Drop', price: 150 }, { desc: 'Termination', price: 20 }, { desc: 'Camera Mounting', price: 20 },
    { desc: 'Camera Programming', price: 20 }, { desc: 'Camera Waterproofing', price: 20 }, { desc: 'Junction Box', price: 20 },
    { desc: 'NVR (8-Channel)', price: 150 }, { desc: 'NVR (16-Channel)', price: 300 }, { desc: 'NVR (32-Channel)', price: 600 },
    { desc: 'Facial Recognition + LPR', price: 75 },
    { desc: '4TB Hard Drive', price: 200 }, { desc: '6TB Hard Drive', price: 300 }, { desc: '8TB Hard Drive', price: 400 },
    { desc: 'PoE Switch', price: 100 }, { desc: 'Server Rack', price: 200 }, { desc: 'Monitor & Mount', price: 200 },
  ],
  speaker: [
    { desc: 'Speaker Wire Run', price: 150 }, { desc: 'Speaker', price: 75 }, { desc: 'Drilling Mount', price: 75 },
    { desc: 'Amplifier', price: 250 }, { desc: 'Amplifier (5–8 speakers)', price: 350 }, { desc: 'Amplifier (9+ speakers)', price: 450 },
  ],
  toast: [
    { desc: 'Price per Drop', price: 200 }, { desc: 'Mounting', price: 60 }, { desc: 'Test Tone', price: 30 },
    { desc: 'System Setup', price: 300 }, { desc: 'Per Diem (Map & Test)', price: 700 },
  ],
  adt: [
    { desc: 'Control Panel / Hub', price: 0 }, { desc: 'Door / Window Sensor', price: 0 }, { desc: 'Motion Sensor', price: 0 },
    { desc: 'Glass Break Sensor', price: 0 }, { desc: 'Keypad', price: 0 }, { desc: 'Smoke / CO Detector', price: 0 },
    { desc: 'Indoor Camera', price: 0 }, { desc: 'Yard Sign & Decals', price: 0 },
    { desc: 'Installation (per device)', price: 0 }, { desc: 'Monitoring (per month)', price: 0 },
  ],
};
function getPriceBook() {
  const row = db.prepare("SELECT value FROM meta WHERE key='price_book'").get();
  const saved = row && safeParse(row.value);
  if (!saved) return JSON.parse(JSON.stringify(DEFAULT_PRICE_BOOK));
  // Merge: keep defaults as the canonical item list, overlay saved prices, allow saved custom items
  const out = {};
  Object.keys(DEFAULT_PRICE_BOOK).forEach(function (cat) {
    const savedCat = Array.isArray(saved[cat]) ? saved[cat] : [];
    const byDesc = {}; savedCat.forEach(function (it) { if (it && it.desc) byDesc[it.desc] = Number(it.price) || 0; });
    out[cat] = DEFAULT_PRICE_BOOK[cat].map(function (it) { return { desc: it.desc, price: it.desc in byDesc ? byDesc[it.desc] : it.price }; });
    // append any custom items the admin added that aren't in defaults
    savedCat.forEach(function (it) { if (it && it.desc && !DEFAULT_PRICE_BOOK[cat].some(function (d) { return d.desc === it.desc; })) out[cat].push({ desc: it.desc, price: Number(it.price) || 0 }); });
  });
  return out;
}
function savePriceBook(book) {
  const clean3 = {};
  Object.keys(book || {}).forEach(function (cat) {
    if (!Array.isArray(book[cat])) return;
    clean3[cat] = book[cat].filter(function (it) { return it && clean(it.desc); }).map(function (it) { return { desc: clean(it.desc), price: Number(it.price) || 0 }; });
  });
  db.prepare("INSERT INTO meta (key,value) VALUES ('price_book', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(clean3));
  return getPriceBook();
}

// ── Google Places address lookup (proxied so the key stays server-side) ──────
// Supports both "Places API (New)" and the legacy Places web service; whichever
// the key has enabled is detected on first use and cached in GOOGLE_MODE.
async function googleAutocomplete(input, sessionToken) {
  const key = CONFIG.googleMapsApiKey;
  if (!key) return { error: 'no-key' };

  // Try the NEW Places API first (unless we already know legacy works)
  if (GOOGLE_MODE !== 'legacy') {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        body: JSON.stringify({
          input,
          includedRegionCodes: ['us'],
          ...(sessionToken ? { sessionToken } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.suggestions)) {
        GOOGLE_MODE = 'new';
        return {
          mode: 'new',
          predictions: data.suggestions
            .filter(s => s.placePrediction)
            .map(s => ({
              placeId: s.placePrediction.placeId,
              main: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text?.text || '',
              secondary: s.placePrediction.structuredFormat?.secondaryText?.text || '',
              description: s.placePrediction.text?.text || '',
            })),
        };
      }
      // If the new API is explicitly not enabled, fall through to legacy
    } catch (e) { /* fall through */ }
  }

  // Legacy Places Autocomplete web service
  try {
    const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'
      + '?input=' + encodeURIComponent(input)
      + '&components=country:us&key=' + encodeURIComponent(key)
      + (sessionToken ? '&sessiontoken=' + encodeURIComponent(sessionToken) : '');
    const data = await (await fetch(url)).json();
    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      GOOGLE_MODE = 'legacy';
      return {
        mode: 'legacy',
        predictions: (data.predictions || []).map(p => ({
          placeId: p.place_id,
          main: p.structured_formatting?.main_text || p.description,
          secondary: p.structured_formatting?.secondary_text || '',
          description: p.description,
        })),
      };
    }
    return { error: data.error_message || data.status || 'google-error' };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}

function parseNewComponents(comps) {
  const get = (type) => (comps.find(c => (c.types || []).includes(type)) || {});
  const num = get('street_number').shortText || '';
  const route = get('route').longText || '';
  const city = get('locality').longText || get('sublocality').longText || get('postal_town').longText || get('administrative_area_level_2').longText || '';
  const state = get('administrative_area_level_1').shortText || '';
  const zip = get('postal_code').longText || '';
  return { street: [num, route].filter(Boolean).join(' '), city, state, zip };
}
function parseLegacyComponents(comps) {
  const get = (type) => (comps.find(c => (c.types || []).includes(type)) || {});
  const num = get('street_number').short_name || '';
  const route = get('route').long_name || '';
  const city = get('locality').long_name || get('sublocality').long_name || get('postal_town').long_name || get('administrative_area_level_2').long_name || '';
  const state = get('administrative_area_level_1').short_name || '';
  const zip = get('postal_code').long_name || '';
  return { street: [num, route].filter(Boolean).join(' '), city, state, zip };
}

async function googleDetails(placeId, sessionToken) {
  const key = CONFIG.googleMapsApiKey;
  if (!key) return { error: 'no-key' };

  if (GOOGLE_MODE !== 'legacy') {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId), {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'addressComponents,formattedAddress,displayName' },
      });
      const data = await res.json();
      if (res.ok && data.addressComponents) {
        GOOGLE_MODE = 'new';
        const parts = parseNewComponents(data.addressComponents);
        return { ...parts, formatted: data.formattedAddress || '', name: data.displayName?.text || '' };
      }
    } catch (e) { /* fall through */ }
  }

  try {
    const url = 'https://maps.googleapis.com/maps/api/place/details/json'
      + '?place_id=' + encodeURIComponent(placeId)
      + '&fields=address_component,formatted_address,name&key=' + encodeURIComponent(key)
      + (sessionToken ? '&sessiontoken=' + encodeURIComponent(sessionToken) : '');
    const data = await (await fetch(url)).json();
    if (data.status === 'OK' && data.result) {
      GOOGLE_MODE = 'legacy';
      const parts = parseLegacyComponents(data.result.address_components || []);
      return { ...parts, formatted: data.result.formatted_address || '', name: data.result.name || '' };
    }
    return { error: data.error_message || data.status || 'google-error' };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}

// ── API handlers ────────────────────────────────────────────────────────────
const api = {
  // ── Auth ────────────────────────────────────────────────────────────────
  // GET /api/me  — current user + whether logins have been set up
  'GET /api/me': (req, res) => {
    json(res, { user: publicUser(currentUser(req)), authEnabled: authEnabled() });
  },
  // POST /api/setup  — create the FIRST admin (only allowed when no users exist)
  'POST /api/setup': async (req, res) => {
    if (authEnabled()) return json(res, { ok: false, error: 'already set up' }, 403);
    const b = await readBody(req) || {};
    const username = clean(b.username).toLowerCase(), pw = String(b.password || '');
    if (!username || pw.length < 6) return json(res, { ok: false, error: 'username and a 6+ char password required' }, 400);
    const r = db.prepare('INSERT INTO users (username,pass_hash,role,roles,name,email,active,created_at) VALUES (?,?,?,?,?,?,1,?)')
      .run(username, hashPassword(pw), 'admin', 'admin', clean(b.name) || 'Admin', clean(b.email).toLowerCase(), now());
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(r.lastInsertRowid));
    loginUser(u, res);
    json(res, { ok: true, user: publicUser(u) });
  },
  // POST /api/signup  — anyone can create a login; an admin grants roles afterward
  'POST /api/signup': async (req, res) => {
    if (!authEnabled()) return json(res, { ok: false, error: 'not set up yet' }, 400);
    const b = await readBody(req) || {};
    const username = clean(b.username).toLowerCase(), pw = String(b.password || ''), email = clean(b.email).toLowerCase();
    if (!username) return json(res, { ok: false, error: 'username required' }, 400);
    if (pw.length < 6) return json(res, { ok: false, error: 'password must be 6+ characters' }, 400);
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return json(res, { ok: false, error: 'That username is taken' }, 409);
    // New self-signups become CUSTOMER accounts, linked to a fresh customer profile so the role
    // is immediately functional (the gate keys off customer_id). An admin can promote to staff later.
    const customerId = provisionCustomerForSignup(clean(b.name) || username, email);
    const r = db.prepare('INSERT INTO users (username,pass_hash,role,roles,name,email,customer_id,active,created_at) VALUES (?,?,?,?,?,?,?,1,?)')
      .run(username, hashPassword(pw), 'customer', 'customer', clean(b.name), email, customerId, now());
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(r.lastInsertRowid));
    loginUser(u, res);
    json(res, { ok: true, user: publicUser(u) });
  },
  // POST /api/login  {username,password}
  'POST /api/login': async (req, res) => {
    const b = await readBody(req) || {};
    const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(clean(b.username).toLowerCase());
    if (!u || !verifyPassword(String(b.password || ''), u.pass_hash)) return json(res, { ok: false, error: 'Invalid username or password' }, 401);
    loginUser(u, res);
    json(res, { ok: true, user: publicUser(u) });
  },
  // POST /api/logout
  'POST /api/logout': (req, res) => { clearSession(req, res); json(res, { ok: true }); },
  // POST /api/switch-role  {role}  — switch the active role (must be one you hold)
  'POST /api/switch-role': async (req, res) => {
    if (!req.user) return json(res, { ok: false, error: 'unauthorized' }, 401);
    const b = await readBody(req) || {};
    if (!(req.user.rolesList || []).includes(b.role)) return json(res, { ok: false, error: 'role not assigned to you' }, 403);
    const sid = parseCookies(req).sid;
    db.prepare('UPDATE sessions SET active_role=? WHERE token=?').run(clean(b.role), sid);
    req.user.role = b.role;
    json(res, { ok: true, user: publicUser(req.user) });
  },

  // POST /api/auth/google  {credential: <google ID token>}  — Sign in with Google
  'POST /api/auth/google': async (req, res) => {
    if (!CONFIG.googleClientId) return json(res, { ok: false, error: 'Google sign-in is not configured' }, 400);
    const b = await readBody(req) || {};
    const p = await verifyGoogleIdToken(b.credential);
    if (!p) return json(res, { ok: false, error: 'Could not verify your Google account' }, 401);
    const email = String(p.email).toLowerCase();
    let u = db.prepare('SELECT * FROM users WHERE lower(email)=? AND active=1').get(email);
    let pending = false;
    if (!u) {
      let base = email.split('@')[0].replace(/[^a-z0-9._-]/gi, '') || 'user', uname = base, i = 1;
      while (db.prepare('SELECT 1 FROM users WHERE username=?').get(uname)) uname = base + (++i);
      const firstRun = !authEnabled();
      const role = firstRun ? 'admin' : 'customer';     // first Google sign-in = owner; otherwise a customer account
      const customerId = firstRun ? null : provisionCustomerForSignup(clean(p.name) || base, email);
      const r = db.prepare('INSERT INTO users (username,pass_hash,role,roles,name,email,customer_id,active,created_at) VALUES (?,?,?,?,?,?,?,1,?)')
        .run(uname, '', role, role, clean(p.name) || base, email, customerId, now());
      u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(r.lastInsertRowid));
    }
    loginUser(u, res);
    json(res, { ok: true, user: publicUser(u), pending });
  },

  // GET /api/users  (admin) — list all logins with their roles + linked tech/customer
  'GET /api/users': (req, res) => {
    if (!req.user || req.user.role !== 'admin') return json(res, { error: 'forbidden' }, 403);
    const rows = db.prepare(`SELECT u.id,u.username,u.role,u.roles,u.name,u.email,u.technician_id,u.customer_id,u.active,u.pass_hash,u.created_at,
        t.name AS technician_name, COALESCE(NULLIF(c.business,''),c.name) AS customer_name
      FROM users u LEFT JOIN technicians t ON t.id=u.technician_id LEFT JOIN customers c ON c.id=u.customer_id
      ORDER BY u.username`).all();
    rows.forEach(u => { u.has_password = !!u.pass_hash; delete u.pass_hash; u.rolesList = parseRoles(u.roles || u.role); });
    json(res, { users: rows });
  },
  // POST /api/users  (admin) — create or update any login with one OR MORE roles
  'POST /api/users': async (req, res) => {
    if (!req.user || req.user.role !== 'admin') return json(res, { error: 'forbidden' }, 403);
    const b = await readBody(req) || {};
    // roles: accept an array, or fall back to a single `role`
    const rolesArr = Array.isArray(b.roles) ? b.roles : (b.role ? [b.role] : []);
    const roles = rolesCsv(rolesArr), primary = highestRole(parseRoles(roles));
    if (b.id) {
      const sets = ['role=?', 'roles=?', 'name=?', 'active=?'], vals = [primary, roles, clean(b.name), b.active ? 1 : 0];
      if (b.technician_id !== undefined) { sets.push('technician_id=?'); vals.push(b.technician_id ? Number(b.technician_id) : null); }
      if (b.customer_id !== undefined) { sets.push('customer_id=?'); vals.push(b.customer_id ? Number(b.customer_id) : null); }
      if (b.email !== undefined) { sets.push('email=?'); vals.push(clean(b.email).toLowerCase()); }
      if (b.password) { sets.push('pass_hash=?'); vals.push(hashPassword(String(b.password))); }
      vals.push(Number(b.id));
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id=?`).run(...vals);
      return json(res, { ok: true, id: Number(b.id) });
    }
    const username = clean(b.username).toLowerCase(), pw = String(b.password || ''), email = clean(b.email).toLowerCase();
    if (!username) return json(res, { ok: false, error: 'username required' }, 400);
    if (!email && pw.length < 6) return json(res, { ok: false, error: 'a 6+ char password or a Google email is required' }, 400);
    if (pw && pw.length < 6) return json(res, { ok: false, error: 'password must be 6+ characters' }, 400);
    if (parseRoles(roles).includes('customer') && !b.customer_id) return json(res, { ok: false, error: 'link a customer for a customer role' }, 400);
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return json(res, { ok: false, error: 'username taken' }, 409);
    const r = db.prepare('INSERT INTO users (username,pass_hash,role,roles,name,email,technician_id,customer_id,active,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)')
      .run(username, pw ? hashPassword(pw) : '', primary, roles, clean(b.name), email, b.technician_id ? Number(b.technician_id) : null, b.customer_id ? Number(b.customer_id) : null, now());
    json(res, { ok: true, id: Number(r.lastInsertRowid) });
  },
  'DELETE /api/users/:id': (req, res, url, params) => {
    if (!req.user || req.user.role !== 'admin') return json(res, { error: 'forbidden' }, 403);
    if (Number(params.id) === req.user.id) return json(res, { ok: false, error: 'cannot delete yourself' }, 400);
    db.prepare('DELETE FROM users WHERE id=?').run(Number(params.id));
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(Number(params.id));
    json(res, { ok: true });
  },

  // GET /api/my-workorders  — the logged-in tech's assigned jobs, COST-STRIPPED
  'GET /api/my-workorders': (req, res) => {
    if (!req.user) return json(res, { error: 'forbidden' }, 403);
    const tid = req.user.technician_id;
    const rows = tid ? db.prepare(`SELECT w.id, w.customer_id, w.proposal_num, w.title, w.status, w.scheduled_date, w.time_window, w.qc_status, w.checklist,
        c.business AS customer_business, c.name AS customer_name, c.address AS customer_address
      FROM work_orders w LEFT JOIN customers c ON c.id=w.customer_id
      WHERE w.technician_id=? ORDER BY w.scheduled_date IS NULL, w.scheduled_date`).all(tid) : [];
    rows.forEach(w => { const cl = safeParse(w.checklist) || []; const done = cl.filter(i => i.done).length;
      w.checklist_progress = cl.length ? Math.round(done / cl.length * 100) : 0; delete w.checklist; });
    json(res, { workOrders: rows });
  },

  // GET /api/address/autocomplete?q=...&token=...  (Google Places proxy)
  'GET /api/address/autocomplete': async (req, res, url) => {
    const q = (url.searchParams.get('q') || '').trim();
    const token = url.searchParams.get('token') || '';
    if (q.length < 3) return json(res, { predictions: [] });
    json(res, await googleAutocomplete(q, token));
  },

  // GET /api/address/details?placeId=...&token=...
  'GET /api/address/details': async (req, res, url) => {
    const placeId = url.searchParams.get('placeId') || '';
    const token = url.searchParams.get('token') || '';
    if (!placeId) return json(res, { error: 'missing placeId' }, 400);
    json(res, await googleDetails(placeId, token));
  },

  // GET /api/geocode?q=...  — address → lat/lon via Google (key stays server-side); used by the survey satellite
  'GET /api/geocode': async (req, res, url) => {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return json(res, { error: 'missing q' }, 400);
    const key = CONFIG.googleMapsApiKey;
    if (!key) return json(res, { error: 'no-key' });
    try {
      const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(q) + '&key=' + key);
      const d = await r.json();
      const loc = d && d.results && d.results[0] && d.results[0].geometry && d.results[0].geometry.location;
      if (loc) return json(res, { lat: loc.lat, lon: loc.lng, formatted: d.results[0].formatted_address });
      return json(res, { error: 'not-found' });
    } catch (e) { return json(res, { error: 'geocode-failed' }); }
  },

  // GET /api/staticmap?lat=&lon=&zoom=&type=  — Google satellite/hybrid tile, proxied same-origin (key server-side, canvas-safe)
  // type=hybrid overlays road + street-name labels on the imagery; defaults to clean satellite.
  'GET /api/staticmap': async (req, res, url) => {
    const lat = url.searchParams.get('lat'), lon = url.searchParams.get('lon');
    const zoom = Math.max(1, Math.min(21, parseInt(url.searchParams.get('zoom') || '19', 10)));
    const maptype = url.searchParams.get('type') === 'hybrid' ? 'hybrid' : 'satellite';
    const key = CONFIG.googleMapsApiKey;
    if (!key || !lat || !lon) { res.writeHead(404); return res.end('no-staticmap'); }
    try {
      // For the labeled (hybrid) view, hide business/POI labels so only street names show.
      const style = maptype === 'hybrid' ? '&style=' + encodeURIComponent('feature:poi|element:labels|visibility:off') + '&style=' + encodeURIComponent('feature:transit|element:labels|visibility:off') : '';
      const g = await fetch('https://maps.googleapis.com/maps/api/staticmap?center=' + lat + ',' + lon + '&zoom=' + zoom + '&size=640x640&scale=2&maptype=' + maptype + style + '&key=' + key);
      if (!g.ok) { res.writeHead(502); return res.end('staticmap-failed'); }
      const buf = Buffer.from(await g.arrayBuffer());
      res.writeHead(200, { 'Content-Type': g.headers.get('content-type') || 'image/png', 'Cache-Control': 'private, max-age=600' });
      res.end(buf);
    } catch (e) { res.writeHead(502); res.end('staticmap-error'); }
  },

  // GET /api/config  (front-end checks whether Google address search / sign-in are enabled)
  'GET /api/config': (req, res) => {
    json(res, { googleAddress: !!CONFIG.googleMapsApiKey, googleClientId: CONFIG.googleClientId || '' });
  },

  // Standard Costs (price book) — read by the calculator; edited once in Settings
  'GET /api/pricebook': (req, res) => { json(res, getPriceBook()); },
  'POST /api/pricebook': async (req, res) => {
    if (req.user && req.user.role !== 'admin' && req.user.role !== 'manager') return json(res, { ok: false, error: 'forbidden' }, 403);
    const b = await readBody(req) || {};
    json(res, { ok: true, priceBook: savePriceBook(b.priceBook || b) });
  },

  // GET /api/customers/search?q=...
  'GET /api/customers/search': (req, res, url) => {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return json(res, []);
    const like = `%${q}%`;
    const rows = db.prepare(`
      SELECT c.*,
             (SELECT proposal_num FROM proposals p WHERE p.customer_id=c.id ORDER BY p.updated_at DESC LIMIT 1) AS last_proposal_num,
             (SELECT grand_total  FROM proposals p WHERE p.customer_id=c.id ORDER BY p.updated_at DESC LIMIT 1) AS last_total
      FROM customers c
      WHERE c.name LIKE ? OR c.business LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.address LIKE ?
      ORDER BY c.updated_at DESC
      LIMIT 25
    `).all(like, like, like, like, like);
    json(res, rows);
  },

  // GET /api/customers  (recent list)
  'GET /api/customers': (req, res) => {
    const rows = db.prepare(`
      SELECT c.*,
             (SELECT proposal_num FROM proposals p WHERE p.customer_id=c.id ORDER BY p.updated_at DESC LIMIT 1) AS last_proposal_num,
             (SELECT grand_total  FROM proposals p WHERE p.customer_id=c.id ORDER BY p.updated_at DESC LIMIT 1) AS last_total
      FROM customers c
      ORDER BY c.updated_at DESC
      LIMIT 200
    `).all();
    json(res, rows);
  },

  // GET /api/project/:id  (everything for one project: lead + proposals + work orders)
  'GET /api/project/:id': (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const cust = db.prepare('SELECT * FROM customers WHERE id=?').get(cid);
    if (!cust) return json(res, { error: 'not found' }, 404);
    // Ensure share/portal tokens exist
    if (!proj.access_token) { proj.access_token = genToken(); db.prepare('UPDATE projects SET access_token=? WHERE id=?').run(proj.access_token, pid); }
    if (!cust.portal_token) { cust.portal_token = genToken(); db.prepare('UPDATE customers SET portal_token=? WHERE id=?').run(cust.portal_token, cid); }
    // Backward-compatible payload: `id` stays the CUSTOMER id; per-project state is overlaid from the project.
    const c = {
      id: cid, customer_id: cid, project_id: pid,
      name: cust.name, business: cust.business, phone: cust.phone, email: cust.email, address: cust.address, notes: cust.notes,
      portal_token: cust.portal_token, project_name: proj.name, site_address: proj.site_address,
      status: proj.status, temperature: proj.temperature, source: proj.source, closed_reason: proj.closed_reason,
      signed_name: proj.signed_name, signed_at: proj.signed_at, signature_data: proj.signature_data, signed_proposal: proj.signed_proposal, signed_total: proj.signed_total,
      deposit_required: proj.deposit_required, deposit_label: proj.deposit_label,
      completion_approved: proj.completion_approved, completion_approved_at: proj.completion_approved_at,
      survey_date: proj.survey_date, survey_status: proj.survey_status, survey_notes: proj.survey_notes, survey_approved_at: proj.survey_approved_at, survey_approved_name: proj.survey_approved_name,
      stage_overrides: proj.stage_overrides, help_open: proj.help_open, help_requested_at: proj.help_requested_at, help_message: proj.help_message,
      access_token: proj.access_token, created_at: proj.created_at, updated_at: proj.updated_at
    };
    c.proposals = db.prepare('SELECT id,proposal_num,client_label,grand_total,status,updated_at FROM proposals WHERE project_id=? ORDER BY updated_at DESC').all(pid);
    const wos = db.prepare(`
      SELECT w.*, t.name AS technician_name
      FROM work_orders w LEFT JOIN technicians t ON t.id=w.technician_id
      WHERE w.project_id=? ORDER BY w.updated_at DESC`).all(pid);
    wos.forEach(w => {
      w.checklist = safeParse(w.checklist) || [];
      w.addendums = safeParse(w.addendums) || [];
      w.addendum_total = w.addendums.reduce((s, a) => s + (Number(a.qty || 1) * Number(a.amount || 0)), 0);
      w.total = (Number(w.amount) || 0) + w.addendum_total;
      const done = w.checklist.filter(i => i.done).length;
      w.checklist_progress = w.checklist.length ? Math.round(done / w.checklist.length * 100) : 0;
    });
    c.workOrders = wos;
    // Activity log + notes. ?scope=external returns only customer-visible entries.
    const scope = url.searchParams.get('scope');
    c.logs = (scope === 'external')
      ? db.prepare("SELECT * FROM project_logs WHERE project_id=? AND visibility='external' ORDER BY id DESC").all(pid)
      : db.prepare('SELECT * FROM project_logs WHERE project_id=? ORDER BY id DESC').all(pid);
    // Documents — ?scope=external returns only customer-visible files
    c.documents = (scope === 'external')
      ? db.prepare("SELECT id,name,mime,size,visibility,source,created_at FROM documents WHERE project_id=? AND visibility='external' ORDER BY id DESC").all(pid)
      : db.prepare('SELECT id,name,mime,size,visibility,source,created_at FROM documents WHERE project_id=? ORDER BY id DESC').all(pid);
    // Payments (customer-visible) + a quick summary against the proposal total
    c.payments = db.prepare('SELECT * FROM payments WHERE project_id=? ORDER BY id ASC').all(pid);
    const proposalTotal = (c.proposals[0] && Number(c.proposals[0].grand_total)) || 0;
    const paid = c.payments.filter(p => p.status === 'Paid').reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const depositRequired = Number(c.deposit_required) || 0;
    // Deposit approval workflow: customer self-reports (Pending) → we Approve / Waive / Follow-up
    const depLine = c.payments.find(p => p.ext_ref === 'auto:deposit') || c.payments.find(p => /deposit/i.test(p.label || ''));
    const depositStatus = depLine ? depLine.status : (depositRequired > 0 ? 'Due' : '');
    const depositWaived = depositStatus === 'Waived';
    const depositPending = depositStatus === 'Pending';
    const depositMet = depositRequired > 0 && (depositWaived || paid >= depositRequired - 0.005);
    const depositShort = depositRequired > 0 && !depositMet ? Math.max(0, Math.round((depositRequired - paid) * 100) / 100) : 0;
    c.paymentSummary = { total: proposalTotal, paid, balance: Math.max(0, proposalTotal - paid),
      depositRequired, depositLabel: c.deposit_label || '', depositShort,
      depositMet, depositStatus, depositPending, depositWaived,
      depositMethod: depLine ? (depLine.method || '') : '',
      depositRemaining: Math.max(0, Math.round((depositRequired - paid) * 100) / 100) };
    // Latest signature request (drives the "signature required" banner + signing link)
    const sr = db.prepare("SELECT id, token, status, proposal_num, total, source_doc_id, signed_doc_id, signer_name, created_at, signed_at FROM signature_requests WHERE project_id=? AND status != 'void' ORDER BY id DESC LIMIT 1").get(pid);
    c.signatureRequest = sr || null;
    // Canonical lifecycle — the same ladder every role/view renders
    c.lifecycle = computeLifecycle(c, c.workOrders, c.paymentSummary, c.signatureRequest);
    c.pendingAddendums = pendingAddendumCount(c.workOrders);
    // Has the technician been paid for this job? (drives the tech 3-stage bar's "Paid").
    // Match payroll's free-text work_order_id against every form the UI shows: bare id, 'WO-id', proposal_num.
    let _techPaid = false;
    for (const w of (c.workOrders || [])) {
      const keys = [String(w.id), 'WO-' + w.id]; if (clean(w.proposal_num)) keys.push(clean(w.proposal_num));
      for (const k of keys) { if (db.prepare("SELECT 1 FROM payroll WHERE status='Paid' AND work_order_id=? LIMIT 1").get(k)) { _techPaid = true; break; } }
      if (_techPaid) break;
    }
    c.techPaid = _techPaid;
    // Admin/manager only: the work order's line items WITH how much each pays the assigned tech
    if (scope !== 'tech' && scope !== 'external') {
      const woForPay = (c.workOrders || []).find(w => clean(w.line_items)) || (c.workOrders || [])[0];
      const payB = techPayBreakdown(lineItemsFor(pid), getTechRates(woForPay && woForPay.technician_id));
      c.workOrderPay = { lineItems: payB.rows, total: payB.total };
    }
    // ── Technician scope: NEVER expose project costs; show only work + est. pay ──
    if (scope === 'tech') {
      // A tech may only open a project they're actually dispatched to (no enumerating others' customers)
      const myTechId = req.user && req.user.technician_id;
      const assigned = myTechId && db.prepare('SELECT 1 FROM work_orders WHERE project_id=? AND technician_id=? LIMIT 1').get(pid, Number(myTechId));
      if (!assigned) return json(res, { error: 'forbidden', message: 'You are not assigned to this job.' }, 403);
      c.proposals = (c.proposals || []).map(pr => { const x = { ...pr }; delete x.grand_total; return x; });
      c.workOrders = (c.workOrders || []).map(w => { const x = { ...w }; delete x.amount; delete x.total; delete x.addendum_total; delete x.addendums; delete x.line_items; return x; });
      c.payments = [];
      c.paymentSummary = null;
      // Proposal/invoice/signed PDFs reveal pricing — withheld. The site-survey floor plan
      // carries no costs, so the assigned tech gets it (shared automatically on assignment).
      c.documents = db.prepare("SELECT id,name,mime,size,visibility,source,created_at FROM documents WHERE project_id=? AND source IN ('survey-plan','survey-pdf') ORDER BY id DESC").all(pid);
      c.signatureRequest = null;
      delete c.signed_total; delete c.signature_data; delete c.access_token;
      delete c.deposit_required; delete c.deposit_label;   // monetary — never to techs
      // Strip any dollar figures from the shared lifecycle details (e.g. 'Balance $12,345')
      if (c.lifecycle && c.lifecycle.stages) c.lifecycle.stages.forEach(s => { if (s.detail) s.detail = String(s.detail).replace(/\$[\d,]+(\.\d+)?/g, '').replace(/\s{2,}/g, ' ').trim(); });
      c.logs = (c.logs || []).filter(l => !/\$|payment|deposit|invoice|\bpaid\b|balance|total/i.test(l.body || ''));
      c.techEstimate = techCompEstimate(pid, req.user && req.user.technician_id);
    }
    // ── Customer (external) scope: strip internal-only fields from the customer dashboard ──
    if (scope === 'external') {
      delete c.notes;          // internal staff scratchpad — must never reach the customer
      delete c.access_token;   // the share secret itself
    }
    json(res, c);
  },

  // POST /api/project/:id/sign  — customer accepts & e-signs the proposal
  'POST /api/project/:id/sign': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const b = await readBody(req) || {};
    const name = clean(b.name);
    if (!name) return json(res, { ok: false, error: 'name required' }, 400);
    const ts = applySignedSideEffects(proj.id, { name, proposalNum: b.proposal_num, total: b.total, signatureData: b.signature });
    json(res, { ok: true, signed_at: ts });
  },

  // POST /api/project/:id/payments  — record a payment / scheduled amount (admin)
  'POST /api/project/:id/payments': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const b = await readBody(req) || {};
    const amount = Number(b.amount) || 0;
    if (!amount) return json(res, { ok: false, error: 'amount required' }, 400);
    const status = b.status === 'Due' ? 'Due' : 'Paid';
    const r = db.prepare(`INSERT INTO payments (customer_id,project_id,label,amount,method,status,note,due_date,paid_at,created_at)
                          VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(cid, pid, clean(b.label) || 'Payment', amount, clean(b.method), status, clean(b.note),
           clean(b.due_date), status === 'Paid' ? (clean(b.paid_at) || now()) : '', now());
    addLog(cid, { kind: 'event', visibility: 'external',
      body: (status === 'Paid' ? 'Payment received: ' : 'Payment scheduled: ') + '$' + amount.toLocaleString('en-US') + (clean(b.label) ? ' (' + clean(b.label) + ')' : ''),
      author: 'IOT Techs', project_id: pid });
    json(res, { ok: true, id: Number(r.lastInsertRowid) });
  },

  // PATCH /api/payments/:id  — mark Due → Paid, edit fields
  'PATCH /api/payments/:id': async (req, res, url, params) => {
    const b = await readBody(req) || {};
    if ('status' in b) b.status = b.status === 'Paid' ? 'Paid' : 'Due';   // never let a stray status drop money from totals
    const allowed = ['label', 'amount', 'method', 'status', 'note', 'due_date', 'paid_at'];
    const sets = [], vals = [];
    allowed.forEach(f => { if (f in b) { sets.push(f + '=?'); vals.push(f === 'amount' ? (Number(b[f]) || 0) : clean(b[f])); } });
    if (b.status === 'Paid' && !('paid_at' in b)) { sets.push('paid_at=?'); vals.push(now()); }
    if (!sets.length) return json(res, { ok: false, error: 'no fields' }, 400);
    vals.push(Number(params.id));
    db.prepare(`UPDATE payments SET ${sets.join(', ')} WHERE id=?`).run(...vals);
    json(res, { ok: true });
  },

  // DELETE /api/payments/:id
  'DELETE /api/payments/:id': (req, res, url, params) => {
    db.prepare('DELETE FROM payments WHERE id=?').run(Number(params.id));
    json(res, { ok: true });
  },

  // POST /api/project/:id/deposit-claim  — CUSTOMER self-reports the deposit as paid → Pending our review
  'POST /api/project/:id/deposit-claim': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const cust = db.prepare('SELECT name, business FROM customers WHERE id=?').get(cid) || {};
    const b = await readBody(req) || {};
    const method = clean(b.method);
    let dep = db.prepare("SELECT * FROM payments WHERE project_id=? AND ext_ref='auto:deposit'").get(pid);
    if (dep && dep.status === 'Paid') return json(res, { ok: false, error: 'deposit already confirmed' }, 409);
    const note = 'Customer reported deposit paid' + (method ? ' via ' + method : '');
    if (!dep) {
      const amt = Math.round((Number(proj.deposit_required) || (Number(proj.signed_total) || 0) * 0.5) * 100) / 100;
      if (amt <= 0) return json(res, { ok: false, error: 'no deposit required' }, 400);
      db.prepare(`INSERT INTO payments (customer_id,project_id,label,amount,method,status,note,due_date,paid_at,ext_ref,created_at)
                  VALUES (?,?,?,?,?, 'Pending', ?,?,?,?,?)`).run(cid, pid, 'Deposit to start', amt, method, note, '', '', 'auto:deposit', now());
    } else {
      db.prepare("UPDATE payments SET status='Pending', method=?, note=? WHERE id=?").run(method, note, dep.id);
    }
    addLog(cid, { kind: 'event', visibility: 'external',
      body: 'Customer reported the deposit as paid' + (method ? ' (' + method + ')' : '') + ' — awaiting confirmation',
      author: clean(cust.name) || clean(cust.business) || 'Customer', project_id: pid });
    json(res, { ok: true });
  },

  // POST /api/project/:id/approve-completion  — CUSTOMER signs off on the finished installation
  'POST /api/project/:id/approve-completion': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const cust = db.prepare('SELECT name, business FROM customers WHERE id=?').get(cid) || {};
    db.prepare('UPDATE projects SET completion_approved=1, completion_approved_at=?, updated_at=? WHERE id=?').run(now(), now(), pid);
    addLog(cid, { kind: 'event', visibility: 'external', body: 'Customer approved the completed project ✓', author: clean(cust.name) || clean(cust.business) || 'Customer', project_id: pid });
    json(res, { ok: true });
  },

  // POST /api/project/:id/reschedule-request  — CUSTOMER asks to move the install date → flags dispatch
  'POST /api/project/:id/reschedule-request': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const cust = db.prepare('SELECT name, business FROM customers WHERE id=?').get(cid) || {};
    const b = await readBody(req) || {};
    const note = clean(b.note).slice(0, 400);
    // Flag the active (not completed/cancelled) work orders for this project
    const r = db.prepare("UPDATE work_orders SET reschedule_requested=1, reschedule_note=?, updated_at=? WHERE project_id=? AND status NOT IN ('Completed','Cancelled')")
      .run(note, now(), pid);
    addLog(cid, { kind: 'event', visibility: 'external', body: 'Customer requested to reschedule the installation' + (note ? ': ' + note : '') + ' — dispatch will confirm a new date', author: clean(cust.name) || clean(cust.business) || 'Customer', project_id: pid });
    json(res, { ok: true, flagged: r.changes });
  },

  // POST /api/project/:id/balance-claim  — CUSTOMER self-reports the FINAL payment → Pending (staff confirms via Mark paid)
  'POST /api/project/:id/balance-claim': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const cust = db.prepare('SELECT name FROM customers WHERE id=?').get(cid) || {};
    const b = await readBody(req) || {};
    const method = clean(b.method);
    const total = Number((db.prepare('SELECT grand_total FROM proposals WHERE project_id=? ORDER BY updated_at DESC LIMIT 1').get(pid) || {}).grand_total) || 0;
    const paid = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE project_id=? AND status='Paid'").get(pid).v;
    const bal = Math.round((total - paid) * 100) / 100;
    if (bal <= 0) return json(res, { ok: false, error: 'no balance due' }, 400);
    const note = 'Customer reported final payment' + (method ? ' via ' + method : '');
    const line = db.prepare("SELECT * FROM payments WHERE project_id=? AND ext_ref='auto:balance'").get(pid);
    if (line && line.status === 'Paid') return json(res, { ok: false, error: 'already paid' }, 409);
    if (!line) db.prepare(`INSERT INTO payments (customer_id,project_id,label,amount,method,status,note,due_date,paid_at,ext_ref,created_at)
                           VALUES (?,?,?,?,?, 'Pending', ?,?,?,?,?)`).run(cid, pid, 'Final payment', bal, method, note, '', '', 'auto:balance', now());
    else db.prepare("UPDATE payments SET status='Pending', amount=?, method=?, note=? WHERE id=?").run(bal, method, note, line.id);
    addLog(cid, { kind: 'event', visibility: 'external', body: 'Customer reported the final payment' + (method ? ' (' + method + ')' : '') + ' — awaiting confirmation', author: clean(cust.name) || 'Customer', project_id: pid });
    json(res, { ok: true });
  },

  // POST /api/project/:id/deposit-decision  — STAFF: {decision: 'approve'|'waive'|'followup', note?}
  'POST /api/project/:id/deposit-decision': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const b = await readBody(req) || {};
    const decision = clean(b.decision);
    const dep = db.prepare("SELECT * FROM payments WHERE project_id=? AND ext_ref='auto:deposit'").get(pid);
    if (!dep) return json(res, { ok: false, error: 'no deposit on file' }, 404);
    const amt = Number(dep.amount) || 0;
    if (decision === 'approve') {
      db.prepare("UPDATE payments SET status='Paid', paid_at=?, note=? WHERE id=?").run(now(), 'Deposit confirmed by IOT Techs', dep.id);
      addLog(cid, { kind: 'event', visibility: 'external', body: 'Deposit approved — $' + amt.toLocaleString('en-US') + ' confirmed received', author: 'IOT Techs', project_id: pid });
    } else if (decision === 'waive') {
      db.prepare("UPDATE payments SET status='Waived', note=? WHERE id=?").run('Deposit waived by IOT Techs', dep.id);
      addLog(cid, { kind: 'event', visibility: 'external', body: 'Deposit waived — work may proceed without it', author: 'IOT Techs', project_id: pid });
    } else if (decision === 'followup') {
      db.prepare("UPDATE payments SET status='Pending', note=? WHERE id=?").run('Following up with customer on deposit', dep.id);
      addLog(cid, { kind: 'event', visibility: 'internal', body: 'Circling back on deposit — follow up with customer' + (clean(b.note) ? ': ' + clean(b.note) : ''), author: 'IOT Techs', project_id: pid });
    } else {
      return json(res, { ok: false, error: 'unknown decision' }, 400);
    }
    json(res, { ok: true });
  },

  // POST /api/project/:id/survey  — STAFF schedules / completes / skips the site survey {date?, status?}
  'POST /api/project/:id/survey': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const b = await readBody(req) || {};
    const date = clean(b.date);
    const status = ['scheduled', 'done', 'skipped', ''].indexOf(clean(b.status)) >= 0 ? clean(b.status) : (date ? 'scheduled' : '');
    db.prepare('UPDATE projects SET survey_date=?, survey_status=?, updated_at=? WHERE id=?').run(date, status, now(), pid);
    const msg = status === 'skipped' ? 'Site survey skipped' : status === 'done' ? 'Site survey completed' : (date ? 'Site survey scheduled for ' + date : 'Site survey updated');
    addLog(cid, { kind: 'event', visibility: 'external', body: msg, author: 'IOT Techs', project_id: pid });
    json(res, { ok: true });
  },

  // POST /api/project/:id/stage-override  — ADMIN/MANAGER mark a skipped lifecycle stage complete (or undo) {stageKey, done}
  'POST /api/project/:id/stage-override': async (req, res, url, params) => {
    if (req.user && req.user.role !== 'admin' && req.user.role !== 'manager') return json(res, { ok: false, error: 'forbidden' }, 403);
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const b = await readBody(req) || {};
    const key = clean(b.stageKey);
    const VALID = ['inquiry', 'survey', 'proposal_sent', 'proposal_signed', 'deposit', 'work_order', 'tech_assigned', 'scheduled', 'installation', 'qc', 'customer_approval', 'final_payment', 'complete'];
    if (VALID.indexOf(key) < 0) return json(res, { ok: false, error: 'unknown stage' }, 400);
    const ov = safeParse(proj.stage_overrides) || {};
    if (b.done === false) delete ov[key]; else ov[key] = 1;
    db.prepare('UPDATE projects SET stage_overrides=?, updated_at=? WHERE id=?').run(JSON.stringify(ov), now(), pid);
    addLog(cid, { kind: 'event', visibility: 'internal', body: 'Stage marked ' + (b.done === false ? 'incomplete' : 'complete') + ' by admin: ' + key, author: 'IOT Techs', project_id: pid });
    json(res, { ok: true });
  },

  // POST /api/workorders/:id/accept  — the assigned TECH accepts the job
  'POST /api/workorders/:id/accept': async (req, res, url, params) => {
    const wo = db.prepare('SELECT * FROM work_orders WHERE id=?').get(Number(params.id));
    if (!wo) return json(res, { ok: false, error: 'not found' }, 404);
    // a tech may only accept their OWN assigned job
    if (req.user && req.user.role === 'tech' && Number(wo.technician_id) !== Number(req.user.technician_id))
      return json(res, { ok: false, error: 'forbidden' }, 403);
    db.prepare('UPDATE work_orders SET tech_accepted=1, tech_accepted_at=?, updated_at=? WHERE id=?').run(now(), now(), wo.id);
    addLog(wo.customer_id, { kind: 'event', visibility: 'internal', body: 'Technician accepted the job', author: 'Technician', project_id: wo.project_id });
    json(res, { ok: true });
  },

  // POST /api/project/:id/addendum-decision  — CUSTOMER (their money) or STAFF approves/declines extra work {wo_id, index, decision}
  'POST /api/project/:id/addendum-decision': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const b = await readBody(req) || {};
    const woId = Number(b.wo_id);
    const idx = Number(b.index);
    const decision = clean(b.decision);
    const wo = db.prepare('SELECT * FROM work_orders WHERE id=? AND project_id=?').get(woId, pid);
    if (!wo) return json(res, { ok: false, error: 'not found' }, 404);
    const adds = safeParse(wo.addendums) || [];
    if (!adds[idx]) return json(res, { ok: false, error: 'addendum not found' }, 404);
    if (decision !== 'approve' && decision !== 'decline') return json(res, { ok: false, error: 'unknown decision' }, 400);
    adds[idx].status = decision === 'approve' ? 'approved' : 'declined';
    adds[idx].decided_by = (req.user && req.user.role === 'customer') ? 'customer' : 'staff';
    db.prepare('UPDATE work_orders SET addendums=?, updated_at=? WHERE id=?').run(JSON.stringify(adds), now(), wo.id);
    const a = adds[idx], who = (req.user && req.user.role === 'customer') ? 'Customer' : 'IOT Techs';
    addLog(cid, { kind: 'event', visibility: 'external',
      body: 'Extra work ' + (decision === 'approve' ? 'approved' : 'declined') + ' by ' + (who === 'Customer' ? 'customer' : 'IOT Techs') + ': ' + clean(a.desc || a.title || 'addendum') + (a.amount ? ' ($' + Number(a.amount).toLocaleString('en-US') + ')' : ''),
      author: who, project_id: pid });
    json(res, { ok: true });
  },

  // POST /api/project/:id/documents  — attach a file {name,mime,data(base64/dataURL),visibility}
  'POST /api/project/:id/documents': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const b = await readBody(req) || {};
    const name = clean(b.name) || 'document';
    // A document that needs signing must be customer-visible
    const visibility = b.signatureRequired ? 'external' : (b.visibility === 'internal' ? 'internal' : 'external');
    const src = clean(b.source) || (b.signatureRequired ? 'for-signature' : 'upload');
    // Techs may only save floor-plan survey docs (no signature flow, no other sources).
    if (req.user && req.user.role === 'tech' && (b.signatureRequired || ['survey-state', 'survey-plan', 'survey-pdf'].indexOf(src) < 0))
      return json(res, { ok: false, error: 'forbidden' }, 403);
    let docId;
    try {
      // replace:true keeps a single current doc per source PER PROJECT (e.g. auto-saved survey state / floor plan)
      if (b.replace && src) {
        for (const o of db.prepare('SELECT id,filename,customer_id FROM documents WHERE project_id=? AND source=?').all(pid, src)) {
          try { fs.unlinkSync(path.join(DOCS_DIR, String(o.customer_id), o.filename || '')); } catch (e) { /* gone */ }
          db.prepare('DELETE FROM documents WHERE id=?').run(o.id);
        }
      }
      docId = storeDocument(cid, pid, { name, mime: b.mime, data: b.data, visibility, source: src });
    }
    catch (e) { return json(res, { ok: false, error: String(e.message || e) }, 400); }
    // ── Site-survey change log ────────────────────────────────────────────────
    // Floor-plan edits autosave every ~1.5s (silent), so logging each would flood the timeline.
    // Coalesce: record one "Site survey updated" entry per project per ~5-min editing window.
    // The explicit "Submit to Customer" (survey-pdf) always logs its own milestone.
    const SURVEY_SOURCES = ['survey-state', 'survey-plan', 'survey-pdf'];
    if (SURVEY_SOURCES.indexOf(src) >= 0) {
      const who = (req.user && clean(req.user.name)) || 'IOT Techs';
      if (src === 'survey-pdf') {
        addLog(cid, { kind: 'event', visibility: 'internal', body: 'Site survey submitted to customer', author: who, project_id: pid });
      } else if (src === 'survey-state') {   // the canonical autosave doc — throttle to one entry per window
        const last = db.prepare("SELECT created_at FROM project_logs WHERE project_id=? AND body LIKE 'Site survey updated%' ORDER BY id DESC LIMIT 1").get(pid);
        const stale = !last || (Date.parse(now()) - Date.parse(last.created_at) > 5 * 60 * 1000);
        if (stale) addLog(cid, { kind: 'event', visibility: 'internal', body: 'Site survey updated — floor plan edited', author: who, project_id: pid });
      }
    } else if (!b.silent) {
      addLog(cid, { kind: 'event', visibility, body: 'Document added: ' + name, author: 'IOT Techs', project_id: pid });
    }
    let signUrl = null;
    if (b.signatureRequired) {
      db.prepare("UPDATE signature_requests SET status='void' WHERE project_id=? AND status IN ('pending','viewed')").run(pid);
      const cust = db.prepare('SELECT name,email FROM customers WHERE id=?').get(cid) || {};
      const p = db.prepare('SELECT proposal_num,grand_total FROM proposals WHERE project_id=? ORDER BY updated_at DESC LIMIT 1').get(pid) || {};
      const token = genSignToken();
      db.prepare(`INSERT INTO signature_requests (customer_id,project_id,proposal_num,source_doc_id,token,status,signer_name,signer_email,total,created_at)
                  VALUES (?,?,?,?,?, 'pending', ?,?,?,?)`)
        .run(cid, pid, clean(p.proposal_num), docId, token, clean(cust.name), clean(cust.email), Number(p.grand_total) || 0, now());
      addLog(cid, { kind: 'event', visibility: 'external', body: 'Document sent for signature: ' + name, author: 'IOT Techs', project_id: pid });
      signUrl = '/s/' + token;
    }
    json(res, { ok: true, id: docId, signUrl });
  },

  // GET /api/documents/:id/file  — view (inline) or download (?download=1)
  'GET /api/documents/:id/file': (req, res, url, params) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(Number(params.id));
    if (!doc) { res.writeHead(404); return res.end('Not found'); }
    const fp = path.join(DOCS_DIR, String(doc.customer_id), doc.filename || '');
    if (!fp.startsWith(DOCS_DIR) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('Missing file'); }
    const dl = url.searchParams.get('download');
    const dispo = (dl ? 'attachment' : 'inline') + '; filename="' + (doc.name || 'document').replace(/"/g, '') + '"';
    res.writeHead(200, { 'Content-Type': doc.mime || 'application/octet-stream', 'Content-Disposition': dispo });
    fs.createReadStream(fp).pipe(res);
  },

  // DELETE /api/documents/:id
  'DELETE /api/documents/:id': (req, res, url, params) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(Number(params.id));
    if (doc) {
      try { fs.unlinkSync(path.join(DOCS_DIR, String(doc.customer_id), doc.filename || '')); } catch (e) { /* gone */ }
      db.prepare('DELETE FROM documents WHERE id=?').run(doc.id);
    }
    json(res, { ok: true });
  },

  // ── E-signature: submit a proposal PDF for the customer to sign ─────────────
  // POST /api/project/:id/sign-request  {data(base64 PDF), name, proposal_num, total, signer_name, signer_email}
  'POST /api/project/:id/sign-request': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const cid = proj.customer_id, pid = proj.id;
    const b = await readBody(req) || {};
    const cust = db.prepare('SELECT * FROM customers WHERE id=?').get(cid);
    if (!cust) return json(res, { ok: false, error: 'not found' }, 404);
    let docId;
    try {
      docId = storeDocument(cid, pid, { name: clean(b.name) || 'Proposal.pdf', mime: 'application/pdf',
        data: b.data, visibility: 'external', source: 'proposal-unsigned' });
    } catch (e) { return json(res, { ok: false, error: String(e.message || e) }, 400); }
    // Supersede any earlier pending request for this project
    db.prepare("UPDATE signature_requests SET status='void' WHERE project_id=? AND status IN ('pending','viewed')").run(pid);
    const token = genSignToken();
    const r = db.prepare(`INSERT INTO signature_requests (customer_id,project_id,proposal_num,source_doc_id,token,status,signer_name,signer_email,total,created_at)
                          VALUES (?,?,?,?,?, 'pending', ?,?,?,?)`)
      .run(cid, pid, clean(b.proposal_num), docId, token, clean(b.signer_name) || clean(cust.name), clean(b.signer_email) || clean(cust.email), Number(b.total) || 0, now());
    addLog(cid, { kind: 'event', visibility: 'external', body: 'Proposal sent for signature', author: 'IOT Techs', project_id: pid });
    json(res, { ok: true, id: Number(r.lastInsertRowid), token, document_id: docId, signUrl: '/s/' + token });
  },

  // GET /api/sign/:token  — PUBLIC, token-scoped metadata (safe fields only)
  'GET /api/sign/:token': (req, res, url, params) => {
    const sr = db.prepare('SELECT * FROM signature_requests WHERE token=?').get(clean(params.token));
    if (!sr || sr.status === 'void') return json(res, { ok: false, error: 'invalid or expired link' }, 404);
    const cust = db.prepare('SELECT business, name, access_token FROM customers WHERE id=?').get(sr.customer_id) || {};
    if (!cust.access_token) { cust.access_token = genToken(); db.prepare('UPDATE customers SET access_token=? WHERE id=?').run(cust.access_token, sr.customer_id); }
    if (sr.status === 'pending') db.prepare("UPDATE signature_requests SET status='viewed', viewed_at=? WHERE id=?").run(now(), sr.id);
    json(res, { ok: true, business: cust.business || cust.name || 'Customer', proposal_num: sr.proposal_num,
      total: sr.total, status: sr.status === 'pending' ? 'viewed' : sr.status,
      signer_name: clean(sr.signer_name) || clean(cust.name) || clean(cust.business) || '',
      signed: sr.status === 'signed', document_id: sr.source_doc_id,
      dashboard: '/project.html?customer=' + sr.customer_id + '&view=customer&token=' + cust.access_token });
  },

  // GET /api/sign/:token/file  — PUBLIC, streams the proposal PDF for that token (?signed=1 → signed copy)
  'GET /api/sign/:token/file': (req, res, url, params) => {
    const sr = db.prepare('SELECT * FROM signature_requests WHERE token=?').get(clean(params.token));
    if (!sr || sr.status === 'void') { res.writeHead(404); return res.end('Not found'); }
    const wantSigned = url.searchParams.get('signed');
    const docId = wantSigned ? sr.signed_doc_id : sr.source_doc_id;
    const doc = docId && db.prepare('SELECT * FROM documents WHERE id=?').get(Number(docId));
    if (!doc) { res.writeHead(404); return res.end('Missing file'); }
    streamDocument(doc, res, url.searchParams.get('download'));
  },

  // POST /api/sign/:token  — PUBLIC, accept the flattened signed PDF {data(base64), name, signer}
  'POST /api/sign/:token': async (req, res, url, params) => {
    const sr = db.prepare('SELECT * FROM signature_requests WHERE token=?').get(clean(params.token));
    if (!sr || sr.status === 'void') return json(res, { ok: false, error: 'invalid or expired link' }, 404);
    if (sr.status === 'signed') return json(res, { ok: false, error: 'already signed' }, 409);
    const b = await readBody(req) || {};
    const name = clean(b.signer) || clean(b.name) || sr.signer_name || 'Customer';
    const srPid = sr.project_id || mostRecentProjectId(sr.customer_id);
    let signedDocId;
    try {
      signedDocId = storeDocument(sr.customer_id, srPid, { name: clean(b.name) || 'Signed-Proposal.pdf', mime: 'application/pdf',
        data: b.data, visibility: 'external', source: 'proposal-signed' });
    } catch (e) { return json(res, { ok: false, error: String(e.message || e) }, 400); }
    db.prepare("UPDATE signature_requests SET status='signed', signed_doc_id=?, signer_name=?, signed_at=? WHERE id=?")
      .run(signedDocId, name, now(), sr.id);
    // Mirror the signed side-effects (status advance, deposit + WO automation, customer signature fields)
    const ts = applySignedSideEffects(srPid, { name, proposalNum: sr.proposal_num, total: sr.total, signatureData: '' });
    let tok = (db.prepare('SELECT access_token FROM customers WHERE id=?').get(sr.customer_id) || {}).access_token;
    if (!tok) { tok = genToken(); db.prepare('UPDATE customers SET access_token=? WHERE id=?').run(tok, sr.customer_id); }
    json(res, { ok: true, signed_at: ts, signed_doc_id: signedDocId,
      dashboard: '/project.html?customer=' + sr.customer_id + '&view=customer&token=' + tok });
  },

  // POST /api/project/:id/logs  — add a note/log (internal or external)
  'POST /api/project/:id/logs': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const b = await readBody(req) || {};
    if (!clean(b.body)) return json(res, { ok: false, error: 'empty' }, 400);
    const logId = addLog(Number(proj.customer_id), { kind: b.kind, visibility: b.visibility, body: b.body, author: b.author, project_id: proj.id });
    json(res, { ok: true, id: logId });
  },

  // POST /api/project/:id/help  — customer raises a help request (own project, by login or token)
  'POST /api/project/:id/help': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const b = await readBody(req) || {};
    const msg = clean(b.message);
    if (!msg) return json(res, { ok: false, error: 'message required' }, 400);
    const c = db.prepare('SELECT name, business FROM customers WHERE id=?').get(cid) || {};
    db.prepare('UPDATE projects SET help_open=1, help_requested_at=?, help_message=?, updated_at=? WHERE id=?').run(now(), msg, now(), pid);
    addLog(cid, { kind: 'event', visibility: 'external', body: 'Help requested: ' + msg, author: clean(c.name) || 'Customer', project_id: pid });
    json(res, { ok: true });
  },

  // POST /api/project/:id/resolve-help  (staff) — clear the help flag
  'POST /api/project/:id/resolve-help': (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    db.prepare('UPDATE projects SET help_open=0, updated_at=? WHERE id=?').run(now(), pid);
    addLog(cid, { kind: 'event', visibility: 'internal', body: 'Help request resolved', author: req.user ? clean(req.user.name) || 'Staff' : 'Staff', project_id: pid });
    json(res, { ok: true });
  },

  // POST /api/project/:id/new-lead  — customer wants more work: add to THIS project OR start a NEW project (same customer)
  'POST /api/project/:id/new-lead': async (req, res, url, params) => {
    const proj = resolveProject(Number(params.id), url);
    if (!proj) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = Number(proj.id), cid = Number(proj.customer_id);
    const cust = db.prepare('SELECT name, business FROM customers WHERE id=?').get(cid) || {};
    const who = clean(cust.business || cust.name) || ('customer #' + cid);
    const b = await readBody(req) || {};
    const details = clean(b.details);
    if (b.mode === 'new') {
      // a NEW PROJECT under the SAME customer (not a new customer)
      const ts = now();
      const r = db.prepare(`INSERT INTO projects (customer_id,name,site_address,status,source,access_token,created_at,updated_at)
                            VALUES (?,?,?,?,?,?,?,?)`)
        .run(cid, (clean(b.business) || clean(b.address) || 'New project'), clean(b.address), 'New', 'Existing Customer', genToken(), ts, ts);
      const newPid = Number(r.lastInsertRowid);
      addLog(cid, { kind: 'event', visibility: 'internal', body: 'New project requested by customer' + (b.address ? ' · ' + clean(b.address) : '') + (details ? ' — ' + details : ''), author: who, project_id: newPid });
      addLog(cid, { kind: 'event', visibility: 'external', body: 'Started another project' + (b.address ? ' at ' + clean(b.address) : '') + (details ? ' — ' + details : ''), author: who, project_id: pid });
      return json(res, { ok: true, mode: 'new', projectId: newPid });
    }
    // add to this project: log a request + flag so staff follow up
    db.prepare('UPDATE projects SET help_open=1, help_requested_at=?, help_message=?, updated_at=? WHERE id=?')
      .run(now(), 'Additional work requested' + (details ? ': ' + details : ''), now(), pid);
    addLog(cid, { kind: 'event', visibility: 'external', body: 'Requested additional work on this project' + (details ? ': ' + details : ''), author: who, project_id: pid });
    json(res, { ok: true, mode: 'existing' });
  },

  // GET /api/customers/:id/projects — list a customer's projects (project selector + portal); each with a lifecycle label
  'GET /api/customers/:id/projects': (req, res, url, params) => {
    const cid = Number(params.id);
    const rows = db.prepare('SELECT * FROM projects WHERE customer_id=? ORDER BY updated_at DESC, id DESC').all(cid);
    const out = rows.map(function (p) {
      const wos = db.prepare('SELECT * FROM work_orders WHERE project_id=?').all(p.id);
      wos.forEach(w => { w.addendums = safeParse(w.addendums) || []; });
      const total = Number((db.prepare('SELECT grand_total FROM proposals WHERE project_id=? ORDER BY updated_at DESC LIMIT 1').get(p.id) || {}).grand_total) || 0;
      const paid = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE project_id=? AND status='Paid'").get(p.id).v;
      const depReq = Number(p.deposit_required) || 0;
      const depLine = db.prepare("SELECT status FROM payments WHERE project_id=? AND ext_ref='auto:deposit'").get(p.id);
      const depStatus = depLine ? depLine.status : (depReq > 0 ? 'Due' : '');
      const sum = { total, paid, balance: Math.max(0, total - paid), depositRequired: depReq, depositStatus: depStatus, depositWaived: depStatus === 'Waived', depositMet: depReq > 0 && (depStatus === 'Waived' || paid >= depReq - 0.005) };
      const sr = db.prepare("SELECT status FROM signature_requests WHERE project_id=? AND status!='void' ORDER BY id DESC LIMIT 1").get(p.id);
      const lc = computeLifecycle(p, wos, sum, sr);
      const cur = lc.stages[lc.currentIndex] || {};
      return { id: p.id, name: p.name, site_address: p.site_address, status: p.status, total, balance: sum.balance, currentKey: lc.currentKey, currentLabel: cur.label || '', updated_at: p.updated_at, created_at: p.created_at };
    });
    json(res, out);
  },

  // POST /api/customers/:id/projects — create a new project under a customer (admin/manager)
  'POST /api/customers/:id/projects': async (req, res, url, params) => {
    if (req.user && req.user.role !== 'admin' && req.user.role !== 'manager') return json(res, { error: 'forbidden' }, 403);
    const cid = Number(params.id);
    const c = db.prepare('SELECT id,business,name,address FROM customers WHERE id=?').get(cid);
    if (!c) return json(res, { ok: false, error: 'not found' }, 404);
    const b = await readBody(req) || {};
    const ts = now();
    const r = db.prepare(`INSERT INTO projects (customer_id,name,site_address,status,access_token,created_at,updated_at)
                          VALUES (?,?,?,?,?,?,?)`)
      .run(cid, clean(b.name) || clean(b.site_address) || (c.business || c.name || 'Project'), clean(b.site_address) || clean(c.address), 'New', genToken(), ts, ts);
    const pid = Number(r.lastInsertRowid);
    addLog(cid, { kind: 'event', visibility: 'internal', body: 'New project created' + (clean(b.name) ? ': ' + clean(b.name) : ''), author: req.user ? clean(req.user.name) || 'Staff' : 'Staff', project_id: pid });
    json(res, { ok: true, projectId: pid });
  },

  // DELETE /api/logs/:id  — remove a log/note entry
  'DELETE /api/logs/:id': (req, res, url, params) => {
    db.prepare('DELETE FROM project_logs WHERE id=?').run(Number(params.id));
    json(res, { ok: true });
  },

  // GET /api/surveys  — projects with a saved site survey, plus recent projects that have none yet (admin/manager/tech)
  'GET /api/surveys': (req, res) => {
    if (req.user && ['admin', 'manager', 'tech'].indexOf(req.user.role) < 0) return json(res, { error: 'forbidden' }, 403);
    // One row per PROJECT that has survey documents (id = project id; customer_id carried for links/disk path).
    const surveys = db.prepare(`
      SELECT pr.id, pr.customer_id, pr.name AS project_name, pr.site_address,
             c.business, c.name, c.address, pr.status,
             MAX(d.created_at)                                          AS updated,
             MAX(CASE WHEN d.source='survey-pdf'   THEN d.id END)       AS pdf_id,
             MAX(CASE WHEN d.source='survey-state' THEN d.id END)       AS state_id
      FROM documents d
      JOIN projects  pr ON pr.id = d.project_id
      JOIN customers c  ON c.id = pr.customer_id
      WHERE d.source IN ('survey-state','survey-plan','survey-pdf')
      GROUP BY pr.id
      ORDER BY updated DESC`).all();
    surveys.forEach(s => { s.hasSurvey = true; });
    const have = new Set(surveys.map(s => s.id));
    // Recent projects without any floor plan yet — offer to add location plans
    const recent = db.prepare(`
      SELECT pr.id, pr.customer_id, pr.name AS project_name, pr.site_address,
             c.business, c.name, c.address, pr.status, pr.updated_at AS updated
      FROM projects pr JOIN customers c ON c.id = pr.customer_id
      ORDER BY pr.updated_at DESC LIMIT 60`).all()
      .filter(p => !have.has(p.id))
      .map(p => ({ ...p, hasSurvey: false }));
    json(res, { surveys, projects: recent });
  },

  // GET /api/customers/:id  (customer + their proposals + latest state)
  'GET /api/customers/:id': (req, res, url, params) => {
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(Number(params.id));
    if (!c) return json(res, { error: 'not found' }, 404);
    // ?project=<pid> scopes proposals + latestState to one project (multi-project customers);
    // otherwise fall back to the customer-wide latest (legacy single-project behavior).
    const pid = Number(url.searchParams.get('project')) || 0;
    const proposals = pid
      ? db.prepare('SELECT id,proposal_num,client_label,grand_total,status,updated_at FROM proposals WHERE project_id=? ORDER BY updated_at DESC').all(pid)
      : db.prepare('SELECT id,proposal_num,client_label,grand_total,status,updated_at FROM proposals WHERE customer_id=? ORDER BY updated_at DESC').all(c.id);
    const latest = pid
      ? db.prepare('SELECT state_json FROM proposals WHERE project_id=? ORDER BY updated_at DESC LIMIT 1').get(pid)
      : db.prepare('SELECT state_json FROM proposals WHERE customer_id=? ORDER BY updated_at DESC LIMIT 1').get(c.id);
    c.proposals = proposals;
    c.project_id = pid || null;
    c.latestState = latest ? safeParse(latest.state_json) : null;
    json(res, c);
  },

  // PATCH /api/customers/:id  (update CRM lead fields)
  'PATCH /api/customers/:id': async (req, res, url, params) => {
    const body = await readBody(req) || {};
    const id = Number(params.id);
    const prev = db.prepare('SELECT status FROM customers WHERE id=?').get(id);
    const allowed = ['status', 'temperature', 'source', 'closed_reason', 'notes'];
    const sets = [], vals = [];
    allowed.forEach(f => { if (f in body) { sets.push(f + '=?'); vals.push(clean(body[f])); } });
    if (!sets.length) return json(res, { ok: false, error: 'no fields' }, 400);
    sets.push('updated_at=?'); vals.push(now());
    vals.push(id);
    db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id=?`).run(...vals);
    // Auto-log a status change to the project activity timeline
    if ('status' in body && prev && clean(body.status) && clean(body.status) !== (prev.status || '')) {
      addLog(id, { kind: 'event', visibility: 'internal',
        body: 'Pipeline status changed to "' + clean(body.status) + '"',
        author: clean(body.author) || 'System' });
    }
    json(res, { ok: true, customer: db.prepare('SELECT * FROM customers WHERE id=?').get(id) });
  },

  // GET /api/stats  (dashboard aggregates)
  'GET /api/stats': (req, res) => {
    const totalLeads = db.prepare('SELECT COUNT(*) n FROM customers').get().n;
    const byStatus = {};
    LEAD_STATUSES.forEach(s => { byStatus[s] = 0; });
    db.prepare('SELECT COALESCE(NULLIF(status,\'\'),\'New\') status, COUNT(*) n FROM customers GROUP BY status')
      .all().forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + r.n; });
    const byTemp = {};
    db.prepare('SELECT COALESCE(NULLIF(temperature,\'\'),\'Warm\') t, COUNT(*) n FROM customers GROUP BY temperature')
      .all().forEach(r => { byTemp[r.t] = r.n; });
    // Open pipeline value = latest proposal total for customers not Closed/Completed
    const openPlaceholders = OPEN_STATUSES.map(() => '?').join(',');
    const openPipeline = db.prepare(`
      SELECT COALESCE(SUM(t),0) v FROM (
        SELECT (SELECT grand_total FROM proposals p WHERE p.customer_id=c.id ORDER BY p.updated_at DESC LIMIT 1) t
        FROM customers c WHERE COALESCE(NULLIF(c.status,''),'New') IN (${openPlaceholders})
      )`).get(...OPEN_STATUSES).v;
    // Won = value of deals the customer actually signed (same definition as /api/analytics)
    const wonValue = db.prepare("SELECT COALESCE(SUM(signed_total),0) v FROM projects WHERE signed_at IS NOT NULL AND signed_at!=''").get().v;
    const totalProposals = db.prepare('SELECT COUNT(*) n FROM proposals').get().n;
    json(res, { totalLeads, totalProposals, byStatus, byTemp, openPipeline, wonValue, statuses: LEAD_STATUSES });
  },

  // GET /api/analytics  — KPIs + chart series for the analytics dashboard
  'GET /api/analytics': (req, res) => {
    const totalLeads = db.prepare('SELECT COUNT(*) n FROM customers').get().n;
    const statuses = {}; LEAD_STATUSES.forEach(s => statuses[s] = 0);
    db.prepare("SELECT COALESCE(NULLIF(status,''),'New') s, COUNT(*) n FROM customers GROUP BY status").all()
      .forEach(r => { statuses[r.s] = (statuses[r.s] || 0) + r.n; });
    // pipeline (open) value + signed (won) value via latest proposal per customer
    const openPh = OPEN_STATUSES.map(() => '?').join(',');
    const pipelineValue = db.prepare(`SELECT COALESCE(SUM(t),0) v FROM (
      SELECT (SELECT grand_total FROM proposals p WHERE p.customer_id=c.id ORDER BY p.updated_at DESC LIMIT 1) t
      FROM customers c WHERE COALESCE(NULLIF(c.status,''),'New') IN (${openPh}))`).get(...OPEN_STATUSES).v;
    const signed = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(signed_total),0) v FROM projects WHERE signed_at IS NOT NULL AND signed_at!=''").get();
    const payCollected = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE status='Paid'").get().v;
    const payDue = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE status='Due'").get().v;
    const winRate = totalLeads ? Math.round(signed.n / totalLeads * 100) : 0;
    const avgDeal = signed.n ? Math.round(signed.v / signed.n) : 0;
    // signed value by month (last 6)
    const signedByMonth = db.prepare("SELECT substr(signed_at,1,7) m, COUNT(*) n, COALESCE(SUM(signed_total),0) v FROM projects WHERE signed_at IS NOT NULL AND signed_at!='' GROUP BY m ORDER BY m DESC LIMIT 6").all().reverse();
    const leadsByMonth = db.prepare("SELECT substr(created_at,1,7) m, COUNT(*) n FROM customers WHERE created_at!='' GROUP BY m ORDER BY m DESC LIMIT 6").all().reverse();
    const woCounts = {}; WO_STATUSES.forEach(s => woCounts[s] = 0);
    db.prepare('SELECT status s, COUNT(*) n FROM work_orders GROUP BY status').all().forEach(r => { woCounts[r.s] = (woCounts[r.s] || 0) + r.n; });
    json(res, { totalLeads, statuses, pipelineValue, wonValue: signed.v, signedCount: signed.n, winRate, avgDeal,
      payCollected, payDue, signedByMonth, leadsByMonth, woCounts, leadStatuses: LEAD_STATUSES, woStatuses: WO_STATUSES });
  },

  // GET /api/reminders  — work-order follow-ups, bucketed overdue/today/upcoming
  'GET /api/reminders': (req, res) => {
    const rows = db.prepare(`SELECT w.id, w.customer_id, w.title, w.proposal_num, w.status, w.scheduled_date, w.follow_up_date, w.follow_up_note,
        c.business AS customer_business, c.name AS customer_name
      FROM work_orders w LEFT JOIN customers c ON c.id=w.customer_id
      WHERE w.follow_up_date IS NOT NULL AND w.follow_up_date != '' ORDER BY w.follow_up_date`).all();
    const today = localDate();   // today in the business timezone, not UTC
    const out = { overdue: [], today: [], upcoming: [], all: rows };
    rows.forEach(r => { const d = (r.follow_up_date || '').slice(0, 10);
      if (d < today) out.overdue.push(r); else if (d === today) out.today.push(r); else out.upcoming.push(r); });
    json(res, out);
  },

  // GET /api/proposals/:id  (full state for one proposal)
  'GET /api/proposals/:id': (req, res, url, params) => {
    const p = db.prepare('SELECT * FROM proposals WHERE id=?').get(Number(params.id));
    if (!p) return json(res, { error: 'not found' }, 404);
    p.state = safeParse(p.state_json);
    delete p.state_json;
    json(res, p);
  },

  // ── Proposal LINK: a shareable web proposal (/p/<token>) the customer can view, download as PDF, sign, and pay deposit ──
  'POST /api/proposals/:id/share-link': (req, res, url, params) => {
    if (req.user && req.user.role !== 'admin' && req.user.role !== 'manager') return json(res, { error: 'forbidden' }, 403);
    const p = db.prepare('SELECT * FROM proposals WHERE id=?').get(Number(params.id));
    if (!p) return json(res, { ok: false, error: 'not found' }, 404);
    let tok = clean(p.share_token);
    if (!tok) { tok = genToken(); db.prepare('UPDATE proposals SET share_token=? WHERE id=?').run(tok, p.id); }
    json(res, { ok: true, token: tok, url: '/p/' + tok });
  },
  // POST /api/survey-share  {html, name, token?}  — host a self-contained survey HTML page at /sv/<token>.
  // Works with NO customer attached; reusing a token (passed back) updates that same link in place.
  'POST /api/survey-share': async (req, res, url, params) => {
    if (req.user && ['admin', 'manager', 'tech'].indexOf(req.user.role) < 0) return json(res, { error: 'forbidden' }, 403);
    const b = await readBody(req) || {};
    const html = String(b.html || ''); if (!html) return json(res, { ok: false, error: 'no html' }, 400);
    const name = clean(b.name).slice(0, 120);
    let tok = clean(b.token);
    if (tok && db.prepare('SELECT 1 FROM survey_shares WHERE token=?').get(tok)) {
      db.prepare('UPDATE survey_shares SET html=?, name=?, updated_at=? WHERE token=?').run(html, name, now(), tok);
    } else {
      tok = genToken();
      db.prepare('INSERT INTO survey_shares (token,name,html,created_at,updated_at) VALUES (?,?,?,?,?)').run(tok, name, html, now(), now());
    }
    json(res, { ok: true, token: tok, url: '/sv/' + tok });
  },
  // GET /api/pub/proposal/:token  — public proposal view data (the token is the credential)
  'GET /api/pub/proposal/:token': (req, res, url, params) => {
    const tok = clean(params.token);
    const p = tok && db.prepare("SELECT * FROM proposals WHERE share_token=? AND share_token!=''").get(tok);
    if (!p) return json(res, { error: 'not found' }, 404);
    const cust = db.prepare('SELECT id,business,name,email,phone,address FROM customers WHERE id=?').get(p.customer_id) || {};
    const proj = p.project_id ? getProject(p.project_id) : null;
    // State columns (signed/deposit/survey) live on the project now; contact stays on the customer.
    const c = Object.assign({}, cust, proj || {}, { id: cust.id });
    const pid = p.project_id || (proj && proj.id) || mostRecentProjectId(p.customer_id);
    if (!clean(p.viewed_at)) db.prepare('UPDATE proposals SET viewed_at=? WHERE id=?').run(now(), p.id);  // first-open timestamp
    const state = safeParse(p.state_json) || {};
    // Customer-facing documents that ride along with the proposal (floor plan, payment terms, receipts, etc.)
    const docs = db.prepare("SELECT id,name,mime,source,created_at FROM documents WHERE project_id=? AND visibility='external' ORDER BY id DESC").all(pid)
      .map(d => ({ id: d.id, name: d.name, mime: d.mime, source: d.source, created_at: d.created_at,
        kind: /survey/.test(d.source || '') ? 'floorplan' : (/pdf/.test(d.mime || '') ? 'pdf' : 'doc') }));
    const secLbl = { camera: 'Cameras & Surveillance', speaker: 'Sound', toast: 'Toast POS', adt: 'Alarm / ADT' };
    const sections = [];
    ['camera', 'speaker', 'toast', 'adt'].forEach(k => {
      const s = state.SECTIONS && state.SECTIONS[k]; if (!s || !s.items) return;
      const items = s.items.filter(it => it.enabled && Number(it.qty) > 0)
        .map(it => ({ desc: it.desc, qty: Number(it.qty), price: Number(it.price) || 0, amount: Math.round(Number(it.qty) * (Number(it.price) || 0) * 100) / 100 }));
      if (items.length) sections.push({ label: secLbl[k] || k, items, subtotal: Math.round(items.reduce((a, it) => a + it.amount, 0) * 100) / 100 });
    });
    const total = Number(p.grand_total) || 0;
    const struct = state.paymentStructure || '50/50';
    const depositReq = Number(c.deposit_required) || Math.round((struct === '100' ? total : total * 0.5) * 100) / 100;
    const depLine = db.prepare("SELECT status FROM payments WHERE project_id=? AND ext_ref='auto:deposit'").get(pid);
    const paid = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE project_id=? AND status='Paid'").get(pid).v;
    json(res, {
      proposalNum: p.proposal_num, clientLabel: p.client_label, total,
      customer: { business: c.business || '', name: c.name || '', address: c.address || '' },
      sections, paymentStructure: struct, documents: docs, viewedAt: clean(p.viewed_at) || now(),
      deposit: { required: depositReq, label: c.deposit_label || '' },
      signed: c.signed_at ? { at: c.signed_at, name: c.signed_name || '', signature: c.signature_data || '' } : null,
      survey: { notes: c.survey_notes || '', approvedAt: c.survey_approved_at || '', approvedName: c.survey_approved_name || '',
                hasPlans: docs.some(d => d.kind === 'floorplan') },
      depositStatus: depLine ? depLine.status : (paid > 0 ? 'Paid' : ''),
      depositSettled: !!(depLine && (depLine.status === 'Paid' || depLine.status === 'Waived')) || paid >= depositReq - 0.005
    });
  },
  // POST /api/pub/proposal/:token/sign  {name, signature}
  'POST /api/pub/proposal/:token/sign': async (req, res, url, params) => {
    const p = db.prepare("SELECT * FROM proposals WHERE share_token=? AND share_token!=''").get(clean(params.token));
    if (!p) return json(res, { ok: false, error: 'not found' }, 404);
    const b = await readBody(req) || {};
    const name = clean(b.name); if (!name) return json(res, { ok: false, error: 'name required' }, 400);
    if (!b.disclosure) return json(res, { ok: false, error: 'You must agree to sign electronically' }, 400);
    const pPid = p.project_id || mostRecentProjectId(p.customer_id);
    const ts = applySignedSideEffects(pPid, { name, proposalNum: p.proposal_num, total: p.grand_total, signatureData: b.signature });
    // E-sign audit trail
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    addLog(p.customer_id, { kind: 'event', visibility: 'internal', body: 'E-signature consent recorded for ' + name + ' (proposal ' + (p.proposal_num || '') + ') at ' + ts + (ip ? ' · IP ' + ip : ''), author: 'System', project_id: pPid });
    json(res, { ok: true, signed_at: ts });
  },
  // GET /api/pub/proposal/:token/doc/:id  — stream a customer-facing document via the proposal token
  'GET /api/pub/proposal/:token/doc/:id': (req, res, url, params) => {
    const p = db.prepare("SELECT customer_id, project_id FROM proposals WHERE share_token=? AND share_token!=''").get(clean(params.token));
    if (!p) { res.writeHead(404); return res.end('Not found'); }
    const pid = p.project_id || mostRecentProjectId(p.customer_id);
    const doc = db.prepare("SELECT * FROM documents WHERE id=? AND project_id=? AND visibility='external'").get(Number(params.id), pid);
    if (!doc) { res.writeHead(404); return res.end('Not found'); }
    streamDocument(doc, res, url.searchParams.get('download'));
  },
  // POST /api/pub/proposal/:token/survey-notes  {notes}  — customer leaves notes on the floor plans
  'POST /api/pub/proposal/:token/survey-notes': async (req, res, url, params) => {
    const p = db.prepare("SELECT customer_id, project_id FROM proposals WHERE share_token=? AND share_token!=''").get(clean(params.token));
    if (!p) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = p.project_id || mostRecentProjectId(p.customer_id);
    const b = await readBody(req) || {};
    const notes = clean(b.notes).slice(0, 4000);
    db.prepare('UPDATE projects SET survey_notes=? WHERE id=?').run(notes, pid);
    json(res, { ok: true });
  },
  // POST /api/pub/proposal/:token/survey-approve  {name?}  — customer signs off on the floor plans
  'POST /api/pub/proposal/:token/survey-approve': async (req, res, url, params) => {
    const p = db.prepare("SELECT customer_id, project_id FROM proposals WHERE share_token=? AND share_token!=''").get(clean(params.token));
    if (!p) return json(res, { ok: false, error: 'not found' }, 404);
    const pid = p.project_id || mostRecentProjectId(p.customer_id);
    const proj = getProject(pid);
    const cust = db.prepare('SELECT * FROM customers WHERE id=?').get(p.customer_id);
    if (!proj || !cust) return json(res, { ok: false, error: 'not found' }, 404);
    if (clean(proj.survey_approved_at)) return json(res, { ok: true, approvedAt: proj.survey_approved_at, approvedName: proj.survey_approved_name || '' });
    const b = await readBody(req) || {};
    const name = clean(b.name);
    if (clean(b.notes)) db.prepare('UPDATE projects SET survey_notes=? WHERE id=?').run(clean(b.notes).slice(0, 4000), pid);
    const ts = now();
    const who = name || proj.signed_name || cust.name || cust.business || 'Customer';
    db.prepare('UPDATE projects SET survey_approved_at=?, survey_approved_name=? WHERE id=?').run(ts, who, pid);
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    addLog(p.customer_id, { kind: 'event', visibility: 'internal', body: 'Floor plans approved by ' + who + ' at ' + ts + (ip ? ' · IP ' + ip : ''), author: 'System', project_id: pid });
    json(res, { ok: true, approvedAt: ts, approvedName: who });
  },
  // POST /api/pub/proposal/:token/deposit  {method}  — customer marks the deposit paid (→ Pending review)
  'POST /api/pub/proposal/:token/deposit': async (req, res, url, params) => {
    const p = db.prepare("SELECT * FROM proposals WHERE share_token=? AND share_token!=''").get(clean(params.token));
    if (!p) return json(res, { ok: false, error: 'not found' }, 404);
    const b = await readBody(req) || {};
    const cid = p.customer_id, method = clean(b.method);
    const pid = p.project_id || mostRecentProjectId(cid);
    const proj = getProject(pid);
    const cust = db.prepare('SELECT * FROM customers WHERE id=?').get(cid);
    if (!proj || !cust) return json(res, { ok: false, error: 'not found' }, 404);
    let dep = db.prepare("SELECT * FROM payments WHERE project_id=? AND ext_ref='auto:deposit'").get(pid);
    if (dep && dep.status === 'Paid') return json(res, { ok: false, error: 'deposit already confirmed' }, 409);
    const note = 'Customer reported deposit paid' + (method ? ' via ' + method : '') + ' (proposal link)';
    if (!dep) {
      const amt = Math.round((Number(proj.deposit_required) || (Number(proj.signed_total) || Number(p.grand_total) || 0) * 0.5) * 100) / 100;
      if (amt <= 0) return json(res, { ok: false, error: 'no deposit required' }, 400);
      db.prepare("INSERT INTO payments (customer_id,project_id,label,amount,method,status,note,due_date,paid_at,ext_ref,created_at) VALUES (?,?,?,?,?, 'Pending', ?,?,?,?,?)")
        .run(cid, pid, 'Deposit to start', amt, method, note, '', '', 'auto:deposit', now());
    } else {
      db.prepare("UPDATE payments SET status='Pending', method=?, note=? WHERE id=?").run(method, note, dep.id);
    }
    addLog(cid, { kind: 'event', visibility: 'external', body: 'Customer reported the deposit as paid' + (method ? ' (' + method + ')' : '') + ' — awaiting confirmation', author: clean(cust.name) || clean(cust.business) || 'Customer', project_id: pid });
    json(res, { ok: true });
  },

  // POST /api/save  { customer:{...}, proposal:{ proposalNum, clientLabel, grandTotal, status, state } }
  'POST /api/save': async (req, res) => {
    const body = await readBody(req);
    if (!body || !body.customer) return json(res, { ok: false, error: 'missing customer' }, 400);
    const customerId = upsertCustomer(body.customer);
    // Resolve the target project: explicit body.projectId, else most recent, else create the customer's first project.
    let projectId = body.projectId ? Number(body.projectId) : null;
    if (projectId) { const pp = getProject(projectId); if (!pp || Number(pp.customer_id) !== Number(customerId)) projectId = null; }
    if (!projectId) projectId = mostRecentProjectId(customerId);
    if (!projectId) {
      const cst = db.prepare('SELECT business,name,address FROM customers WHERE id=?').get(customerId) || {};
      const ts = now();
      const r = db.prepare(`INSERT INTO projects (customer_id,name,site_address,status,access_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
        .run(customerId, (cst.business || cst.name || 'Project'), (cst.address || ''), 'New', genToken(), ts, ts);
      projectId = Number(r.lastInsertRowid);
    }
    const proposalId = body.proposal ? upsertProposal(customerId, projectId, body.proposal) : null;
    if (body.proposal) syncProposalToPayments(customerId, projectId, body.proposal);
    json(res, { ok: true, customerId, projectId, proposalId });
  },

  // DELETE /api/proposals/:id
  'DELETE /api/proposals/:id': (req, res, url, params) => {
    db.prepare('DELETE FROM proposals WHERE id=?').run(Number(params.id));
    json(res, { ok: true });
  },

  // DELETE /api/customers/:id  (cascade: removes the customer, proposals, work orders)
  'DELETE /api/customers/:id': (req, res, url, params) => {
    const id = Number(params.id);
    db.prepare('DELETE FROM proposals WHERE customer_id=?').run(id);
    db.prepare('DELETE FROM work_orders WHERE customer_id=?').run(id);
    db.prepare('DELETE FROM project_logs WHERE customer_id=?').run(id);
    db.prepare('DELETE FROM payments WHERE customer_id=?').run(id);
    db.prepare('DELETE FROM documents WHERE customer_id=?').run(id);
    db.prepare('DELETE FROM signature_requests WHERE customer_id=?').run(id);
    db.prepare('DELETE FROM projects WHERE customer_id=?').run(id);
    try { fs.rmSync(path.join(DOCS_DIR, String(id)), { recursive: true, force: true }); } catch (e) { /* none */ }
    db.prepare('DELETE FROM customers WHERE id=?').run(id);
    json(res, { ok: true });
  },

  // ── Technicians ────────────────────────────────────────────────────────────
  'GET /api/technicians': (req, res) => {
    const rows = db.prepare('SELECT * FROM technicians ORDER BY active DESC, name COLLATE NOCASE').all();
    // Only admin/manager see pay structures; techs get roster names only (no cross-tech rate leak)
    const isMgr = req.user && (req.user.role === 'admin' || req.user.role === 'manager');
    if (!isMgr) rows.forEach(t => { delete t.pay_structure; });
    json(res, rows);
  },
  'POST /api/technicians': async (req, res) => {
    const b = await readBody(req) || {};
    const ts = now();
    const name = clean(b.name), phone = clean(b.phone), email = clean(b.email),
          skills = clean(b.skills), active = b.active === false || b.active === 0 ? 0 : 1;
    if (!name) return json(res, { ok: false, error: 'name required' }, 400);
    // Per-technician pay structure (component rates). Only persist keys we recognize.
    let payStruct;
    if (b.pay_structure && typeof b.pay_structure === 'object') {
      const allowed = ['cableRun', 'termination', 'mounting', 'nvrSetup'];
      const ps = {};
      allowed.forEach(function (k) { if (b.pay_structure[k] != null && b.pay_structure[k] !== '') ps[k] = Number(b.pay_structure[k]) || 0; });
      payStruct = Object.keys(ps).length ? JSON.stringify(ps) : '';
    }
    if (b.id) {
      db.prepare('UPDATE technicians SET name=?, phone=?, email=?, skills=?, active=?, updated_at=? WHERE id=?')
        .run(name, phone, email, skills, active, ts, Number(b.id));
      if (payStruct !== undefined) db.prepare('UPDATE technicians SET pay_structure=? WHERE id=?').run(payStruct, Number(b.id));
      return json(res, { ok: true, id: Number(b.id) });
    }
    const r = db.prepare('INSERT INTO technicians (name,phone,email,skills,active,pay_structure,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(name, phone, email, skills, active, payStruct || '', ts, ts);
    json(res, { ok: true, id: Number(r.lastInsertRowid) });
  },
  'DELETE /api/technicians/:id': (req, res, url, params) => {
    const id = Number(params.id);
    db.prepare('UPDATE work_orders SET technician_id=NULL, status=CASE WHEN status=\'Assigned\' THEN \'Unassigned\' ELSE status END WHERE technician_id=?').run(id);
    db.prepare('DELETE FROM technicians WHERE id=?').run(id);
    json(res, { ok: true });
  },

  // ── Work orders ──────────────────────────────────────────────────────────
  'GET /api/workorders': (req, res) => {
    const rows = db.prepare(`
      SELECT w.*, t.name AS technician_name,
             c.business AS customer_business, c.name AS customer_name,
             c.phone AS customer_phone, c.address AS customer_address
      FROM work_orders w
      LEFT JOIN technicians t ON t.id = w.technician_id
      LEFT JOIN customers   c ON c.id = w.customer_id
      ORDER BY w.updated_at DESC
    `).all();
    rows.forEach(w => {
      w.checklist = safeParse(w.checklist) || [];
      w.addendums = safeParse(w.addendums) || [];
      w.addendum_total = w.addendums.reduce((s, a) => s + (Number(a.qty || 1) * Number(a.amount || 0)), 0);
      w.total = (Number(w.amount) || 0) + w.addendum_total;
      const done = w.checklist.filter(i => i.done).length;
      w.checklist_progress = w.checklist.length ? Math.round(done / w.checklist.length * 100) : 0;
      // "Request to schedule": signed + deposit satisfied, but not yet on the calendar
      const wpid = w.project_id || mostRecentProjectId(w.customer_id);
      const cu = db.prepare('SELECT signed_at, deposit_required FROM projects WHERE id=?').get(wpid) || {};
      const depReq = Number(cu.deposit_required) || 0;
      const depLine = db.prepare("SELECT status FROM payments WHERE project_id=? AND ext_ref='auto:deposit'").get(wpid);
      const paid = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE project_id=? AND status='Paid'").get(wpid).v;
      const depMet = depReq > 0 ? ((depLine && (depLine.status === 'Paid' || depLine.status === 'Waived')) || paid >= depReq - 0.005) : (paid > 0);
      w.signed = !!cu.signed_at;
      w.deposit_met = !!depMet;
      w.awaiting_schedule = !!cu.signed_at && depMet && !w.scheduled_date && ['Scheduled', 'In Progress', 'Completed', 'Cancelled'].indexOf(w.status) < 0;
    });
    json(res, { workOrders: rows, statuses: WO_STATUSES });
  },
  'POST /api/workorders/from-lead': async (req, res) => {
    const b = await readBody(req) || {};
    const cid = Number(b.customerId);
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(cid);
    if (!c) return json(res, { ok: false, error: 'customer not found' }, 404);
    let pid = b.projectId ? Number(b.projectId) : null;
    if (pid) { const pp = getProject(pid); if (!pp || Number(pp.customer_id) !== cid) pid = null; }
    if (!pid) pid = mostRecentProjectId(cid);
    if (!pid) return json(res, { ok: false, error: 'no project' }, 404);
    const woId = createWOFromLead(pid);
    addLog(cid, { kind: 'event', visibility: 'internal', body: 'Work order created: ' + ((c.business || c.name || 'Job') + ' — Installation'), author: 'System', project_id: pid });
    json(res, { ok: true, id: woId });
  },
  'PATCH /api/workorders/:id': async (req, res, url, params) => {
    const b = await readBody(req) || {};
    // Auto status transitions (server-side, so any client gets them) unless the
    // caller set status explicitly: assign a tech → Assigned; set a date → Scheduled.
    if (!('status' in b)) {
      const cur = db.prepare('SELECT status FROM work_orders WHERE id=?').get(Number(params.id));
      if (cur) {
        if ('technician_id' in b && b.technician_id && cur.status === 'Unassigned') b.status = 'Assigned';
        if ('technician_id' in b && !b.technician_id && cur.status === 'Assigned') b.status = 'Unassigned';
        if ('scheduled_date' in b && clean(b.scheduled_date) && (b.status === 'Assigned' || cur.status === 'Assigned')) b.status = 'Scheduled';
      }
    }
    const allowed = ['title', 'technician_id', 'status', 'scheduled_date', 'time_window', 'amount', 'notes',
                     'checklist', 'addendums', 'qc_status', 'qc_notes', 'follow_up_date', 'follow_up_note', 'reschedule_requested', 'reschedule_note'];
    const sets = [], vals = [];
    allowed.forEach(f => {
      if (f in b) {
        sets.push(f + '=?');
        if (f === 'technician_id') vals.push(b[f] == null || b[f] === '' ? null : Number(b[f]));
        else if (f === 'amount') vals.push(Number(b[f]) || 0);
        else if (f === 'reschedule_requested') vals.push(b[f] ? 1 : 0);
        else if (f === 'checklist' || f === 'addendums') vals.push(JSON.stringify(b[f] || []));
        else vals.push(clean(b[f]));
      }
    });
    // Booking (or re-booking) a date clears any pending reschedule request
    if ('scheduled_date' in b && clean(b.scheduled_date) && !('reschedule_requested' in b)) { sets.push('reschedule_requested=?'); vals.push(0); }
    if (!sets.length) return json(res, { ok: false, error: 'no fields' }, 400);
    sets.push('updated_at=?'); vals.push(now()); vals.push(Number(params.id));
    db.prepare(`UPDATE work_orders SET ${sets.join(', ')} WHERE id=?`).run(...vals);
    json(res, { ok: true });
  },
  'DELETE /api/workorders/:id': (req, res, url, params) => {
    db.prepare('DELETE FROM work_orders WHERE id=?').run(Number(params.id));
    json(res, { ok: true });
  },

  // ── Payroll (technician pay records from the TPC tool) ──────────────────────
  'GET /api/payroll': (req, res) => {
    const rows = db.prepare(`
      SELECT p.*, t.name AS roster_name
      FROM payroll p LEFT JOIN technicians t ON t.id = p.technician_id
      ORDER BY p.job_date DESC, p.created_at DESC
    `).all();
    json(res, { payroll: rows });
  },
  'GET /api/payroll/stats': (req, res) => {
    const pending = db.prepare("SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payroll WHERE status='Pending'").get();
    const paid = db.prepare("SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payroll WHERE status='Paid'").get();
    // current week (Mon–Sun) by job_date
    const d = new Date(); const day = (d.getDay() + 6) % 7; // 0=Mon
    const monday = new Date(d); monday.setDate(d.getDate() - day); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const iso = x => x.toISOString().slice(0, 10);
    const week = db.prepare('SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payroll WHERE job_date BETWEEN ? AND ?')
      .get(iso(monday), iso(sunday));
    const byTech = db.prepare(`
      SELECT COALESCE(NULLIF(technician_name,''),'(unnamed)') name, COUNT(*) n,
             COALESCE(SUM(amount),0) total,
             COALESCE(SUM(CASE WHEN status='Pending' THEN amount ELSE 0 END),0) pending
      FROM payroll GROUP BY technician_name ORDER BY total DESC
    `).all();
    json(res, { pending, paid, week: { ...week, start: iso(monday), end: iso(sunday) }, byTech });
  },
  'POST /api/payroll': async (req, res) => {
    const b = await readBody(req) || {};
    const ts = now();
    const name = clean(b.technician_name);
    // link to (or create) a roster technician by name
    let techId = b.technician_id ? Number(b.technician_id) : null;
    if (!techId && name) {
      const ex = db.prepare('SELECT id FROM technicians WHERE lower(name)=lower(?)').get(name);
      if (ex) techId = ex.id;
      else techId = Number(db.prepare('INSERT INTO technicians (name,active,created_at,updated_at) VALUES (?,?,?,?)').run(name, 1, ts, ts).lastInsertRowid);
    }
    const fields = {
      technician_id: techId, technician_name: name, client: clean(b.client), location: clean(b.location),
      work_order_id: clean(b.work_order_id), job_date: clean(b.job_date), vehicle: clean(b.vehicle),
      amount: Number(b.amount) || 0, status: clean(b.status) || 'Pending',
      snapshot_json: typeof b.snapshot === 'string' ? b.snapshot : JSON.stringify(b.snapshot || {}),
    };
    let payId;
    if (b.id) {
      const sets = Object.keys(fields).map(k => k + '=?');
      db.prepare(`UPDATE payroll SET ${sets.join(', ')}, updated_at=? WHERE id=?`)
        .run(...Object.values(fields), ts, Number(b.id));
      payId = Number(b.id);
    } else {
      const r = db.prepare(`INSERT INTO payroll (technician_id,technician_name,client,location,work_order_id,job_date,vehicle,amount,status,snapshot_json,created_at,updated_at)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(fields.technician_id, fields.technician_name, fields.client, fields.location, fields.work_order_id,
             fields.job_date, fields.vehicle, fields.amount, fields.status, fields.snapshot_json, ts, ts);
      payId = Number(r.lastInsertRowid);
    }
    // Log a version unless this was a tiny auto-save with no real change (caller may pass note)
    if (!b.noVersion) {
      logVersion('payroll', payId, { snapshot: fields.snapshot_json, total: fields.amount,
        label: fields.client, editedBy: fields.technician_name, note: clean(b.note) || (b.id ? 'revised' : 'created') });
    }
    json(res, { ok: true, id: payId, technician_id: techId });
  },
  // GET /api/payroll/:id  (record + version history)
  'GET /api/payroll/:id': (req, res, url, params) => {
    const p = db.prepare('SELECT * FROM payroll WHERE id=?').get(Number(params.id));
    if (!p) return json(res, { error: 'not found' }, 404);
    // A technician may only read their OWN pay record — never another tech's
    if (req.user && req.user.role === 'tech' && Number(p.technician_id) !== Number(req.user.technician_id))
      return json(res, { error: 'forbidden' }, 403);
    p.snapshot = safeParse(p.snapshot_json); delete p.snapshot_json;
    p.versions = db.prepare('SELECT id,version_no,total,edited_by,note,created_at FROM versions WHERE entity_type=? AND entity_id=? ORDER BY version_no DESC').all('payroll', p.id);
    json(res, p);
  },
  'PATCH /api/payroll/:id': async (req, res, url, params) => {
    const b = await readBody(req) || {};
    const allowed = ['status', 'amount', 'client', 'work_order_id', 'job_date', 'technician_name'];
    const sets = [], vals = [];
    allowed.forEach(f => { if (f in b) { sets.push(f + '=?'); vals.push(f === 'amount' ? (Number(b[f]) || 0) : clean(b[f])); } });
    if (!sets.length) return json(res, { ok: false, error: 'no fields' }, 400);
    sets.push('updated_at=?'); vals.push(now()); vals.push(Number(params.id));
    db.prepare(`UPDATE payroll SET ${sets.join(', ')} WHERE id=?`).run(...vals);
    json(res, { ok: true });
  },
  'DELETE /api/payroll/:id': (req, res, url, params) => {
    db.prepare('DELETE FROM payroll WHERE id=?').run(Number(params.id));
    db.prepare('DELETE FROM versions WHERE entity_type=? AND entity_id=?').run('payroll', Number(params.id));
    json(res, { ok: true });
  },

  // ── Generic submissions (Toast Drop calc + any future tool) — versioned ─────
  'GET /api/submissions': (req, res, url) => {
    const tool = url.searchParams.get('tool');
    const rows = tool
      ? db.prepare('SELECT id,tool,label,client,total,status,edited_by,version,updated_at FROM submissions WHERE tool=? ORDER BY updated_at DESC').all(tool)
      : db.prepare('SELECT id,tool,label,client,total,status,edited_by,version,updated_at FROM submissions ORDER BY updated_at DESC').all();
    json(res, { submissions: rows });
  },
  'GET /api/submissions/:id': (req, res, url, params) => {
    const s = db.prepare('SELECT * FROM submissions WHERE id=?').get(Number(params.id));
    if (!s) return json(res, { error: 'not found' }, 404);
    s.snapshot = safeParse(s.snapshot_json); delete s.snapshot_json;
    s.versions = db.prepare('SELECT id,version_no,total,edited_by,note,created_at FROM versions WHERE entity_type=? AND entity_id=? ORDER BY version_no DESC').all('submission', s.id);
    json(res, s);
  },
  'POST /api/submissions': async (req, res) => {
    const b = await readBody(req) || {};
    const ts = now();
    const fields = {
      tool: clean(b.tool) || 'tool', label: clean(b.label), client: clean(b.client),
      total: Number(b.total) || 0, status: clean(b.status) || 'Draft',
      snapshot_json: typeof b.snapshot === 'string' ? b.snapshot : JSON.stringify(b.snapshot || {}),
      edited_by: clean(b.edited_by),
    };
    let id, version;
    if (b.id) {
      const cur = db.prepare('SELECT version FROM submissions WHERE id=?').get(Number(b.id));
      version = (cur && cur.version ? cur.version : 1) + 1;
      db.prepare(`UPDATE submissions SET tool=?, label=?, client=?, total=?, status=?, snapshot_json=?, edited_by=?, version=?, updated_at=? WHERE id=?`)
        .run(fields.tool, fields.label, fields.client, fields.total, fields.status, fields.snapshot_json, fields.edited_by, version, ts, Number(b.id));
      id = Number(b.id);
    } else {
      version = 1;
      const r = db.prepare(`INSERT INTO submissions (tool,label,client,total,status,snapshot_json,edited_by,version,created_at,updated_at)
                            VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(fields.tool, fields.label, fields.client, fields.total, fields.status, fields.snapshot_json, fields.edited_by, 1, ts, ts);
      id = Number(r.lastInsertRowid);
    }
    if (!b.noVersion) {
      logVersion('submission', id, { snapshot: fields.snapshot_json, total: fields.total,
        label: fields.label, editedBy: fields.edited_by, note: clean(b.note) || (b.id ? 'revised' : 'created') });
    }
    json(res, { ok: true, id, version });
  },
  'DELETE /api/submissions/:id': (req, res, url, params) => {
    db.prepare('DELETE FROM submissions WHERE id=?').run(Number(params.id));
    db.prepare('DELETE FROM versions WHERE entity_type=? AND entity_id=?').run('submission', Number(params.id));
    json(res, { ok: true });
  },

  // GET /api/versions/:type/:id  — full version list with snapshots for an entity
  'GET /api/versions/:type/:id': (req, res, url, params) => {
    const rows = db.prepare('SELECT * FROM versions WHERE entity_type=? AND entity_id=? ORDER BY version_no DESC').all(clean(params.type), Number(params.id));
    rows.forEach(v => { v.snapshot = safeParse(v.snapshot_json); delete v.snapshot_json; });
    json(res, { versions: rows });
  },
};

// ── Tiny router ─────────────────────────────────────────────────────────────
function matchRoute(method, pathname) {
  for (const key of Object.keys(api)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const pParts = pattern.split('/').filter(Boolean);
    const uParts = pathname.split('/').filter(Boolean);
    if (pParts.length !== uParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(':')) params[pParts[i].slice(1)] = decodeURIComponent(uParts[i]);
      else if (pParts[i] !== uParts[i]) { ok = false; break; }
    }
    if (ok) return { handler: api[key], params };
  }
  return null;
}

// ── HTTP server ─────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

// Public API paths (no login required). Everything else needs a session once
// at least one account exists (authEnabled). Until then the app stays open.
function isPublicApi(method, pathname) {
  if (pathname === '/api/me' || pathname === '/api/login' || pathname === '/api/logout' ||
      pathname === '/api/setup' || pathname === '/api/signup' || pathname === '/api/switch-role' ||
      pathname === '/api/config' || pathname === '/api/auth/google') return true;
  if (pathname.startsWith('/api/sign/')) return true;        // tokened public signing page
  if (pathname.startsWith('/api/pub/')) return true;         // tokened public proposal link page
  if (pathname.startsWith('/api/address/')) return true;     // address autocomplete proxy
  if (pathname === '/api/geocode') return true;              // address → lat/lon proxy (key server-side)
  if (pathname === '/api/staticmap') return true;            // Google satellite tile proxy
  return false;
}
// A logged-in technician may only touch these (everything else is admin-only).
// Deliberately NOT allowed: /api/submissions (Toast = customer retail pricing) and
// /api/versions/* (a generic snapshot dumper that leaks other techs' pay + Toast retail).
function techAllowed(method, pathname) {
  if (method === 'GET' && /^\/api\/project\/\d+$/.test(pathname)) return true;   // forced tech scope
  if (pathname === '/api/my-workorders') return true;
  if (method === 'PATCH' && /^\/api\/workorders\/\d+$/.test(pathname)) return true;  // checklist/QC on their job
  if (method === 'POST' && /^\/api\/workorders\/\d+\/accept$/.test(pathname)) return true;  // accept their assigned job
  if (method === 'POST' && pathname === '/api/payroll') return true;                 // their pay calc
  if (method === 'GET' && /^\/api\/payroll\/\d+$/.test(pathname)) return true;       // own pay only (ownership checked in handler)
  if (method === 'GET' && pathname === '/api/technicians') return true;             // roster names
  // Site surveys: techs may create/view/edit floor plans (no retail pricing rides on survey docs).
  if (method === 'GET' && pathname === '/api/surveys') return true;                  // survey worklist
  if (method === 'POST' && pathname === '/api/survey-share') return true;            // host a /sv/<token> survey page
  if (method === 'POST' && /^\/api\/project\/\d+\/documents$/.test(pathname)) return true;  // save survey-state/plan/pdf (source enforced in handler)
  if (method === 'GET' && /^\/api\/customers\/\d+\/projects$/.test(pathname)) return true;  // project switcher on the survey page
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    req.user = currentUser(req);

    // API
    if (pathname.startsWith('/api/')) {
      // ── Access control (only enforced once an account exists) ──────────────
      if (authEnabled() && !isPublicApi(req.method, pathname)) {
        const u = req.user;
        const isProjectGet = req.method === 'GET' && /^\/api\/project\/\d+$/.test(pathname);
        // The path :id is the CUSTOMER id (legacy); ?project=<pid> may override which project is targeted.
        // For ownership we resolve the targeted project to its owning customer so a caller can't reach
        // another customer's project by pairing their own customer-id path with a foreign ?project=.
        const projParam = Number(url.searchParams.get('project')) || 0;
        let projOwner = null, projBad = false;
        if (projParam) {
          const pr = db.prepare('SELECT customer_id FROM projects WHERE id=?').get(projParam);
          if (pr) projOwner = Number(pr.customer_id); else projBad = true;   // ?project= points nowhere
        }
        // Customer self-service actions (Need Help / Start Another Project) — own project, by login OR token
        const action = req.method === 'POST' && pathname.match(/^\/api\/project\/(\d+)\/(help|new-lead|deposit-claim|balance-claim|approve-completion|reschedule-request|addendum-decision)$/);
        if (action) {
          if (projBad) return json(res, { error: 'forbidden' }, 403);
          const cid = projOwner != null ? projOwner : Number(action[1]);   // owning customer of the targeted project
          const byUser = u && (u.role === 'admin' || u.role === 'manager' || (u.role === 'customer' && Number(u.customer_id) === cid));
          const tok = url.searchParams.get('token');
          const byTok = !byUser && tok && db.prepare('SELECT 1 FROM customers WHERE id=? AND access_token=?').get(cid, tok);
          if (!byUser && !byTok) return json(res, { error: 'forbidden' }, 403);
          // allowed → fall through to the route
        } else if (!u && isProjectGet) {
          // Customer reaching their own project via the secure share token
          if (projBad) return json(res, { error: 'unauthorized' }, 401);
          const cid = projOwner != null ? projOwner : Number(pathname.split('/')[3]);
          const tok = url.searchParams.get('token');
          const row = tok && db.prepare('SELECT access_token FROM customers WHERE id=?').get(cid);
          if (row && row.access_token && tok === row.access_token) url.searchParams.set('scope', 'external');
          else return json(res, { error: 'unauthorized' }, 401);
        } else if (!u) {
          return json(res, { error: 'unauthorized' }, 401);
        } else if (u.role === 'admin' || u.role === 'manager') {
          // full operations access — admin-only endpoints (/api/users, setup) self-check inside
        } else if (u.role === 'tech') {
          if (req.method === 'GET' && /^\/api\/documents\/\d+\/file$/.test(pathname)) {
            // A tech may only open the floor-plan doc of a job they're actually dispatched to
            const doc = db.prepare('SELECT customer_id,source FROM documents WHERE id=?').get(Number(pathname.split('/')[3]));
            const okSrc = doc && (doc.source === 'survey-plan' || doc.source === 'survey-pdf');
            const assigned = doc && u.technician_id &&
              db.prepare('SELECT 1 FROM work_orders WHERE customer_id=? AND technician_id=? LIMIT 1').get(Number(doc.customer_id), Number(u.technician_id));
            if (!okSrc || !assigned) return json(res, { error: 'forbidden' }, 403);
          } else {
            if (!techAllowed(req.method, pathname)) return json(res, { error: 'forbidden' }, 403);
            if (isProjectGet) url.searchParams.set('scope', 'tech');   // techs never get costs
          }
        } else if (u.role === 'customer') {
          // A customer login may only touch THEIR OWN project + their own document files
          const cid = Number(u.customer_id) || -1;
          if (projBad) return json(res, { error: 'forbidden' }, 403);
          const targetCust = projOwner != null ? projOwner : Number(pathname.split('/')[3]);
          if (isProjectGet) {
            if (targetCust !== cid) return json(res, { error: 'forbidden' }, 403);
            url.searchParams.set('scope', 'external');
          } else if (req.method === 'POST' && /^\/api\/project\/\d+\/sign$/.test(pathname)) {
            if (targetCust !== cid) return json(res, { error: 'forbidden' }, 403);
          } else if (req.method === 'GET' && /^\/api\/documents\/\d+\/file$/.test(pathname)) {
            const doc = db.prepare('SELECT customer_id FROM documents WHERE id=?').get(Number(pathname.split('/')[3]));
            if (!doc || Number(doc.customer_id) !== cid) return json(res, { error: 'forbidden' }, 403);
          } else if (req.method === 'GET' && /^\/api\/customers\/\d+\/projects$/.test(pathname)) {
            // A customer may list THEIR OWN projects (drives the portal/project switcher)
            if (Number(pathname.split('/')[3]) !== cid) return json(res, { error: 'forbidden' }, 403);
          } else {
            return json(res, { error: 'forbidden' }, 403);
          }
        } else {
          // logged in but no role assigned yet (pending) — no data access
          return json(res, { error: 'pending', message: 'Your account is awaiting an admin to grant access.' }, 403);
        }
      }
      const route = matchRoute(req.method, pathname);
      if (route) return await route.handler(req, res, url, route.params);
      return json(res, { error: 'no route' }, 404);
    }

    // Short signing link:  /s/<token>  ->  serve the signing page (token read client-side)
    if (/^\/s\/[A-Za-z0-9_-]+$/.test(pathname)) return serveStatic('/sign.html', res);
    if (/^\/p\/[A-Za-z0-9_-]+$/.test(pathname)) return serveStatic('/proposal.html', res);
    // Standalone survey share: /sv/<token> streams the self-contained floor-plan HTML stored in survey_shares.
    if (/^\/sv\/[A-Za-z0-9_-]+$/.test(pathname)) {
      const sh = db.prepare('SELECT html FROM survey_shares WHERE token=?').get(pathname.slice(4));
      if (!sh) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<body style="font-family:sans-serif;background:#0B0F1A;color:#fff;text-align:center;padding:60px"><h2>Survey link not found or expired.</h2></body>'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(sh.html);
    }

    // Static files
    return serveStatic(pathname, res);
  } catch (err) {
    console.error(err);
    json(res, { error: String(err && err.message || err) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`\n  IOT Techs proposal app running`);
  console.log(`  →  http://localhost:${PORT}`);
  console.log(`  DB:   ${path.join(DATA_DIR, 'iot.db')}\n`);
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function json(res, obj, status = 200) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(s);
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 20e6) req.destroy(); });
    req.on('end', () => resolve(safeParse(data)));
    req.on('error', () => resolve(null));
  });
}

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/home.html';
  // Prevent path traversal
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}
