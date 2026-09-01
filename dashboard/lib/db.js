import { DatabaseSync } from "node:sqlite";
import { mkdirSync, copyFileSync, existsSync, rmSync, statSync } from "node:fs";
import { createHash, randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";
import path from "node:path";
import { parseUserAgent, deviceFingerprint } from "./device.js";
import { makeAccessId, stageLabel, SERVICE_CODES } from "./spec.js";
import { missingReqs, nextStageOf, AUTO_STAGES, MASTER_ORDER } from "./stage-flow.js";
import { toolHasData, toolFingerprint } from "./tool-data.js";
import { optionTotals } from "./proposal.js";
import { HIRING_STATUSES, statusLabel, portalOfStatus, legacyStageFromStatus, resolveHiring } from "./hiring.js";

// Passwords use scrypt with a per-user random salt — stored as "scrypt$<salt>$<hash>".
// Legacy accounts were a single unsalted SHA-256; verifyPw still accepts those so existing
// logins keep working, and verifyUserByCredential upgrades them to scrypt on next sign-in.
const LEGACY_SALT = "iot_techs_2026";
const legacyHash = (pw) => createHash("sha256").update(String(pw) + LEGACY_SALT).digest("hex");

function hashPw(pw) {
  const salt = randomBytes(16).toString("hex");
  const dk = scryptSync(String(pw), salt, 64).toString("hex");
  return `scrypt$${salt}$${dk}`;
}

function verifyPw(pw, stored) {
  if (!stored) return false;
  if (stored.startsWith("scrypt$")) {
    const [, salt, hash] = stored.split("$");
    if (!salt || !hash) return false;
    const dk = scryptSync(String(pw), salt, 64);
    const want = Buffer.from(hash, "hex");
    return dk.length === want.length && timingSafeEqual(dk, want);
  }
  // Legacy unsalted SHA-256 — constant-length hex, so a direct compare is fine.
  return legacyHash(pw) === stored;
}

// True when a stored hash is still in the legacy (non-scrypt) format and should be re-hashed.
const isLegacyHash = (stored) => !!stored && !String(stored).startsWith("scrypt$");

const STAFF = [
  { name: "Admin",        username: "admin",   email: "admin@iot-techs.com",   phone: null,             password: "password", role: "admin"   },
  { name: "Manager",      username: "manager", email: "manager@iot-techs.com", phone: null,             password: "password", role: "manager" },
  { name: "Sales Rep",    username: "sales",   email: "sales@iot-techs.com",   phone: null,             password: "password", role: "sales"   },
  { name: "Marco (Tech)", username: "marco",   email: "marco@iot-techs.com",   phone: "(646) 555-0101", password: "password", role: "tech"    },
  { name: "Devon (Tech)", username: "devon",   email: "devon@iot-techs.com",   phone: "(646) 555-0102", password: "password", role: "tech"    },
];

const STAGE_FOR_STATUS = {
  lead: "inquiry", open: "inquiry", survey: "site_survey",
  quoted: "proposal", approved: "approval_deposit",
  awaiting_parts: "schedule", scheduled: "schedule",
  dispatched: "install", installing: "install", onsite: "install",
  closed: "completion",
};

// Contact info from intake form — keyed by customer name.
// Used both in fresh seed and to backfill existing rows.
const CONTACT_INFO = {
  "Riverside Auto Body": { n: "Marco Diaz",       e: "mdiaz@riversideauto.com",   p: "(646) 555-0142", m: "Need 8 cameras for lot and garage entrance. Vandalism concern.", s: "web" },
  "Lakeshore Pharmacy":  { n: "Diana Chen",        e: "d.chen@lakeshorerx.com",    p: "(718) 555-0241", m: "Replacing old analog system. 12 cams for storefront and parking.", s: "referral" },
  "Greenfield Storage":  { n: "Sam Greenfield",    e: "sam@gfstore.com",            p: "(732) 555-0039", m: "Large facility. 24 cameras for aisles and exterior.", s: "web" },
  "Westend Warehouse":   { n: "Bill Tonner",       e: "b.tonner@westendwh.com",    p: "(201) 555-0318", m: "Industrial warehouse. 32 cameras for docks and perimeter.", s: "referral" },
  "Corner Liquor":       { n: "Tony Marino",       e: "tony@cornerliquor.com",     p: "(718) 555-0451", m: "6 cameras, PTZ for counter. After-hours vandalism concern.", s: "web" },
  "Hillview Apartments": { n: "Maria Santos",      e: "m.santos@hillviewapts.com", p: "(646) 555-0733", m: "16 cameras for entrances, parking, lobby.", s: "referral" },
  "Sunrise Daycare":     { n: "Kelly Kim",         e: "k.kim@sunrisedaycare.com",  p: "(646) 555-0812", m: "5 cameras. Need parent remote access for classrooms.", s: "web" },
  "Metro Dental":        { n: "Dr. Carlos Ruiz",   e: "c.ruiz@metrodental.com",    p: "(212) 555-0661", m: "4 cameras for reception and parking area.", s: "web" },
  "Bayview Diner":       { n: "Robert Banks",      e: "r.banks@bayviewdiner.com",  p: "(718) 555-0504", m: null, s: "existing" },
  "Park Plaza Mall":     { n: "Management Office", e: "mgmt@parkplaza.com",        p: "(201) 555-0900", m: null, s: "existing" },
  // Residential
  "Martinez Residence":  { n: "James Martinez",    e: "jmartinez@gmail.com",       p: "(201) 555-0177", m: "4 cameras — front door, driveway, backyard, and side gate. Had a break-in last year.", s: "web" },
  "Thompson Home":       { n: "Linda Thompson",    e: "l.thompson@gmail.com",      p: "(973) 555-0394", m: "Full alarm system for colonial. 3 bed 2 bath, two floors.", s: "web" },
  "Patel Residence":     { n: "Raj Patel",         e: "raj.patel@gmail.com",       p: "(973) 555-0528", m: "New construction — security cameras + alarm system. Want to do it right from the start.", s: "referral" },
  "Sullivan Home":       { n: "Kevin Sullivan",    e: "k.sullivan@gmail.com",      p: "(908) 555-0763", m: "Whole-home audio, 5 zones. Living room, kitchen, master, patio, garage.", s: "referral" },
};

const SEED = [
  // Commercial — active
  { n:1042, svc:"SC", type:"A", category:"open",      customer:"Riverside Auto Body", address:"2503 Jay Pl, Bronx, NY 10462",              cameras:8,  value:6400,  status:"installing",    tech:"Marco", date:"2026-06-24", issue:null },
  { n:1041, svc:"SC", type:"A", category:"open",      customer:"Lakeshore Pharmacy",  address:"118 Lake St, Weehawken, NJ 07086",          cameras:12, value:9800,  status:"scheduled",     tech:"Devon", date:"2026-06-27", issue:null },
  { n:1039, svc:"SC", type:"A", category:"open",      customer:"Greenfield Storage",  address:"44 Industrial Pkwy, Secaucus, NJ 07094",    cameras:24, value:21500, status:"approved",      tech:null,    date:null,         issue:null },
  { n:1031, svc:"AS", type:"A", category:"open",      customer:"Westend Warehouse",   address:"1200 Dock Rd, Newark, NJ 07114",            cameras:32, value:28900, status:"installing",    tech:"Devon", date:"2026-06-23", issue:null },
  // Commercial — pending
  { n:1038, svc:"SC", type:"A", category:"pending",   customer:"Corner Liquor",       address:"900 Main St, Hackensack, NJ 07601",         cameras:6,  value:4100,  status:"quoted",        tech:null,    date:null,         issue:null },
  { n:1036, svc:"SC", type:"A", category:"pending",   customer:"Hillview Apartments", address:"77 Hill Rd, Fort Lee, NJ 07024",            cameras:16, value:13200, status:"quoted",        tech:null,    date:null,         issue:null },
  { n:1035, svc:"SC", type:"A", category:"pending",   customer:"Sunrise Daycare",     address:"210 Elm Ave, Bergenfield, NJ 07621",        cameras:5,  value:3600,  status:"survey",        tech:"Marco", date:"2026-06-25", issue:null },
  { n:1033, svc:"SC", type:"A", category:"pending",   customer:"Metro Dental",        address:"55 Center Blvd, Jersey City, NJ 07306",     cameras:4,  value:2900,  status:"lead",          tech:null,    date:null,         issue:null },
  // Upgrades
  { n:3104, svc:"SC", type:"B", category:"upgrade",   customer:"Bayview Diner",       address:"8 Harbor Way, Bayonne, NJ 07002",           cameras:4,  value:3200,  status:"approved",      tech:null,    date:null,         issue:"Add 4 cams to rear lot" },
  { n:3102, svc:"AC", type:"B", category:"upgrade",   customer:"Park Plaza Mall",     address:"500 Plaza Dr, Paramus, NJ 07652",           cameras:0,  value:5400,  status:"scheduled",     tech:"Devon", date:"2026-06-30", issue:"NVR + storage upgrade" },
  // Service calls
  { n:2207, svc:"SC", type:"C", category:"service",   customer:"Bayview Diner",       address:"8 Harbor Way, Bayonne, NJ 07002",           cameras:7,  value:180,   status:"dispatched",    tech:"Marco", date:"2026-06-24", issue:"Cam 3 offline" },
  { n:2206, svc:"AC", type:"C", category:"service",   customer:"Park Plaza Mall",     address:"500 Plaza Dr, Paramus, NJ 07652",           cameras:40, value:0,     status:"awaiting_parts",tech:"Devon", date:"2026-06-26", issue:"NVR hard drive failure" },
  { n:2204, svc:"SC", type:"C", category:"service",   customer:"Greenfield Storage",  address:"44 Industrial Pkwy, Secaucus, NJ 07094",    cameras:24, value:150,   status:"open",          tech:null,    date:null,         issue:"Night vision blurry, 2 cams" },
  // Completed commercial
  { n:1028, svc:"SC", type:"A", category:"completed", customer:"Bayview Diner",       address:"8 Harbor Way, Bayonne, NJ 07002",           cameras:7,  value:5200,  status:"closed",        tech:"Marco", date:"2026-06-18", issue:null },
  { n:1025, svc:"AC", type:"A", category:"completed", customer:"Park Plaza Mall",     address:"500 Plaza Dr, Paramus, NJ 07652",           cameras:40, value:41000, status:"closed",        tech:"Devon", date:"2026-06-12", issue:null },
  { n:1019, svc:"SC", type:"A", category:"completed", customer:"Lakeshore Pharmacy",  address:"118 Lake St, Weehawken, NJ 07086",          cameras:6,  value:4800,  status:"closed",        tech:"Marco", date:"2026-05-30", issue:null },
  // Residential — new
  { n:1044, svc:"SC", type:"A", category:"open",      customer:"Martinez Residence",  address:"147 Maple Ave, Ridgewood, NJ 07450",        cameras:4,  value:2800,  status:"installing",    tech:"Marco", date:"2026-06-25", issue:null },
  { n:1043, svc:"AS", type:"A", category:"pending",   customer:"Thompson Home",       address:"83 Oak Lane, Montclair, NJ 07042",          cameras:0,  value:3200,  status:"survey",        tech:"Marco", date:"2026-06-26", issue:null },
  { n:1045, svc:"MX", type:"A", category:"pending",   customer:"Patel Residence",     address:"29 Birch St, Livingston, NJ 07039",         cameras:6,  value:5100,  status:"quoted",        tech:null,    date:null,         issue:null },
  { n:1047, svc:"SS", type:"A", category:"completed", customer:"Sullivan Home",       address:"612 Cedar Ave, Summit, NJ 07901",           cameras:0,  value:4400,  status:"closed",        tech:"Devon", date:"2026-06-15", issue:null },
];

// Resolve the directory the SQLite file lives in. DB_DIR wins when set. Otherwise: on Hostinger's
// atomic Git deploys the app runs from `.../<site>/hbuilds/versions/<hash>/…`, and that whole
// versioned folder is REPLACED on every push — a DB written inside it is silently wiped each deploy.
// Detect that layout and anchor the data ABOVE `hbuilds` (the stable domain root) so it persists
// across deploys with no env config. Everywhere else, fall back to ./data next to the app.
export function dbDir() {
  if (process.env.DB_DIR) return process.env.DB_DIR;
  const cwd = process.cwd();
  const marker = cwd.indexOf(`${path.sep}hbuilds${path.sep}`);
  if (marker !== -1) return path.join(cwd.slice(0, marker), "persistent-data");
  return path.join(cwd, "data");
}

function init() {
  // DB lives on disk. Locally that's ./data; in production DB_DIR (or the hbuilds anchor in dbDir())
  // points at a PERSISTENT location so the database survives deploys and restarts.
  const dir = dbDir();
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "dashboard.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      email         TEXT,
      phone         TEXT,
      password_hash TEXT,
      role          TEXT NOT NULL DEFAULT 'customer',
      created_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(email),
      UNIQUE(phone)
    );
  `);

  const uCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!uCols.includes("phone"))        db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  if (!uCols.includes("username"))     db.exec("ALTER TABLE users ADD COLUMN username TEXT");
  if (!uCols.includes("disabled"))     db.exec("ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0");
  // Lead-capture flows (quick-start, demo request) stamp a placeholder password (phone digits,
  // or "customer") on the account so it can be PIN-accessed immediately — that's never a password
  // the customer actually chose. password_set distinguishes "has SOME hash" from "has a password
  // the account owner deliberately set" so userHasPassword() can tell registration it's still safe
  // to write their real chosen password, instead of bouncing them with "you already have an account."
  if (!uCols.includes("password_set")) db.exec("ALTER TABLE users ADD COLUMN password_set INTEGER DEFAULT 0");
  // Per-user PIN override (internal users). Owner rule: an internal user's project PIN is the
  // last 4 of THEIR phone; pin_custom (4 digits) overrides it when set. NULL = follow the phone.
  if (!uCols.includes("pin_custom"))   db.exec("ALTER TABLE users ADD COLUMN pin_custom TEXT");
  // Technician certification, stamped when a candidate becomes an Approved Technician (Portal 3).
  // { active, tier, badges:[], approved_at, from_app } — operations gates work-order eligibility on it.
  if (!uCols.includes("tech_cert"))    db.exec("ALTER TABLE users ADD COLUMN tech_cert TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email    ON users(email)    WHERE email    IS NOT NULL");

  // Seed staff — DO NOTHING if email already exists so admin edits are never overwritten
  const userStmt = db.prepare(
    "INSERT INTO users (name, username, email, phone, password_hash, role, password_set) VALUES (?,?,?,?,?,?,1) ON CONFLICT(email) DO NOTHING"
  );
  for (const u of STAFF) {
    userStmt.run(u.name, u.username, u.email, u.phone || null, hashPw(u.password), u.role);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      access_id     TEXT UNIQUE NOT NULL,
      customer      TEXT NOT NULL,
      address       TEXT,
      service_code  TEXT NOT NULL,
      project_type  TEXT NOT NULL,
      category      TEXT NOT NULL,
      stage         TEXT NOT NULL,
      status        TEXT NOT NULL,
      cameras       INTEGER DEFAULT 0,
      value         INTEGER DEFAULT 0,
      tech          TEXT,
      date          TEXT,
      issue         TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  const cols = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
  if (!cols.includes("customer_pin"))    db.exec("ALTER TABLE projects ADD COLUMN customer_pin TEXT");
  // pin_custom = 1 means an admin hand-set the PIN; the last-4-phone normalizer leaves those alone.
  if (!cols.includes("pin_custom"))      db.exec("ALTER TABLE projects ADD COLUMN pin_custom INTEGER DEFAULT 0");
  if (!cols.includes("tech_pin"))        db.exec("ALTER TABLE projects ADD COLUMN tech_pin TEXT");
  // Field-created project (a tech logged a legacy/on-site job with just name + address). needs_details=1
  // flags it "missing details" for the office to complete later; clears once a phone is on file.
  if (!cols.includes("needs_details"))   db.exec("ALTER TABLE projects ADD COLUMN needs_details INTEGER DEFAULT 0");
  if (!cols.includes("created_by_name")) db.exec("ALTER TABLE projects ADD COLUMN created_by_name TEXT");
  // Internal / legacy job (no customer sale): the work order skips the customer sign+deposit gate.
  // Set automatically for field-created jobs; also toggleable on any project by admin/manager.
  if (!cols.includes("internal_job"))    db.exec("ALTER TABLE projects ADD COLUMN internal_job INTEGER DEFAULT 0");
  if (!cols.includes("contact_name"))    db.exec("ALTER TABLE projects ADD COLUMN contact_name TEXT");
  if (!cols.includes("contact_email"))   db.exec("ALTER TABLE projects ADD COLUMN contact_email TEXT");
  if (!cols.includes("contact_phone"))   db.exec("ALTER TABLE projects ADD COLUMN contact_phone TEXT");
  if (!cols.includes("contact_message")) db.exec("ALTER TABLE projects ADD COLUMN contact_message TEXT");
  if (!cols.includes("source"))          db.exec("ALTER TABLE projects ADD COLUMN source TEXT DEFAULT 'internal'");
  if (!cols.includes("company_name"))    db.exec("ALTER TABLE projects ADD COLUMN company_name TEXT");
  if (!cols.includes("install_date"))    db.exec("ALTER TABLE projects ADD COLUMN install_date TEXT");
  if (!cols.includes("lost_reason"))       db.exec("ALTER TABLE projects ADD COLUMN lost_reason TEXT");
  if (!cols.includes("lost_at"))           db.exec("ALTER TABLE projects ADD COLUMN lost_at TEXT");
  if (!cols.includes("needs_attention"))    db.exec("ALTER TABLE projects ADD COLUMN needs_attention INTEGER DEFAULT 0");
  if (!cols.includes("attention_note"))     db.exec("ALTER TABLE projects ADD COLUMN attention_note TEXT");
  if (!cols.includes("commission_rate"))    db.exec("ALTER TABLE projects ADD COLUMN commission_rate REAL DEFAULT 0");
  if (!cols.includes("commission_status"))  db.exec("ALTER TABLE projects ADD COLUMN commission_status TEXT DEFAULT 'pending'");
  if (!cols.includes("sales_rep"))          db.exec("ALTER TABLE projects ADD COLUMN sales_rep TEXT");
  if (!cols.includes("restricted"))         db.exec("ALTER TABLE projects ADD COLUMN restricted INTEGER DEFAULT 0");
  if (!cols.includes("customer_granted"))   db.exec("ALTER TABLE projects ADD COLUMN customer_granted INTEGER DEFAULT 0");
  if (!cols.includes("managers_granted"))   db.exec("ALTER TABLE projects ADD COLUMN managers_granted INTEGER DEFAULT 0");
  if (!cols.includes("completed_at"))       db.exec("ALTER TABLE projects ADD COLUMN completed_at TEXT");
  if (!cols.includes("ar_archived_at"))     db.exec("ALTER TABLE projects ADD COLUMN ar_archived_at TEXT");   // hidden from the receivables portal (written off / parked)
  if (!cols.includes("warranty_months"))    db.exec("ALTER TABLE projects ADD COLUMN warranty_months INTEGER DEFAULT 6");
  if (!cols.includes("system_qr"))          db.exec("ALTER TABLE projects ADD COLUMN system_qr TEXT");
  if (!cols.includes("payout_amount"))      db.exec("ALTER TABLE projects ADD COLUMN payout_amount REAL DEFAULT 0");
  if (!cols.includes("payout_status"))      db.exec("ALTER TABLE projects ADD COLUMN payout_status TEXT DEFAULT 'pending'");
  // Set the first time the customer confirms their contact details (first-login welcome modal).
  if (!cols.includes("info_confirmed_at"))  db.exec("ALTER TABLE projects ADD COLUMN info_confirmed_at TEXT");
  // Set the first time the customer finishes (or skips) the first-time guided tour — so it shows once.
  if (!cols.includes("tour_seen_at"))       db.exec("ALTER TABLE projects ADD COLUMN tour_seen_at TEXT");
  // JSON array of customer-facing "X has been published" pop-ups already shown, so each published
  // item (survey / mockup / proposal vN) celebrates exactly once.
  if (!cols.includes("announced_seen"))     db.exec("ALTER TABLE projects ADD COLUMN announced_seen TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      submitted_by_id INTEGER,
      submitted_by_name TEXT,
      submitted_at TEXT DEFAULT (datetime('now','localtime')),
      notes TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by_id INTEGER,
      reviewed_by_name TEXT,
      reviewed_at TEXT,
      review_notes TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      user_email TEXT,
      role TEXT NOT NULL,
      granted_by INTEGER,
      granted_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // INSERT OR IGNORE: adds new seed rows, skips existing ones.
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO projects
      (access_id,customer,address,service_code,project_type,category,stage,status,
       cameras,value,tech,date,issue,contact_name,contact_email,contact_phone,contact_message,source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  for (const j of SEED) {
    const ci = CONTACT_INFO[j.customer] || {};
    stmt.run(
      makeAccessId(j.type, j.svc, j.n),
      j.customer, j.address, j.svc, j.type, j.category,
      STAGE_FOR_STATUS[j.status] || "inquiry",
      j.status, j.cameras, j.value, j.tech, j.date, j.issue,
      ci.n || null, ci.e || null, ci.p || null, ci.m || null, ci.s || "internal"
    );
  }
  // Always sync addresses from seed (handles format updates to existing rows).
  const addrStmt = db.prepare("UPDATE projects SET address = ? WHERE access_id = ?");
  for (const j of SEED) {
    addrStmt.run(j.address, makeAccessId(j.type, j.svc, j.n));
  }

  const OLD_TO_NEW = {
    qualified: "inquiry", mockup: "proposal", approval: "approval_deposit",
    deposit: "approval_deposit", procurement: "schedule", dispatch: "install",
    tech_qc: "qc", customer_qc: "qc",
  };
  for (const [oldKey, newKey] of Object.entries(OLD_TO_NEW)) {
    db.prepare("UPDATE projects SET stage = ? WHERE stage = ?").run(newKey, oldKey);
  }

  // Customer PIN is ALWAYS the last 4 of the contact phone (owner rule). Normalize every row so a
  // seeded/legacy/hand-set PIN can't drift from the number; only fall back to a derived PIN when
  // there's no usable phone on file. tech_pin stays derived. Idempotent — only writes on a diff.
  const pinRows = db.prepare("SELECT id, access_id, tech, contact_phone, customer_pin, tech_pin, pin_custom FROM projects").all();
  const setPin = db.prepare("UPDATE projects SET customer_pin = ?, tech_pin = ? WHERE id = ?");
  for (const r of pinRows) {
    const derived = makePins(r.access_id);
    // Admin-set custom PIN wins — only the phone-derived customer PIN is normalized. tech_pin still fills.
    const cust = r.pin_custom ? r.customer_pin : (phonePin(r.contact_phone) || r.customer_pin || derived.customer);
    const tech = r.tech ? (r.tech_pin || derived.tech) : null;
    if (cust !== r.customer_pin || tech !== r.tech_pin) setPin.run(cust, tech, r.id);
  }

  // Backfill contact info for existing rows
  const bfStmt = db.prepare(
    "UPDATE projects SET contact_name=?,contact_email=?,contact_phone=?,contact_message=?,source=? WHERE customer=? AND contact_name IS NULL"
  );
  for (const [cust, ci] of Object.entries(CONTACT_INFO)) {
    bfStmt.run(ci.n, ci.e, ci.p, ci.m, ci.s || "internal", cust);
  }

  // Migrate login_logs if it exists with old schema (no ip_address column)
  const _llCols = (() => {
    try { return db.prepare("PRAGMA table_info(login_logs)").all().map(c => c.name); } catch { return []; }
  })();
  if (_llCols.length > 0 && !_llCols.includes("ip_address")) {
    db.exec("DROP TABLE IF EXISTS login_logs");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER,
      event_type  TEXT NOT NULL DEFAULT 'login',
      login_at    TEXT NOT NULL DEFAULT (datetime('now')),
      logout_at   TEXT,
      ip_address  TEXT,
      user_agent  TEXT,
      project_id  INTEGER,
      notes       TEXT
    )
  `);

  // ---- Inventory ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      category          TEXT,
      sku               TEXT,
      quantity          INTEGER DEFAULT 0,
      unit_cost         INTEGER DEFAULT 0,
      location          TEXT,
      project_access_id TEXT,
      created_at        TEXT DEFAULT (datetime('now'))
    )
  `);
  const invCols = db.prepare("PRAGMA table_info(inventory)").all().map((c) => c.name);
  if (!invCols.includes("qty_for_project")) db.exec("ALTER TABLE inventory ADD COLUMN qty_for_project INTEGER DEFAULT 0");
  if (!invCols.includes("qty_used"))        db.exec("ALTER TABLE inventory ADD COLUMN qty_used INTEGER DEFAULT 0");

  // Serialized units — one row per physical unit scanned in (serial/QR), kept forever.
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_units (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id           INTEGER NOT NULL,
      serial            TEXT,
      sku               TEXT,
      tracking          TEXT,
      status            TEXT DEFAULT 'in_stock',   -- in_stock | assigned | installed | removed
      project_access_id TEXT,
      received_at       TEXT DEFAULT (datetime('now')),
      installed_at      TEXT,
      note              TEXT
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_inv_units_item ON inventory_units(item_id)");
  // Permanent movement log — every receive/assign/install/remove, never pruned.
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id           INTEGER NOT NULL,
      unit_id           INTEGER,
      type              TEXT NOT NULL,             -- created | received | assigned | unassigned | installed | adjusted | removed
      qty               INTEGER DEFAULT 1,
      serial            TEXT,
      project_access_id TEXT,
      actor_id          INTEGER,
      actor_name        TEXT,
      note              TEXT,
      at                TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_inv_events_item ON inventory_events(item_id)");

  const invCount = db.prepare("SELECT COUNT(*) AS n FROM inventory").get().n;
  if (!invCount) {
    const projIds = db.prepare("SELECT access_id FROM projects ORDER BY id LIMIT 3").all().map((r) => r.access_id);
    const INV_SEED = [
      ["Hikvision DS-2CD2143G2 4MP Dome", "Camera",   "HK-2143G2", 24, 95,  "Warehouse A", null],
      ["Hikvision DS-2CD2T87G2 8MP Bullet","Camera",   "HK-2T87G2", 18, 140, "Warehouse A", null],
      ["Dahua 16ch NVR 4K",               "NVR",       "DH-NVR16",  9,  420, "Warehouse A", null],
      ["Dahua 32ch NVR 4K",               "NVR",       "DH-NVR32",  5,  690, "Warehouse A", null],
      ["WD Purple 8TB Surveillance HDD",  "Storage",   "WD-PUR8",   22, 160, "Warehouse B", null],
      ["Cat6 Cable — 1000ft Box",         "Cabling",   "C6-1000",   31, 110, "Warehouse B", null],
      ["PoE Switch 24-Port Gigabit",      "Networking","PoE-24",    7,  280, "Warehouse A", null],
      ["LPR Camera 4MP Varifocal",        "Camera",    "LPR-4MP",   6,  310, "Warehouse A", projIds[0] || null],
      ["Access Control Panel 4-Door",     "Access",    "AC-4D",     4,  240, "Warehouse B", projIds[1] || null],
      ["Commercial Speaker 70V 8in",      "Audio",     "SPK-70V",   28, 65,  "Warehouse B", projIds[2] || null],
    ];
    const insInv = db.prepare("INSERT INTO inventory (name, category, sku, quantity, unit_cost, location, project_access_id) VALUES (?,?,?,?,?,?,?)");
    for (const r of INV_SEED) insInv.run(...r);
  }

  // ---- Tickets + messages ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      access_id      TEXT,
      subject        TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'open',
      priority       TEXT NOT NULL DEFAULT 'medium',
      opened_by_id   INTEGER,
      opened_by_name TEXT,
      opened_by_role TEXT,
      assignee_id    INTEGER,
      assignee_name  TEXT,
      audience       TEXT NOT NULL DEFAULT 'admin,manager,tech,customer',
      created_at     TEXT DEFAULT (datetime('now')),
      updated_at     TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   INTEGER NOT NULL,
      author_id   INTEGER,
      author_name TEXT,
      author_role TEXT,
      body        TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);
  // ---- Service calls (TRACE) ----
  // A service call is its OWN entity, not a project. Own SVC#### id series, own stage flow, its own
  // PIN gate. Add-on cameras still become projects; this is the fault-report / diagnostic / billing
  // track. `diagnostics` holds each guided session (customer or tech); `service_call_events` is the
  // append-only, timestamped timeline the whole record is built from.
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_calls (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      svc_id            TEXT UNIQUE,
      customer          TEXT,
      contact_name      TEXT,
      contact_email     TEXT,
      contact_phone     TEXT,
      address           TEXT,
      project_access_id TEXT,               -- the project whose system this is about (optional)
      issue             TEXT,               -- what the customer reported
      category          TEXT,               -- camera | dropout | nvr | other
      stage             TEXT NOT NULL DEFAULT 'submitted',
      status            TEXT NOT NULL DEFAULT 'open',
      priority          TEXT NOT NULL DEFAULT 'medium',
      outcome_route     TEXT,               -- last diagnostic outcome: solved|service|field|replace|escalate
      customer_pin      TEXT,               -- PIN gate, last 4 of contact phone
      assignee_id       INTEGER,
      assignee_name     TEXT,
      ticket_id         INTEGER,
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      updated_at        TEXT DEFAULT (datetime('now','localtime')),
      resolved_at       TEXT,
      closed_at         TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS diagnostics (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      svc_id      TEXT NOT NULL,
      mode        TEXT NOT NULL,            -- 'customer' | 'tech'
      technician  TEXT,
      issue       TEXT,
      steps       TEXT,                     -- JSON: [{step, question, answer}]
      speed_test  TEXT,                     -- JSON: {down, up, ping, at}
      outcome     TEXT,                     -- JSON: {route, routeLabel, title, action}
      started     TEXT,
      completed   TEXT,
      created_at  TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_call_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      svc_id      TEXT NOT NULL,
      at          TEXT DEFAULT (datetime('now','localtime')),
      kind        TEXT NOT NULL,            -- submitted | diagnostic | note | stage | quote | payment | resolved | closed
      actor_role  TEXT,
      actor_name  TEXT,
      detail      TEXT
    )
  `);
  // Existing DBs predate the companion-project link — add the column in place.
  const svcCols = db.prepare("PRAGMA table_info(service_calls)").all().map((c) => c.name);
  if (!svcCols.includes("svc_project_id")) db.exec("ALTER TABLE service_calls ADD COLUMN svc_project_id TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS svc_invoices (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      svc_id       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'draft',   -- draft | sent | void
      items        TEXT,                             -- JSON: [{desc, qty, price}]
      notes        TEXT,
      signed_name  TEXT,
      signed_at    TEXT,
      sent_at      TEXT,
      voided_at    TEXT,
      created_at   TEXT DEFAULT (datetime('now','localtime')),
      updated_at   TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS svc_payments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      svc_id      TEXT NOT NULL,
      amount      REAL NOT NULL DEFAULT 0,
      method      TEXT,
      note        TEXT,
      recorded_by TEXT,
      paid_at     TEXT,
      created_at  TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  // ---- Hiring / onboarding: a job application behaves like a project — own ID, own PIN gate,
  // a stage bar the applicant can watch, and an event log. Once hired, the onboarding checklist
  // (documents, equipment, training) lives on the same record.
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id        TEXT UNIQUE,
      name          TEXT,
      email         TEXT,
      phone         TEXT,
      address       TEXT,
      position      TEXT,                              -- tech | installer | sales | office | other
      experience    TEXT,                              -- years of experience (free text bucket)
      skills        TEXT,                              -- certs / systems they've worked on
      has_license   INTEGER DEFAULT 0,
      has_vehicle   INTEGER DEFAULT 0,
      has_tools     INTEGER DEFAULT 0,
      availability  TEXT,                              -- full | part | weekends | flexible
      start_date    TEXT,
      about         TEXT,                              -- why they want to work here
      stage         TEXT NOT NULL DEFAULT 'applied',   -- applied|reviewing|interview|offer|hired|declined
      applicant_pin TEXT,
      rating        INTEGER,                           -- office 1-5 gut score
      reviewer_id   INTEGER,
      reviewer_name TEXT,
      interview_at  TEXT,
      decline_reason TEXT,
      onboarding    TEXT,                              -- JSON checklist once hired
      user_id       INTEGER,                           -- the staff account created on hire
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      updated_at    TEXT DEFAULT (datetime('now','localtime')),
      hired_at      TEXT,
      declined_at   TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS application_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id     TEXT NOT NULL,
      at         TEXT DEFAULT (datetime('now','localtime')),
      kind       TEXT NOT NULL,                        -- applied|stage|note|interview|offer|hired|declined|onboarding
      actor_role TEXT,
      actor_name TEXT,
      detail     TEXT
    )
  `);
  // Three-portal hiring engine: `status` is fine-grained (see lib/hiring.js), `portal` (1/2/3) is
  // derived from it. Added alongside the legacy `stage`, which stays coarsely in sync. One-time
  // backfill maps existing rows' stage → status/portal so the pipeline board shows them correctly.
  const hiringCols = db.prepare("PRAGMA table_info(applications)").all().map((c) => c.name);
  if (!hiringCols.includes("portal")) db.exec("ALTER TABLE applications ADD COLUMN portal INTEGER DEFAULT 1");
  if (!hiringCols.includes("status")) {
    db.exec("ALTER TABLE applications ADD COLUMN status TEXT");
    db.exec(`UPDATE applications SET
      status = CASE stage WHEN 'applied' THEN 'applied' WHEN 'reviewing' THEN 'assessment'
                          WHEN 'interview' THEN 'phone' WHEN 'offer' THEN 'documents_pending'
                          WHEN 'hired' THEN 'documents_pending' WHEN 'declined' THEN 'declined' ELSE 'applied' END,
      portal = CASE WHEN stage IN ('offer','hired') THEN 2 ELSE 1 END
      WHERE status IS NULL`);
  }
  if (!hiringCols.includes("assessment")) db.exec("ALTER TABLE applications ADD COLUMN assessment TEXT"); // Portal 1 pre-hire assessment blob (responses + score + flags + profile)
  if (!hiringCols.includes("steps")) db.exec("ALTER TABLE applications ADD COLUMN steps TEXT");           // Portal 1 evaluation scorecards { phone:{...}, in_person:{...}, sop:{...}, ride_along:{...} }
  if (!hiringCols.includes("compliance")) db.exec("ALTER TABLE applications ADD COLUMN compliance TEXT"); // Portal 2 compliance blob { items:{...}, checks:{...} } — sensitive fields stored *_enc
  if (!hiringCols.includes("training")) db.exec("ALTER TABLE applications ADD COLUMN training TEXT");     // Portal 3 training blob { modules:{...}, tier, badges:[] }
  if (!hiringCols.includes("dob")) db.exec("ALTER TABLE applications ADD COLUMN dob TEXT");               // date of birth (YYYY-MM-DD) — collected at apply, 18+ required
  if (!hiringCols.includes("archived")) db.exec("ALTER TABLE applications ADD COLUMN archived INTEGER DEFAULT 0"); // soft-delete: void, never hard-delete (kept for audit)
  if (!hiringCols.includes("archived_at")) db.exec("ALTER TABLE applications ADD COLUMN archived_at TEXT");
  if (!hiringCols.includes("archived_by")) db.exec("ALTER TABLE applications ADD COLUMN archived_by TEXT");
  // Candidate DISPOSITION — an axis orthogonal to the pipeline stage: active | on_hold | withdrawn.
  // (declined / hired / archived stay their own mechanisms.) Lets someone be "Phone Screen · On Hold".
  if (!hiringCols.includes("disposition")) db.exec("ALTER TABLE applications ADD COLUMN disposition TEXT DEFAULT 'active'");
  // ADT project portal — a lightweight 3-step flow (Apply → Schedule → Complete) separate from the
  // main install lifecycle. `equipment` is the JSON selection {itemId: qty}; `points` is the ADT
  // point total at submit; `stage` walks applied → scheduled → completed.
  db.exec(`
    CREATE TABLE IF NOT EXISTS adt_applications (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      adt_id        TEXT UNIQUE,
      name          TEXT,
      email         TEXT,
      phone         TEXT,
      address       TEXT,
      equipment     TEXT,                              -- JSON { itemId: qty }
      points        REAL DEFAULT 0,
      notes         TEXT,
      stage         TEXT NOT NULL DEFAULT 'applied',   -- applied | scheduled | completed
      schedule_date TEXT,
      schedule_window TEXT,
      access_pin    TEXT,
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      updated_at    TEXT DEFAULT (datetime('now','localtime')),
      scheduled_at  TEXT,
      completed_at  TEXT
    )
  `);
  // Residential vs commercial — the first choice on the ADT intake (added after launch).
  const adtCols = db.prepare("PRAGMA table_info(adt_applications)").all().map((c) => c.name);
  if (!adtCols.includes("property_type")) db.exec("ALTER TABLE adt_applications ADD COLUMN property_type TEXT");   // residential | commercial
  if (!adtCols.includes("tax_id"))        db.exec("ALTER TABLE adt_applications ADD COLUMN tax_id TEXT");          // SSN (residential) / EIN (commercial) — stored AES-256-GCM encrypted (encBlob)
  if (!adtCols.includes("emergency_contacts")) db.exec("ALTER TABLE adt_applications ADD COLUMN emergency_contacts TEXT"); // JSON [{name,phone},…] — who we call if the customer can't be reached
  if (!adtCols.includes("verbal_password"))    db.exec("ALTER TABLE adt_applications ADD COLUMN verbal_password TEXT");    // identity-verify passphrase — encrypted (encBlob)
  if (!adtCols.includes("pref_days"))    db.exec("ALTER TABLE adt_applications ADD COLUMN pref_days TEXT");    // JSON ["Mon",…] — customer's preferred install days
  if (!adtCols.includes("pref_windows")) db.exec("ALTER TABLE adt_applications ADD COLUMN pref_windows TEXT"); // JSON ["Morning",…] — preferred time windows
  if (!adtCols.includes("asap")) db.exec("ALTER TABLE adt_applications ADD COLUMN asap INTEGER DEFAULT 0"); // standalone flag: customer wants the install as soon as possible
  if (!adtCols.includes("contact_name")) db.exec("ALTER TABLE adt_applications ADD COLUMN contact_name TEXT"); // commercial: the person to reach (name field holds the business)
  if (!adtCols.includes("customer_docs")) db.exec("ALTER TABLE adt_applications ADD COLUMN customer_docs TEXT"); // JSON [{name,type,data(dataURL),at},…] docs the customer uploaded for a needs-docs request
  if (!adtCols.includes("deal_json"))    db.exec("ALTER TABLE adt_applications ADD COLUMN deal_json TEXT");    // ADT Tool deal state (cart + tier + credit) — internal pricing engine
  if (!adtCols.includes("deal_shared_at")) db.exec("ALTER TABLE adt_applications ADD COLUMN deal_shared_at TEXT"); // set when staff Share the quote → customer /adt shows a sanitized Cust view
  if (!adtCols.includes("deal_accepted_at")) db.exec("ALTER TABLE adt_applications ADD COLUMN deal_accepted_at TEXT"); // set when the customer accepts ("picks up") their quote
  if (!adtCols.includes("dob")) db.exec("ALTER TABLE adt_applications ADD COLUMN dob TEXT"); // account holder's full date of birth (YYYY-MM-DD) — identity verification
  if (!adtCols.includes("deal_signed_name")) db.exec("ALTER TABLE adt_applications ADD COLUMN deal_signed_name TEXT");       // customer's typed signature name on the quote
  if (!adtCols.includes("deal_signed_at")) db.exec("ALTER TABLE adt_applications ADD COLUMN deal_signed_at TEXT");           // Eastern wall-clock (datetime('now','localtime')) they signed — formatted by fmtSignStamp
  if (!adtCols.includes("deal_signature_data")) db.exec("ALTER TABLE adt_applications ADD COLUMN deal_signature_data TEXT"); // PNG dataURL of the typed signature
  if (!adtCols.includes("archived")) db.exec("ALTER TABLE adt_applications ADD COLUMN archived INTEGER DEFAULT 0"); // soft-delete: hidden from lists, kept for audit
  if (!adtCols.includes("verification_doc")) db.exec("ALTER TABLE adt_applications ADD COLUMN verification_doc TEXT"); // commercial business-verification file: JSON {name,type,data(dataURL)}
  if (!adtCols.includes("docs_note")) db.exec("ALTER TABLE adt_applications ADD COLUMN docs_note TEXT"); // when status=needs_docs, which documents the office needs
  if (!adtCols.includes("status")) {   // credit/approval lifecycle: submitted → in_review → approved | declined → installed
    db.exec("ALTER TABLE adt_applications ADD COLUMN status TEXT DEFAULT 'submitted'");
    db.exec("UPDATE adt_applications SET status = CASE WHEN stage = 'completed' THEN 'installed' ELSE 'submitted' END WHERE status IS NULL");
  }

  // Résumé upload on job applications (base64 data URL + original filename), added after launch.
  const appCols = db.prepare("PRAGMA table_info(applications)").all().map((c) => c.name);
  if (!appCols.includes("resume_name")) db.exec("ALTER TABLE applications ADD COLUMN resume_name TEXT");
  if (!appCols.includes("resume_data")) db.exec("ALTER TABLE applications ADD COLUMN resume_data TEXT");

  const tCount = db.prepare("SELECT COUNT(*) AS n FROM tickets").get().n;
  if (!tCount) {
    const URGENT = /offline|down|not\s+(working|record)|no\s+signal|dead|fail/i;
    const MED = /static|intermittent|slow|delay|glitch|loose/i;
    const issues = db.prepare("SELECT access_id, customer, issue, stage, tech, contact_name FROM projects WHERE issue IS NOT NULL AND issue != ''").all();
    const insT = db.prepare("INSERT INTO tickets (access_id, subject, status, priority, opened_by_name, opened_by_role, assignee_name, audience) VALUES (?,?,?,?,?,?,?,?)");
    const insM = db.prepare("INSERT INTO ticket_messages (ticket_id, author_name, author_role, body) VALUES (?,?,?,?)");
    for (const r of issues) {
      const priority = URGENT.test(r.issue) ? "urgent" : MED.test(r.issue) ? "medium" : "low";
      const status = ["payment", "completion"].includes(r.stage) ? "closed" : "open";
      const info = insT.run(r.access_id, r.issue, status, priority, r.contact_name || r.customer, "customer", r.tech || null, "admin,manager,tech,customer");
      insM.run(Number(info.lastInsertRowid), r.contact_name || r.customer, "customer", r.issue);
    }
  }

  // ---- Notifications ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      type       TEXT,
      title      TEXT NOT NULL,
      body       TEXT,
      link       TEXT,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  const nCount = db.prepare("SELECT COUNT(*) AS n FROM notifications").get().n;
  if (!nCount) {
    const admins = db.prepare("SELECT id FROM users WHERE role IN ('admin','manager')").all();
    const openTickets = db.prepare("SELECT id, subject, access_id FROM tickets WHERE status != 'closed' LIMIT 5").all();
    const insN = db.prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)");
    for (const a of admins) {
      for (const t of openTickets) insN.run(a.id, "ticket", "New ticket", t.subject, `/tickets/${t.id}`);
    }
  }

  // ---- Expenses ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      category    TEXT,
      amount      INTEGER NOT NULL DEFAULT 0,
      vendor      TEXT,
      access_id   TEXT,
      spent_on    TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);
  // Migrate expenses to support tech submissions + approval workflow
  const eCols = db.prepare("PRAGMA table_info(expenses)").all().map(c => c.name);
  if (!eCols.includes("submitted_by_id"))   db.exec("ALTER TABLE expenses ADD COLUMN submitted_by_id INTEGER");
  if (!eCols.includes("submitted_by_name")) db.exec("ALTER TABLE expenses ADD COLUMN submitted_by_name TEXT");
  if (!eCols.includes("status"))            db.exec("ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  if (!eCols.includes("review_notes"))      db.exec("ALTER TABLE expenses ADD COLUMN review_notes TEXT");
  if (!eCols.includes("reviewed_by_id"))    db.exec("ALTER TABLE expenses ADD COLUMN reviewed_by_id INTEGER");
  if (!eCols.includes("reviewed_by_name"))  db.exec("ALTER TABLE expenses ADD COLUMN reviewed_by_name TEXT");
  if (!eCols.includes("reviewed_at"))       db.exec("ALTER TABLE expenses ADD COLUMN reviewed_at TEXT");
  if (!eCols.includes("payment_date"))      db.exec("ALTER TABLE expenses ADD COLUMN payment_date TEXT");
  if (!eCols.includes("payment_method"))    db.exec("ALTER TABLE expenses ADD COLUMN payment_method TEXT");
  // Normalize legacy category names
  db.exec("UPDATE expenses SET category='Operations' WHERE category='Overhead'");

  // ---- Requests (equipment / tool / material requests from techs) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT,
      request_type      TEXT NOT NULL DEFAULT 'equipment',
      description       TEXT NOT NULL,
      notes             TEXT,
      submitted_by_id   INTEGER,
      submitted_by_name TEXT,
      status            TEXT NOT NULL DEFAULT 'pending',
      review_notes      TEXT,
      reviewed_by_id    INTEGER,
      reviewed_by_name  TEXT,
      reviewed_at       TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  const eCount = db.prepare("SELECT COUNT(*) AS n FROM expenses").get().n;
  if (!eCount) {
    const EXP_SEED = [
      ["Camera stock — bulk order", "Equipment", 4800, "Hikvision Distributor", "2026-06-02"],
      ["Van fuel & tolls — June",   "Vehicle",   620,  "Shell / EZ-Pass",       "2026-06-20"],
      ["Cat6 + conduit restock",    "Materials", 1340, "Graybar",               "2026-06-10"],
      ["Software licenses (NVR)",   "Software",  390,  "Dahua",                 "2026-06-01"],
      ["Tech tools — drill set",    "Tools",     280,  "Home Depot",            "2026-06-15"],
      ["Liability insurance — June","Insurance", 950,  "The Hartford",          "2026-06-05"],
      ["Office rent — June",        "Overhead",  2200, "La Vague Holdings",     "2026-06-01"],
    ];
    const insE = db.prepare("INSERT INTO expenses (description, category, amount, vendor, spent_on) VALUES (?,?,?,?,?)");
    for (const r of EXP_SEED) insE.run(...r);
  }

  // ---- Dev Roadmap (internal build tracker for the platform itself) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS dev_tasks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      category     TEXT NOT NULL,
      title        TEXT NOT NULL,
      detail       TEXT,
      route        TEXT,
      route_status TEXT NOT NULL DEFAULT 'na',
      priority     INTEGER NOT NULL DEFAULT 100,
      done         INTEGER NOT NULL DEFAULT 0,
      done_at      TEXT,
      is_custom    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  const dCount = db.prepare("SELECT COUNT(*) AS n FROM dev_tasks").get().n;
  if (!dCount) {
    // [category, title, detail, route, route_status, priority, done]
    // route_status: exists | partial | missing | na
    const DEV_SEED = [
      // ---- Security (Sprint 0) ----
      ["Security", "Gate dev-only master PINs", "0000/8965-style global PINs auto-disable in production (NODE_ENV check).", "/project/:sample", "exists", 10, 1],
      ["Security", "Route /portal & /projects through getVisibleJobs", "These pages still call getAllJobs(), leaking restricted projects to any role by URL.", "/portal", "partial", 11, 0],
      ["Security", "Central role-guard for unguarded pages", "/customers, /dashboard, /projects, /portal, /notifications have no role check — techs/sales can reach by URL.", null, "missing", 12, 0],
      ["Security", "Gate /api/config + rotate Maps key", "Live Google Maps key is in config.json and served unauthenticated. Restrict by referrer + auth the endpoint.", null, "missing", 13, 0],
      ["Security", "Fix pin-check null-PIN bypass", "A project with no customer_pin is accessible with any PIN (api/pin-check).", null, "missing", 14, 0],
      ["Security", "Session token expiry + stronger password hashing", "Tokens carry no expiry; passwords are unsalted SHA-256. Move to expiring tokens + bcrypt/argon.", null, "missing", 15, 0],

      // ---- Core Spine ----
      ["Core Spine", "Action Center", "Role + stage pending-tasks list pinned to top of every project. The command-center centerpiece.", "/project/:sample", "missing", 20, 0],
      ["Core Spine", "Blocker + Project Health engine", "Show one primary blocker + health (Healthy/Waiting/Behind/At Risk); gate stage advancement on cleared blockers.", "/project/:sample", "missing", 21, 0],
      ["Core Spine", "Required Actions engine", "Each stage blocks advance until its required actions are complete (server-validated).", "/project/:sample", "missing", 22, 0],
      ["Core Spine", "Real Activity Log / Audit Trail", "Replace the hardcoded ACTIVITY feed with real per-project events (user, IP, old→new value, immutable).", "/project/:sample", "partial", 23, 0],

      // ---- Stage Model ----
      ["Stage Model", "Split Approval and Schedule stages", "Spec forbids merging. Approval = signature only; deposit/procurement/work-order live in Schedule. (Needs Removal Suggestion — current key is approval_deposit.)", null, "missing", 30, 0],
      ["Stage Model", "Sales final stage label = 'Completed'", "Sales timeline must end in 'Completed', never 'Closed'.", "/sales", "partial", 31, 0],
      ["Stage Model", "Tech payout as widget inside Completed", "Tech 4-step ends at Completed; payout is a widget there, not its own progress step.", "/project/:sample", "partial", 32, 0],

      // ---- Operational Centers ----
      ["Operational Centers", "Appointment Center", "First-class survey/install appointments with customer + technician confirmation states.", "/project/:sample", "missing", 40, 0],
      ["Operational Centers", "Document Center", "Proposal, signed proposal, invoices, receipts, certificate, warranty, manuals + version history.", "/project/:sample", "missing", 41, 0],
      ["Operational Centers", "Photo Center", "Categorized photos (Survey/Install/QC/Completion/Warranty) with uploader, date, GPS, permission-gated.", "/project/:sample", "missing", 42, 0],
      ["Operational Centers", "Equipment Center", "Per-device registry: model, serial, MAC, IP, firmware, location, warranty expiration, QR.", "/project/:sample", "missing", 43, 0],
      ["Operational Centers", "Inventory + Procurement blocking", "Link inventory/procurement to Schedule; block install if required items are unavailable.", "/inventory", "partial", 44, 0],

      // ---- Notifications ----
      ["Notifications", "Notification Manager", "Rule-driven triggers: templates, channels (SMS/email/push/internal), delay, reminders, escalation, retry.", null, "missing", 50, 0],
      ["Notifications", "Replace hardcoded notifications feed", "Gateway NOTIFS array is fake & identical on every project — wire to real project events.", "/project/:sample", "partial", 51, 0],

      // ---- Financial ----
      ["Financial", "Payments — deposit + balance", "Deposit at Schedule, final balance at Payment. Needs a payment integration (Stripe).", "/project/:sample", "missing", 60, 0],
      ["Financial", "Commission rollup report", "getCommissionsByRep exists but nothing reads it — build a sales commission/earnings view.", "/sales", "partial", 61, 0],
      ["Financial", "Real payroll / technician payout module", "Replace the 10%-of-value placeholder on admin dashboard & finances with a real payout subsystem.", "/finances", "partial", 62, 0],

      // ---- Customer Experience ----
      ["Customer Experience", "E-signature + proposal builder", "Customer signs proposal; sales builds it. (Deferred — owner will add later.)", "/project/:sample", "missing", 70, 0],
      ["Customer Experience", "Customer action flows", "Make the customer buttons real: sign, pay deposit/balance, confirm appointment, walkthrough, download docs.", "/project/:sample", "missing", 71, 0],

      // ---- Cleanup & Polish ----
      ["Cleanup & Polish", "Replace pv-grid 'What you see / do'", "Temporary placeholder card — replace with the advanced per-stage role tool.", "/project/:sample", "partial", 80, 0],
      ["Cleanup & Polish", "Remove 2503 Jay Pl test-address fallback", "Projects with no address render a Bronx test address as if real; also stop boot-time address resync overwriting edits.", "/project/:sample", "partial", 81, 0],
      ["Cleanup & Polish", "Persist tech checklists & certifications", "Tools/Vehicle checklists & Training certs are local-only and reset on reload — save to DB per tech.", "/tech", "partial", 82, 0],
      ["Cleanup & Polish", "Real Manager dashboard", "/manager currently just redirects to /tickets — build a real manager home (approvals, workload, QC).", "/manager", "missing", 83, 0],
      ["Cleanup & Polish", "Wire dead buttons", "Claim (tech jobs), + Log Call (Service Calls), + Add (certs) render but do nothing.", "/tech", "partial", 84, 0],

      // ---- Shipped (done — sink to bottom) ----
      ["Roles & Access", "Role-based nav filtering", "Tech sees Tech/Tickets/Expenses; Sales sees Sales/Customers/Tickets; correct order.", "/dashboard", "exists", 90, 1],
      ["Roles & Access", "Restricted project visibility toggle", "Team & Access 'All Staff / Restricted' toggle; getVisibleJobs hides restricted projects from unassigned staff.", "/project/:sample", "exists", 91, 1],
      ["Roles & Access", "Sales dashboard + commission panel", "Sales-only dashboard; per-project commission setter (rate/status/rep).", "/sales", "exists", 92, 1],
      ["Roles & Access", "Tech dashboard + Tech Action Bar", "Tech accepts job (Schedule→Install) and completes install (Install→QC); tickets filtered to the tech.", "/tech", "exists", 93, 1],
      ["Roles & Access", "Expenses & Requests workflow", "Techs submit expenses/requests; admin/manager pay/decline/approve with status lifecycle.", "/expenses", "exists", 94, 1],
      ["Security", "User duplicate prevention", "Block duplicate username/email/phone on create & edit; seed no longer overwrites admin edits.", "/users", "exists", 95, 1],
    ];
    const insD = db.prepare("INSERT INTO dev_tasks (category, title, detail, route, route_status, priority, done, done_at) VALUES (?,?,?,?,?,?,?,?)");
    for (const t of DEV_SEED) insD.run(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[6] ? new Date().toISOString().slice(0,19).replace("T"," ") : null);
  }

  // ---- API key vault (Development ▸ API Keys) ----
  // One row per integration key. The raw value lives here on the persistent disk, never in git.
  // Readers prefer this store, then fall back to process.env. Admin-only surface.
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_secrets (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      updated_by TEXT
    )
  `);

  // One-time reset (2026-08-13): the aerial enhance prompt override was saved byte-identical to
  // the old "light cleanup" default. The default is now the declutter version, so drop that stale
  // override to fall through to it. Hash-guarded — a genuinely customized prompt is never touched.
  // Safe to delete this block once production has restarted.
  try {
    const LEGACY_AERIAL_SHA = "6d0501a218bbab93753b9781fee63cb830d42cbd5406b1d2dcd9ed594ecb68f7";
    const row = db.prepare("SELECT value FROM app_secrets WHERE key='SURVEY_PROMPT_AERIAL'").get();
    if (row && createHash("sha256").update(String(row.value).trim()).digest("hex") === LEGACY_AERIAL_SHA) {
      db.prepare("DELETE FROM app_secrets WHERE key='SURVEY_PROMPT_AERIAL'").run();
    }
  } catch { /* non-fatal */ }

  // ---- Global floor-plan library ----
  // Finished survey backgrounds (aerial / uploaded plan / drawing) saved for reuse on any project's
  // floor. `thumb` is a small preview for the picker grid; `image` is the full plan (fetched on pick).
  db.exec(`
    CREATE TABLE IF NOT EXISTS floorplan_library (
      id             INTEGER PRIMARY KEY,
      name           TEXT,
      image          TEXT NOT NULL,
      thumb          TEXT,
      hash           TEXT UNIQUE,
      source_project TEXT,
      kind           TEXT DEFAULT 'aerial',
      created_at     TEXT DEFAULT (datetime('now','localtime')),
      created_by     TEXT
    )
  `);

  // ---- Document library (Tools ▸ readers) ----
  // One row per captured document (registration / insurance / business licence / …). `fields`
  // is the full JSON the reader produced; subject_name + doc_number are denormalized for search.
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type      TEXT NOT NULL,
      subject_name  TEXT,
      doc_number    TEXT,
      fields        TEXT,
      score         INTEGER DEFAULT 0,
      access_id     TEXT,
      captured_by   TEXT,
      captured_at   TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_documents_access ON documents(access_id)");

  // ---- Identity / biometrics (Face ID + Driver's Licence library) ----
  // One row per user who enrols. Photos (id_image, face_image) are AES-256-GCM
  // encrypted at rest (see encBlob/decBlob). Embeddings are ArcFace vectors kept
  // as plain JSON so the 1:N login matcher can cosine-compare fast — a vector is
  // not reversible into a face image. status: unverified|pending|verified|rejected.
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_identity (
      user_id         INTEGER PRIMARY KEY,
      status          TEXT DEFAULT 'unverified',
      id_type         TEXT,
      id_image        TEXT,
      id_embedding    TEXT,
      id_fields       TEXT,
      id_verdict      TEXT,
      face_image      TEXT,
      face_embedding  TEXT,
      enroll_score    REAL,
      consent_at      TEXT,
      consent_version TEXT,
      enrolled_at     TEXT,
      updated_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_by      TEXT
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_identity_status ON user_identity(status)");

  // Every consent, enrolment, login match/miss, and admin action — an audit trail
  // for a system that holds government IDs and biometrics.
  db.exec(`
    CREATE TABLE IF NOT EXISTS identity_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      kind       TEXT,
      detail     TEXT,
      score      REAL,
      actor_role TEXT,
      actor_name TEXT,
      at         TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_identity_events_user ON identity_events(user_id)");

  // Unauthorized captures — a face-login MISS parks the live frame here (AES-encrypted),
  // with the closest-match guess, so an admin can identify the person and attach the face
  // to their account (multi-face). Auto-purged after 30 days unless claimed.
  db.exec(`
    CREATE TABLE IF NOT EXISTS unauthorized_faces (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      image           TEXT,
      embedding       TEXT,
      ip              TEXT,
      best_user_id    INTEGER,
      best_name       TEXT,
      best_score      REAL,
      status          TEXT DEFAULT 'pending',
      claimed_user_id INTEGER,
      claimed_at      TEXT,
      captured_at     TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_unauth_status ON unauthorized_faces(status)");

  // Additional enrolled faces per user (glasses / hat / mask / a claimed capture). The 1:N
  // login matcher unions these with user_identity.face_embedding so ANY of a user's faces can
  // match. Images encrypted like the primary; a vector alone isn't reversible into a face.
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_faces (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      embedding   TEXT,
      image       TEXT,
      source      TEXT,
      added_by    TEXT,
      added_at    TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_user_faces_user ON user_faces(user_id)");

  // One-time enrolment invites — an admin mints a tokenized link a user opens to
  // enrol WITHOUT logging in first (new hires, controlled onboarding).
  db.exec(`
    CREATE TABLE IF NOT EXISTS enroll_invites (
      token       TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      created_by  TEXT,
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      expires_at  TEXT,
      used_at     TEXT
    )
  `);

  // ---- Archive (soft-delete store — deleted records land here, restorable or purgeable) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS archive (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type      TEXT NOT NULL,
      source_table     TEXT NOT NULL,
      entity_id        INTEGER,
      label            TEXT,
      detail           TEXT,
      payload          TEXT NOT NULL,
      archived_by_id   INTEGER,
      archived_by_name TEXT,
      archived_at      TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // ---- Proposal views (who opened the proposal bucket, when, from where) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS proposal_views (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      viewer_role       TEXT,
      viewer_name       TEXT,
      ip                TEXT,
      viewed_at         TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  // Approximate viewer location (IP-based, like Wix/GA), resolved lazily when staff open the views.
  const pvCols = db.prepare("PRAGMA table_info(proposal_views)").all().map((c) => c.name);
  if (!pvCols.includes("geo")) db.exec("ALTER TABLE proposal_views ADD COLUMN geo TEXT");
  // IP → location cache, so each distinct IP hits the geolocation API only once, ever.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ip_geo (
      ip           TEXT PRIMARY KEY,
      label        TEXT,
      resolved_at  TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // ---- Proposals (versioned business record: options A/B/C, line items, pricing) ----
  // Sent versions are immutable; revisions clone to version+1 and mark the old row superseded.
  // cost lives only inside payload JSON and is stripped server-side for non-admin/manager (lib/proposal.js).
  db.exec(`
    CREATE TABLE IF NOT EXISTS proposals (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      version           INTEGER NOT NULL DEFAULT 1,
      status            TEXT NOT NULL DEFAULT 'draft',
      payload           TEXT NOT NULL,
      tax_rate          REAL NOT NULL DEFAULT 0,
      deposit_pct       REAL NOT NULL DEFAULT 50,
      selected_option   TEXT,
      selected_at       TEXT,
      sent_at           TEXT,
      sent_by_name      TEXT,
      change_note       TEXT,
      created_by_name   TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      updated_at        TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_access_id)`);
  const propCols = db.prepare("PRAGMA table_info(proposals)").all().map((c) => c.name);
  if (!propCols.includes("customer_flags")) db.exec("ALTER TABLE proposals ADD COLUMN customer_flags TEXT");
  if (!propCols.includes("signed_name"))    db.exec("ALTER TABLE proposals ADD COLUMN signed_name TEXT");
  if (!propCols.includes("signed_at"))      db.exec("ALTER TABLE proposals ADD COLUMN signed_at TEXT");
  if (!propCols.includes("signature_data")) db.exec("ALTER TABLE proposals ADD COLUMN signature_data TEXT");
  if (!propCols.includes("accepted_options")) db.exec("ALTER TABLE proposals ADD COLUMN accepted_options TEXT");
  if (!propCols.includes("declined_reason"))  db.exec("ALTER TABLE proposals ADD COLUMN declined_reason TEXT");
  if (!propCols.includes("declined_at"))      db.exec("ALTER TABLE proposals ADD COLUMN declined_at TEXT");
  if (!propCols.includes("declined_options")) db.exec("ALTER TABLE proposals ADD COLUMN declined_options TEXT"); // { optId: reason } — per-option declines, independent of accepted_options
  if (!propCols.includes("tech_signed_name"))    db.exec("ALTER TABLE proposals ADD COLUMN tech_signed_name TEXT");    // technician who accepted the work order
  if (!propCols.includes("tech_signed_at"))      db.exec("ALTER TABLE proposals ADD COLUMN tech_signed_at TEXT");
  if (!propCols.includes("tech_signature_data")) db.exec("ALTER TABLE proposals ADD COLUMN tech_signature_data TEXT");
  // Work order: the office finalizes the auto-created work order (payout reviewed) before a tech
  // can accept it. Null until finalized; stamped with the finalizer's name + timestamp.
  if (!propCols.includes("wo_finalized_at"))     db.exec("ALTER TABLE proposals ADD COLUMN wo_finalized_at TEXT");
  if (!propCols.includes("wo_finalized_by"))     db.exec("ALTER TABLE proposals ADD COLUMN wo_finalized_by TEXT");
  // Performance Credit Program (PCP): a pending, discretionary labor-subtotal credit that the
  // customer acknowledges (agreement) and admin finalizes at payment. See lib/proposal PCP.
  if (!propCols.includes("pcp_status"))       db.exec("ALTER TABLE proposals ADD COLUMN pcp_status TEXT");        // null | pending | approved
  if (!propCols.includes("pcp_agreed_at"))    db.exec("ALTER TABLE proposals ADD COLUMN pcp_agreed_at TEXT");    // customer acknowledged the agreement
  if (!propCols.includes("pcp_agreed_sig"))   db.exec("ALTER TABLE proposals ADD COLUMN pcp_agreed_sig TEXT");
  if (!propCols.includes("pcp_agreement_no")) db.exec("ALTER TABLE proposals ADD COLUMN pcp_agreement_no TEXT");
  if (!propCols.includes("pcp_grant_source")) db.exec("ALTER TABLE proposals ADD COLUMN pcp_grant_source TEXT");  // performance | donor | community | company
  if (!propCols.includes("pcp_approved_at"))  db.exec("ALTER TABLE proposals ADD COLUMN pcp_approved_at TEXT");   // admin finalized

  // ---- Payments / deposits recorded against a project (approval & deposit stage) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_payments (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      amount            REAL NOT NULL DEFAULT 0,
      method            TEXT,
      kind              TEXT NOT NULL DEFAULT 'deposit',
      source            TEXT NOT NULL DEFAULT 'staff',
      note              TEXT,
      recorded_by       TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_project ON project_payments(project_access_id)`);
  // Customer-submitted payments start 'pending' until staff confirm receipt; staff entries are
  // 'confirmed' at creation. Only confirmed money counts toward the balance.
  const payCols = db.prepare("PRAGMA table_info(project_payments)").all().map((c) => c.name);
  if (!payCols.includes("status")) db.exec("ALTER TABLE project_payments ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'");
  // The actual date the money changed hands (staff-set), separate from created_at (when it was logged).
  if (!payCols.includes("paid_at")) db.exec("ALTER TABLE project_payments ADD COLUMN paid_at TEXT");

  // ---- Inquiry-stage extras: appointment point-of-contact + a lightweight notes thread ----
  if (!cols.includes("poc_name"))  db.exec("ALTER TABLE projects ADD COLUMN poc_name TEXT");
  if (!cols.includes("poc_phone")) db.exec("ALTER TABLE projects ADD COLUMN poc_phone TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_notes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      author_role       TEXT,
      author_name       TEXT,
      body              TEXT NOT NULL,
      created_at        TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_project ON project_notes(project_access_id)`);
  // scope tags a note to a surface (survey / mockup / general) so a customer's "change this"
  // comment on the site survey shows under the survey, not mixed into general project notes.
  const noteCols = db.prepare("PRAGMA table_info(project_notes)").all().map((c) => c.name);
  if (!noteCols.includes("scope")) db.exec("ALTER TABLE project_notes ADD COLUMN scope TEXT DEFAULT 'general'");
  // `public` = is this note visible to the customer. Staff notes default internal (0) and can be
  // toggled public; a customer's own note is always public (1). The Job Log reads this flag.
  if (!noteCols.includes("public")) db.exec("ALTER TABLE project_notes ADD COLUMN public INTEGER DEFAULT 0");
  // A tech/sales rep can't publish directly — they REQUEST it (pending_public=1) and an admin or
  // manager approves. Admin/manager set public straight away.
  if (!noteCols.includes("pending_public")) db.exec("ALTER TABLE project_notes ADD COLUMN pending_public INTEGER DEFAULT 0");
  // `anchor` tags a comment to the specific ITEM the customer tapped (e.g. "Camera 3", "Front Door")
  // within a scope, so tap-to-comment threads read against the thing they're about.
  if (!noteCols.includes("anchor")) db.exec("ALTER TABLE project_notes ADD COLUMN anchor TEXT");

  // ---- Job Log events ----  append-only activity beyond stage acceptances (calls placed, etc.).
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      kind              TEXT NOT NULL,
      label             TEXT,
      actor             TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_project ON project_events(project_access_id)`);

  // ---- Server copy of the browser tools' working data (survey / mockup / schedule) ----
  // These tools draft in localStorage for speed; this table is the authoritative backup so a
  // cleared cache or a different device never loses a site survey. One row per project+tool.
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_tool_data (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      tool              TEXT NOT NULL,
      data              TEXT NOT NULL,
      updated_by        TEXT,
      updated_at        TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(project_access_id, tool)
    )
  `);
  // One row per appointment we've already sent a 24h reminder for — so the hourly sweep fires
  // each reminder exactly once (see lib/appointment-reminders.js).
  db.exec(`
    CREATE TABLE IF NOT EXISTS appt_reminders (
      event_key TEXT PRIMARY KEY,
      sent_at   TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // ---- Uploaded photos (HEIC-safe): the /api/media route converts every upload to JPEG
  // server-side (iPhone HEIC → JPEG, since browsers/desktops can't decode HEVC) and stores the
  // bytes here. Tools save the returned /api/media/:id URL instead of multi-MB base64 data-URLs.
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id                TEXT PRIMARY KEY,
      project_access_id TEXT,
      kind              TEXT,
      mime              TEXT NOT NULL DEFAULT 'image/jpeg',
      bytes             BLOB NOT NULL,
      w                 INTEGER,
      h                 INTEGER,
      created_by        TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      voided            INTEGER DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_media_project ON media(project_access_id)`);

  // ---- Per-stage customer acceptances (site survey / mockup gating) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_acceptances (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      stage             TEXT NOT NULL,
      accepted_by       TEXT,
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(project_access_id, stage)
    )
  `);
  // Data fingerprint captured at approval time — if the survey/mockup changes later, the stored
  // fingerprint no longer matches and the approval is treated as void (customer must re-approve).
  const saCols = db.prepare("PRAGMA table_info(stage_acceptances)").all().map(c => c.name);
  if (!saCols.includes("fingerprint")) db.exec("ALTER TABLE stage_acceptances ADD COLUMN fingerprint TEXT");

  // ---- Stage transition log — one row each time a project enters a stage, so we can report
  // "days in current stage" (real per-stage aging) instead of guessing off last activity. ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_transitions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_access_id TEXT NOT NULL,
      stage             TEXT NOT NULL,
      entered_at        TEXT DEFAULT (datetime('now','localtime')),
      by_name           TEXT
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_stage_trans ON stage_transitions(project_access_id, id)");
  // Backfill: seed a transition for every project's CURRENT stage so aging has a start point on
  // day one. The true historical entry time is unknown, so we estimate with the project's start
  // (created_at); every future move is logged exactly at the moment it happens.
  {
    const need = db.prepare(`
      SELECT p.access_id, p.stage, p.created_at FROM projects p
      WHERE NOT EXISTS (SELECT 1 FROM stage_transitions t WHERE t.project_access_id = p.access_id AND t.stage = p.stage)
    `).all();
    const ins = db.prepare("INSERT INTO stage_transitions (project_access_id, stage, entered_at, by_name) VALUES (?,?,?,'backfill')");
    for (const r of need) ins.run(r.access_id, r.stage, r.created_at || null);
  }

  // ---- Company-wide default price book (single row) — the proposal gear "Default pricing" ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_book (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      prices      TEXT NOT NULL DEFAULT '{}',
      updated_by  TEXT,
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec(`INSERT OR IGNORE INTO price_book (id, prices) VALUES (1, '{}')`);

  // ---- Technician work-order rate library — one row per scope ("default" or "tech:<name>") ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_book (
      scope       TEXT PRIMARY KEY,
      data        TEXT NOT NULL DEFAULT '{}',
      updated_by  TEXT,
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // Support library — FAQ / knowledge-base articles. Admin/manager author; everyone reads.
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_articles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT 'General',
      pinned      INTEGER DEFAULT 0,
      author      TEXT,
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  // Seed a small starter library so the page opens with real, editable examples (not an empty shell).
  if (db.prepare("SELECT COUNT(*) AS n FROM support_articles").get().n === 0) {
    const seedArticle = db.prepare("INSERT INTO support_articles (title, body, category, pinned, author) VALUES (?,?,?,?,?)");
    for (const a of SUPPORT_SEED) seedArticle.run(a.title, a.body, a.category, a.pinned ? 1 : 0, "IOT TECHS");
  }
  // `kind` = 'article' (plain FAQ) or 'guide' (interactive animated walkthrough; body holds step JSON).
  const supCols = db.prepare("PRAGMA table_info(support_articles)").all().map((c) => c.name);
  if (!supCols.includes("kind")) db.exec("ALTER TABLE support_articles ADD COLUMN kind TEXT DEFAULT 'article'");
  // `slug` is the public URL of a guide (/guide/<slug>). Guides are many now, not one.
  if (!supCols.includes("slug")) db.exec("ALTER TABLE support_articles ADD COLUMN slug TEXT");
  // `audience` = 'customer' (the public/help library) or 'tech' (the technician support portal).
  if (!supCols.includes("audience")) db.exec("ALTER TABLE support_articles ADD COLUMN audience TEXT DEFAULT 'customer'");
  // Seed the built-in Mobile App Setup guide once (the animated device walkthrough)…
  if (db.prepare("SELECT COUNT(*) AS n FROM support_articles WHERE kind='guide'").get().n === 0) {
    db.prepare("INSERT INTO support_articles (title, body, category, kind, slug, pinned, author) VALUES (?,?,?,?,?,?,?)")
      .run("Mobile App Setup", JSON.stringify(MOBILE_SETUP_GUIDE), "Getting Started", "guide", "mobile-setup", 1, "IOT TECHS");
  }
  // …and keep its body in sync with the code on every boot. It's the built-in, code-defined guide
  // (the code is the source of truth), so edits to MOBILE_SETUP_GUIDE — new steps, store links —
  // actually ship instead of being frozen at the first seed.
  db.prepare("UPDATE support_articles SET body=? WHERE slug='mobile-setup' AND kind='guide'").run(JSON.stringify(MOBILE_SETUP_GUIDE));
  // Backfill: the first guide predates slugs and its URL is already in customers' hands.
  db.prepare("UPDATE support_articles SET slug='mobile-setup' WHERE kind='guide' AND (slug IS NULL OR slug='') AND title LIKE 'Mobile App Setup%'").run();
  for (const g of db.prepare("SELECT id, title FROM support_articles WHERE kind='guide' AND (slug IS NULL OR slug='')").all()) {
    db.prepare("UPDATE support_articles SET slug=? WHERE id=?").run(slugify(g.title, g.id), g.id);
  }
  // Seed the rest of the Welcome Package. Keyed by slug and insert-only, so this adds guides that
  // don't exist yet and never overwrites one the owner has since edited.
  const hasSlug = db.prepare("SELECT 1 FROM support_articles WHERE slug=? LIMIT 1");
  const addGuide = db.prepare("INSERT INTO support_articles (title, body, category, kind, slug, pinned, author) VALUES (?,?,?,'guide',?,0,?)");
  for (const g of GUIDE_SEED) {
    if (hasSlug.get(g.slug)) continue;
    addGuide.run(g.title, JSON.stringify({ surface: g.surface || "mobile", order: g.order ?? 999, ready: g.ready === true, flow: g.flow || {}, steps: g.steps }), g.category, g.slug, "IOT TECHS");
  }

  // Reconcile placement + order onto existing rows so re-orderings ship without a manual migration.
  // Only touches surface/order (structural metadata the owner doesn't edit in-UI); steps preserved.
  const placement = [{ slug: "mobile-setup", surface: "mobile", order: 1, ready: true }, ...GUIDE_SEED.map((g) => ({ slug: g.slug, surface: g.surface, order: g.order, ready: g.ready === true }))];
  for (const p of placement) {
    const row = db.prepare("SELECT id, body FROM support_articles WHERE slug=? AND kind='guide'").get(p.slug);
    if (!row) continue;
    let b; try { b = JSON.parse(row.body); } catch { continue; }
    if (p.surface) b.surface = p.surface;
    if (p.order != null) b.order = p.order;
    b.ready = p.ready === true;
    db.prepare("UPDATE support_articles SET body=? WHERE id=?").run(JSON.stringify(b), row.id);
  }
  // One-time title rename; guarded so an owner edit isn't clobbered.
  db.prepare("UPDATE support_articles SET title='Set the Time' WHERE slug='nvr-time-sync' AND title='Fix the Time'").run();

  // Seed the technician support portal once (audience:'tech'), separate from the customer library.
  if (db.prepare("SELECT COUNT(*) AS n FROM support_articles WHERE audience='tech'").get().n === 0) {
    const seedTech = db.prepare("INSERT INTO support_articles (title, body, category, pinned, author, audience) VALUES (?,?,?,?,?,'tech')");
    for (const a of TECH_SUPPORT_SEED) seedTech.run(a.title, a.body, a.category, a.pinned ? 1 : 0, "IOT TECHS");
  }

  // One-time backfill: correct timestamps written while the server ran in UTC (see below).
  shiftTimestampsToEastern(db, path.join(dir, "dashboard.db"));

  return db;
}

// One-time data repair. Production rows were written while the server OS was UTC, where SQLite's
// datetime('now','localtime') === datetime('now') === UTC. Every stored wall-clock timestamp is
// therefore 4–5h ahead of Eastern. Now that the process runs with TZ=America/New_York,
// datetime(col,'localtime') re-reads each stored value AS UTC and converts it to Eastern —
// DST-aware per row (−4h in EDT, −5h in EST). Runs exactly once, only in production (local dev
// already wrote Eastern), only once the server is actually on Eastern, and takes a file backup first.
function shiftTimestampsToEastern(db, dbPath) {
  try {
    db.exec("CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT)");
    if (db.prepare("SELECT 1 FROM app_meta WHERE k='tz_shift_eastern_v1'").get()) return; // already handled
    if (process.env.NODE_ENV !== "production") {
      // Local dev data is already Eastern — never shift it; mark done so this stays a no-op here.
      db.prepare("INSERT OR REPLACE INTO app_meta (k,v) VALUES ('tz_shift_eastern_v1','skipped-nonprod')").run();
      return;
    }
    // Only proceed once TZ is actually Eastern — if localtime still equals UTC the fix hasn't taken
    // effect yet, so bail WITHOUT marking done and retry on the next boot.
    const offH = db.prepare("SELECT CAST(ROUND((julianday(datetime('now')) - julianday(datetime('now','localtime'))) * 24) AS INTEGER) AS h").get().h;
    if (!offH) { console.warn("[tz-shift] localtime still == UTC; deferring backfill until TZ=Eastern is live"); return; }

    try { copyFileSync(dbPath, dbPath + ".pre-tzshift.bak"); } catch (e) { console.error("[tz-shift] backup failed, aborting:", e); return; }

    let total = 0;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    db.exec("BEGIN");
    for (const { name } of tables) {
      if (name === "app_meta") continue;
      for (const c of db.prepare(`PRAGMA table_info("${name}")`).all()) {
        if (!/(^|_)at$/.test(c.name)) continue; // only wall-clock event columns (…_at / at)
        // Shift only values in SQLite's exact "YYYY-MM-DD HH:MM:SS" form (skip nulls, dates, ISO/epoch).
        const r = db.prepare(
          `UPDATE "${name}" SET "${c.name}" = datetime("${c.name}",'localtime') ` +
          `WHERE "${c.name}" LIKE '____-__-__ __:__:__' AND length("${c.name}") = 19`
        ).run();
        total += Number(r.changes || 0);
      }
    }
    db.prepare("INSERT OR REPLACE INTO app_meta (k,v) VALUES ('tz_shift_eastern_v1', ?)").run(`${total} rows, offset ${offH}h`);
    db.exec("COMMIT");
    console.log(`[tz-shift] converted ${total} timestamp values UTC→Eastern (backup: ${dbPath}.pre-tzshift.bak)`);
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("[tz-shift] failed:", e);
  }
}

// The Mobile App Setup walkthrough — a sequence of animated steps rendered by GuideWalkthrough.
// Each step: `art` = which animated illustration to show, plus editable title/text. Ties into the
// System QR card the customer was handed. Kept brand-neutral so the owner can tailor the app name.
const MOBILE_SETUP_GUIDE = {
  intro: "",
  surface: "mobile",
  order: 1,
  ready: true,
  // `flow` turns the setup-specific screens on. Other guides leave these off and are a plain
  // step-through — a troubleshooting guide shouldn't demand a System QR before showing anything.
  flow: { askPlatform: true, needsSystem: true, consent: true, addMore: true },
  steps: [
    // store:true makes the mockup + a button link to the right listing for their platform.
    { art: "download", image: "/guides/annke/01.png", title: "Get the app",       text: "Install Annke Vision.", store: true },
    { art: "account",  image: "/guides/annke/02.png", title: "Open it",           text: "Tap Register.",                          tap: { x: 18, y: 44, w: 32, h: 5 } },
    { art: "account",  image: "/guides/annke/03.png", title: "Agree",             text: "Tap Agree.",                             tap: { x: 50, y: 60, w: 60, h: 6 } },
    { art: "account",  image: "/guides/annke/04.png", title: "Pick your country", text: "Choose USA." },
    { art: "account",  image: "/guides/annke/05.png", title: "Use your phone",    text: "Tap “Register by Mobile Phone Number.”", tap: { x: 50, y: 94, w: 68, h: 4 } },
    // 06 and 07 are the same screen (before/after typing), so they're one step — splitting them let
    // people submit the form on "06" before the password instruction ever appeared.
    { art: "account",  image: "/guides/annke/07.png", title: "Number and password", text: "Type your mobile number, set the password to {PASSWORD}, then tap Get Security Code.", tap: [{ x: 50, y: 28, w: 82, h: 6 }, { x: 50, y: 40, w: 82, h: 6 }, { x: 50, y: 88, w: 88, h: 6 }], why: "Use this exact password — not a personal one. It’s the shared password we agreed on." },
    { art: "account",  image: "/guides/annke/08.png", title: "Enter the code",    text: "Check your texts. Tap Finish.",          tap: { x: 50, y: 32, w: 82, h: 7 } },
    { art: "device",   image: "/guides/annke/09.png", title: "Add a device",      text: "Tap Add Device.",                        tap: { x: 50, y: 61, w: 58, h: 7 } },
    { art: "qr",       image: "/guides/annke/10.png", title: "Choose Scan QR",    text: "Tap Scan QR Code.",                      tap: { x: 50, y: 78, w: 84, h: 7 } },
    { art: "qr",       image: "/guides/annke/11.png", title: "Upload your QR",    text: "Tap Album, then pick the QR code we gave you.", tap: { x: 21, y: 90, w: 18, h: 9 } },
  ],
};

// The rest of the Welcome Package, as interactive guides. Step text is condensed from the printed
// booklet — short lines, one action each, because these are read on a phone by someone who is not
// technical. Screenshots get attached per step later; until then each step falls back to its `art`
// animation. `flow: {}` means a plain step-through: no platform question, no System QR, no consent.
// NOTE: the booklet's "Password1" is replaced everywhere by {PASSWORD} (Cam + the system ZIP).
const GUIDE_SEED = [
  {
    // The showcase reel — what the system can do, in the app. Steps use `art` filler animations and
    // `video`/`image` slots the owner maps to real captures later. `landscape:true` rotates the
    // phone for the full-screen playback beat.
    slug: "system-demo", title: "System Demo", surface: "demo", order: 1, ready: false, category: "Demo",
    steps: [
      { art: "device",   image: "/guides/annke/09.png", title: "Open your system", text: "Tap your recorder to jump in." },
      { art: "live",     video: "/demo/live.mp4",  videoLandscape: "/demo/live-land.mp4",  title: "Live view",  text: "Every camera, live. Rotate your phone for the wide view." },
      { art: "notify",                                   title: "Get alerts",     text: "Motion alerts arrive the moment they happen." },
      { art: "playback", video: "/demo/playback.mp4", videoLandscape: "/demo/playback-land.mp4", title: "Playback", text: "Scrub back through the whole day." },
      { art: "playback", landscape: true, video: "/demo/playback-land.mp4", title: "Full screen", text: "Rotate your phone for a full-screen view." },
      { art: "zoom",                                     title: "Zoom the timeline", text: "Pinch to find the exact moment." },
      { art: "screenshot",                               title: "Screenshot",     text: "Grab a still and save it to your photos." },
      { art: "clip",                                     title: "Save a clip",    text: "Trim a moment and share it." },
    ],
  },
  {
    slug: "admin-transfer", title: "Add Your System", surface: "nvr", order: 2, ready: false, category: "Getting Started",
    steps: [
      { art: "device", device: "monitor", title: "Wake the recorder",   text: "Right-click anywhere on the recorder’s screen." },
      { art: "device", device: "monitor", title: "Open the menu",       text: "Choose Menu." },
      { art: "device", device: "monitor", title: "Go to Network",       text: "Pick Network on the left." },
      { art: "device", device: "monitor", title: "Platform Access",     text: "Choose the middle option: Platform Access." },
      { art: "device", device: "monitor", title: "Check it says Online", text: "If it doesn’t say Online, call us before going further." },
      { art: "qr",     title: "Open the app",        text: "On your phone, open Annke Vision." },
      { art: "qr",     title: "Tap +",               text: "Tap the + in the top right corner." },
      { art: "qr",     title: "Scan QR Code",        text: "Choose Scan QR Code." },
      { art: "qr",     title: "Scan the recorder",   text: "Point your phone at the QR code on the recorder’s screen. Your system is added." },
    ],
  },
  {
    slug: "share-system", title: "Share With Family", surface: "mobile", order: 2, ready: true, category: "Everyday Use",
    // Mirrors the SHARE_STEPS flow built into mobile-setup (guide-walkthrough.jsx): colour key,
    // whose-phone badges, the built-in QR picker, and the scan/upload + accept steps. Keep in sync.
    steps: [
      { legend: true, title: "Two phones", text: "This part moves between two phones. Green steps are on YOUR phone. Red steps are on their device." },
      { who: "them", image: "/guides/annke/01.png",       title: "They get the app",   text: "Have them install Annke Vision." },
      { who: "you",  showQr: true,                          title: "Share your QR",      text: "Pick which system to share, then hold the QR up for them to scan — or text it to them." },
      { who: "them", image: "/guides/annke/11.png",       title: "Scan or upload",     text: "They point at your QR to scan it — or tap Album (bottom-left) to pick the photo you sent.", tap: { x: 21, y: 90, w: 18, h: 9 } },
      { who: "them", image: "/guides/annke/share-01.png", title: "Apply for Sharing",  text: "They tap Apply for Sharing.",         tap: { x: 50, y: 66, w: 70, h: 6 } },
      { who: "them", image: "/guides/annke/share-02.png", title: "Request sent",       text: "They tap OK.",                        tap: { x: 50, y: 58, w: 40, h: 6 } },
      { who: "you",  image: "/guides/annke/share-03.png", title: "Check your phone",   text: "“You have 1 new sharing” appears at the top. Tap it.", tap: { x: 50, y: 13, w: 97, h: 5 } },
      { who: "you",  image: "/guides/annke/share-04.png", title: "Check the number",   text: "Make sure the number is theirs, then tap the system to choose cameras.",
        tap: [{ x: 50, y: 25, w: 92, h: 5 }, { x: 50, y: 18, w: 92, h: 6 }],
        why: "Only accept a request from a number you recognise. Accepting gives that person live view of your cameras." },
      { who: "you",  image: "/guides/annke/share-05.png", title: "Pick cameras",       text: "Tick the cameras to share, then tap Finish.", tap: [{ x: 50, y: 16, w: 60, h: 4 }, { x: 50, y: 95, w: 92, h: 5 }] },
      { who: "you",  image: "/guides/annke/share-04.png", title: "Accept",             text: "You’re back here. Tap Accept — they’re in.", tap: { x: 75, y: 34, w: 48, h: 5 } },
    ],
  },
  {
    slug: "nvr-time-sync", title: "Set the Time", surface: "nvr", order: 3, ready: false, category: "Troubleshooting",
    steps: [
      { art: "device", title: "Open the app",       text: "Go to the Home screen." },
      { art: "device", title: "Open the menu",      text: "Tap the three dots next to your system." },
      { art: "device", title: "Settings",           text: "Choose Settings." },
      { art: "device", title: "Web Configuration",  text: "Tap Web Configuration." },
      { art: "device", title: "Confirm",            text: "When it asks to Select NVR/DVR, tap OK." },
      { art: "device", title: "System",             text: "Choose System from the left menu." },
      { art: "device", title: "System Settings",    text: "Tap System Settings." },
      { art: "device", title: "Time Settings",      text: "Switch to the Time Settings tab." },
      { art: "device", title: "Manual Time Sync",   text: "Turn on Manual Time Sync." },
      { art: "device", title: "Sync",               text: "Tap Sync with Mobile Time, then Save." },
    ],
  },
  {
    slug: "rename-cameras", title: "Rename Cameras", surface: "nvr", order: 4, ready: false, category: "Everyday Use",
    steps: [
      { art: "device", title: "Open the app",      text: "Open Annke Vision." },
      { art: "device", title: "Open the menu",     text: "Tap the three dots next to your system." },
      { art: "device", title: "Settings",          text: "Choose Settings." },
      { art: "device", title: "Channel Management", text: "Tap Channel Management." },
      { art: "device", title: "Pick a camera",     text: "Choose the camera you want to rename." },
      { art: "name",   title: "Type the new name", text: "Tap Channel Name and type it — “Front Door,” “Driveway.”" },
      { art: "name",   title: "Save",              text: "Tap the check mark in the top right. You’ll see Completed." },
    ],
  },
  {
    slug: "admin-pattern", title: "Admin Pattern", surface: "nvr", order: 1, ready: true, category: "Getting Started",
    steps: [
      // One screen, one gesture — the recorder asks for the pattern and that is the whole task. The
      // reveal draws the G over the real lock screen, then fades to the live cameras.
      { title: "Draw the G",
        text: "When the recorder asks for the pattern, draw the G — start top-right and trace it as shown.",
        reveal: { lockedSrc: "/guides/nvr/pattern-locked.png", cleanSrc: "/guides/nvr/pattern-clean.png", pattern: [3, 2, 1, 4, 7, 8, 9, 6, 5] },
        why: "This is the admin pattern for your system. Keep it private — it unlocks settings that can turn cameras off." },
    ],
  },
  {
    slug: "mic-off", title: "Turn Off the Mic", surface: "nvr", order: 5, ready: false, category: "Everyday Use",
    steps: [
      { art: "device", title: "Open the app",      text: "Tap Home in the bottom left." },
      { art: "device", title: "Open the menu",     text: "Find your system and tap the three dots." },
      { art: "device", title: "Settings",          text: "Choose Settings, then Web Configuration." },
      { art: "device", title: "Confirm",           text: "When it asks to Select NVR/DVR, tap OK." },
      { art: "device", title: "Video and Audio",   text: "Under Configuration, tap Video and Audio — then tap it again for the channel list." },
      { art: "device", title: "Pick a camera",     text: "Choose the camera you want to change." },
      { art: "device", title: "Video Stream Only", text: "Tap Video Type and change it from Video and Audio to Video Stream Only." },
      { art: "device", title: "Save",              text: "Tap OK, then Save. You’ll see Saved.",
        why: "Audio recording laws vary by state. Please check your local laws, or ask an attorney, before recording audio." },
    ],
  },
  {
    slug: "change-passwords", title: "Change Passwords", surface: "nvr", order: 6, ready: false, category: "Getting Started",
    steps: [
      { art: "account", title: "Open More",        text: "In the app, tap More in the bottom right." },
      { art: "account", title: "Tap your account", text: "Tap your name, email, or phone number at the top." },
      { art: "account", title: "Account Manager",  text: "Open Account Manager." },
      { art: "account", title: "Change password",  text: "Choose Change App Account Password." },
      { art: "account", title: "Old, then new",    text: "Enter {PASSWORD}, then your new password. Confirm and save.",
        why: "Write the new password down and keep it somewhere safe. If it’s lost, a reset can cost $100–$300 depending on your system." },
      { art: "device",  title: "Now the recorder", text: "For the recorder itself: Home → three dots → Settings → Web Configuration → NVR/DVR." },
      { art: "device",  title: "User Management",  text: "Tap System, then User Management." },
      { art: "device",  title: "Edit Admin",       text: "Tap Admin, then Edit." },
      { art: "device",  title: "Set the new one",  text: "Enter the current password, then the new one. Confirm and save." },
    ],
  },
  {
    slug: "add-system-user", title: "Add a User", surface: "nvr", order: 7, ready: false, category: "Everyday Use",
    steps: [
      { art: "device", title: "Open User Management", text: "Home → three dots → Settings → Web Configuration → System → User Management." },
      { art: "name",   title: "Tap +",                text: "Tap the + in the top right." },
      { art: "name",   title: "Fill in their details", text: "Enter their name and password." },
      { art: "device", title: "Choose permissions",   text: "Pick what they’re allowed to do." },
      { art: "device", title: "Save",                 text: "Save. Limiting permissions keeps admin-only settings safe.",
        why: "Give family and staff their own limited user instead of the admin login — it stops accidental changes to the system." },
    ],
  },
  {
    slug: "monthly-reset", title: "Monthly Reset", surface: "nvr", order: 8, ready: false, category: "Troubleshooting",
    steps: [
      { art: "device", title: "Why reset",     text: "A monthly restart fixes about 90% of common problems and keeps your system healthy." },
      { art: "device", title: "Power it off",  text: "Unplug the recorder for 1–2 minutes." },
      { art: "device", title: "Power it on",   text: "Plug it back in and give it a few minutes to come up." },
      { art: "device", title: "Still stuck?",  text: "If a camera is still offline, call us at 646-396-0775. We’re here 24/7." },
    ],
  },
];

// Starter knowledge-base content — editable/archivable from the Support page. Kept generic (no
// customer data) so it's a useful template the owner can rewrite.
const SUPPORT_SEED = [
  { category: "Getting Started", pinned: 1, title: "How do I access my project portal?",
    body: "Go to the login page and choose the “Project ID” tab. Enter your Project ID — the full ID (e.g. ASC00SK) or just its last 4 digits — then enter the PIN printed on your service agreement. Your PIN is usually the last 4 digits of the phone number on file." },
  { category: "Getting Started", pinned: 0, title: "What do the project stages mean?",
    body: "Every project moves through: Inquiry → Site Survey → Proposal → Approval & Deposit → Schedule → Install → QC → Payment → Completion. Your portal always shows the current stage and the one action needed next." },
  { category: "Billing", pinned: 0, title: "How is my deposit calculated?",
    body: "The deposit is a percentage of the pre-tax project total (typically 50%). It’s shown on your proposal and must be received before the work order is scheduled. The remaining balance is due at completion unless your agreement says otherwise." },
  { category: "Billing", pinned: 0, title: "What is the PCP credit on my invoice?",
    body: "The Performance Credit Program (PCP) is a discretionary labor credit we may apply back to your project. When one is granted, it appears as a credit line on your proposal and you can approve it in one click from your portal." },
  { category: "Technical", pinned: 0, title: "My camera is offline — what should I do?",
    body: "First check the camera has power and the network cable is seated. Power-cycle the NVR (unplug 30 seconds, plug back in). If it’s still offline after a few minutes, open a support ticket from your portal with the camera name and we’ll dispatch a technician." },
  { category: "Warranty", pinned: 0, title: "What does my warranty cover?",
    body: "Standard installs carry a workmanship warranty (6, 12, or 24 months — see your completion record). It covers labor to correct install-related faults. Hardware is covered by the manufacturer’s warranty. Accidental damage and power surges are not covered." },
];

// Technician-facing knowledge base — field diagnostics and service-call procedure. Blunt and
// technical on purpose; this is for staff on a call, not customers. Seeded with audience:'tech'.
const TECH_SUPPORT_SEED = [
  { category: "Service Calls", pinned: 1, title: "Service call — arrival checklist",
    body: "1. Confirm the ticket + system model before leaving. 2. Verify the reported fault yourself; don't trust the description. 3. Check NVR status page (Menu → Maintenance → System Info) and note firmware. 4. Photograph the rack/NVR and any fault before touching anything. 5. Log the fix and parts used on the ticket, with before/after photos." },
  { category: "Cameras", pinned: 0, title: "Camera offline — diagnostic order",
    body: "Work outside-in: 1. PoE — check the switch/NVR port LED; move the camera to a known-good port. 2. Cable — test with a spare patch lead; re-terminate if the run is suspect (TIA-568B both ends). 3. Power budget — sum camera wattage vs switch PoE budget; IR cameras spike at night. 4. IP conflict — ping the camera IP; check for a duplicate. 5. Camera — factory-reset (hold reset 15s), re-add. If still dead after a known-good port + cable + power, RMA the camera." },
  { category: "Cameras", pinned: 0, title: "No image at night / IR not working",
    body: "Daytime fine, night black = IR or exposure. 1. Confirm IR LEDs glow faint red in the dark (phone camera sees them). 2. Check for spider webs / dust on the dome — #1 cause of night glare and false motion. 3. Day/Night mode set to Auto, not Colour. 4. IR cut filter should click at dusk — listen for it. 5. If LEDs are dead, it's a hardware fault → RMA." },
  { category: "Recorder", pinned: 0, title: "NVR not recording",
    body: "1. Storage — Menu → HDD: is the disk Normal, or Uninitialised/Error? Initialise a new disk; a failing disk shows SMART warnings. 2. Recording schedule — confirm Continuous or Motion is actually enabled on the channel, all-day. 3. Overwrite — if the disk is full and overwrite is off, recording stops. Turn on Overwrite. 4. Channel — a camera in a fault state won't record; fix the feed first. Note SMART health on the ticket if the disk is aging." },
  { category: "Network", pinned: 0, title: "Remote view fails but local works",
    body: "Local live view fine, app/remote fails = WAN/P2P. 1. NVR → Network → Platform Access (P2P): status must read Online. 2. Check the NVR has a valid gateway + DNS (DHCP or static that matches the LAN). 3. Router — no double-NAT; P2P needs outbound 443/UDP. 4. Re-add the device in Annke Vision if the P2P register is stale. Avoid manual port-forwarding unless P2P is blocked on-site." },
  { category: "Recorder", pinned: 0, title: "Forgotten admin password / lockout",
    body: "Do NOT hard-reset a live system — it wipes camera bindings and recordings config. 1. Try the shared Cam+ZIP password if within the first-week window. 2. Use the pattern unlock if set. 3. If truly locked, generate a reset code via the recorder's date-based flow and contact the manufacturer with the device serial. Resets on complex systems bill $100–$300; quote before proceeding." },
];

function makePins(accessId) {
  let h = 0;
  for (let i = 0; i < accessId.length; i++) h = (h * 31 + accessId.charCodeAt(i)) >>> 0;
  const customer = String(1000 + (h % 9000));
  const tech = String(100000 + ((h * 7 + 13) % 900000));
  return { customer, tech };
}

// Owner rule: a project's customer PIN is ALWAYS the last 4 digits of the contact phone.
// Returns null when there's no usable phone (caller falls back to a derived PIN).
function phonePin(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
}

// Internal-user PIN login (owner rule): every staff member — tech, sales, manager, admin —
// can PIN into a project with the LAST 4 OF THEIR OWN PHONE, or a custom PIN if one is set
// on their account (users.pin_custom). Custom PINs win over phone matches so an admin-set
// PIN can never be shadowed by someone else's phone digits. Returns the matched user or null.
export function findInternalUserByPin(entered) {
  const pin = String(entered || "").replace(/\D/g, "");
  if (pin.length !== 4) return null;
  const staff = db.prepare(
    "SELECT * FROM users WHERE role IN ('tech','sales','manager','admin') AND (disabled IS NULL OR disabled=0)"
  ).all();
  return staff.find((u) => u.pin_custom && String(u.pin_custom).trim() === pin)
      || staff.find((u) => !u.pin_custom && phonePin(u.phone) === pin)
      || null;
}

// An internal user's effective project PIN: their custom PIN if set, else last-4-of-phone.
export function userEffectivePin(user) {
  return user?.pin_custom ? String(user.pin_custom).trim() : phonePin(user?.phone);
}

// The primary admin account (lowest id) — who the master admin PIN logs in AS, so that override
// gets a real cross-project session (dashboard access + correct attribution), not a synthetic one.
export function getPrimaryAdmin() {
  return db.prepare("SELECT * FROM users WHERE role='admin' AND (disabled IS NULL OR disabled=0) ORDER BY id ASC LIMIT 1").get() || null;
}

// Projects that have a generated System QR — powers the guide's "which system?" picker.
// Pass the caller's own scope (all for admin/manager; a single customer's list in their portal).
export function getProjectsWithSystemQr(rows) {
  const src = rows || db.prepare("SELECT access_id, customer, address, system_qr FROM projects WHERE system_qr IS NOT NULL AND system_qr != ''").all();
  return src
    .filter((p) => p.system_qr)
    .map((p) => ({
      access_id: p.access_id,
      customer: p.customer || p.access_id,
      system_qr: p.system_qr,
      // ZIP drives the app password (Cam<ZIP>) — pulled from the project address.
      zip: (String(p.address || "").match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1] || "",
    }));
}

// Admin System-QR library: every project that has a QR, with the fields you'd search by
// (customer, address, phone, ID). The QR image itself lives in system_qr (a data URL).
// Site-survey library — every project's survey in one searchable place, WITH the finished
// background photo as a thumbnail. Reads the new tool (survey2: floors[].bg + devices[]) first,
// falling back to the legacy engine (survey: floors[].markers + B.rooms) for historical projects.
export function getSurveyLibrary() {
  const THUMB_CAP = 700 * 1024;   // chars — larger first backgrounds ship as a count-only card
  return db.prepare(
    `SELECT p.access_id, p.customer, p.address, p.contact_name, p.created_at,
            t2.data AS s2, t2.updated_by AS ub2, t2.updated_at AS ua2,
            t1.data AS s1, t1.updated_by AS ub1, t1.updated_at AS ua1
       FROM projects p
       LEFT JOIN project_tool_data t2 ON t2.project_access_id = p.access_id AND t2.tool = 'survey2'
       LEFT JOIN project_tool_data t1 ON t1.project_access_id = p.access_id AND t1.tool = 'survey'
      ORDER BY (COALESCE(t2.data,t1.data) IS NOT NULL) DESC, COALESCE(t2.updated_at,t1.updated_at,'') DESC, p.id DESC`
  ).all().map((p) => {
    let floors = 0, devices = 0, rooms = 0, title = "", thumb = null, submitted = false, parsed = false;
    // New tool (survey2): each floor carries a bg image + placed devices — show the first bg as a thumb.
    try {
      const d = JSON.parse(p.s2 || "null");
      if (d && Array.isArray(d.floors)) {
        parsed = true;
        submitted = !!d.submitted;
        const real = d.floors.filter((f) => f && (f.started || f.bg || (f.devices || []).length));
        floors = real.length;
        for (const f of real) devices += (f.devices || []).length;
        const bg = real.map((f) => f && f.bg).find((b) => typeof b === "string" && b.startsWith("data:image"));
        if (bg && bg.length <= THUMB_CAP) thumb = bg;
      }
    } catch { /* bad blob */ }
    // Legacy engine (survey): counts only.
    if (!parsed) {
      try {
        const d = JSON.parse(p.s1 || "null");
        if (d && Array.isArray(d.floors)) {
          title = d.surveyTitle || "";
          floors = d.floors.length;
          for (const f of d.floors) { devices += (f?.markers || []).length; rooms += (f?.B?.rooms || []).length; }
        }
      } catch { /* bad blob */ }
    }
    return {
      access_id: p.access_id,
      customer: p.customer || p.contact_name || p.access_id,
      address: p.address || "",
      has: floors > 0 || devices > 0,
      title, floors, devices, rooms, thumb, submitted,
      updated_by: p.ub2 || p.ub1 || null,
      updated_at: p.ua2 || p.ua1 || null,
    };
  });
}

// ---- Global floor-plan library (reusable finished plans) ----
// Save a finished plan for reuse. Deduped by content hash so re-saving the same image is a no-op.
export function addFloorplan({ image, thumb, name, project, kind, actor } = {}) {
  if (typeof image !== "string" || !image.startsWith("data:image")) return { ok: false, error: "no image" };
  const hash = createHash("sha256").update(image).digest("hex");
  const hit = db.prepare("SELECT id FROM floorplan_library WHERE hash=?").get(hash);
  if (hit) return { ok: true, id: hit.id, dup: true };
  const r = db.prepare(
    "INSERT INTO floorplan_library (name,image,thumb,hash,source_project,kind,created_by) VALUES (?,?,?,?,?,?,?)"
  ).run(name || null, image, thumb || null, hash, project || null, kind || "aerial", actor || null);
  return { ok: true, id: Number(r.lastInsertRowid) };
}
// List for the picker grid — thumbs only (full image fetched on pick), newest first. When `project`
// is given, only that project's own saved plans are returned (the survey library is per-project — you
// reuse plans you made HERE, not every other job's aerials).
export function listFloorplans(limit = 60, project = null) {
  const lim = Math.max(1, Math.min(200, limit));
  if (project) {
    return db.prepare(
      "SELECT id,name,COALESCE(thumb,image) AS thumb,source_project,kind,created_at FROM floorplan_library WHERE source_project=? ORDER BY id DESC LIMIT ?"
    ).all(String(project), lim);
  }
  return db.prepare(
    "SELECT id,name,COALESCE(thumb,image) AS thumb,source_project,kind,created_at FROM floorplan_library ORDER BY id DESC LIMIT ?"
  ).all(lim);
}
// Full plan image by id (fetched when the user actually picks one).
export function getFloorplan(id) {
  return db.prepare("SELECT id,name,image,kind FROM floorplan_library WHERE id=?").get(Number(id) || 0) || null;
}
// Remove a saved plan from the library. Scoped to a project when given, so a survey can only delete
// the plans it owns (never another job's). Returns how many rows went.
export function deleteFloorplan(id, project = null) {
  const nid = Number(id) || 0;
  const r = project
    ? db.prepare("DELETE FROM floorplan_library WHERE id=? AND source_project=?").run(nid, String(project))
    : db.prepare("DELETE FROM floorplan_library WHERE id=?").run(nid);
  return { ok: true, removed: r.changes };
}

// Mockup library — every project's mockup with a first-photo thumbnail. Photos are inline data
// URLs (megabytes per project), so the thumb ships only when reasonably sized; the card always
// carries the count and links into the project's mockup tool.
export function getMockupLibrary() {
  const THUMB_CAP = 400 * 1024;   // chars — bigger first photos ship as count-only cards
  return db.prepare(
    `SELECT p.access_id, p.customer, p.address, p.contact_name, p.created_at,
            t.data AS mockup_data, t.updated_by, t.updated_at
       FROM projects p
       LEFT JOIN project_tool_data t ON t.project_access_id = p.access_id AND t.tool = 'mockup'
      ORDER BY (t.data IS NOT NULL) DESC, COALESCE(t.updated_at,'') DESC, p.id DESC`
  ).all().map((p) => {
    let count = 0, thumb = null;
    try {
      const d = JSON.parse(p.mockup_data || "null");
      const photos = Array.isArray(d?.photos) ? d.photos.filter(Boolean) : [];
      count = photos.length;
      const first = photos.find((x) => typeof x === "string" && x.startsWith("data:image"));
      if (first && first.length <= THUMB_CAP) thumb = first;
    } catch { /* bad blob */ }
    return {
      access_id: p.access_id,
      customer: p.customer || p.contact_name || p.access_id,
      address: p.address || "",
      has: count > 0,
      count, thumb,
      updated_by: p.updated_by || null,
      updated_at: p.updated_at || null,
    };
  });
}

// Proposal library — every project with its active (latest non-superseded) proposal in one place.
// Mirrors the survey/mockup libraries: numbers computed server-side, status + total ship to the
// card. Empties list too (so a project still needing a proposal is findable), but hide by default.
export function getProposalLibrary() {
  return db.prepare(
    `SELECT p.access_id, p.customer, p.address, p.contact_name,
            pr.id AS pid, pr.version, pr.status, pr.payload, pr.tax_rate, pr.deposit_pct,
            pr.accepted_options, pr.signed_name, pr.created_by_name, pr.updated_at, pr.sent_at
       FROM projects p
       LEFT JOIN proposals pr
         ON pr.project_access_id = p.access_id
        AND pr.id = (SELECT x.id FROM proposals x
                      WHERE x.project_access_id = p.access_id AND x.status != 'superseded'
                      ORDER BY x.version DESC, x.id DESC LIMIT 1)
      ORDER BY (pr.id IS NOT NULL) DESC, COALESCE(pr.updated_at, pr.sent_at, '') DESC, p.id DESC`
  ).all().map((r) => {
    let total = 0, items = 0, options = 0;
    const accepted = (() => { try { return JSON.parse(r.accepted_options || "[]"); } catch { return []; } })();
    if (r.payload) {
      try {
        const pl = JSON.parse(r.payload);
        options = (pl.options || []).length;
        const opt = (pl.options || []).find((o) => accepted.includes(o.id)) || (pl.options || [])[0];
        if (opt) {
          total = optionTotals(opt, r.tax_rate, pl.discount, r.deposit_pct, pl.pcp_credit).grand;
          (opt.services || []).forEach((s) => { items += (s.items || []).length; });
        }
      } catch { /* bad payload */ }
    }
    return {
      access_id: r.access_id,
      customer: r.customer || r.contact_name || r.access_id,
      address: r.address || "",
      has: !!r.pid,
      status: r.status || null,          // draft | sent | changes_requested | accepted | declined
      version: r.version || null,
      total, items, options,
      signed: !!r.signed_name,
      accepted_count: accepted.length,
      updated_by: resolvePreparerName(r.created_by_name),
      updated_at: r.updated_at || r.sent_at || null,
    };
  });
}

// Accounts receivable — every BILLED project (proposal sent or beyond), bucketed by how firm the
// money is (owner's rule):
//   • unsigned (sent, not signed)      → "pending"   — a tentative receivable (whole total pending)
//   • signed (agreement signed)        → "signed"    — 50% of the total is due now (the deposit)
//   • completed (job done)             → "completed" — 100% of the total is due
//   • closed/declined & never signed   → "jobs"      — a dead job, NOT a receivable
// `expected` is the amount owed at the current state; balance = expected − confirmed paid. Totals
// use the same option+add-on math the payment stage trusts, so figures agree everywhere.
export function getReceivables() {
  return db.prepare(
    `SELECT p.access_id, p.customer, p.contact_name, p.address, p.stage, p.category,
            p.contact_phone, p.contact_email, p.completed_at, p.lost_at, p.ar_archived_at,
            pr.status, pr.payload, pr.tax_rate, pr.deposit_pct,
            pr.accepted_options, pr.selected_option, pr.signed_name, pr.sent_at, pr.updated_at
       FROM projects p
       JOIN proposals pr
         ON pr.project_access_id = p.access_id
        AND pr.id = (SELECT x.id FROM proposals x
                      WHERE x.project_access_id = p.access_id AND x.status != 'superseded'
                      ORDER BY x.version DESC, x.id DESC LIMIT 1)
      WHERE pr.status IN ('sent','changes_requested','accepted','declined')
      ORDER BY p.id DESC`
  ).all().map((r) => {
    let grand = 0;
    try {
      const pl = JSON.parse(r.payload);
      const acceptedIds = (() => {
        try { const a = JSON.parse(r.accepted_options || "[]"); return a.length ? a : (r.selected_option ? [r.selected_option] : []); }
        catch { return r.selected_option ? [r.selected_option] : []; }
      })();
      const acceptedOpts = (pl.options || []).filter((o) => acceptedIds.includes(o.id));
      const shown = acceptedOpts.length ? acceptedOpts : [(pl.options || [])[0]].filter(Boolean);
      grand = shown.reduce((s, o) => s + optionTotals(o, r.tax_rate, pl.discount, r.deposit_pct, pl.pcp_credit).grand, 0);
    } catch { /* bad payload */ }
    const addons = getApprovedAddons(r.access_id);
    const total  = grand + (addons?.total || 0);
    const pays = db.prepare("SELECT amount, status, created_at FROM project_payments WHERE project_access_id=?").all(r.access_id);
    const paid    = pays.filter((x) => x.status !== "pending").reduce((s, x) => s + (+x.amount || 0), 0);
    const pending = pays.filter((x) => x.status === "pending").reduce((s, x) => s + (+x.amount || 0), 0);

    const signed    = !!r.signed_name;
    const completed = !!r.completed_at || r.stage === "completion" || r.category === "completed";
    const closed    = !!r.lost_at || r.status === "declined";   // dead/lost deal

    // Bucket + the receivable EXPECTED at this state (owner's rule).
    let bucket, expected;
    if (!signed && closed)   { bucket = "jobs";      expected = 0; }          // dead — not a receivable
    else if (completed)      { bucket = "completed"; expected = total; }        // 100% due
    else if (signed)         { bucket = "signed";    expected = +(total * 0.5).toFixed(2); }  // 50% due now
    else                     { bucket = "pending";   expected = total; }        // tentative (whole total pending)
    const balance = Math.max(0, +(expected - paid).toFixed(2));

    const lastPay = pays.map((x) => x.created_at).filter(Boolean).sort().slice(-1)[0] || null;
    const since = lastPay || r.sent_at || r.updated_at || null;
    let daysOut = 0;
    if (since) { const d = Math.floor((Date.now() - new Date(since.replace(" ", "T")).getTime()) / 86400000); daysOut = Number.isFinite(d) ? Math.max(0, d) : 0; }
    const dOnly = (v) => (v ? String(v).slice(0, 10) : null);
    return {
      access_id: r.access_id,
      customer: r.customer || r.contact_name || r.access_id,
      address: r.address || "",
      phone: r.contact_phone || null,
      stage: r.stage,
      status: r.status,
      signed, completed, closed,
      bucket,                            // pending | signed | completed | jobs
      archived: !!r.ar_archived_at,      // hidden from the active portal (written off / parked)
      billedAt: dOnly(r.sent_at),        // when it became a receivable (proposal sent)
      lastActivity: dOnly(since),        // most recent money movement, else billed date
      total,                             // full proposal total (what the job is worth)
      expected,                          // receivable due at the current state
      paid, pending, balance,
      paidInFull: bucket !== "jobs" && balance <= 0.01 && expected > 0,
      lastPay, daysOut,
    };
  }).filter((r) => r.total > 0);
}

// Archive (or restore) a receivable — hides it from the active portal (written off / parked) while
// keeping the project and its money intact. Non-destructive: it's a timestamp, reversible anytime.
export function setReceivableArchived(accessId, on) {
  const val = on ? "datetime('now','localtime')" : "NULL";
  const info = db.prepare(`UPDATE projects SET ar_archived_at = ${val} WHERE access_id = ? COLLATE NOCASE`).run(String(accessId));
  return info.changes > 0;
}

export function getSystemQrLibrary() {
  // Every project is listed, with or without a card. Ones that HAVE a card lead (that's what the
  // library is for), and within each group the newest project comes first.
  return db.prepare(
    `SELECT access_id, customer, address, contact_phone, contact_name, system_qr, created_at
       FROM projects
      ORDER BY (system_qr IS NOT NULL AND system_qr != '') DESC,
               COALESCE(created_at, '') DESC,
               id DESC`
  ).all().map((p) => ({
    access_id: p.access_id,
    customer: p.customer || p.contact_name || p.access_id,
    address: p.address || "",
    phone: p.contact_phone || "",
    system_qr: p.system_qr || null,
  }));
}

// ---- Support library (FAQ / knowledge base) ----
export function getSupportArticles(audience = "customer") {
  return db.prepare(
    "SELECT id, title, body, category, kind, pinned, author, created_at, updated_at FROM support_articles WHERE COALESCE(audience,'customer') = ? ORDER BY pinned DESC, category ASC, updated_at DESC, id DESC"
  ).all(audience).map((r) => ({ ...r, pinned: !!r.pinned, kind: r.kind || "article" }));
}
export function getSupportArticle(id) {
  const r = db.prepare("SELECT * FROM support_articles WHERE id=?").get(Number(id));
  return r ? { ...r, pinned: !!r.pinned } : null;
}
// ---- Guides (interactive walkthroughs; body holds {flow, steps} JSON) ----

// URL-safe slug, unique-ified with the row id so two guides can share a title.
export function slugify(title, id) {
  const base = String(title || "guide").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "guide";
  return id ? `${base}-${id}` : base;
}

function decorateGuide(r) {
  if (!r) return null;
  let parsed = { steps: [] };
  try { parsed = JSON.parse(r.body || "{}"); } catch { /* a malformed body shouldn't 500 the page */ }
  return {
    id: r.id,
    title: r.title,
    slug: r.slug || slugify(r.title, r.id),
    category: r.category || "General",
    pinned: !!r.pinned,
    updated_at: r.updated_at,
    surface: parsed.surface || "mobile",   // "mobile" (their phone) | "nvr" (the recorder)
    order: parsed.order ?? 999,            // display order within a surface section
    ready: parsed.ready === true,          // build status: real screenshots in, vs placeholder fillers
    flow: parsed.flow || {},
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
  };
}

export function getGuides() {
  return db.prepare("SELECT * FROM support_articles WHERE kind='guide' ORDER BY pinned DESC, title COLLATE NOCASE ASC").all().map(decorateGuide);
}

export function getGuideBySlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  return decorateGuide(db.prepare("SELECT * FROM support_articles WHERE kind='guide' AND slug=? COLLATE NOCASE").get(s));
}

// The first guide — kept for callers that just want "the" walkthrough.
export function getGuideArticle() {
  return db.prepare("SELECT * FROM support_articles WHERE kind='guide' ORDER BY id ASC").get() || null;
}

export function createGuide({ title, category, flow, steps, author }) {
  const info = db.prepare(
    "INSERT INTO support_articles (title, body, category, kind, pinned, author) VALUES (?,?,?,'guide',0,?)"
  ).run(String(title || "Untitled guide").trim(), JSON.stringify({ flow: flow || {}, steps: steps || [] }), String(category || "Guides").trim(), author || null);
  const id = Number(info.lastInsertRowid);
  db.prepare("UPDATE support_articles SET slug=? WHERE id=?").run(slugify(title, id), id);
  return decorateGuide(db.prepare("SELECT * FROM support_articles WHERE id=?").get(id));
}

export function updateGuide(id, { title, category, flow, steps, pinned }) {
  const cur = db.prepare("SELECT * FROM support_articles WHERE id=? AND kind='guide'").get(Number(id));
  if (!cur) return null;
  const prev = decorateGuide(cur);
  const body = JSON.stringify({
    flow:  flow  != null ? flow  : prev.flow,
    steps: steps != null ? steps : prev.steps,
  });
  db.prepare(
    "UPDATE support_articles SET title=?, body=?, category=?, pinned=?, updated_at=datetime('now','localtime') WHERE id=?"
  ).run(
    title != null ? String(title).trim() : cur.title,
    body,
    category != null ? String(category).trim() : cur.category,
    pinned != null ? (pinned ? 1 : 0) : (cur.pinned ? 1 : 0),
    Number(id)
  );
  return decorateGuide(db.prepare("SELECT * FROM support_articles WHERE id=?").get(Number(id)));
}
export function createSupportArticle({ title, body, category, pinned, author, audience = "customer" }) {
  const info = db.prepare(
    "INSERT INTO support_articles (title, body, category, pinned, author, audience) VALUES (?,?,?,?,?,?)"
  ).run(String(title || "").trim(), String(body || "").trim(), String(category || "General").trim() || "General", pinned ? 1 : 0, author || null, audience === "tech" ? "tech" : "customer");
  return getSupportArticle(info.lastInsertRowid);
}
export function updateSupportArticle(id, { title, body, category, pinned }) {
  const cur = getSupportArticle(id);
  if (!cur) return null;
  db.prepare(
    "UPDATE support_articles SET title=?, body=?, category=?, pinned=?, updated_at=datetime('now','localtime') WHERE id=?"
  ).run(
    title != null ? String(title).trim() : cur.title,
    body != null ? String(body).trim() : cur.body,
    category != null ? (String(category).trim() || "General") : cur.category,
    pinned != null ? (pinned ? 1 : 0) : (cur.pinned ? 1 : 0),
    Number(id)
  );
  return getSupportArticle(id);
}

// Admin/manager: set a staff member's custom project PIN (4 digits), or clear it (NULL) to fall
// back to the last-4-of-phone rule. Returns the fresh user row (for the panel to reflect).
export function setUserPin(userId, pin) {
  const clean = String(pin ?? "").replace(/\D/g, "");
  if (clean.length >= 4) db.prepare("UPDATE users SET pin_custom=? WHERE id=?").run(clean.slice(0, 4), Number(userId));
  else                   db.prepare("UPDATE users SET pin_custom=NULL WHERE id=?").run(Number(userId));
  return db.prepare("SELECT id,name,role,phone,pin_custom FROM users WHERE id=?").get(Number(userId));
}

// Everyone (staff + project customers) whose effective 4-digit PIN equals `pin`, excluding the
// entity that just changed. Used to detect shadowing collisions (resolveAccess resolves a
// project's own customer/tech PIN before internal-user PINs, so a shared PIN hides one login).
export function findPinConflicts(pin, { skipUserId = null, skipAccessId = null } = {}) {
  const p = String(pin || "").replace(/\D/g, "");
  if (p.length !== 4) return [];
  const out = [];
  const staff = db.prepare("SELECT id,name,role,phone,pin_custom FROM users WHERE role IN ('tech','sales','manager','admin') AND (disabled IS NULL OR disabled=0)").all();
  for (const u of staff) {
    if (skipUserId && u.id === Number(skipUserId)) continue;
    if (userEffectivePin(u) === p) out.push({ kind: "user", id: u.id, name: u.name, role: u.role });
  }
  const projs = db.prepare("SELECT access_id, contact_name, customer FROM projects WHERE customer_pin = ?").all(p);
  for (const pr of projs) {
    if (skipAccessId && String(pr.access_id).toUpperCase() === String(skipAccessId).toUpperCase()) continue;
    out.push({ kind: "project", access_id: pr.access_id, name: pr.contact_name || pr.customer || pr.access_id });
  }
  return out;
}

// If setting `pin` for `label` collides with anyone else's PIN, open ONE high-priority service
// ticket (admin+manager) describing the conflict. Returns { ticketId, conflicts } or null.
export function openPinConflictTicketIfAny(pin, label, { skipUserId = null, skipAccessId = null, accessId = null, actor = null } = {}) {
  const conflicts = findPinConflicts(pin, { skipUserId, skipAccessId });
  if (!conflicts.length) return null;
  const lines = conflicts.map((c) => c.kind === "user"
    ? `• ${c.name} (${c.role})`
    : `• Project ${c.access_id} — ${c.name} (customer PIN)`).join("\n");
  const ticketId = createTicket({
    access_id: accessId || conflicts.find((c) => c.kind === "project")?.access_id || null,
    subject: `PIN conflict — ${label} shares a login PIN`,
    priority: "high",
    opened_by_id: actor?.id ?? null, opened_by_name: actor?.name || "System", opened_by_role: actor?.role || "system",
    audience: "admin,manager",
    body: `${label} was just set to a PIN already used by:\n${lines}\n\nA project resolves its own customer/tech PIN before internal-user PINs, so on a shared project one of these logins is shadowed. Set a custom PIN on one of them to resolve.`,
  });
  return { ticketId, conflicts };
}

const DB_VER = "v37";
const g = globalThis;

// Open (and migrate/seed) the database on first real use — NOT at import time. During
// `next build` the module is imported to collect page data, but the persistent disk (DB_DIR,
// e.g. Render's /data) isn't mounted yet, so opening here would crash the build with
// ENOENT mkdir '/data'. Deferring to the first query means init() only runs at runtime, when
// the disk exists. Cached on globalThis so it survives HMR and is shared across the module graph.
function getDb() {
  if (!g.__iotDb || g.__iotDbVer !== DB_VER) {
    try { if (g.__iotDb) g.__iotDb.close(); } catch (_) {}
    g.__iotDb = init();
    g.__iotDbVer = DB_VER;
  }
  return g.__iotDb;
}

// A lazy proxy so every existing `db.prepare(...)` / `db.exec(...)` call site works unchanged,
// while the underlying connection is created on first property access rather than at import.
const db = new Proxy({}, {
  get(_t, prop) {
    const real = getDb();
    const v = real[prop];
    return typeof v === "function" ? v.bind(real) : v;
  },
});

// Flush the WAL into the main .db file so a file-level copy (backup / migration) is complete.
export function checkpointDb() {
  try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); return true; } catch { return false; }
}
// Absolute path of the SQLite file — used by the DB export/restore migration routes.
export function dbFilePath() {
  return path.join(dbDir(), "dashboard.db");
}

// Write a clean, transactionally-consistent copy of the ENTIRE database (every table + the media
// blobs) to destPath. VACUUM INTO is atomic and safe to run while the app is live — the copy is a
// complete point-in-time snapshot, never a half-written file. Powers the one-click backup / the
// Render→VPS migration export. destPath must not already exist.
export function backupDatabaseTo(destPath) {
  checkpointDb();   // fold the WAL in first so the snapshot is fully current
  db.exec(`VACUUM INTO '${String(destPath).replace(/'/g, "''")}'`);
  return destPath;
}

// Replace the live database with a snapshot (from backupDatabaseTo / VACUUM INTO). Powers the admin
// Restore page and the Render→VPS migration: download a backup on one host, upload it here, swap it
// in atomically. The current DB is copied aside first (dashboard.db.pre-restore-<ts>.bak) so a bad
// restore is always reversible. srcPath must be a valid SQLite file; we verify it opens and carries
// the `users` table before touching anything. Returns the path of the safety backup we kept.
export function restoreDatabaseFrom(srcPath) {
  if (!existsSync(srcPath)) throw new Error("restore source not found");
  if (statSync(srcPath).size < 4096) throw new Error("restore source too small to be a database");
  // 1) Validate the incoming file really is our database (opens + has the users table with rows/schema).
  let probe;
  try {
    probe = new DatabaseSync(srcPath, { readOnly: true });
    const ok = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (!ok) throw new Error("uploaded file is not an IOT dashboard database (no users table)");
  } finally {
    try { probe && probe.close(); } catch (_) {}
  }

  const live = dbFilePath();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safety = `${live}.pre-restore-${stamp}.bak`;

  // 2) Fold the WAL in, then drop the live handle so the file is no longer held open.
  try { checkpointDb(); } catch (_) {}
  try { if (g.__iotDb) g.__iotDb.close(); } catch (_) {}
  g.__iotDb = null;
  g.__iotDbVer = null;

  // 3) Keep the current DB as a safety backup, clear stale WAL/SHM sidecars, then move the snapshot in.
  try { if (existsSync(live)) copyFileSync(live, safety); } catch (e) { throw new Error("could not back up current DB before restore: " + e.message); }
  for (const side of ["-wal", "-shm"]) { try { rmSync(live + side, { force: true }); } catch (_) {} }
  // copyFileSync, not renameSync: the upload lands in the OS tmpdir which is on a DIFFERENT filesystem
  // from the data dir on most hosts (VPS: /tmp vs /home), so rename() fails with EXDEV. Copy works
  // across devices; then best-effort remove the tmp source.
  copyFileSync(srcPath, live);
  try { rmSync(srcPath, { force: true }); } catch (_) {}

  // 4) Reopen — init() re-runs the CREATE TABLE / ALTER migrations so the restored data is on the
  //    current schema, and getDb() caches the fresh handle for every subsequent query.
  getDb();
  return safety;
}

const decorate = (r) => ({
  ...r,
  stageLabel: stageLabel(r.stage),
  service: SERVICE_CODES[r.service_code] || r.service_code,
});

export function getAllJobs() {
  return db.prepare("SELECT * FROM projects ORDER BY id DESC").all().map(decorate);
}

// Most-recent activity timestamp across the project's real events — the honest basis for "how
// long has this been sitting" (vs faking it off created_at). Timestamps are local 'YYYY-MM-DD
// HH:MM:SS' strings, which sort lexically = chronologically.
function lastActivityAt(accessId, createdAt) {
  const q = (sql) => { try { return db.prepare(sql).get(String(accessId))?.v || null; } catch { return null; } };
  const stamps = [
    createdAt,
    q("SELECT MAX(updated_at) v FROM proposals WHERE project_access_id=?"),
    q("SELECT MAX(created_at) v FROM project_payments WHERE project_access_id=?"),
    q("SELECT MAX(created_at) v FROM stage_acceptances WHERE project_access_id=?"),
    q("SELECT MAX(created_at) v FROM project_notes WHERE project_access_id=?"),
    q("SELECT MAX(created_at) v FROM requests WHERE project_access_id=?"),
  ].filter(Boolean).map(String).sort();
  return stamps.length ? stamps[stamps.length - 1] : null;
}

// Cross-project throughput view: every active job's current blocker, whose court it's in, and how
// long it's been sitting. A pure projection of the stage-flow matrix (missingReqs) — no new state.
// Sorted oldest-first so the most stalled float to the top.
export function getStalledJobs() {
  const jobs = db.prepare(
    "SELECT * FROM projects WHERE completed_at IS NULL AND lost_at IS NULL AND stage != 'completion' ORDER BY id DESC"
  ).all();
  const now = Date.now();
  const parseTs = (s) => { const t = new Date(String(s).replace(" ", "T")).getTime(); return Number.isFinite(t) ? t : NaN; };
  const out = [];
  for (const p of jobs) {
    const facts = buildStageFacts(p.access_id);
    if (!facts) continue;
    const missing = missingReqs(facts.stage, facts, getProjectAssignments(p.access_id));
    if (!missing.length) continue;              // nothing blocking — mid auto-advance / ready to move
    const primary = missing[0];                 // the first unmet requirement is the live blocker
    // Age = days in the CURRENT stage (from the transition log); fall back to last activity if a
    // project somehow has no transition row.
    const enteredAt = stageEnteredAt(p.access_id, p.stage) || lastActivityAt(p.access_id, p.created_at);
    const ms        = enteredAt ? parseTs(enteredAt) : NaN;
    const ageDays   = Number.isFinite(ms) ? Math.max(0, Math.floor((now - ms) / 86400000)) : null;
    out.push({
      access_id:     p.access_id,
      customer:      p.company_name || p.customer,
      stage:         p.stage,
      stageLabel:    stageLabel(p.stage),
      blocker:       primary.label,
      who:           primary.who || "internal",   // "customer" | "internal"
      blocker_count: missing.length,
      sales_rep:     p.sales_rep || null,
      tech:          p.tech || null,
      age_days:      ageDays,
      value:         p.value || 0,
    });
  }
  out.sort((a, b) => (b.age_days ?? -1) - (a.age_days ?? -1));
  return out;
}

// For roles that aren't admin/manager: exclude restricted projects unless the user is assigned
export function getVisibleJobs(userId, role) {
  if (role === "admin" || role === "manager") return getAllJobs();
  // Unrestricted projects + restricted projects where this user is assigned
  return db.prepare(`
    SELECT DISTINCT p.* FROM projects p
    LEFT JOIN project_assignments a
      ON a.project_access_id = p.access_id AND a.user_id = ?
    WHERE p.restricted = 0 OR a.id IS NOT NULL
    ORDER BY p.id DESC
  `).all(Number(userId) || 0).map(decorate);
}

export function setProjectRestricted(accessId, restricted) {
  db.prepare("UPDATE projects SET restricted = ? WHERE access_id = ? COLLATE NOCASE")
    .run(restricted ? 1 : 0, String(accessId));
}

export function getCustomers() {
  return db.prepare("SELECT DISTINCT customer FROM projects ORDER BY customer").all().map((r) => r.customer);
}

export function getJobsForCustomer(name) {
  return db.prepare("SELECT * FROM projects WHERE customer = ? ORDER BY id DESC").all(name).map(decorate);
}

export function getJobByAccessId(accessId) {
  const r = db.prepare("SELECT * FROM projects WHERE access_id = ? COLLATE NOCASE").get(String(accessId || "").trim());
  return r ? decorate(r) : null;
}

// Resolve a project the way a person types it at the gate: either the FULL project ID (ASC00SY)
// or just its LAST 4 characters (00SY / 0041). IDs are ASC + a 4-char alphanumeric tail, so the
// short code is matched on characters, not digits. Full match wins; otherwise fall back to the
// tail. Suffix match only resolves when it's UNAMBIGUOUS — if two projects share the same last-4,
// the short code is rejected and the full ID is required (never guess which project was meant).
export function resolveProjectRef(ref) {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  const exact = getJobByAccessId(raw);
  if (exact) return exact;
  const code = raw.replace(/[^a-z0-9]/gi, "");    // keep letters+digits — "00SY", "0041"
  if (code.length < 3 || code.length > 8) return null;
  const rows = db.prepare("SELECT * FROM projects WHERE access_id LIKE ? COLLATE NOCASE").all("%" + code);
  return rows.length === 1 ? decorate(rows[0]) : null;   // exactly one → resolve; 0 or many → no
}

// Log every entry into a stage. This is THE choke point all stage moves flow through
// (setStage, tech advance, maybeAutoAdvance, create-work-order), so nothing changes stage
// without being recorded — no scattered call sites to keep in sync.
function recordStageTransition(accessId, stage, byName) {
  try {
    db.prepare("INSERT INTO stage_transitions (project_access_id, stage, by_name) VALUES (?,?,?)")
      .run(String(accessId), String(stage), byName || null);
  } catch { /* transitions are advisory — a logging failure must never block the move */ }
}

// When the project entered its CURRENT stage — the latest transition INTO it (handles loops like
// proposal → approval → back to proposal, where the newest entry is what "days in stage" means).
export function stageEnteredAt(accessId, stage) {
  const r = db.prepare(
    "SELECT entered_at FROM stage_transitions WHERE project_access_id=? AND stage=? ORDER BY id DESC LIMIT 1"
  ).get(String(accessId), String(stage));
  return r?.entered_at || null;
}

export function updateStage(accessId, stage, byName) {
  const id   = String(accessId || "").trim();
  const prev = db.prepare("SELECT stage FROM projects WHERE access_id = ? COLLATE NOCASE").get(id);
  const info = db.prepare("UPDATE projects SET stage = ? WHERE access_id = ? COLLATE NOCASE").run(String(stage), id);
  if (!info.changes) return null;
  if (!prev || prev.stage !== String(stage)) recordStageTransition(id, stage, byName); // only real moves
  return getJobByAccessId(accessId);
}

// The survey visit is booked in the scheduling TOOL (its own blob), but the `inquiry` stage's
// requirement checks `projects.date`. Mirror the booked date onto the column so inquiry can
// auto-advance to site_survey. Only fills an EMPTY date — never overwrites a set one, so a later
// install booking can't clobber the survey date. Returns true if it wrote.
export function setSurveyDate(accessId, dateStr) {
  if (!dateStr) return false;
  const info = db.prepare("UPDATE projects SET date = ? WHERE access_id = ? COLLATE NOCASE AND (date IS NULL OR date = '')")
    .run(String(dateStr), String(accessId || "").trim());
  return info.changes > 0;
}

// ---- Stage auto-advance ------------------------------------------------------
// Build the fact object lib/stage-flow.js checks run against — same field names the
// page hands the gateway, sourced straight from the DB so server decisions are current.
export function buildStageFacts(accessId) {
  const p = db.prepare("SELECT * FROM projects WHERE access_id=?").get(String(accessId));
  if (!p) return null;
  const prop = db.prepare(
    "SELECT * FROM proposals WHERE project_access_id=? AND status != 'superseded' ORDER BY version DESC, id DESC LIMIT 1"
  ).get(String(accessId));
  const pays = db.prepare("SELECT amount, status FROM project_payments WHERE project_access_id=?").all(String(accessId));
  const confirmedTotal = pays.filter((x) => x.status !== "pending").reduce((s, x) => s + (+x.amount || 0), 0);

  // Final balance paid — same math as the payment portal (accepted option(s) total + approved
  // add-ons vs. confirmed payments). Lets `payment` auto-advance once the balance is truly $0,
  // without needing a human to eyeball it.
  let finalBalancePaid = false;
  if (prop?.payload && prop.status === "accepted") {
    try {
      const payload = typeof prop.payload === "string" ? JSON.parse(prop.payload) : prop.payload;
      const acceptedIds = (() => { try { const a = JSON.parse(prop.accepted_options || "[]"); return a.length ? a : (prop.selected_option ? [prop.selected_option] : []); } catch { return prop.selected_option ? [prop.selected_option] : []; } })();
      const acceptedOpts = (payload.options || []).filter((o) => acceptedIds.includes(o.id));
      const shown = acceptedOpts.length ? acceptedOpts : [payload.options[0]];
      const grand = shown.reduce((s, o) => s + optionTotals(o, prop.tax_rate, payload.discount, prop.deposit_pct, payload.pcp_credit).grand, 0);
      const addons = getApprovedAddons(accessId);
      finalBalancePaid = confirmedTotal >= (grand + addons.total) - 0.01;   // cent-rounding slack
    } catch { finalBalancePaid = false; }
  }

  return {
    stage: p.stage,
    date: p.date,
    sales_rep: p.sales_rep,
    tech: p.tech,
    // Satisfied when every tool WITH data has a current (unvoided) approval; nothing to
    // approve → satisfied (customer can sail straight through).
    survey_accepted: surveyStageSatisfied(accessId),
    proposal_status: prop?.status || null,
    proposal_version: prop?.version || 1,
    proposal_signed: !!prop?.signed_name,
    tech_accepted: !!prop?.tech_signed_name,
    deposit_submitted: pays.some((x) => (+x.amount || 0) > 0),
    deposit_recorded: pays.some((x) => (+x.amount || 0) > 0 && x.status === "confirmed"),
    final_balance_paid: finalBalancePaid,
  };
}
// When every requirement of the current stage passes (customer's AND ours), move the
// project forward automatically — chains across stages (e.g. proposal → approval →
// schedule in one shot if everything is already satisfied). Only AUTO_STAGES advance
// this way; field-work stages stay manual. Returns the (possibly new) current stage.
export function maybeAutoAdvance(accessId) {
  for (let hop = 0; hop < 4; hop++) {
    const facts = buildStageFacts(accessId);
    if (!facts || !AUTO_STAGES.has(facts.stage)) return facts?.stage || null;
    if (missingReqs(facts.stage, facts, getProjectAssignments(accessId)).length) return facts.stage;
    const next = nextStageOf(facts.stage);
    if (!next) return facts.stage;
    updateStage(accessId, next);
  }
  return buildStageFacts(accessId)?.stage || null;
}

// Forward-only jump to a specific stage: moves the project TO `target` only when target is
// strictly later in MASTER_ORDER than where it sits now — never rewinds a job that's already
// further along. Used when an action is itself proof the earlier stages are done (e.g. sending
// a proposal means we're past inquiry/site_survey regardless of their sign-offs). After the
// jump it runs maybeAutoAdvance so a fully-satisfied stage still chains forward normally.
export function advanceStageForward(accessId, target, byName) {
  const facts = buildStageFacts(accessId);
  if (!facts) return null;
  const cur = MASTER_ORDER.indexOf(facts.stage);
  const to  = MASTER_ORDER.indexOf(target);
  if (to > cur) updateStage(accessId, target, byName);
  return maybeAutoAdvance(accessId);
}

export function getCustomersWithStats() {
  return db.prepare(`
    SELECT customer,
           MAX(address) AS address,
           MAX(contact_name) AS contact_name,
           MAX(contact_email) AS contact_email,
           MAX(contact_phone) AS contact_phone,
           COUNT(*) AS total_projects,
           SUM(CASE WHEN category IN ('open','pending') THEN 1 ELSE 0 END) AS active_count,
           SUM(CASE WHEN category = 'completed' THEN 1 ELSE 0 END) AS completed_count,
           SUM(COALESCE(value, 0)) AS total_value
    FROM projects GROUP BY customer ORDER BY MAX(id) DESC
  `).all();
}

export function getCustomerProfile(name) {
  const customer = db.prepare(`
    SELECT customer, MAX(address) AS address,
           MAX(contact_name) AS contact_name, MAX(contact_email) AS contact_email,
           MAX(contact_phone) AS contact_phone, MAX(contact_message) AS contact_message,
           MAX(source) AS source,
           COUNT(*) AS total_projects,
           SUM(CASE WHEN category IN ('open','pending') THEN 1 ELSE 0 END) AS active_count,
           SUM(CASE WHEN category = 'completed' THEN 1 ELSE 0 END) AS completed_count,
           SUM(COALESCE(value, 0)) AS total_value
    FROM projects WHERE customer = ? COLLATE NOCASE
  `).get(name);
  if (!customer?.customer) return null;
  const jobs = db.prepare("SELECT * FROM projects WHERE customer = ? ORDER BY id DESC").all(name).map(decorate);
  return { customer, jobs };
}

export function updateCustomerContact(name, { contact_name, contact_email, contact_phone, contact_message, source }) {
  db.prepare(`UPDATE projects SET contact_name=?,contact_email=?,contact_phone=?,contact_message=?,source=? WHERE customer=? COLLATE NOCASE`)
    .run(contact_name || null, contact_email || null, contact_phone || null, contact_message || null, source || "internal", name);
}

export function getAllUsers() {
  return db.prepare("SELECT id, name, username, email, phone, role, disabled, pin_custom, created_at FROM users ORDER BY id").all();
}

export function setUserDisabled(targetId, disabled) {
  db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(disabled ? 1 : 0, Number(targetId));
}

// Auto-derive a username from an email's local-part (before @) — the customer's starting
// handle, editable later via updateUser. Sanitized to lowercase alphanumeric/underscore;
// de-duplicated with a numeric suffix if another account already claimed it.
function usernameFromEmail(email) {
  if (!email) return null;
  const base = String(email).split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  if (!base) return null;
  let candidate = base, n = 1;
  while (db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(candidate)) {
    n++;
    candidate = `${base}${n}`;
  }
  return candidate;
}

function checkUserDuplicates(excludeId, { username, email, phone }) {
  if (username) {
    const row = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(String(username).trim());
    if (row && Number(row.id) !== Number(excludeId)) throw new Error("USERNAME_TAKEN");
  }
  if (email) {
    const row = db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(String(email).trim().toLowerCase());
    if (row && Number(row.id) !== Number(excludeId)) throw new Error("EMAIL_TAKEN");
  }
  if (phone) {
    const clean = String(phone).trim();
    const row = db.prepare("SELECT id FROM users WHERE phone = ?").get(clean);
    if (row && Number(row.id) !== Number(excludeId)) throw new Error("PHONE_TAKEN");
  }
}

export function createStaffUser({ name, username, email, phone, role, password }) {
  const normalEmail = email ? String(email).trim().toLowerCase() : null;
  checkUserDuplicates(null, { username, email: normalEmail, phone });
  const info = db.prepare(
    "INSERT INTO users (name, username, email, phone, password_hash, role, password_set) VALUES (?,?,?,?,?,?,1)"
  ).run(
    String(name || "").trim() || "New User",
    username ? String(username).trim() : null,
    normalEmail,
    phone ? String(phone).trim() : null,
    hashPw(String(password || "changeme")),
    String(role || "tech")
  );
  return Number(info.lastInsertRowid);
}

export function setUserRole(targetId, newRole) {
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(String(newRole), Number(targetId));
}

export function deleteUser(targetId) {
  db.prepare("DELETE FROM users WHERE id = ?").run(Number(targetId));
}

export function resetUserPassword(userId, plainPassword) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPw(String(plainPassword)), Number(userId));
}

export function getUserById(id) {
  const r = db.prepare("SELECT id, name, username, email, phone, role, disabled, tech_cert FROM users WHERE id = ?").get(Number(id));
  return r ? { ...r, tech_cert: safeJson(r.tech_cert, null) } : r;
}

// Technician certification stamped on the user at Approved Technician (Portal 3 hand-off).
export function getTechCert(userId) {
  const r = db.prepare("SELECT tech_cert FROM users WHERE id = ?").get(Number(userId));
  return r ? safeJson(r.tech_cert, null) : null;
}
export function setTechCert(userId, cert) {
  db.prepare("UPDATE users SET tech_cert = ? WHERE id = ?").run(cert ? JSON.stringify(cert) : null, Number(userId));
  return getTechCert(userId);
}
// Does a tech hold every required qualification badge? (operations work-order gate)
export function techEligible(cert, requiredBadges = []) {
  if (!requiredBadges || !requiredBadges.length) return true;
  const have = new Set((cert?.badges) || []);
  return requiredBadges.every((b) => have.has(b));
}

// The customer account that owns a project — matched to the project's contact email, then
// phone. Used to turn a correct project PIN into that customer's real login session (so a PIN
// unlock also identifies them and reaches their dashboard), and to attribute PIN-access events.
export function getCustomerUserForProject(project) {
  if (!project) return null;
  const email = project.contact_email ? String(project.contact_email).trim().toLowerCase() : null;
  if (email) {
    const u = db.prepare("SELECT id, name, username, email, phone, role, disabled FROM users WHERE LOWER(email)=? AND role='customer'").get(email);
    if (u) return u;
  }
  const digits = String(project.contact_phone || "").replace(/\D/g, "");
  if (digits.length >= 7) {
    const u = db.prepare("SELECT id, name, username, email, phone, role, disabled FROM users WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''),'(',''),')',''),'-',''),' ','')=? AND role='customer'").get(digits);
    if (u) return u;
  }
  return null;
}

// True when the account already has a password set — registration must never overwrite it
// (that would let anyone take over an existing account by "registering" with its email).
export function userHasPassword(userId) {
  const r = db.prepare("SELECT password_set FROM users WHERE id = ?").get(Number(userId));
  return !!(r && r.password_set);
}

export function getUserByEmail(email) {
  return db.prepare("SELECT id, name, username, email, phone, role FROM users WHERE LOWER(email) = ?").get(String(email).trim().toLowerCase());
}

export function getUserByPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return db.prepare(
    "SELECT id, name, username, email, phone, role FROM users WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','') = ?"
  ).get(digits);
}

export function recordLogin(userId, ip, ua) {
  db.prepare(
    "INSERT INTO login_logs (user_id, event_type, login_at, ip_address, user_agent) VALUES (?, 'login', datetime('now'), ?, ?)"
  ).run(Number(userId), ip || null, ua || null);
}

export function recordLogout(userId) {
  const row = db.prepare(
    "SELECT id FROM login_logs WHERE user_id = ? AND logout_at IS NULL ORDER BY id DESC LIMIT 1"
  ).get(Number(userId));
  if (row) db.prepare("UPDATE login_logs SET logout_at = datetime('now') WHERE id = ?").run(row.id);
}

// Distinct devices a user has signed in from, newest activity first. Grouped by a coarse
// fingerprint (OS family + major version + browser) so a routine browser update doesn't read as a
// new device. Purely observational — nothing here gates access.
export function getUserDevices(userId, limit = 40) {
  const rows = db.prepare(
    `SELECT ip_address, user_agent, login_at
       FROM login_logs
      WHERE user_id = ? AND event_type = 'login' AND user_agent IS NOT NULL
      ORDER BY id DESC LIMIT 500`
  ).all(Number(userId));

  const byFp = new Map();
  for (const r of rows) {
    const fp = deviceFingerprint(r.user_agent);
    let d = byFp.get(fp);
    if (!d) {
      const p = parseUserAgent(r.user_agent);
      d = { fp, label: p.label, kind: p.kind, os: p.os, browser: p.browser,
            logins: 0, last_seen: r.login_at, first_seen: r.login_at, ips: new Set() };
      byFp.set(fp, d);
    }
    d.logins += 1;
    if (r.ip_address) d.ips.add(r.ip_address);
    if (r.login_at < d.first_seen) d.first_seen = r.login_at;   // rows are newest-first
    if (r.login_at > d.last_seen)  d.last_seen  = r.login_at;
  }

  return [...byFp.values()]
    .map((d) => {
      const ip = [...d.ips][0];
      const hit = ip ? db.prepare("SELECT label FROM ip_geo WHERE ip=?").get(String(ip)) : null;
      return { ...d, ips: [...d.ips], geo: hit?.label || "" };   // cache-only; never blocks
    })
    .sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)))
    .slice(0, limit);
}

export function recordEvent(eventType, userId, ip, ua, projectId, notes) {
  db.prepare(
    "INSERT INTO login_logs (user_id, event_type, login_at, ip_address, user_agent, project_id, notes) VALUES (?, ?, datetime('now'), ?, ?, ?, ?)"
  ).run(userId ? Number(userId) : null, String(eventType), ip || null, ua || null, projectId ? Number(projectId) : null, notes || null);
}

export function getLoginStatsMap() {
  const rows = db.prepare(`
    SELECT l.user_id,
           MAX(l.login_at) AS last_login,
           (SELECT logout_at FROM login_logs WHERE user_id = l.user_id AND logout_at IS NOT NULL ORDER BY id DESC LIMIT 1) AS last_logout,
           (SELECT ip_address FROM login_logs WHERE user_id = l.user_id ORDER BY id DESC LIMIT 1) AS last_ip,
           (SELECT user_agent FROM login_logs WHERE user_id = l.user_id ORDER BY id DESC LIMIT 1) AS last_ua
    FROM login_logs l WHERE l.user_id IS NOT NULL GROUP BY l.user_id
  `).all();
  const map = {};
  for (const r of rows) {
    const sessionMins = r.last_logout
      ? Math.round((new Date(r.last_logout + "Z") - new Date(r.last_login + "Z")) / 60000)
      : null;
    map[r.user_id] = {
      last_login:   r.last_login,
      last_logout:  r.last_logout,
      session_mins: sessionMins,
      last_ip:      r.last_ip,
      last_ua:      r.last_ua,
    };
  }
  return map;
}

export function getActivityLog(limit = 500) {
  return db.prepare(`
    SELECT l.id, l.event_type, l.login_at, l.logout_at,
           l.ip_address, l.user_agent, l.project_id, l.notes,
           u.name AS user_name, u.username, u.role AS user_role,
           p.customer AS project_customer, p.address AS project_address, p.access_id AS project_access_id
    FROM login_logs l
    LEFT JOIN users u ON u.id = l.user_id
    LEFT JOIN projects p ON p.id = l.project_id
    ORDER BY l.id DESC LIMIT ?
  `).all(Number(limit));
}

export function updateUser(userId, { name, username, email, phone, password }) {
  const normalEmail = email ? email.trim().toLowerCase() : null;
  checkUserDuplicates(userId, {
    username: username || null,
    email:    normalEmail,
    phone:    phone    || null,
  });
  const sets = [], vals = [];
  if (name     !== undefined) { sets.push("name = ?");          vals.push(name || null); }
  if (username !== undefined) { sets.push("username = ?");      vals.push(username || null); }
  if (email    !== undefined) { sets.push("email = ?");         vals.push(normalEmail); }
  if (phone    !== undefined) { sets.push("phone = ?");         vals.push(phone || null); }
  if (password)               { sets.push("password_hash = ?", "password_set = 1"); vals.push(hashPw(String(password))); }
  if (!sets.length) return;
  vals.push(Number(userId));
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

export function getProjectsByContactEmail(email) {
  if (!email) return [];
  return db.prepare("SELECT * FROM projects WHERE LOWER(contact_email) = ? ORDER BY id DESC")
    .all(String(email).trim().toLowerCase()).map(decorate);
}

export function searchProjects(q) {
  const like = `%${q}%`;
  return db
    .prepare("SELECT * FROM projects WHERE customer LIKE ? OR access_id LIKE ? OR address LIKE ? OR issue LIKE ? ORDER BY id DESC")
    .all(like, like, like, like)
    .map(decorate);
}

// Self-service password reset. Identity is proven the same way the app already trusts identity
// everywhere else — the last 4 digits of the phone on file (the customer's login PIN). Match the
// account by username/email/phone, confirm the last-4, then set the new password. Deliberately
// vague errors so it can't be used to enumerate which emails/phones have accounts.
export function resetPasswordByPhoneLast4(identifier, last4, newPassword) {
  const cred = String(identifier || "").trim().toLowerCase();
  if (!cred) return { error: "Enter your email or phone." };
  if (String(newPassword || "").length < 6) return { error: "Password must be at least 6 characters." };
  const l4 = String(last4 || "").replace(/\D/g, "").slice(-4);
  if (l4.length !== 4) return { error: "Enter the last 4 digits of your phone." };

  const digits = cred.replace(/\D/g, "");
  const where = ["LOWER(COALESCE(username,'')) = ?", "LOWER(COALESCE(email,'')) = ?"];
  const params = [cred, cred];
  if (digits.length >= 7) {
    where.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''),'(',''),')',''),'-',''),' ',''),'+','') = ?");
    params.push(digits);
  }
  const candidates = db.prepare(`SELECT * FROM users WHERE ${where.join(" OR ")}`).all(...params);
  const user = candidates.find((u) => {
    const pd = String(u.phone || "").replace(/\D/g, "");
    return pd.length >= 4 && pd.slice(-4) === l4;
  });
  if (!user) return { error: "We couldn't verify those details. Check your email/phone and the last 4 digits." };
  if (user.disabled) return { error: "This account is disabled — please contact support." };
  updateUser(user.id, { password: newPassword });
  return { ok: true, name: user.name };
}

export function verifyUser(email, password) {
  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(String(email || "").trim().toLowerCase());
  if (!user) return null;
  if (!verifyPw(String(password || ""), user.password_hash)) return null;
  if (isLegacyHash(user.password_hash)) upgradeHash(user.id, password);
  return { id: user.id, name: user.name, email: user.email, role: user.role || "customer" };
}

// Re-hash a legacy password to scrypt after a successful login (transparent migration).
function upgradeHash(userId, plainPassword) {
  try { db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPw(String(plainPassword)), Number(userId)); }
  catch { /* best-effort — a failed upgrade just means we try again next login */ }
}

export function verifyUserByCredential(identifier, password) {
  const cred   = String(identifier || "").trim().toLowerCase();
  if (!cred) return null;
  const digits = cred.replace(/\D/g, "");

  // Build the WHERE clause dynamically. Only match on phone when the identifier
  // actually contains enough digits to be a phone number — otherwise an empty/short
  // digit string would match every account with a NULL/blank phone.
  const where = [
    "LOWER(COALESCE(username,'')) = ?",
    "LOWER(COALESCE(email,''))    = ?",
  ];
  const params = [cred, cred];
  if (digits.length >= 7) {
    where.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''),'(',''),')',''),'-',''),' ',''),'+','') = ?");
    params.push(digits);
  }

  // A phone number can be shared by more than one account (e.g. a staff member who is
  // also a customer), so check the password against EVERY candidate, not just the first.
  const candidates = db.prepare(`SELECT * FROM users WHERE ${where.join(" OR ")}`).all(...params);
  const user = candidates.find((u) => verifyPw(String(password || ""), u.password_hash));
  if (!user) return null;
  if (isLegacyHash(user.password_hash)) upgradeHash(user.id, password);
  if (user.disabled) return { disabled: true };
  return { id: user.id, name: user.name, username: user.username, email: user.email, phone: user.phone, role: user.role || "customer" };
}

export function createCustomerUser(name, email, phone) {
  const normalEmail = email ? String(email).trim().toLowerCase() : null;
  const normalPhone = phone ? String(phone).trim() : null;
  const digits = normalPhone ? normalPhone.replace(/\D/g, "") : null;
  const initialPw = digits && digits.length >= 7 ? digits : "customer";
  // No password_set here either — same placeholder-vs-chosen distinction as createLeadProject.
  try {
    db.prepare(
      "INSERT OR IGNORE INTO users (name, username, email, phone, password_hash, role) VALUES (?,?,?,?,?,?)"
    ).run(name || "Customer", usernameFromEmail(normalEmail), normalEmail, normalPhone, hashPw(initialPw), "customer");
  } catch (_) {}
}

export function createLeadProject(name, email, phone, address, service, company) {
  const normalEmail = email ? String(email).trim().toLowerCase() : null;
  const normalPhone = phone ? String(phone).trim() : null;

  // Upsert user
  let user = normalEmail
    ? db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(normalEmail)
    : null;
  if (!user && normalPhone) {
    const d = normalPhone.replace(/\D/g, "");
    user = db.prepare("SELECT * FROM users WHERE REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-','') = ?").get(d);
  }
  if (!user) {
    const digits = normalPhone ? normalPhone.replace(/\D/g, "") : null;
    const initialPw = digits && digits.length >= 7 ? digits : "customer";
    // No password_set here — this is a lead-capture placeholder, not the customer's chosen
    // password. userHasPassword() stays false so registration can still write their real one.
    const info = db.prepare(
      "INSERT OR IGNORE INTO users (name, username, email, phone, password_hash, role) VALUES (?,?,?,?,?,?)"
    ).run(name || "Customer", usernameFromEmail(normalEmail), normalEmail, normalPhone, hashPw(initialPw), "customer");
    user = info.lastInsertRowid
      ? db.prepare("SELECT * FROM users WHERE id = ?").get(Number(info.lastInsertRowid))
      : normalEmail
        ? db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(normalEmail)
        : db.prepare("SELECT * FROM users WHERE name = ? ORDER BY id DESC LIMIT 1").get(name || "Customer");
  }
  // Final safety net so a project can always be created.
  if (!user) user = { id: null };

  // Generate unique access_id (type=A, svc=SC for "Security Camera" as default)
  const svcMap = { "Security Cameras / CCTV": "SC", "Commercial Audio": "AU", "Networking & Cat6": "NW",
    "Access Control / Door Entry": "AC", "Full System — not sure yet": "SC" };
  const svc = svcMap[service] || "SC";
  const count = (db.prepare("SELECT COUNT(*) as n FROM projects").get()?.n || 0) + 1;
  let accessId = `A${svc}${String(count).toString(36).toUpperCase().padStart(4, "0")}`;
  // Ensure uniqueness
  while (db.prepare("SELECT id FROM projects WHERE access_id = ?").get(accessId)) {
    accessId = `A${svc}${String(Math.floor(Math.random() * 99999)).toString(36).toUpperCase().padStart(4, "0")}`;
  }

  // Owner rule: the customer PIN is the last 4 digits of the phone number.
  // Fall back to a deterministic generated PIN only when no usable phone is on file.
  const pin = phonePin(normalPhone)
    || String(1000 + (Math.abs(user.id * 7919 + count * 31) % 9000));

  const companyName = company ? String(company).trim() : null;
  const customerLabel = companyName || name || "Customer";
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO projects
      (access_id, customer, address, service_code, project_type, category, stage, status,
       contact_name, contact_email, contact_phone, source, customer_pin, date, company_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    accessId, customerLabel, address || "", svc, "A", "open",
    "inquiry", "New", name || "Customer", normalEmail, normalPhone,
    "external", pin, today, companyName
  );

  return { userId: user.id, accessId, customerPin: pin };
}

// Field capture (tech, on-site): create a project from JUST a name + address for a legacy/pre-software
// job. Reuses createLeadProject, then flags it needs_details so the office knows to fill in the rest.
export function createFieldProject({ name, address, createdByName }) {
  const cleanName = String(name || "").trim();
  const cleanAddr = String(address || "").trim();
  if (!cleanName) return { error: "Customer name is required." };
  const res = createLeadProject(cleanName, null, null, cleanAddr, null, null);
  // Field jobs are internal by default (no customer sale) so the work order can skip the sign+deposit gate.
  db.prepare("UPDATE projects SET needs_details=1, internal_job=1, source='field', created_by_name=? WHERE access_id=? COLLATE NOCASE")
    .run(createdByName || null, res.accessId);
  return { ok: true, accessId: res.accessId };
}

// Admin/manager toggle: mark a project internal (no customer sale) so its work order can be created
// without a customer signature + deposit. Works on any project, not just field-created ones.
export function setInternalJob(accessId, on) {
  db.prepare("UPDATE projects SET internal_job=? WHERE access_id=? COLLATE NOCASE").run(on ? 1 : 0, String(accessId));
  return getJobByAccessId(accessId);
}

export function setCommission(accessId, { rate, status, salesRep }) {
  const sets = [];
  const vals = [];
  if (rate !== undefined) { sets.push("commission_rate=?"); vals.push(Number(rate) || 0); }
  if (status !== undefined) { sets.push("commission_status=?"); vals.push(status || "pending"); }
  if (salesRep !== undefined) { sets.push("sales_rep=?"); vals.push(salesRep || null); }
  if (!sets.length) return;
  vals.push(String(accessId));
  db.prepare(`UPDATE projects SET ${sets.join(",")} WHERE access_id=? COLLATE NOCASE`).run(...vals);
}
// Record / approve the technician payout for a completed job. Amount is clamped to a sane range.
export function setProjectPayout(accessId, { amount, status }) {
  const sets = [], vals = [];
  if (amount !== undefined) { sets.push("payout_amount=?"); vals.push(Math.max(0, Math.min(1_000_000, Number(amount) || 0))); }
  if (status !== undefined) { sets.push("payout_status=?"); vals.push(["pending", "approved", "paid"].includes(status) ? status : "pending"); }
  if (!sets.length) return getJobByAccessId(accessId);
  vals.push(String(accessId));
  db.prepare(`UPDATE projects SET ${sets.join(",")} WHERE access_id=? COLLATE NOCASE`).run(...vals);
  return getJobByAccessId(accessId);
}
// Stamp the project complete (job closed & handed off). Idempotent — keeps the first stamp.
export function markProjectCompleted(accessId, date) {
  // An explicit YYYY-MM-DD sets that completion date; otherwise keep any existing stamp or use now.
  const d = date && /^\d{4}-\d{2}-\d{2}/.test(String(date)) ? String(date).slice(0, 10) + " 00:00:00" : null;
  if (d) db.prepare("UPDATE projects SET completed_at = ? WHERE access_id = ? COLLATE NOCASE").run(d, String(accessId));
  else db.prepare("UPDATE projects SET completed_at = COALESCE(completed_at, datetime('now','localtime')) WHERE access_id = ? COLLATE NOCASE").run(String(accessId));
  return getJobByAccessId(accessId);
}
// Warranty term in months — 6 / 12 / 24 (default 6). Anything else falls back to 6.
export function setWarrantyMonths(accessId, months) {
  const m = [6, 12, 24].includes(+months) ? +months : 6;
  db.prepare("UPDATE projects SET warranty_months = ? WHERE access_id = ? COLLATE NOCASE").run(m, String(accessId));
  return getJobByAccessId(accessId);
}
// Store the system QR (the verified branded-card data URL / payload) uploaded at install.
export function setSystemQr(accessId, data) {
  db.prepare("UPDATE projects SET system_qr = ? WHERE access_id = ? COLLATE NOCASE").run(data ? String(data) : null, String(accessId));
  return getJobByAccessId(accessId);
}
// Re-open a completed project (clears the completion stamp) — admin correction path.
export function reopenProjectCompletion(accessId) {
  db.prepare("UPDATE projects SET completed_at = NULL WHERE access_id = ? COLLATE NOCASE").run(String(accessId));
  return getJobByAccessId(accessId);
}
export function getCommissionsByRep(repName) {
  return db.prepare("SELECT access_id, customer, value, commission_rate, commission_status, sales_rep, stage FROM projects WHERE sales_rep=? COLLATE NOCASE ORDER BY id DESC").all(repName).map(r => ({ ...r }));
}

export function setProjectAttention(accessId, needsAttention, note) {
  db.prepare("UPDATE projects SET needs_attention = ?, attention_note = ? WHERE access_id = ? COLLATE NOCASE")
    .run(needsAttention ? 1 : 0, note ? String(note).trim() : null, String(accessId));
}

export function markProjectLost(accessId, reason) {
  db.prepare("UPDATE projects SET lost_reason = ?, lost_at = datetime('now') WHERE access_id = ? COLLATE NOCASE")
    .run(String(reason), String(accessId));
}
// Reactivate a closed/lost project — clears the lost stamp so it flows again. Also closes any
// open "Reopen request" tickets so the queue reflects that the ask was actioned.
export function reactivateProject(accessId) {
  db.prepare("UPDATE projects SET lost_reason = NULL, lost_at = NULL WHERE access_id = ? COLLATE NOCASE").run(String(accessId));
  db.prepare("UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE access_id = ? COLLATE NOCASE AND status NOT IN ('closed','resolved') AND subject LIKE 'Reopen request%'").run(String(accessId));
  return getJobByAccessId(accessId);
}

// First-login: the customer confirmed their contact details. Stamps the time (once) so the
// welcome modal never shows again for this project. Idempotent — a second call is a no-op.
export function markInfoConfirmed(accessId) {
  db.prepare("UPDATE projects SET info_confirmed_at = COALESCE(info_confirmed_at, datetime('now','localtime')) WHERE access_id = ? COLLATE NOCASE").run(String(accessId));
  return getJobByAccessId(accessId);
}

// Resolve a signed-in actor to a human display NAME for stamping (recorded_by, created_by_name…).
// Session tokens carry { id, email, role } but no name, and PIN tokens carry only role — so look the
// user up by id/email. Never surface a raw email in the UI: fall back to the email's local part
// (title-cased), then the role. Keep this the single source so payments and proposals stamp alike.
export function actorName(tok) {
  if (!tok) return "Staff";
  if (tok.name) return String(tok.name);
  const u = (tok.id != null && getUserById(tok.id)) || (tok.email && getUserByEmail(tok.email)) || null;
  if (u?.name) return u.name;
  if (tok.email) {
    const local = String(tok.email).split("@")[0].replace(/[._-]+/g, " ").trim();
    if (local) return local.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const role = String(tok.role || "").trim();
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "Staff";
}

// Stamp the first-time guided tour as seen (once) so it never auto-opens again.
export function markTourSeen(accessId) {
  db.prepare("UPDATE projects SET tour_seen_at = COALESCE(tour_seen_at, datetime('now','localtime')) WHERE access_id = ? COLLATE NOCASE").run(String(accessId));
  return getJobByAccessId(accessId);
}

// Record that a customer-facing "published" pop-up (survey / mockup / proposal vN) has been shown,
// so it never re-pops. Stored as a JSON array of keys on the project. Idempotent + append-only.
export function markAnnouncementSeen(accessId, key) {
  const k = String(key || "").slice(0, 60);
  if (!k) return getJobByAccessId(accessId);
  const proj = getJobByAccessId(accessId);
  let seen = [];
  try { seen = JSON.parse(proj?.announced_seen || "[]"); } catch { seen = []; }
  if (!Array.isArray(seen)) seen = [];
  if (!seen.includes(k)) {
    seen.push(k);
    db.prepare("UPDATE projects SET announced_seen = ? WHERE access_id = ? COLLATE NOCASE").run(JSON.stringify(seen), String(accessId));
  }
  return getJobByAccessId(accessId);
}

export function setProjectCustomerPin(accessId, pin) {
  db.prepare("UPDATE projects SET customer_pin = ? WHERE access_id = ? COLLATE NOCASE").run(String(pin), String(accessId));
}

// Admin override: hand-set a PIN and flag it custom so the last-4-phone normalizer leaves it alone.
export function setCustomerPinCustom(accessId, pin) {
  db.prepare("UPDATE projects SET customer_pin = ?, pin_custom = 1 WHERE access_id = ? COLLATE NOCASE")
    .run(String(pin), String(accessId));
  return getJobByAccessId(accessId);
}

// Revert to the default rule: clear the custom flag and re-derive the PIN from the phone (if any).
export function resetCustomerPinToPhone(accessId) {
  const p = getJobByAccessId(accessId);
  const pin = phonePin(p?.contact_phone);
  db.prepare("UPDATE projects SET customer_pin = COALESCE(?, customer_pin), pin_custom = 0 WHERE access_id = ? COLLATE NOCASE")
    .run(pin, String(accessId));
  return getJobByAccessId(accessId);
}

export function updateProjectContact(accessId, fields) {
  const COLS = ["company_name","contact_name","contact_phone","contact_email","address","contact_message"];
  const keys = COLS.filter(k => k in fields);
  if (!keys.length) return;
  db.prepare(`UPDATE projects SET ${keys.map(k=>`${k}=?`).join(",")} WHERE access_id=?`)
    .run(...keys.map(k => fields[k]||null), accessId);
  // Owner rule: keep the customer PIN locked to the last 4 of the phone. When the phone changes
  // to a usable number, the PIN follows it — UNLESS an admin set a custom PIN (pin_custom=1).
  if ("contact_phone" in fields) {
    const pin = phonePin(fields.contact_phone);
    const row = db.prepare("SELECT pin_custom FROM projects WHERE access_id=?").get(accessId);
    if (pin && !row?.pin_custom) db.prepare("UPDATE projects SET customer_pin=? WHERE access_id=?").run(pin, accessId);
    // Office filled in the phone → the field-created "missing details" flag clears itself.
    if (pin) db.prepare("UPDATE projects SET needs_details=0 WHERE access_id=?").run(accessId);
  }
}

// ---- Inventory ----
const decorateInv = (r) => ({
  ...r,
  total_value:  (r.quantity || 0) * (r.unit_cost || 0),
  qty_for_project: r.qty_for_project || 0,
  qty_used:        r.qty_used        || 0,
});

export function getInventory() {
  return db.prepare(`
    SELECT i.*, p.customer AS project_customer,
           (SELECT COUNT(*) FROM inventory_units u WHERE u.item_id = i.id) AS serial_count,
           (SELECT GROUP_CONCAT(u.serial, ' ') FROM inventory_units u WHERE u.item_id = i.id AND u.serial IS NOT NULL) AS serials_blob,
           (SELECT MAX(at) FROM inventory_events e WHERE e.item_id = i.id) AS last_activity
    FROM inventory i
    LEFT JOIN projects p ON p.access_id = i.project_access_id COLLATE NOCASE
    ORDER BY i.category, i.name
  `).all().map(decorateInv);
}

export function getInventoryStats() {
  const rows = db.prepare("SELECT quantity, unit_cost, project_access_id FROM inventory").all();
  let units = 0, inStock = 0, deployed = 0, value = 0;
  for (const r of rows) {
    const q = r.quantity || 0;
    units += q;
    value += q * (r.unit_cost || 0);
    if (r.project_access_id) deployed += q; else inStock += q;
  }
  return { units, inStock, deployed, value, skus: rows.length };
}

// Append to the permanent movement log. Never pruned — this is the "forever" history.
function logInvEvent({ item_id, unit_id = null, type, qty = 1, serial = null, project_access_id = null, actor = {}, note = null }) {
  db.prepare(`INSERT INTO inventory_events (item_id, unit_id, type, qty, serial, project_access_id, actor_id, actor_name, note)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(Number(item_id), unit_id, String(type), Number(qty) || 0, serial, project_access_id,
         actor?.id || null, actor?.name || actor?.email || null, note);
}

export function addInventoryItem({ name, category, sku, quantity, unit_cost, location, project_access_id }, actor = {}) {
  const qty = Number(quantity) || 0;
  const info = db.prepare(
    "INSERT INTO inventory (name, category, sku, quantity, unit_cost, location, project_access_id) VALUES (?,?,?,?,?,?,?)"
  ).run(
    String(name || "").trim() || "Item",
    category ? String(category).trim() : null,
    sku ? String(sku).trim() : null,
    qty,
    Number(unit_cost) || 0,
    location ? String(location).trim() : null,
    project_access_id ? String(project_access_id).trim() : null
  );
  const id = Number(info.lastInsertRowid);
  logInvEvent({ item_id: id, type: "created", qty, actor, note: qty ? `Added with ${qty} on hand` : null });
  return id;
}

// Scan a batch of serial/QR codes into an item: one unit per non-blank line. Duplicates
// (already on this item, or repeated in the same batch) are skipped. Stock qty grows by
// the number actually added, and every unit gets a permanent "received" event.
export function batchReceiveSerials(itemId, serials, opts = {}, actor = {}) {
  const id = Number(itemId);
  const item = db.prepare("SELECT * FROM inventory WHERE id = ?").get(id);
  if (!item) return { error: "Item not found." };
  const sku      = opts.sku      != null && String(opts.sku).trim()      ? String(opts.sku).trim()      : null;
  const tracking = opts.tracking != null && String(opts.tracking).trim() ? String(opts.tracking).trim() : null;
  const existing = new Set(
    db.prepare("SELECT serial FROM inventory_units WHERE item_id = ? AND serial IS NOT NULL").all(id)
      .map((r) => String(r.serial).toLowerCase())
  );
  const clean = [];
  const seen = new Set();
  let raw = 0;
  for (const s0 of (serials || [])) {
    const s = String(s0 || "").trim();
    if (!s) continue;
    raw++;
    const key = s.toLowerCase();
    if (existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    clean.push(s);
  }
  const insUnit = db.prepare("INSERT INTO inventory_units (item_id, serial, sku, tracking, status) VALUES (?,?,?,?, 'in_stock')");
  for (const s of clean) {
    const u = insUnit.run(id, s, sku, tracking);
    logInvEvent({ item_id: id, unit_id: Number(u.lastInsertRowid), type: "received", qty: 1, serial: s,
                  actor, note: tracking ? `Tracking ${tracking}` : null });
  }
  if (clean.length) db.prepare("UPDATE inventory SET quantity = quantity + ? WHERE id = ?").run(clean.length, id);
  if (sku && !item.sku) db.prepare("UPDATE inventory SET sku = ? WHERE id = ?").run(sku, id);
  return { ok: true, added: clean.length, skipped: raw - clean.length };
}

// Full, date-filterable history for one item — unit list + event timeline + roll-ups.
export function getItemHistory(itemId, since = null) {
  const id = Number(itemId);
  const item = db.prepare(`
    SELECT i.*, p.customer AS project_customer
    FROM inventory i LEFT JOIN projects p ON p.access_id = i.project_access_id COLLATE NOCASE
    WHERE i.id = ?`).get(id);
  if (!item) return null;
  const args = [id];
  let where = "WHERE item_id = ?";
  if (since) { where += " AND at >= ?"; args.push(String(since)); }
  // node:sqlite rows have a null prototype — spread into plain objects so they can cross
  // the server→client boundary (React refuses to serialize null-prototype objects).
  const events = db.prepare(`
    SELECT e.*, p.customer AS project_customer
    FROM inventory_events e LEFT JOIN projects p ON p.access_id = e.project_access_id COLLATE NOCASE
    ${where} ORDER BY e.at DESC, e.id DESC`).all(...args).map((r) => ({ ...r }));
  const units = db.prepare(`
    SELECT u.*, p.customer AS project_customer
    FROM inventory_units u LEFT JOIN projects p ON p.access_id = u.project_access_id COLLATE NOCASE
    WHERE u.item_id = ? ORDER BY u.received_at DESC, u.id DESC`).all(id).map((r) => ({ ...r }));
  const received  = db.prepare("SELECT COALESCE(SUM(qty),0) AS n FROM inventory_events WHERE item_id = ? AND type='received'").get(id).n;
  const installed = db.prepare("SELECT COUNT(*) AS n FROM inventory_units WHERE item_id = ? AND status='installed'").get(id).n;
  return { item: decorateInv(item), events, units, totals: { received, installed, serials: units.length, used: item.qty_used || 0 } };
}

export function assignInventory(id, projectAccessId, qtyForProject, actor = {}) {
  const pid = projectAccessId ? String(projectAccessId).trim() : null;
  const qty = pid ? (Number(qtyForProject) || 0) : 0;
  db.prepare("UPDATE inventory SET project_access_id = ?, qty_for_project = ? WHERE id = ?")
    .run(pid, qty, Number(id));
  logInvEvent({ item_id: Number(id), type: pid ? "assigned" : "unassigned", qty, project_access_id: pid, actor });
}

export function updateQtyForProject(id, qty) {
  db.prepare("UPDATE inventory SET qty_for_project = ? WHERE id = ?").run(Math.max(0, Number(qty) || 0), Number(id));
}

export function markInventoryUsed(id, qtyUsed, actor = {}) {
  const prev = db.prepare("SELECT qty_used, project_access_id FROM inventory WHERE id = ?").get(Number(id));
  const next = Math.max(0, Number(qtyUsed) || 0);
  db.prepare("UPDATE inventory SET qty_used = ? WHERE id = ?").run(next, Number(id));
  const delta = next - (prev?.qty_used || 0);
  if (delta !== 0) {
    logInvEvent({ item_id: Number(id), type: "installed", qty: delta, project_access_id: prev?.project_access_id || null,
                  actor, note: `Installed count → ${next}` });
  }
}

export function getProjectInventoryShortages() {
  const rows = db.prepare(`
    SELECT i.project_access_id, p.customer,
           COUNT(*) AS item_count,
           SUM(CASE WHEN i.qty_for_project > i.quantity THEN 1 ELSE 0 END) AS over_allocated,
           SUM(CASE WHEN i.qty_for_project > 0 AND i.qty_used < i.qty_for_project THEN 1 ELSE 0 END) AS pending_install
    FROM inventory i
    JOIN projects p ON p.access_id = i.project_access_id COLLATE NOCASE
    WHERE i.project_access_id IS NOT NULL
    GROUP BY i.project_access_id
  `).all();
  return rows;
}

export function deleteInventoryItem(id) {
  db.prepare("DELETE FROM inventory WHERE id = ?").run(Number(id));
}

// ---- Tickets ----
const decorateTicket = (t) => ({ ...t, audienceList: (t.audience || "").split(",").map((s) => s.trim()).filter(Boolean) });

export function getTickets() {
  return db.prepare(`
    SELECT t.*, p.customer AS project_customer,
           (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
    FROM tickets t
    LEFT JOIN projects p ON p.access_id = t.access_id COLLATE NOCASE
    ORDER BY (t.status = 'closed') ASC, t.updated_at DESC, t.id DESC
  `).all().map(decorateTicket);
}

// True when this project already has an open/unresolved "Reopen request" ticket — so a customer
// tapping Reopen twice doesn't stack duplicates.
export function hasOpenReopenTicket(accessId) {
  const row = db.prepare(
    "SELECT 1 FROM tickets WHERE access_id = ? COLLATE NOCASE AND status NOT IN ('closed','resolved') AND subject LIKE 'Reopen request%' LIMIT 1"
  ).get(String(accessId));
  return !!row;
}

export function getTicketById(id) {
  const t = db.prepare(`
    SELECT t.*, p.customer AS project_customer, p.contact_email AS project_email
    FROM tickets t LEFT JOIN projects p ON p.access_id = t.access_id COLLATE NOCASE
    WHERE t.id = ?
  `).get(Number(id));
  if (!t) return null;
  const messages = db.prepare("SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id ASC").all(Number(id)).map((r) => ({ ...r }));
  return { ...decorateTicket(t), messages };
}

export function createTicket({ access_id, subject, priority, opened_by_id, opened_by_name, opened_by_role, assignee_id, assignee_name, audience, body }) {
  const info = db.prepare(`
    INSERT INTO tickets (access_id, subject, priority, opened_by_id, opened_by_name, opened_by_role, assignee_id, assignee_name, audience)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    access_id || null, String(subject || "").trim() || "Ticket", priority || "medium",
    opened_by_id || null, opened_by_name || null, opened_by_role || null,
    assignee_id || null, assignee_name || null,
    audience || "admin,manager,tech,customer"
  );
  const id = Number(info.lastInsertRowid);
  if (body && String(body).trim()) addTicketMessage(id, { author_id: opened_by_id, author_name: opened_by_name, author_role: opened_by_role, body });
  return id;
}

// ===========================================================================
// Service calls (TRACE) — Phase 1 data layer
// ===========================================================================

// The stage ladder for a service call, in order. Distinct from the project lifecycle.
export const SVC_STAGES = [
  { key: "submitted",  label: "Submitted" },
  { key: "diagnosing", label: "Diagnosing" },
  { key: "quoted",     label: "Quoted" },
  { key: "scheduled",  label: "Scheduled" },
  { key: "onsite",     label: "On-site" },
  { key: "resolved",   label: "Resolved" },
  { key: "billed",     label: "Billed" },
  { key: "closed",     label: "Closed" },
];
export function svcStageLabel(key) {
  return (SVC_STAGES.find((s) => s.key === key) || {}).label || key || "";
}

// SVC id from a counter — same base36 scheme as project ids, distinct prefix so it never reads as
// a project. e.g. counter 1 -> "SVC0001", 42 -> "SVC0016".
export function makeSvcId(counter) {
  return `SVC${Number(counter).toString(36).toUpperCase().padStart(4, "0")}`;
}

function decorateSvc(r) {
  if (!r) return null;
  return { ...r, stage_label: svcStageLabel(r.stage) };
}

// Append a line to the call's timeline. Everything the record is built from flows through here, so
// the PDF timeline is just this table in order.
export function logServiceCallEvent(svcId, { kind, detail = null, actor_role = null, actor_name = null }) {
  db.prepare(
    "INSERT INTO service_call_events (svc_id, kind, detail, actor_role, actor_name) VALUES (?,?,?,?,?)"
  ).run(String(svcId), String(kind), detail == null ? null : String(detail), actor_role, actor_name);
}

export function getServiceCallEvents(svcId) {
  return db.prepare(
    "SELECT id, at, kind, actor_role, actor_name, detail FROM service_call_events WHERE svc_id = ? ORDER BY id ASC"
  ).all(String(svcId));
}

// Create a service call from an intake. Assigns the SVC id from the row's own autoincrement id
// (guaranteed unique), sets the PIN to the last 4 of the contact phone (same rule as projects),
// links a ticket, and logs the opening event.
export function createServiceCall({ customer, contact_name, contact_email, contact_phone, address, project_access_id, issue, category, priority, actor_role, actor_name }) {
  const info = db.prepare(`
    INSERT INTO service_calls (customer, contact_name, contact_email, contact_phone, address, project_access_id, issue, category, priority, customer_pin)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    String(customer || contact_name || "").trim() || null,
    contact_name || null, contact_email || null, contact_phone || null,
    address || null, project_access_id || null,
    String(issue || "").trim() || null, category || "other", priority || "medium",
    phonePin(contact_phone)
  );
  const id = Number(info.lastInsertRowid);
  const svcId = makeSvcId(id);
  db.prepare("UPDATE service_calls SET svc_id = ? WHERE id = ?").run(svcId, id);

  // Companion ticket so it flows through the existing ticket surfaces too.
  const ticketId = createTicket({
    subject: `Service call — ${issue || category || "issue"}`,
    priority: priority || "medium",
    opened_by_name: actor_name || contact_name, opened_by_role: actor_role || "customer",
    audience: "admin,manager,tech,customer",
  });
  db.prepare("UPDATE service_calls SET ticket_id = ? WHERE id = ?").run(ticketId, id);

  logServiceCallEvent(svcId, { kind: "submitted", detail: issue || category || "Service call opened", actor_role: actor_role || "customer", actor_name: actor_name || contact_name });
  // Companion type-C project — the call's full gateway page. Never let a hiccup here kill the
  // intake (the call row already exists); the detail/tracker pages lazily repair a missing link.
  try { ensureSvcProject(svcId); } catch (e) { console.error("ensureSvcProject failed for", svcId, e); }
  return getServiceCall(svcId);
}

export function getServiceCall(svcId) {
  return decorateSvc(db.prepare("SELECT * FROM service_calls WHERE svc_id = ? COLLATE NOCASE").get(String(svcId || "").trim()));
}

// Every service call gets a COMPANION type-C project so it lives on the full project gateway —
// identical page skeleton to any other job (collapsible tool cards, customer/admin/tech views,
// survey, mockup, expenses, scheduling). The SVC row stays the source of truth for the call's
// own thread (diagnostics, rate-card invoice, event log); the project carries the job tooling.
// Idempotent: returns the existing link when the project is already there. Lazily invoked on
// page loads too, so calls created before this shipped get their project on first open.
export function ensureSvcProject(svcId) {
  const call = getServiceCall(svcId);
  if (!call) return null;
  if (call.svc_project_id) {
    const existing = getJobByAccessId(call.svc_project_id);
    if (existing) return existing;
  }
  // createLeadProject handles the customer-user upsert + unique id + PIN; retype the row to a
  // type-C "Service Requests" project and re-prefix the access id (A… → C…) to match the type.
  const { accessId } = createLeadProject(
    call.contact_name || call.customer, call.contact_email, call.contact_phone,
    call.address || "", "Security Cameras / CCTV", call.customer !== call.contact_name ? call.customer : null
  );
  let cId = "C" + accessId.slice(1);
  while (db.prepare("SELECT id FROM projects WHERE access_id = ?").get(cId)) {
    cId = "C" + accessId.slice(1, 3) + String(Math.floor(Math.random() * 99999)).toString(36).toUpperCase().padStart(4, "0");
  }
  db.prepare("UPDATE projects SET access_id = ?, project_type = 'C', category = 'service', issue = ? WHERE access_id = ?")
    .run(cId, call.issue || null, accessId);
  db.prepare("UPDATE service_calls SET svc_project_id = ?, updated_at = datetime('now','localtime') WHERE svc_id = ? COLLATE NOCASE").run(cId, String(call.svc_id));
  logServiceCallEvent(call.svc_id, { kind: "note", detail: `Project ${cId} opened for this call`, actor_role: "system", actor_name: null });

  // The call is on a system WE installed (linked at intake) → import the install's site survey
  // so the tech walks in with the floor plan and camera layout already on the call's project.
  if (call.project_access_id) {
    try {
      const src = getToolData(call.project_access_id, "survey");
      if (src?.data) {
        saveToolData(cId, "survey", src.data, "Imported from " + call.project_access_id);
        logServiceCallEvent(call.svc_id, { kind: "note", detail: `Site survey imported from ${call.project_access_id}`, actor_role: "system", actor_name: null });
      }
    } catch { /* survey blob unreadable — skip, never block call creation */ }
  }
  return getJobByAccessId(cId);
}

// Reverse lookup: the service call living on a companion type-C project (gateway integration).
// ============================ HIRING / ONBOARDING ============================
// An application is a mini-project: APP id, last-4-of-phone PIN, a stage bar the applicant
// watches, and an append-only event log. Same conventions as service calls throughout.

export const APP_STAGES = [
  { key: "applied",   label: "Applied" },
  { key: "reviewing", label: "In review" },
  { key: "interview", label: "Interview" },
  { key: "offer",     label: "Offer" },
  { key: "hired",     label: "Hired" },
  { key: "declined",  label: "Not moving forward" },
];
export const APP_POSITIONS = [
  { key: "tech",      label: "Technician" },
  { key: "installer", label: "Installer / helper" },
  { key: "sales",     label: "Sales" },
  { key: "office",    label: "Office / dispatch" },
  { key: "other",     label: "Something else" },
];
export function appStageLabel(key) { return APP_STAGES.find((s) => s.key === key)?.label || key; }
export function appPositionLabel(key) { return APP_POSITIONS.find((p) => p.key === key)?.label || key || "—"; }
export function makeAppId(counter) { return `APP${Number(counter).toString(36).toUpperCase().padStart(4, "0")}`; }

function decorateApp(r) {
  if (!r) return null;
  const h = resolveHiring(r);   // { status, portal, meta } — derives from legacy stage if columns are unset
  return { ...r, stage_label: appStageLabel(r.stage), position_label: appPositionLabel(r.position),
    onboarding: safeJson(r.onboarding, null), assessment: safeJson(r.assessment, null), steps: safeJson(r.steps, {}), training: safeJson(r.training, { modules: {}, tier: null, badges: [] }),
    portal: r.portal || h.portal, status: h.status, status_label: statusLabel(h.status), status_tone: h.meta?.tone || "neutral",
    disposition: r.disposition || "active" };
}

export function logApplicationEvent(appId, { kind, detail, actor_role, actor_name } = {}) {
  db.prepare("INSERT INTO application_events (app_id, kind, actor_role, actor_name, detail) VALUES (?,?,?,?,?)")
    .run(String(appId), String(kind || "note"), actor_role || null, actor_name || null, String(detail || "").slice(0, 800) || null);
}
export function getApplicationEvents(appId) {
  return db.prepare("SELECT * FROM application_events WHERE app_id = ? COLLATE NOCASE ORDER BY id ASC").all(String(appId)).map((r) => ({ ...r }));
}

export function createApplication({ name, email, phone, address, position, experience, skills, has_license, has_vehicle, has_tools, availability, start_date, about, resume_name, resume_data, dob }) {
  const info = db.prepare(`
    INSERT INTO applications (name, email, phone, address, position, experience, skills, has_license, has_vehicle, has_tools, availability, start_date, about, applicant_pin, resume_name, resume_data, dob)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    String(name || "").trim() || null, String(email || "").trim() || null, String(phone || "").trim() || null,
    String(address || "").trim() || null, position || "other",
    String(experience || "").slice(0, 60) || null, String(skills || "").slice(0, 600) || null,
    has_license ? 1 : 0, has_vehicle ? 1 : 0, has_tools ? 1 : 0,
    availability || null, String(start_date || "").slice(0, 20) || null,
    String(about || "").slice(0, 2000) || null,
    phonePin(phone),
    resume_name ? String(resume_name).slice(0, 200) : null,
    resume_data || null,
    String(dob || "").slice(0, 10) || null
  );
  const id = Number(info.lastInsertRowid);
  const appId = makeAppId(id);
  db.prepare("UPDATE applications SET app_id = ? WHERE id = ?").run(appId, id);
  logApplicationEvent(appId, { kind: "applied", detail: `Applied for ${appPositionLabel(position)}`, actor_role: "applicant", actor_name: name });
  return getApplication(appId);
}

export function getApplication(appId) {
  return decorateApp(db.prepare("SELECT * FROM applications WHERE app_id = ? COLLATE NOCASE").get(String(appId || "").trim()));
}

// Most recent application for an email — used to block duplicate applications from the same person.
export function findApplicationByEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  // Ignore voided applications — a re-apply after a void should create a fresh row, not recover one.
  return decorateApp(db.prepare("SELECT * FROM applications WHERE lower(trim(email)) = ? AND COALESCE(archived,0) = 0 ORDER BY id DESC LIMIT 1").get(e));
}

// Full APP id or its last 4 (unambiguous only) — mirrors resolveProjectRef/resolveServiceCallRef.
export function resolveApplicationRef(ref) {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  const exact = getApplication(raw);
  if (exact) return exact;
  const code = raw.replace(/[^a-z0-9]/gi, "");
  if (code.length < 3 || code.length > 8) return null;
  const rows = db.prepare("SELECT * FROM applications WHERE app_id LIKE ? COLLATE NOCASE").all("%" + code);
  return rows.length === 1 ? decorateApp(rows[0]) : null;
}

export function listApplications({ stage, includeArchived = false } = {}) {
  // Voided (archived) applications are hidden from the board/roster by default; pass
  // includeArchived to see them (e.g. an admin "Archived" view).
  const where = [];
  if (stage) where.push("stage = ?");
  if (!includeArchived) where.push("COALESCE(archived,0) = 0");
  const sql = "SELECT * FROM applications" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY id DESC";
  return (stage ? db.prepare(sql).all(stage) : db.prepare(sql).all()).map(decorateApp);
}

// Void / restore an application. Non-destructive — the row and its events are kept for audit.
export function setApplicationArchived(appId, archived, { actor_role, actor_name } = {}) {
  const app = getApplication(appId);
  if (!app) return null;
  db.prepare("UPDATE applications SET archived = ?, archived_at = " + (archived ? "datetime('now','localtime')" : "NULL") + ", archived_by = ? WHERE app_id = ? COLLATE NOCASE")
    .run(archived ? 1 : 0, archived ? (actor_name || null) : null, app.app_id);
  logApplicationEvent(app.app_id, { kind: "note", detail: archived ? "Application voided (archived)" : "Application restored from archive", actor_role, actor_name });
  return getApplication(app.app_id);
}

// Set the candidate disposition (active | on_hold | withdrawn) — independent of the pipeline stage,
// which is preserved. Logs the change so the timeline shows who paused/withdrew the candidate and why.
export function setApplicationDisposition(appId, disposition, { actor_role, actor_name, reason } = {}) {
  if (!["active", "on_hold", "withdrawn"].includes(disposition)) return null;
  const cur = getApplication(appId);
  if (!cur) return null;
  const from = cur.disposition || "active";
  db.prepare("UPDATE applications SET disposition = ?, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE").run(disposition, cur.app_id);
  const LBL = { active: "Active", on_hold: "On Hold", withdrawn: "Withdrawn" };
  logApplicationEvent(cur.app_id, { kind: "disposition", detail: `${LBL[from] || from} → ${LBL[disposition]}${reason ? ` — ${String(reason).slice(0, 200)}` : ""}`, actor_role, actor_name });
  return getApplication(cur.app_id);
}

export function setApplicationStage(appId, stage, { actor_role, actor_name, reason } = {}) {
  if (!APP_STAGES.some((s) => s.key === stage)) return null;
  const cur = getApplication(appId);
  if (!cur) return null;
  const extra = stage === "hired" ? ", hired_at = datetime('now','localtime')"
              : stage === "declined" ? ", declined_at = datetime('now','localtime')" : "";
  db.prepare(`UPDATE applications SET stage = ?, decline_reason = COALESCE(?, decline_reason), updated_at = datetime('now','localtime')${extra} WHERE app_id = ? COLLATE NOCASE`)
    .run(stage, stage === "declined" ? (String(reason || "").slice(0, 400) || null) : null, String(appId));
  logApplicationEvent(cur.app_id, { kind: "stage", detail: `${appStageLabel(cur.stage)} → ${appStageLabel(stage)}`, actor_role, actor_name });
  return getApplication(appId);
}

// Set the fine-grained hiring status. Derives the portal, mirrors a coarse legacy `stage` so older
// screens stay correct, stamps hired_at/declined_at where relevant, and logs the transition.
export function setApplicationStatus(appId, status, { actor_role, actor_name, reason } = {}) {
  if (!HIRING_STATUSES.some((s) => s.key === status)) return null;
  const cur = getApplication(appId);
  if (!cur) return null;
  const portal = portalOfStatus(status);
  const stage = legacyStageFromStatus(status);
  const extra = status === "documents_pending" && cur.stage !== "hired" ? ", hired_at = COALESCE(hired_at, datetime('now','localtime'))"
              : status === "declined" ? ", declined_at = datetime('now','localtime')" : "";
  db.prepare(`UPDATE applications SET status = ?, portal = ?, stage = ?, decline_reason = COALESCE(?, decline_reason), updated_at = datetime('now','localtime')${extra} WHERE app_id = ? COLLATE NOCASE`)
    .run(status, portal, stage, status === "declined" ? (String(reason || "").slice(0, 400) || null) : null, String(appId));
  logApplicationEvent(cur.app_id, { kind: "stage", detail: `${statusLabel(cur.status || cur.stage)} → ${statusLabel(status)}`, actor_role, actor_name });
  return getApplication(appId);
}

// Portal 1 pre-hire assessment blob: { status, responses, score, tier, cats, flags, profile, ... }.
export function getApplicationAssessment(appId) {
  const r = db.prepare("SELECT assessment FROM applications WHERE app_id = ? COLLATE NOCASE").get(String(appId));
  return r ? safeJson(r.assessment, null) : null;
}
export function saveApplicationAssessment(appId, obj) {
  db.prepare("UPDATE applications SET assessment = ?, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE")
    .run(JSON.stringify(obj || {}), String(appId));
  return getApplicationAssessment(appId);
}

// ── Portal 3 training ──────────────────────────────────────────────────────
export function getApplicationTraining(appId) {
  const r = db.prepare("SELECT training FROM applications WHERE app_id = ? COLLATE NOCASE").get(String(appId));
  return r ? safeJson(r.training, { modules: {}, tier: null, badges: [] }) : { modules: {}, tier: null, badges: [] };
}
function saveTraining(appId, obj) {
  db.prepare("UPDATE applications SET training = ?, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE")
    .run(JSON.stringify(obj || { modules: {}, tier: null, badges: [] }), String(appId));
}
export function setTrainingModule(appId, key, patch, { actor_role, actor_name } = {}) {
  const t = getApplicationTraining(appId); t.modules = t.modules || {};
  t.modules[key] = { ...(t.modules[key] || {}), ...patch, at: new Date().toISOString().slice(0, 19).replace("T", " ") };
  saveTraining(appId, t);
  try { logApplicationEvent(appId, { kind: "note", detail: `Training · ${key} → ${patch.status || "updated"}`, actor_role, actor_name }); } catch {}
  return t;
}
export function setTraining(appId, patch, { actor_role, actor_name } = {}) {
  const t = { ...getApplicationTraining(appId), ...patch };
  saveTraining(appId, t);
  try { logApplicationEvent(appId, { kind: "note", detail: `Training updated${patch.tier ? ` · tier ${patch.tier}` : ""}`, actor_role, actor_name }); } catch {}
  return t;
}

// ── Portal 2 compliance ───────────────────────────────────────────────────
export function getApplicationCompliance(appId) {
  const r = db.prepare("SELECT compliance FROM applications WHERE app_id = ? COLLATE NOCASE").get(String(appId));
  return r ? safeJson(r.compliance, { items: {}, checks: {} }) : { items: {}, checks: {} };
}
function saveCompliance(appId, obj) {
  db.prepare("UPDATE applications SET compliance = ?, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE")
    .run(JSON.stringify(obj || { items: {}, checks: {} }), String(appId));
}
export function setComplianceItem(appId, key, patch, { actor_role, actor_name } = {}) {
  const c = getApplicationCompliance(appId); c.items = c.items || {};
  c.items[key] = { ...(c.items[key] || {}), ...patch, at: new Date().toISOString().slice(0, 19).replace("T", " ") };
  saveCompliance(appId, c);
  try { logApplicationEvent(appId, { kind: "note", detail: `Compliance · ${key} → ${patch.status || "updated"}`, actor_role, actor_name }); } catch {}
  return c;
}
export function setComplianceCheck(appId, key, patch, { actor_role, actor_name } = {}) {
  const c = getApplicationCompliance(appId); c.checks = c.checks || {};
  c.checks[key] = { ...(c.checks[key] || {}), ...patch, at: new Date().toISOString().slice(0, 19).replace("T", " ") };
  saveCompliance(appId, c);
  try { logApplicationEvent(appId, { kind: "note", detail: `Check · ${key} → ${patch.status || "updated"}`, actor_role, actor_name }); } catch {}
  return c;
}
// Strip any *_enc field before compliance data is sent to a browser (office or candidate).
export function sanitizeCompliance(c) {
  const clean = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k,
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([kk]) => !kk.endsWith("_enc"))) : v]));
  return { items: clean(c?.items), checks: clean(c?.checks) };
}

// Portal 1 evaluation scorecards, keyed by step (phone|in_person|sop|ride_along).
export function getApplicationSteps(appId) {
  const r = db.prepare("SELECT steps FROM applications WHERE app_id = ? COLLATE NOCASE").get(String(appId));
  return r ? safeJson(r.steps, {}) : {};
}
export function saveApplicationStep(appId, step, data, { actor_role, actor_name } = {}) {
  const cur = getApplicationSteps(appId);
  cur[step] = { ...data, by: actor_name || null, at: new Date().toISOString().slice(0, 19).replace("T", " ") };
  db.prepare("UPDATE applications SET steps = ?, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE")
    .run(JSON.stringify(cur), String(appId));
  try { logApplicationEvent(appId, { kind: "note", detail: `Scorecard saved — ${step}${data.score != null ? ` (${data.score}/5)` : ""}`, actor_role, actor_name }); } catch {}
  return cur;
}

export function setApplicationReview(appId, { rating, reviewer_id, reviewer_name, interview_at }, { actor_role, actor_name } = {}) {
  const cur = getApplication(appId);
  if (!cur) return null;
  const sets = [], vals = [];
  if (rating != null)       { sets.push("rating = ?");        vals.push(Math.max(0, Math.min(5, +rating || 0))); }
  if (reviewer_id !== undefined) { sets.push("reviewer_id = ?", "reviewer_name = ?"); vals.push(reviewer_id || null, reviewer_name || null); }
  if (interview_at !== undefined) { sets.push("interview_at = ?"); vals.push(String(interview_at || "").slice(0, 30) || null); }
  if (!sets.length) return cur;
  vals.push(String(appId));
  db.prepare(`UPDATE applications SET ${sets.join(", ")}, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE`).run(...vals);
  if (interview_at) logApplicationEvent(cur.app_id, { kind: "interview", detail: `Interview set for ${interview_at}`, actor_role, actor_name });
  return getApplication(appId);
}

// Office-side onboarding checklist (post-hire): { w9, license, insurance, background, gear, training }
export function setApplicationOnboarding(appId, patch, { actor_role, actor_name } = {}) {
  const cur = getApplication(appId);
  if (!cur) return null;
  const next = { ...(cur.onboarding || {}), ...(patch || {}) };
  db.prepare("UPDATE applications SET onboarding = ?, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE")
    .run(JSON.stringify(next), String(appId));
  logApplicationEvent(cur.app_id, { kind: "onboarding", detail: "Onboarding checklist updated", actor_role, actor_name });
  return getApplication(appId);
}

// New-hire onboarding form — the part THEY fill in (profile, emergency contact, licence, gear
// sizes) plus their typed acknowledgements. Stored under onboarding.profile / onboarding.signed.
// Deliberately collects NO bank details: payroll/direct-deposit is handled on paper so account
// numbers never land in this database.
export function saveOnboardingProfile(appId, profile, { actor_name } = {}) {
  const cur = getApplication(appId);
  if (!cur) return null;
  const s = (v, n = 120) => String(v || "").trim().slice(0, n) || null;
  const clean = {
    legal_name:    s(profile?.legal_name),
    dob:           s(profile?.dob, 20),
    address:       s(profile?.address, 200),
    emergency_name:  s(profile?.emergency_name),
    emergency_phone: s(profile?.emergency_phone, 40),
    emergency_rel:   s(profile?.emergency_rel, 60),
    license_no:    s(profile?.license_no, 40),
    license_state: s(profile?.license_state, 20),
    license_exp:   s(profile?.license_exp, 20),
    shirt:  s(profile?.shirt, 12),
    jacket: s(profile?.jacket, 12),
    boot:   s(profile?.boot, 12),
    submitted_at: new Date().toISOString(),
  };
  // An emergency contact is only worth having if someone confirmed it answers. The office
  // verifies by calling; editing the name or number clears that verification so a changed
  // contact can never inherit an old confirmation.
  const prev = (cur.onboarding || {}).profile || {};
  const same = prev.emergency_name === clean.emergency_name && prev.emergency_phone === clean.emergency_phone;
  const next = { ...(cur.onboarding || {}), profile: clean };
  if (same && (cur.onboarding || {}).emergency_verified) next.emergency_verified = cur.onboarding.emergency_verified;
  else delete next.emergency_verified;
  db.prepare("UPDATE applications SET onboarding = ?, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE")
    .run(JSON.stringify(next), String(cur.app_id));
  logApplicationEvent(cur.app_id, { kind: "onboarding", detail: "New hire submitted their details", actor_role: "applicant", actor_name: actor_name || cur.name });
  return getApplication(appId);
}

// Office confirms the emergency contact actually answers. Cleared automatically if the new hire
// later edits the name or number (see saveOnboardingProfile), so a stale contact can't look verified.
export function verifyEmergencyContact(appId, verified, { actor_role, actor_name, note } = {}) {
  const cur = getApplication(appId);
  if (!cur) return null;
  const prof = (cur.onboarding || {}).profile || {};
  const next = { ...(cur.onboarding || {}) };
  if (verified) {
    next.emergency_verified = { at: new Date().toISOString(), by: actor_name || "Office", note: String(note || "").slice(0, 200) || null };
  } else {
    delete next.emergency_verified;
  }
  db.prepare("UPDATE applications SET onboarding = ?, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE")
    .run(JSON.stringify(next), String(cur.app_id));
  logApplicationEvent(cur.app_id, {
    kind: "onboarding",
    detail: verified ? `Emergency contact verified — ${prof.emergency_name || "contact"} reached` : "Emergency contact verification cleared",
    actor_role, actor_name,
  });
  return getApplication(appId);
}

// A typed name is the signature, same convention as proposals and service-call invoices.
// Signing is one-way: an already-signed document can't be re-signed or altered.
export function signOnboardingDoc(appId, docKey, typedName) {
  const cur = getApplication(appId);
  if (!cur) return null;
  const KEYS = ["safety", "handbook", "equipment"];
  if (!KEYS.includes(docKey)) return cur;
  const signed = { ...((cur.onboarding || {}).signed || {}) };
  if (signed[docKey]) return cur;   // already signed — immutable
  signed[docKey] = { name: String(typedName || "").trim().slice(0, 120), at: new Date().toISOString() };
  const next = { ...(cur.onboarding || {}), signed };
  db.prepare("UPDATE applications SET onboarding = ?, updated_at = datetime('now','localtime') WHERE app_id = ? COLLATE NOCASE")
    .run(JSON.stringify(next), String(cur.app_id));
  const LABEL = { safety: "Safety policy", handbook: "Employee handbook", equipment: "Tool & equipment agreement" };
  logApplicationEvent(cur.app_id, { kind: "onboarding", detail: `${LABEL[docKey]} signed by ${signed[docKey].name}`, actor_role: "applicant", actor_name: signed[docKey].name });
  return getApplication(appId);
}

// Hire: create the real staff account (password + PIN = last 4 of phone, our standing convention),
// link it to the application, and stamp the stage. Idempotent — re-hiring returns the same user.
// Returns { app, accountError }: the stage always moves, but the CALLER must surface accountError
// so nobody thinks a login exists when it doesn't (users.email is UNIQUE NOT NULL, so an
// application with no email can't become an account until the office adds one).
export function hireApplicant(appId, role, { actor_role, actor_name } = {}) {
  const cur = getApplication(appId);
  if (!cur) return null;
  const wanted = ["tech", "sales", "manager", "admin"].includes(role) ? role : "tech";
  let user = cur.user_id ? getUserById(cur.user_id) : null;
  let accountError = null;

  if (!user) {
    const email = String(cur.email || "").trim();
    if (!email) {
      accountError = "No email on the application — add one before creating their login.";
    } else {
      user = getUserByEmail(email) || (cur.phone ? getUserByPhone(cur.phone) : null);
      if (!user) {
        const digits = String(cur.phone || "").replace(/\D/g, "");
        const initialPw = digits.length >= 7 ? digits : "welcome";
        try {
          const info = db.prepare("INSERT INTO users (name, username, email, phone, password_hash, role) VALUES (?,?,?,?,?,?)")
            .run(cur.name || "Team member", usernameFromEmail(email), email, cur.phone || null, hashPw(initialPw), wanted);
          user = getUserById(Number(info.lastInsertRowid));
        } catch (e) {
          accountError = "Could not create the account — that email or phone may already belong to someone.";
        }
      }
    }
  }

  if (user) db.prepare("UPDATE applications SET user_id = ? WHERE app_id = ? COLLATE NOCASE").run(user.id, String(cur.app_id));
  setApplicationStage(cur.app_id, "hired", { actor_role, actor_name });
  logApplicationEvent(cur.app_id, {
    kind: "hired",
    detail: user ? `Hired as ${wanted} — account ${user.email} created` : `Hired as ${wanted} — account pending (${accountError})`,
    actor_role, actor_name,
  });
  return { app: getApplication(appId), accountError };
}

export function getServiceCallByProject(accessId) {
  const r = db.prepare("SELECT * FROM service_calls WHERE svc_project_id = ? COLLATE NOCASE").get(String(accessId || "").trim());
  return decorateSvc(r);
}

// Full SVC id or its last 4 (unambiguous only) — mirrors resolveProjectRef so the PIN page can
// accept either. Returns null when zero or many match.
export function resolveServiceCallRef(ref) {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  const exact = getServiceCall(raw);
  if (exact) return exact;
  const code = raw.replace(/[^a-z0-9]/gi, "");
  if (code.length < 3 || code.length > 8) return null;
  const rows = db.prepare("SELECT * FROM service_calls WHERE svc_id LIKE ? COLLATE NOCASE").all("%" + code);
  return rows.length === 1 ? decorateSvc(rows[0]) : null;
}

export function listServiceCalls({ stage, assignee_id, project_access_id } = {}) {
  const where = [], args = [];
  if (stage) { where.push("stage = ?"); args.push(stage); }
  if (assignee_id) { where.push("assignee_id = ?"); args.push(Number(assignee_id)); }
  if (project_access_id) { where.push("project_access_id = ?"); args.push(project_access_id); }
  const sql = "SELECT * FROM service_calls" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY id DESC";
  return db.prepare(sql).all(...args).map(decorateSvc);
}

export function getServiceCallsForCustomer(email, phone) {
  // Intake often captures phone-only, so match on either channel (phone compared digits-to-digits).
  const d = String(phone || "").replace(/\D/g, "");
  const rows = db.prepare("SELECT * FROM service_calls ORDER BY id DESC").all().filter((r) => {
    const emailMatch = email && r.contact_email && String(r.contact_email).toLowerCase() === String(email).toLowerCase();
    const phoneMatch = d.length >= 7 && String(r.contact_phone || "").replace(/\D/g, "") === d;
    return emailMatch || phoneMatch;
  });
  return rows.map(decorateSvc);
}

// Cameras from a project's site survey, by the survey's OWN naming AND positions — powers the
// "which camera is the problem?" step of the customer diagnostic, including the tap-on-the-map
// picker. Label priority per marker: survey tag + given name ("IC1 — Front Door"), then name,
// then tag (IC1/OC2…), then a stable number. Returns { cameras, floors }: cameras carry x/y
// (the survey's percent coordinates) + their floor index; floors carry the plan name and a
// background image only when it's a reasonably-sized data URL (big uploads ship as blank plans).
export function getSvcCameras(accessId) {
  const cameras = [], floors = [];
  try {
    const sv = JSON.parse(getToolData(accessId, "survey")?.data || "null");
    let n = 0;
    (sv?.floors || []).forEach((f, fi) => {
      const rawImg = f?.B?.img || f?.B?.imgSource || null;
      floors.push({
        name: String(f?.name || "").slice(0, 60) || (sv.floors.length > 1 ? `Floor ${fi + 1}` : ""),
        img: typeof rawImg === "string" && rawImg.startsWith("data:image") && rawImg.length <= 300000 ? rawImg : null,
      });
      const floorTag = (sv.floors.length > 1 && f?.name) ? ` (${f.name})` : "";
      for (const m of f?.markers || []) {
        if (!/cam/i.test(String(m?.kind || "")) && !/cam/i.test(String(m?.name || ""))) continue;
        n += 1;
        const tag = String(m?._tag || "").trim();
        const name = String(m?.name || "").trim();
        const label = (tag && name ? `${tag} — ${name}` : name || tag || `Camera ${n}`).slice(0, 60) + floorTag;
        if (cameras.length < 32 && !cameras.some((c) => c.label === label)) {
          cameras.push({
            label,
            tag: tag || String(n),
            x: Math.max(0, Math.min(100, +m?.x || 0)),
            y: Math.max(0, Math.min(100, +m?.y || 0)),
            floor: fi,
          });
        }
      }
    });
  } catch { /* no/bad survey */ }
  return { cameras, floors };
}

// Flat list of a project's camera location NAMES, for the "which camera is the problem?" picker in
// the customer service-call flow. Survey-named cameras first (they carry the real on-site labels);
// if there's no survey, fall back to the accepted proposal's camera line items (which are also named,
// e.g. "Back Door Camera — FP1"). Returns [] when the project has no camera data of ours.
export function getProjectCameraLabels(accessId) {
  try {
    const { cameras } = getSvcCameras(accessId);
    if (cameras?.length) return cameras.map((c) => c.label);
  } catch { /* fall through */ }
  try {
    const prop = db.prepare(
      "SELECT payload, selected_option, accepted_options FROM proposals WHERE project_access_id=? AND status != 'superseded' ORDER BY version DESC, id DESC LIMIT 1"
    ).get(String(accessId));
    if (prop?.payload) {
      const pl = JSON.parse(prop.payload);
      const ids = (() => { try { const a = JSON.parse(prop.accepted_options || "[]"); return a.length ? a : (prop.selected_option ? [prop.selected_option] : []); } catch { return prop.selected_option ? [prop.selected_option] : []; } })();
      const opts = ids.length ? (pl.options || []).filter((o) => ids.includes(o.id)) : (pl.options || []).slice(0, 1);
      const out = [];
      for (const opt of opts) for (const s of (opt.services || [])) {
        if (s.key !== "camera") continue;
        for (const it of (s.items || [])) {
          if ((it.sub || []).length > 0 && it.name && !out.includes(it.name)) out.push(String(it.name).slice(0, 60));
        }
      }
      if (out.length) return out;
    }
  } catch { /* no/bad proposal */ }
  return [];
}

// ===== ADT project portal (Apply → Schedule → Complete) =====
function nextAdtId() {
  const row = db.prepare("SELECT adt_id FROM adt_applications WHERE adt_id LIKE 'ADT%' ORDER BY id DESC LIMIT 1").get();
  const n = row ? (parseInt(String(row.adt_id).replace(/\D/g, ""), 10) || 0) + 1 : 1;
  return "ADT" + String(n).padStart(4, "0");
}
export function createAdtApplication({ name, email, phone, address, equipment, points, notes, propertyType, taxId, emergency, verbalPassword, prefDays, prefWindows, asap, contactName, verificationDoc, dob }) {
  const adtId = nextAdtId();
  const dobVal = /^\d{4}-\d{2}-\d{2}$/.test(String(dob || "")) ? String(dob) : null;
  const pin = String(phone || "").replace(/\D/g, "").slice(-4) || null;
  const equip = JSON.stringify(equipment || {});
  const ptype = propertyType === "commercial" ? "commercial" : "residential";
  const taxDigits = String(taxId || "").replace(/\D/g, "").slice(0, 9);   // SSN/EIN are 9 digits
  const taxEnc = taxDigits ? encBlob(taxDigits) : null;                   // encrypted at rest
  const emerg = (Array.isArray(emergency) ? emergency : [])
    .map((c) => ({ name: String(c?.name || "").slice(0, 80).trim(), phone: String(c?.phone || "").slice(0, 24).trim() }))
    .filter((c) => c.name || c.phone).slice(0, 2);
  const emergJson = emerg.length ? JSON.stringify(emerg) : null;
  const vpEnc = String(verbalPassword || "").trim() ? encBlob(String(verbalPassword).trim().slice(0, 60)) : null;  // encrypted at rest
  const pDays = JSON.stringify(Array.isArray(prefDays) ? prefDays.slice(0, 7) : []);      // preferred install days
  const pWins = JSON.stringify(Array.isArray(prefWindows) ? prefWindows.slice(0, 3) : []); // preferred windows
  const vdoc = verificationDoc && verificationDoc.data ? JSON.stringify(verificationDoc) : null;
  const contact = ptype === "commercial" ? (String(contactName || "").slice(0, 80).trim() || null) : null;
  db.prepare(`INSERT INTO adt_applications (adt_id, name, email, phone, address, equipment, points, notes, access_pin, property_type, tax_id, emergency_contacts, verbal_password, pref_days, pref_windows, asap, contact_name, verification_doc, dob)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(adtId, name || null, email || null, phone || null, address || null, equip, +points || 0, notes || null, pin, ptype, taxEnc, emergJson, vpEnc, pDays, pWins, asap ? 1 : 0, contact, vdoc, dobVal);
  return getAdtApplication(adtId);
}
// Admin edit of a submitted application — same field handling as create (re-encrypt SSN/verbal,
// recompute the access PIN from the phone). Stage/status/deal are untouched.
export function updateAdtApplication(adtId, { name, email, phone, address, equipment, points, notes, propertyType, taxId, emergency, verbalPassword, prefDays, prefWindows, asap, contactName, verificationDoc, dob }) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  // undefined = leave DOB as-is; a valid date replaces it.
  const dobVal = dob === undefined ? (cur.dob || null) : (/^\d{4}-\d{2}-\d{2}$/.test(String(dob || "")) ? String(dob) : null);
  const pin = String(phone || "").replace(/\D/g, "").slice(-4) || null;
  const equip = JSON.stringify(equipment || {});
  const ptype = propertyType === "commercial" ? "commercial" : "residential";
  const taxDigits = String(taxId || "").replace(/\D/g, "").slice(0, 9);
  const taxEnc = taxDigits ? encBlob(taxDigits) : null;
  const emerg = (Array.isArray(emergency) ? emergency : [])
    .map((c) => ({ name: String(c?.name || "").slice(0, 80).trim(), phone: String(c?.phone || "").slice(0, 24).trim() }))
    .filter((c) => c.name || c.phone).slice(0, 2);
  const emergJson = emerg.length ? JSON.stringify(emerg) : null;
  const vpEnc = String(verbalPassword || "").trim() ? encBlob(String(verbalPassword).trim().slice(0, 60)) : null;
  const pDays = JSON.stringify(Array.isArray(prefDays) ? prefDays.slice(0, 7) : []);
  const pWins = JSON.stringify(Array.isArray(prefWindows) ? prefWindows.slice(0, 3) : []);
  // undefined = leave the doc as-is; an object with data = replace; null = remove.
  const vdoc = verificationDoc === undefined ? cur.verification_doc && JSON.stringify(cur.verification_doc)
             : (verificationDoc && verificationDoc.data ? JSON.stringify(verificationDoc) : null);
  const contact = ptype === "commercial" ? (String(contactName || "").slice(0, 80).trim() || null) : null;
  db.prepare(`UPDATE adt_applications SET name=?, email=?, phone=?, address=?, equipment=?, points=?, notes=?,
              access_pin=?, property_type=?, tax_id=?, emergency_contacts=?, verbal_password=?, pref_days=?, pref_windows=?, asap=?, contact_name=?, verification_doc=?, dob=?,
              updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE`)
    .run(name || null, email || null, phone || null, address || null, equip, +points || 0, notes || null, pin, ptype, taxEnc, emergJson, vpEnc, pDays, pWins, asap ? 1 : 0, contact, vdoc || null, dobVal, String(adtId));
  return getAdtApplication(adtId);
}
export function getAdtApplication(adtId) {
  const r = db.prepare("SELECT * FROM adt_applications WHERE adt_id = ? COLLATE NOCASE").get(String(adtId || "").trim());
  if (!r) return null;
  try { r.equipment = JSON.parse(r.equipment || "{}"); } catch { r.equipment = {}; }
  try { r.pref_days = JSON.parse(r.pref_days || "[]"); } catch { r.pref_days = []; }
  try { r.pref_windows = JSON.parse(r.pref_windows || "[]"); } catch { r.pref_windows = []; }
  try { r.customer_docs = r.customer_docs ? JSON.parse(r.customer_docs) : []; } catch { r.customer_docs = []; }
  r.asap = !!r.asap;
  try { r.verification_doc = r.verification_doc ? JSON.parse(r.verification_doc) : null; } catch { r.verification_doc = null; }
  return r;
}
export function listAdtApplications({ includeArchived = false } = {}) {
  const where = includeArchived ? "" : "WHERE COALESCE(archived, 0) = 0";
  return db.prepare(`SELECT * FROM adt_applications ${where} ORDER BY id DESC`).all().map((r) => {
    try { r.equipment = JSON.parse(r.equipment || "{}"); } catch { r.equipment = {}; }
    return r;
  });
}
// Soft-delete / restore an ADT application — archived rows drop out of every list but are kept for audit.
export function archiveAdtApplication(adtId, on = true) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  db.prepare("UPDATE adt_applications SET archived = ?, updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE")
    .run(on ? 1 : 0, String(adtId));
  return getAdtApplication(adtId);
}
export function scheduleAdtApplication(adtId, { date, window } = {}) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  db.prepare(`UPDATE adt_applications SET schedule_date = ?, schedule_window = ?, stage = 'scheduled',
              scheduled_at = COALESCE(scheduled_at, datetime('now','localtime')), updated_at = datetime('now','localtime')
              WHERE adt_id = ? COLLATE NOCASE`).run(date || null, window || null, String(adtId));
  return getAdtApplication(adtId);
}
export function completeAdtApplication(adtId) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  db.prepare(`UPDATE adt_applications SET stage = 'completed', status = 'installed', completed_at = datetime('now','localtime'),
              updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE`).run(String(adtId));
  return getAdtApplication(adtId);
}
// Set the credit/approval status. installed is set automatically on completion (above).
export const ADT_STATUSES = ["submitted", "in_review", "needs_docs", "approved", "declined", "installed"];
export function setAdtStatus(adtId, status) {
  const cur = getAdtApplication(adtId);
  if (!cur || !ADT_STATUSES.includes(status)) return null;
  db.prepare("UPDATE adt_applications SET status = ?, updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE")
    .run(status, String(adtId));
  return getAdtApplication(adtId);
}
// Which documents the office still needs (shown to the customer when status = needs_docs).
// Customer-uploaded documents for a needs-docs request. Each is a small dataURL blob (capped list).
export function addAdtCustomerDoc(adtId, doc) {
  const cur = getAdtApplication(adtId);
  if (!cur || !doc || !doc.data) return null;
  const list = Array.isArray(cur.customer_docs) ? cur.customer_docs : [];
  if (list.length >= 12) return cur;   // cap the number kept per application
  list.push({ name: String(doc.name || "document").slice(0, 140), type: String(doc.type || ""), data: String(doc.data), at: new Date().toISOString() });
  db.prepare("UPDATE adt_applications SET customer_docs = ?, updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE")
    .run(JSON.stringify(list), String(adtId));
  return getAdtApplication(adtId);
}
export function removeAdtCustomerDoc(adtId, idx) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  const list = Array.isArray(cur.customer_docs) ? cur.customer_docs : [];
  if (idx >= 0 && idx < list.length) list.splice(idx, 1);
  db.prepare("UPDATE adt_applications SET customer_docs = ?, updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE")
    .run(list.length ? JSON.stringify(list) : null, String(adtId));
  return getAdtApplication(adtId);
}
export function setAdtDocsNote(adtId, note) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  db.prepare("UPDATE adt_applications SET docs_note = ?, updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE")
    .run(String(note || "").slice(0, 400).trim() || null, String(adtId));
  return getAdtApplication(adtId);
}
// Persist the internal ADT Tool deal state (equipment cart, tier, credit, rep). Autosaved from the widget.
export function saveAdtDeal(adtId, dealJson) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  const blob = typeof dealJson === "string" ? dealJson : JSON.stringify(dealJson || {});
  db.prepare(`UPDATE adt_applications SET deal_json = ?, updated_at = datetime('now','localtime')
              WHERE adt_id = ? COLLATE NOCASE`).run(blob, String(adtId));
  return getAdtApplication(adtId);
}
// Share / unshare the quote with the customer. Sharing stamps a time; the customer /adt page only
// renders the (sanitized) Cust-view pricing once this is set. Unsharing also clears acceptance.
export function shareAdtDeal(adtId, on) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  db.prepare(`UPDATE adt_applications SET deal_shared_at = ?, deal_accepted_at = CASE WHEN ? THEN deal_accepted_at ELSE NULL END,
              updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE`)
    .run(on ? new Date().toISOString() : null, on ? 1 : 0, String(adtId));
  return getAdtApplication(adtId);
}
// Lightweight patch of just the contact fields (name/phone/email/address) — the header's inline
// edit. Deliberately touches nothing else, so the encrypted SSN/verbal password and the equipment
// are never disturbed. Recomputes the access PIN from the phone (unless the phone is unchanged).
export function updateAdtContact(adtId, { name, phone, email, address } = {}) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  const newPhone = phone != null ? phone : cur.phone;
  db.prepare(`UPDATE adt_applications SET name = ?, phone = ?, email = ?, address = ?, access_pin = ?,
              updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE`)
    .run(name != null ? name : cur.name, newPhone, email != null ? email : cur.email, address != null ? address : cur.address,
         phonePin(newPhone) || cur.access_pin, String(adtId));
  return getAdtApplication(adtId);
}
// Revise a shared/accepted/signed quote back to an editable draft. Keeps the priced deal_json (so
// staff tweak from where it was) but clears the customer agreement — share, acceptance, AND the
// signature — because the terms are changing and the old signature no longer applies. After this,
// staff edit the ADT Tool and re-share; the customer signs the revised quote.
export function reviseAdtDeal(adtId) {
  const cur = getAdtApplication(adtId);
  if (!cur) return null;
  db.prepare(`UPDATE adt_applications SET deal_shared_at = NULL, deal_accepted_at = NULL,
              deal_signed_name = NULL, deal_signature_data = NULL, deal_signed_at = NULL,
              updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE`).run(String(adtId));
  return getAdtApplication(adtId);
}
// Customer accepts ("picks up") their shared quote — stamps the acceptance time (idempotent).
export function acceptAdtDeal(adtId) {
  const cur = getAdtApplication(adtId);
  if (!cur || !cur.deal_shared_at) return null;   // can only accept a shared quote
  if (!cur.deal_accepted_at) {
    db.prepare(`UPDATE adt_applications SET deal_accepted_at = ?, updated_at = datetime('now','localtime')
                WHERE adt_id = ? COLLATE NOCASE`).run(new Date().toISOString(), String(adtId));
  }
  return getAdtApplication(adtId);
}
// Customer SIGNS their shared quote — stores the typed signature + Eastern timestamp and marks the
// deal accepted in the same step (signing IS accepting). Idempotent: an existing signature is a locked
// record and is never overwritten. Timestamp is Eastern wall-clock so lib/proposal.fmtSignStamp reads it right.
export function signAdtDeal(adtId, { name, data } = {}) {
  const cur = getAdtApplication(adtId);
  if (!cur || !cur.deal_shared_at) return null;   // can only sign a shared quote
  if (cur.deal_signed_at) return cur;             // already signed — locked
  db.prepare(`UPDATE adt_applications SET deal_signed_name = ?, deal_signature_data = ?,
              deal_signed_at = datetime('now','localtime'),
              deal_accepted_at = COALESCE(deal_accepted_at, datetime('now','localtime')),
              updated_at = datetime('now','localtime') WHERE adt_id = ? COLLATE NOCASE`)
    .run(String(name || "").trim(), data || null, String(adtId));
  return getAdtApplication(adtId);
}

export function setServiceCallStage(svcId, stage, { actor_role, actor_name } = {}) {
  if (!SVC_STAGES.some((s) => s.key === stage)) return null;
  const cur = getServiceCall(svcId);
  if (!cur) return null;
  const extra = stage === "resolved" ? ", resolved_at = datetime('now','localtime')"
              : stage === "closed"   ? ", closed_at = datetime('now','localtime')" : "";
  db.prepare(`UPDATE service_calls SET stage = ?, updated_at = datetime('now','localtime')${extra} WHERE svc_id = ? COLLATE NOCASE`).run(stage, String(svcId));
  logServiceCallEvent(svcId, { kind: "stage", detail: `${cur.stage} → ${stage}`, actor_role, actor_name });
  return getServiceCall(svcId);
}

// Office links the call to the system it's about AFTER intake (anonymous callers often can't or
// don't). Sets the reference, backfills a missing address, and imports the install's site survey
// onto the companion project when the companion has none — same as a link made at intake.
export function linkServiceCallProject(svcId, accessId, { actor_role, actor_name } = {}) {
  const call = getServiceCall(svcId);
  const proj = getJobByAccessId(accessId);
  if (!call || !proj) return null;
  db.prepare("UPDATE service_calls SET project_access_id = ?, address = COALESCE(NULLIF(address,''), ?), updated_at = datetime('now','localtime') WHERE svc_id = ? COLLATE NOCASE")
    .run(proj.access_id, proj.address || null, String(call.svc_id));
  logServiceCallEvent(call.svc_id, { kind: "note", detail: `Linked to system ${proj.access_id}`, actor_role, actor_name });
  if (call.svc_project_id) {
    try {
      const src = getToolData(proj.access_id, "survey");
      const dst = getToolData(call.svc_project_id, "survey");
      if (src?.data && !dst?.data) {
        saveToolData(call.svc_project_id, "survey", src.data, "Imported from " + proj.access_id);
        logServiceCallEvent(call.svc_id, { kind: "note", detail: `Site survey imported from ${proj.access_id}`, actor_role: "system", actor_name: null });
      }
    } catch { /* unreadable survey — skip */ }
  }
  return getServiceCall(svcId);
}

// Assign (or clear) the technician on a service call, logged to the timeline.
export function assignServiceCallTech(svcId, techId, techName, { actor_role, actor_name } = {}) {
  const cur = getServiceCall(svcId);
  if (!cur) return null;
  db.prepare("UPDATE service_calls SET assignee_id = ?, assignee_name = ?, updated_at = datetime('now','localtime') WHERE svc_id = ? COLLATE NOCASE").run(techId || null, techName || null, String(svcId));
  logServiceCallEvent(svcId, { kind: "assign", detail: techName ? `Assigned to ${techName}` : "Unassigned", actor_role, actor_name });
  return getServiceCall(svcId);
}

// Persist a completed diagnostic session (the buildRecord() shape from the handoff), stamp the
// call's outcome route, and log it to the timeline.
export function addDiagnostic(svcId, { mode, technician, issue, steps, speedTest, outcome, started, completed, actor_role, actor_name }) {
  db.prepare(`
    INSERT INTO diagnostics (svc_id, mode, technician, issue, steps, speed_test, outcome, started, completed)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    String(svcId), mode === "tech" ? "tech" : "customer", technician || null, issue || null,
    JSON.stringify(steps || []), speedTest ? JSON.stringify(speedTest) : null,
    outcome ? JSON.stringify(outcome) : null, started || null, completed || null
  );
  if (outcome?.route) db.prepare("UPDATE service_calls SET outcome_route = ?, updated_at = datetime('now','localtime') WHERE svc_id = ? COLLATE NOCASE").run(outcome.route, String(svcId));
  logServiceCallEvent(svcId, { kind: "diagnostic", detail: `${mode === "tech" ? "Tech" : "Customer"} diagnostic — ${outcome?.title || outcome?.route || "completed"}`, actor_role: actor_role || (mode === "tech" ? "tech" : "customer"), actor_name });
}

export function getDiagnostics(svcId) {
  return db.prepare("SELECT * FROM diagnostics WHERE svc_id = ? ORDER BY id ASC").all(String(svcId)).map((d) => ({
    ...d,
    steps: safeJson(d.steps, []),
    speed_test: safeJson(d.speed_test, null),
    outcome: safeJson(d.outcome, null),
  }));
}

function safeJson(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }

// ---- Service-call billing: one active invoice per call (drafts are edited in place; voiding
// archives the record and allows a fresh one — never deleted, per the money-trail rule). ----
function decorateSvcInvoice(r) {
  if (!r) return null;
  const items = safeJson(r.items, []);
  const total = items.reduce((s, it) => s + Math.max(0, +it.qty || 0) * Math.max(0, +it.price || 0), 0);
  return { ...r, items, total: Math.round(total * 100) / 100 };
}
export function getSvcInvoice(svcId) {
  // The active invoice = the latest non-void one.
  return decorateSvcInvoice(db.prepare("SELECT * FROM svc_invoices WHERE svc_id = ? COLLATE NOCASE AND status != 'void' ORDER BY id DESC LIMIT 1").get(String(svcId)));
}
export function saveSvcInvoice(svcId, { items, notes }, { actor_role, actor_name } = {}) {
  const clean = (Array.isArray(items) ? items : []).slice(0, 40).map((it) => ({
    desc: String(it.desc || "").slice(0, 200),
    qty: Math.max(0, Math.min(999, +it.qty || 0)),
    price: Math.max(0, Math.min(999999, +it.price || 0)),
  })).filter((it) => it.desc.trim());
  const cur = getSvcInvoice(svcId);
  if (cur) {
    // Once SENT, the invoice is what the customer saw — editing it in place would let them sign
    // an amount different from what was first shown. Sent or signed → locked; void to re-bill.
    if (cur.signed_name || cur.status === "sent") return cur;
    db.prepare("UPDATE svc_invoices SET items=?, notes=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(JSON.stringify(clean), String(notes || "").slice(0, 500) || null, cur.id);
  } else {
    db.prepare("INSERT INTO svc_invoices (svc_id, items, notes) VALUES (?,?,?)")
      .run(String(svcId), JSON.stringify(clean), String(notes || "").slice(0, 500) || null);
  }
  return getSvcInvoice(svcId);
}
export function sendSvcInvoice(svcId, { actor_role, actor_name } = {}) {
  const cur = getSvcInvoice(svcId);
  if (!cur || !cur.items.length) return null;
  db.prepare("UPDATE svc_invoices SET status='sent', sent_at=COALESCE(sent_at, datetime('now','localtime')), updated_at=datetime('now','localtime') WHERE id=?").run(cur.id);
  logServiceCallEvent(svcId, { kind: "quote", detail: `Invoice sent — $${cur.total.toFixed(2)}`, actor_role, actor_name });
  return getSvcInvoice(svcId);
}
export function voidSvcInvoice(svcId, { actor_role, actor_name } = {}) {
  const cur = getSvcInvoice(svcId);
  if (!cur) return null;
  db.prepare("UPDATE svc_invoices SET status='void', voided_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?").run(cur.id);
  logServiceCallEvent(svcId, { kind: "note", detail: "Invoice voided", actor_role, actor_name });
  return null;
}
export function signSvcInvoice(svcId, name) {
  const cur = getSvcInvoice(svcId);
  if (!cur || cur.status !== "sent" || cur.signed_name) return cur;
  db.prepare("UPDATE svc_invoices SET signed_name=?, signed_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?")
    .run(String(name || "").slice(0, 120), cur.id);
  logServiceCallEvent(svcId, { kind: "quote", detail: `Invoice approved & signed by ${String(name || "").slice(0, 120)}`, actor_role: "customer", actor_name: String(name || "").slice(0, 120) });
  return getSvcInvoice(svcId);
}
export function getSvcPayments(svcId) {
  return db.prepare("SELECT * FROM svc_payments WHERE svc_id = ? COLLATE NOCASE ORDER BY id DESC").all(String(svcId)).map((r) => ({ ...r }));
}
export function addSvcPayment(svcId, { amount, method, note, paidAt }, byName) {
  const paid = /^\d{4}-\d{2}-\d{2}$/.test(String(paidAt || "")) ? String(paidAt) : new Date().toISOString().slice(0, 10);
  // Same sanity bounds as invoice lines — a fat-fingered extra digit shouldn't enter the money
  // trail. And money only lands against an actual invoice (payments have to reconcile to one).
  const amt = Math.max(0, Math.min(999999, +amount || 0));
  if (!amt || !getSvcInvoice(svcId)) return getSvcPayments(svcId);
  db.prepare("INSERT INTO svc_payments (svc_id, amount, method, note, recorded_by, paid_at) VALUES (?,?,?,?,?,?)")
    .run(String(svcId), amt, String(method || "").slice(0, 60) || null, String(note || "").slice(0, 500) || null, byName || null, paid);
  logServiceCallEvent(svcId, { kind: "payment", detail: `Payment received — $${amt.toFixed(2)}${method ? ` (${method})` : ""}`, actor_role: "staff", actor_name: byName });
  return getSvcPayments(svcId);
}

export function updateTicket(id, fields) {
  const sets = [], vals = [];
  for (const k of ["subject", "status", "priority", "assignee_id", "assignee_name", "audience"]) {
    if (fields[k] !== undefined) { sets.push(`${k} = ?`); vals.push(fields[k]); }
  }
  if (!sets.length) return;
  sets.push("updated_at = datetime('now')");
  vals.push(Number(id));
  db.prepare(`UPDATE tickets SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

// Archive a ticket (with its messages folded into the payload) then remove it. Admin/manager only —
// enforced in the action. Kept recoverable in the archive rather than hard-deleted.
export function deleteTicket(id, actor) {
  const t = db.prepare("SELECT * FROM tickets WHERE id=?").get(Number(id));
  if (!t) return { ok: false, error: "Ticket not found." };
  const msgs = db.prepare("SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY id").all(Number(id));
  db.prepare(`INSERT INTO archive (entity_type, source_table, entity_id, label, detail, payload, archived_by_id, archived_by_name)
              VALUES ('ticket','tickets',?,?,?,?,?,?)`)
    .run(Number(id), t.subject || "Ticket", [t.status, t.priority].filter(Boolean).join(" · ") || null,
         JSON.stringify({ ...t, messages: msgs }), actor?.id ?? null, actor?.name ?? null);
  db.prepare("DELETE FROM ticket_messages WHERE ticket_id=?").run(Number(id));
  db.prepare("DELETE FROM tickets WHERE id=?").run(Number(id));
  return { ok: true };
}

export function addTicketMessage(ticketId, { author_id, author_name, author_role, body }) {
  db.prepare("INSERT INTO ticket_messages (ticket_id, author_id, author_name, author_role, body) VALUES (?,?,?,?,?)")
    .run(Number(ticketId), author_id || null, author_name || null, author_role || null, String(body || "").trim());
  db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(Number(ticketId));
}

// ---- Notifications ----
export function getNotifications(userId, limit = 100) {
  return db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(Number(userId), Number(limit)).map((r) => ({ ...r }));
}
export function getUnreadCount(userId) {
  return db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0").get(Number(userId)).n;
}
export function markAllRead(userId) {
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(Number(userId));
}
export function markNotificationRead(id, userId) {
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?").run(Number(id), Number(userId));
}
// A notification is a per-user transient — dismissing it is a true delete (nothing to audit).
export function deleteNotification(id, userId) {
  db.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?").run(Number(id), Number(userId));
}
export function clearNotifications(userId) {
  db.prepare("DELETE FROM notifications WHERE user_id = ?").run(Number(userId));
}
export function createNotification({ user_id, type, title, body, link }) {
  db.prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)")
    .run(Number(user_id), type || null, String(title || "").trim(), body || null, link || null);
}
export function notifyRoles(roles, { type, title, body, link }, excludeUserId = null) {
  if (!roles.length) return;
  const placeholders = roles.map(() => "?").join(",");
  const users = db.prepare(`SELECT id FROM users WHERE role IN (${placeholders})`).all(...roles);
  for (const u of users) {
    if (excludeUserId && Number(u.id) === Number(excludeUserId)) continue;
    createNotification({ user_id: u.id, type, title, body, link });
  }
}
// Staff emails for a set of roles — used to email the office (admin/manager) on customer actions.
export function getUserEmailsByRoles(roles) {
  if (!roles?.length) return [];
  const placeholders = roles.map(() => "?").join(",");
  return db.prepare(`SELECT name, email, role FROM users WHERE role IN (${placeholders}) AND email IS NOT NULL AND TRIM(email) != ''`).all(...roles).map((r) => ({ ...r }));
}

// Unified notification feed — one place to see every kind of alert. Combines the persistent
// per-user notifications (read/unread, dismissible) with live, click-through events pulled from
// across the system (approvals waiting, tickets, new inquiries, activity). Staff see the aggregate;
// others just get their own persistent notifications.
export function getNotificationFeed(userId, role) {
  const $ = (n) => "$" + Number(n || 0).toLocaleString("en-US");
  const out = [];
  // 1) Persistent per-user notifications.
  for (const n of getNotifications(userId, 200)) {
    const grp = n.type === "ticket" ? "tickets" : n.type === "payment" || n.type === "signature" ? "projects" : "activity";
    out.push({ key: "n" + n.id, source: "notif", id: n.id, group: grp, icon: n.type === "ticket" ? "red" : n.type === "payment" ? "green" : "gold", title: n.title, body: n.body || "", link: n.link || null, at: n.created_at, read: !!n.read });
  }
  if (["admin", "manager"].includes(role)) {
    // 2) Approvals waiting on the office.
    for (const e of getPendingExpenses().slice(0, 40))
      out.push({ key: "e" + e.id, source: "live", group: "action", icon: "amber", title: `Expense awaiting approval — ${$(e.amount)}`, body: [e.description, e.submitted_by_name].filter(Boolean).join(" · "), link: "/expenses", at: e.created_at });
    for (const r of getPendingRequests().slice(0, 40))
      out.push({ key: "r" + r.id, source: "live", group: "action", icon: "purple", title: `Material request — ${r.request_type || "Request"}`, body: [r.description, r.submitted_by_name].filter(Boolean).join(" · "), link: r.project_access_id ? `/project/${r.project_access_id}` : "/operations", at: r.created_at });
    for (const w of getPendingWorkOrders().slice(0, 40))
      out.push({ key: "w" + w.id, source: "live", group: "action", icon: "blue", title: `Work order to review — #${w.project_access_id}`, body: w.submitted_by_name ? `Submitted by ${w.submitted_by_name}` : "", link: `/project/${w.project_access_id}`, at: w.created_at });
    // 3) Open tickets.
    for (const t of getTickets().filter((t) => t.status !== "closed" && t.status !== "resolved").slice(0, 40))
      out.push({ key: "t" + t.id, source: "live", group: "tickets", icon: "red", title: `${t.priority === "urgent" ? "Urgent ticket" : "Ticket"} — ${t.subject}`, body: [t.project_customer, t.assignee_name ? `→ ${t.assignee_name}` : "Unassigned"].filter(Boolean).join(" · "), link: `/tickets/${t.id}`, at: t.updated_at || t.created_at });
    // 4) Recent activity — logins, new inquiries, PIN access.
    for (const a of getActivityLog(40)) {
      const who = a.user_name || "System";
      const proj = a.project_customer || a.project_access_id || null;
      let title, group = "activity", icon = "blue";
      if (a.event_type === "login") title = `${who} signed in`;
      else if (a.event_type === "logout") { title = `${who} signed out`; icon = "amber"; }
      else if (a.event_type === "demo") { title = `New inquiry${proj ? ` — ${proj}` : ""}`; group = "projects"; icon = "green"; }
      else if (a.event_type === "pin_access") { title = a.notes || `PIN access${proj ? ` — ${proj}` : ""}`; icon = "gold"; }
      else { title = a.notes || a.event_type; icon = "gold"; }
      out.push({ key: "a" + a.id, source: "live", group, icon, title, body: a.user_role || "", link: a.project_access_id ? `/project/${a.project_access_id}` : null, at: a.login_at });
    }
  }
  out.sort((x, y) => String(y.at || "").localeCompare(String(x.at || "")));
  return out;
}

// ---- Expenses ----
export function getExpenses() {
  return db.prepare(`
    SELECT e.*, p.customer AS project_customer
    FROM expenses e LEFT JOIN projects p ON p.access_id = e.access_id COLLATE NOCASE
    ORDER BY COALESCE(e.spent_on, e.created_at) DESC, e.id DESC
  `).all().map((r) => ({ ...r }));
}
export function getExpenseStats() {
  const rows = db.prepare("SELECT category, amount FROM expenses").all();
  let total = 0; const byCat = {};
  for (const r of rows) { total += r.amount || 0; byCat[r.category || "Other"] = (byCat[r.category || "Other"] || 0) + (r.amount || 0); }
  return { total, count: rows.length, byCat };
}
export function addExpense({ description, category, amount, vendor, access_id, spent_on }) {
  const info = db.prepare("INSERT INTO expenses (description, category, amount, vendor, access_id, spent_on) VALUES (?,?,?,?,?,?)")
    .run(String(description || "").trim() || "Expense", category || null, Number(amount) || 0, vendor || null, access_id || null, spent_on || null);
  return Number(info.lastInsertRowid);
}
export function deleteExpense(id) {
  db.prepare("DELETE FROM expenses WHERE id = ?").run(Number(id));
}
export function getProjectExpenses(accessId) {
  return db.prepare("SELECT * FROM expenses WHERE access_id=? COLLATE NOCASE ORDER BY created_at DESC").all(accessId).map(r=>({...r}));
}
export function submitProjectExpense(accessId, {description, category, amount, vendor, submittedById, submittedByName}) {
  const info = db.prepare("INSERT INTO expenses (description, category, amount, vendor, access_id, spent_on, submitted_by_id, submitted_by_name, status) VALUES (?,?,?,?,?,date('now','localtime'),?,?,'pending')")
    .run(String(description||"").trim()||"Expense", category||null, Number(amount)||0, vendor||null, accessId, submittedById??null, submittedByName||null);
  return {id: Number(info.lastInsertRowid)};
}
export function payProjectExpense(id, {reviewedById, reviewedByName, paymentDate, paymentMethod}) {
  db.prepare("UPDATE expenses SET status='paid',reviewed_by_id=?,reviewed_by_name=?,reviewed_at=datetime('now','localtime'),payment_date=?,payment_method=? WHERE id=?")
    .run(reviewedById??null, reviewedByName||null, paymentDate||null, paymentMethod||null, Number(id));
}
export function declineProjectExpense(id, {reviewedById, reviewedByName, reviewNotes}) {
  db.prepare("UPDATE expenses SET status='declined',reviewed_by_id=?,reviewed_by_name=?,reviewed_at=datetime('now','localtime'),review_notes=? WHERE id=?")
    .run(reviewedById??null, reviewedByName||null, reviewNotes||null, Number(id));
}
export function updateExpenseStatus(id, {status, paymentDate, paymentMethod, reviewNotes, reviewedById, reviewedByName}) {
  if (status === 'paid') {
    db.prepare("UPDATE expenses SET status='paid',payment_date=?,payment_method=?,reviewed_by_id=?,reviewed_by_name=?,reviewed_at=datetime('now','localtime'),review_notes=NULL WHERE id=?")
      .run(paymentDate||null, paymentMethod||null, reviewedById??null, reviewedByName||null, Number(id));
  } else if (status === 'declined') {
    db.prepare("UPDATE expenses SET status='declined',review_notes=?,reviewed_by_id=?,reviewed_by_name=?,reviewed_at=datetime('now','localtime'),payment_date=NULL,payment_method=NULL WHERE id=?")
      .run(reviewNotes||null, reviewedById??null, reviewedByName||null, Number(id));
  } else {
    db.prepare("UPDATE expenses SET status='pending',reviewed_by_id=NULL,reviewed_by_name=NULL,reviewed_at=NULL,review_notes=NULL,payment_date=NULL,payment_method=NULL WHERE id=?")
      .run(Number(id));
  }
}

export function getProjectRequests(accessId) {
  return db.prepare("SELECT * FROM requests WHERE project_access_id=? COLLATE NOCASE ORDER BY created_at DESC").all(accessId).map(r=>({...r}));
}
export function submitRequest(accessId, {requestType, description, notes, submittedById, submittedByName}) {
  const info = db.prepare("INSERT INTO requests (project_access_id,request_type,description,notes,submitted_by_id,submitted_by_name) VALUES (?,?,?,?,?,?)")
    .run(accessId, requestType||"equipment", String(description||"").trim()||"Request", notes||null, submittedById??null, submittedByName||null);
  return {id: Number(info.lastInsertRowid)};
}
export function approveRequest(id, {reviewedById, reviewedByName}) {
  db.prepare("UPDATE requests SET status='approved',reviewed_by_id=?,reviewed_by_name=?,reviewed_at=datetime('now','localtime') WHERE id=?").run(reviewedById??null, reviewedByName||null, Number(id));
}
export function rejectRequest(id, {reviewedById, reviewedByName, reviewNotes}) {
  db.prepare("UPDATE requests SET status='rejected',reviewed_by_id=?,reviewed_by_name=?,reviewed_at=datetime('now','localtime'),review_notes=? WHERE id=?").run(reviewedById??null, reviewedByName||null, reviewNotes||null, Number(id));
}

// ---- Dev Roadmap tracker ----
export function getDevTasks() {
  // Incomplete first (by priority), completed sink to the bottom (most-recently-done first)
  return db.prepare(`
    SELECT * FROM dev_tasks
    ORDER BY done ASC,
             CASE WHEN done=0 THEN priority END ASC,
             CASE WHEN done=1 THEN done_at END DESC,
             id ASC
  `).all().map(r => ({ ...r }));
}
export function toggleDevTask(id, done) {
  db.prepare("UPDATE dev_tasks SET done=?, done_at=CASE WHEN ?=1 THEN datetime('now','localtime') ELSE NULL END WHERE id=?")
    .run(done ? 1 : 0, done ? 1 : 0, Number(id));
}
export function addDevTask({ category, title, detail, route, routeStatus }) {
  const info = db.prepare(
    "INSERT INTO dev_tasks (category, title, detail, route, route_status, priority, done, is_custom) VALUES (?,?,?,?,?,?,0,1)"
  ).run(
    String(category || "Custom").trim() || "Custom",
    String(title || "").trim() || "Untitled task",
    detail ? String(detail).trim() : null,
    route ? String(route).trim() : null,
    routeStatus || "missing",
    50
  );
  return { id: Number(info.lastInsertRowid) };
}
export function deleteDevTask(id) {
  // Only user-added custom tasks may be removed; seeded roadmap items are protected.
  db.prepare("DELETE FROM dev_tasks WHERE id=? AND is_custom=1").run(Number(id));
}

// ---- API key vault -------------------------------------------------------
// The single place third-party API keys live at runtime. Store wins over env,
// so a key pasted in Development ▸ API Keys overrides any .env value.
export function getSecret(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  try {
    const row = db.prepare("SELECT value FROM app_secrets WHERE key=?").get(k);
    return row ? String(row.value) : "";
  } catch { return ""; }   // table not created yet (pre-restart) — fall back to env
}
// The value an integration should actually use: stored key first, then env.
export function secretValue(key) {
  return getSecret(key) || process.env[String(key || "").trim()] || "";
}
export function setSecret(key, value, actorName) {
  const k = String(key || "").trim();
  const v = String(value ?? "");
  if (!k) return { ok: false, error: "Key name required." };
  if (!/^[A-Z0-9_]+$/.test(k)) return { ok: false, error: "Key name must be UPPER_SNAKE_CASE." };
  if (!v.trim()) return { ok: false, error: "Value required." };
  db.prepare(`
    INSERT INTO app_secrets (key, value, updated_at, updated_by) VALUES (?,?,datetime('now','localtime'),?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `).run(k, v.trim(), actorName ? String(actorName) : null);
  return { ok: true };
}
export function deleteSecret(key) {
  db.prepare("DELETE FROM app_secrets WHERE key=?").run(String(key || "").trim());
  return { ok: true };
}

// Global SMS-2FA kill-switch. Default ON — an admin flips it OFF (stored in the vault) when Twilio is
// having problems, so people fall back to password login without waiting for a text that won't arrive.
export function loginTwoFactorEnabled() {
  const v = String(getSecret("LOGIN_2FA_ENABLED") || "").trim().toLowerCase();
  return !(v === "off" || v === "0" || v === "false");   // unset / anything else → enabled
}
export function setLoginTwoFactor(on, actorName) {
  return setSecret("LOGIN_2FA_ENABLED", on ? "on" : "off", actorName);
}

// ---- Identity / biometrics (Face ID + Driver's Licence library) ----------
// AES-256-GCM at rest for the stored photos. The key lives in the vault
// (BIOMETRIC_ENC_KEY); it's generated once on first use so a fresh deploy is
// self-provisioning. Losing the key makes stored photos unrecoverable — which
// is the point: the DB alone is not enough to see anyone's ID or face.
let _bioKey = null;
function biometricKey() {
  if (_bioKey) return _bioKey;
  let hex = secretValue("BIOMETRIC_ENC_KEY");
  if (!hex || hex.length < 64) {
    hex = randomBytes(32).toString("hex");
    try { setSecret("BIOMETRIC_ENC_KEY", hex, "system"); } catch {}
  }
  _bioKey = Buffer.from(hex.slice(0, 64), "hex");
  return _bioKey;
}
// "v1:<iv>:<tag>:<cipher>", all base64. Returns "" for empty input.
export function encBlob(plain) {
  const s = plain == null ? "" : String(plain);
  if (!s) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", biometricKey(), iv);
  const enc = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}
export function decBlob(blob) {
  const s = String(blob || "");
  if (!s.startsWith("v1:")) return "";
  try {
    const [, ivB, tagB, dataB] = s.split(":");
    const d = createDecipheriv("aes-256-gcm", biometricKey(), Buffer.from(ivB, "base64"));
    d.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([d.update(Buffer.from(dataB, "base64")), d.final()]).toString("utf8");
  } catch { return ""; }
}

const _jparse = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };

export function logIdentityEvent(userId, { kind, detail, score, actor_role, actor_name } = {}) {
  db.prepare("INSERT INTO identity_events (user_id, kind, detail, score, actor_role, actor_name) VALUES (?,?,?,?,?,?)")
    .run(Number(userId) || null, kind || "event", detail == null ? null : String(detail),
         score == null ? null : Number(score), actor_role || null, actor_name || null);
}
export function getIdentityEvents(userId, limit = 100) {
  return db.prepare("SELECT * FROM identity_events WHERE user_id=? ORDER BY id DESC LIMIT ?")
    .all(Number(userId) || 0, Math.min(500, Math.max(1, limit)));
}

// Full row. Embeddings/fields/verdict come back parsed. Photos are decrypted
// ONLY when withImages is set — list views never pull them.
export function getUserIdentity(userId, { withImages = false } = {}) {
  const row = db.prepare("SELECT * FROM user_identity WHERE user_id=?").get(Number(userId) || 0);
  if (!row) return null;
  const out = {
    ...row,
    id_embedding: _jparse(row.id_embedding, null),
    face_embedding: _jparse(row.face_embedding, null),
    id_fields: _jparse(row.id_fields, null),
    id_verdict: _jparse(row.id_verdict, null),
    hasIdImage: !!row.id_image,
    hasFaceImage: !!row.face_image,
  };
  if (withImages) {
    out.id_image = decBlob(row.id_image);
    out.face_image = decBlob(row.face_image);
  } else {
    delete out.id_image; delete out.face_image;
  }
  return out;
}

// Decrypt a single stored photo on demand (for a gated thumbnail route).
export function getIdentityImage(userId, which) {
  const col = which === "face" ? "face_image" : "id_image";
  const row = db.prepare(`SELECT ${col} AS blob FROM user_identity WHERE user_id=?`).get(Number(userId) || 0);
  return row ? decBlob(row.blob) : "";
}

// Create/patch a user's identity row. Image fields in the patch are encrypted;
// array/object fields are JSON-encoded. Only provided keys are written.
export function upsertUserIdentity(userId, patch = {}, { actor_role, actor_name } = {}) {
  const uid = Number(userId) || 0;
  if (!uid) return null;
  db.prepare("INSERT INTO user_identity (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING").run(uid);
  const map = {
    status: (v) => String(v),
    id_type: (v) => String(v),
    id_image: (v) => encBlob(v),
    face_image: (v) => encBlob(v),
    id_embedding: (v) => JSON.stringify(v),
    face_embedding: (v) => JSON.stringify(v),
    id_fields: (v) => JSON.stringify(v),
    id_verdict: (v) => JSON.stringify(v),
    enroll_score: (v) => Number(v),
    consent_at: (v) => String(v),
    consent_version: (v) => String(v),
    enrolled_at: (v) => String(v),
  };
  const sets = [], vals = [];
  for (const k of Object.keys(map)) {
    if (patch[k] === undefined) continue;
    sets.push(`${k}=?`); vals.push(patch[k] === null ? null : map[k](patch[k]));
  }
  if (!sets.length && !patch.touch) return getUserIdentity(uid);
  sets.push("updated_at=datetime('now','localtime')");
  if (actor_name || actor_role) { sets.push("updated_by=?"); vals.push(actor_name || actor_role); }
  vals.push(uid);
  db.prepare(`UPDATE user_identity SET ${sets.join(", ")} WHERE user_id=?`).run(...vals);
  return getUserIdentity(uid);
}

export function setIdentityStatus(userId, status, { actor_role, actor_name } = {}) {
  const ok = ["unverified", "pending", "verified", "rejected"].includes(status);
  if (!ok) return null;
  const r = upsertUserIdentity(userId, { status }, { actor_role, actor_name });
  logIdentityEvent(userId, { kind: "status", detail: status, actor_role, actor_name });
  return r;
}

// Hard purge — biometrics must be deletable on request (admin action).
export function deleteUserIdentity(userId, { actor_role, actor_name } = {}) {
  const uid = Number(userId) || 0;
  db.prepare("DELETE FROM user_identity WHERE user_id=?").run(uid);
  logIdentityEvent(uid, { kind: "delete", detail: "identity purged", actor_role, actor_name });
  return { ok: true };
}

// The library view: one row per user with an identity, joined to the account.
// No photos, no embeddings — just what the admin libraries render.
export function listIdentities() {
  return db.prepare(`
    SELECT ui.user_id, ui.status, ui.id_type, ui.enroll_score, ui.enrolled_at, ui.consent_at,
           ui.updated_at,
           (ui.id_image IS NOT NULL)   AS has_id_image,
           (ui.face_image IS NOT NULL) AS has_face_image,
           ui.id_fields,
           u.name, u.email, u.role
    FROM user_identity ui JOIN users u ON u.id = ui.user_id
    ORDER BY (ui.status='verified') DESC, u.name
  `).all().map((r) => ({ ...r, id_fields: _jparse(r.id_fields, null) }));
}

// For the 1:N face login matcher: every enrolled user's face + ID embeddings.
// Vectors only — the raw photos never leave the DB for this.
export function listEnrolledFaces() {
  const map = (r) => ({
    user_id: r.user_id, status: r.status, name: r.name, role: r.role, email: r.email,
    face_embedding: _jparse(r.face_embedding, null),
    id_embedding: _jparse(r.id_embedding, null),
  });
  // Primary enrolled face (one per user)…
  const primary = db.prepare(`
    SELECT ui.user_id, ui.status, ui.face_embedding, ui.id_embedding, u.name, u.role, u.email
    FROM user_identity ui JOIN users u ON u.id = ui.user_id
    WHERE ui.face_embedding IS NOT NULL AND (u.disabled IS NULL OR u.disabled = 0)
  `).all().map(map);
  // …plus any additional faces (glasses/hat/claimed captures). Same user identity, different vector.
  const extra = db.prepare(`
    SELECT uf.user_id, ui.status, uf.embedding AS face_embedding, ui.id_embedding, u.name, u.role, u.email
    FROM user_faces uf JOIN users u ON u.id = uf.user_id JOIN user_identity ui ON ui.user_id = uf.user_id
    WHERE uf.embedding IS NOT NULL AND (u.disabled IS NULL OR u.disabled = 0)
  `).all().map(map);
  return primary.concat(extra);
}

// ---- multi-face + unauthorized captures ----
function _cosine(a, b) { if (!a || !b || a.length !== b.length) return -1;
  let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb); return d ? s / d : -1; }

// A user's additional faces (beyond the primary enrolment).
export function addUserFace(userId, embedding, image, source, actor) {
  db.prepare("INSERT INTO user_faces (user_id, embedding, image, source, added_by) VALUES (?,?,?,?,?)")
    .run(Number(userId), JSON.stringify(embedding), encBlob(image || ""), String(source || "manual"), String(actor || ""));
}
export function listUserFaces(userId) {
  return db.prepare("SELECT id, source, added_by, added_at, (image IS NOT NULL AND image != '') AS has_image FROM user_faces WHERE user_id=? ORDER BY id DESC")
    .all(Number(userId))
    .map((r) => ({ id: r.id, source: r.source, added_by: r.added_by, added_at: r.added_at, has_image: !!r.has_image }));
}
export function deleteUserFace(id) { db.prepare("DELETE FROM user_faces WHERE id=?").run(Number(id)); }
export function getUserFaceImage(id) { const r = db.prepare("SELECT image FROM user_faces WHERE id=?").get(Number(id)); return r ? decBlob(r.image) : ""; }

// Unauthorized capture parking lot (30-day retention).
function purgeUnauthorizedFaces() {
  db.prepare("DELETE FROM unauthorized_faces WHERE status!='claimed' AND captured_at < datetime('now','localtime','-30 days')").run();
}
export function recordUnauthorizedFace({ image, embedding, ip, bestUserId, bestName, bestScore }) {
  if (!image || !embedding) return;
  purgeUnauthorizedFaces();
  // Dedup a retry burst: skip if a near-identical face was parked in the last 10 minutes.
  const recent = db.prepare("SELECT embedding FROM unauthorized_faces WHERE status='pending' AND captured_at > datetime('now','localtime','-10 minutes')").all();
  for (const r of recent) { const v = _jparse(r.embedding, null); if (v && _cosine(v, embedding) > 0.9) return; }
  db.prepare("INSERT INTO unauthorized_faces (image, embedding, ip, best_user_id, best_name, best_score) VALUES (?,?,?,?,?,?)")
    .run(encBlob(image), JSON.stringify(embedding), String(ip || ""), bestUserId || null, bestName || null, bestScore == null ? null : Number(bestScore));
}
export function listUnauthorizedFaces(limit = 120) {
  purgeUnauthorizedFaces();
  return db.prepare("SELECT id, ip, best_user_id, best_name, best_score, status, captured_at FROM unauthorized_faces WHERE status='pending' ORDER BY id DESC LIMIT ?")
    .all(Number(limit))
    .map((r) => ({ id: r.id, ip: r.ip, best_user_id: r.best_user_id, best_name: r.best_name, best_score: r.best_score, status: r.status, captured_at: r.captured_at }));
}
export function unauthorizedCount() { purgeUnauthorizedFaces(); const r = db.prepare("SELECT COUNT(*) c FROM unauthorized_faces WHERE status='pending'").get(); return r?.c || 0; }
export function getUnauthorizedImage(id) { const r = db.prepare("SELECT image FROM unauthorized_faces WHERE id=?").get(Number(id)); return r ? decBlob(r.image) : ""; }
export function dismissUnauthorizedFace(id) { db.prepare("UPDATE unauthorized_faces SET status='dismissed' WHERE id=?").run(Number(id)); }
export function claimUnauthorizedFace(id, userId, actor) {
  const row = db.prepare("SELECT * FROM unauthorized_faces WHERE id=?").get(Number(id));
  if (!row) return { ok: false, error: "Not found" };
  const emb = _jparse(row.embedding, null); if (!emb) return { ok: false, error: "No embedding on this capture" };
  addUserFace(userId, emb, decBlob(row.image), "claimed", actor);
  db.prepare("UPDATE unauthorized_faces SET status='claimed', claimed_user_id=?, claimed_at=datetime('now','localtime') WHERE id=?").run(Number(userId), Number(id));
  const u = db.prepare("SELECT name FROM users WHERE id=?").get(Number(userId));
  logIdentityEvent(Number(userId), { kind: "face_added", detail: `Face added from an unauthorized capture${row.best_name ? ` (was nearest ${row.best_name})` : ""}`, score: row.best_score || null, actor_name: actor });
  return { ok: true, name: u?.name || null };
}

// ---- One-time enrolment invites ----
export function createEnrollInvite(userId, { createdBy, days = 7 } = {}) {
  const uid = Number(userId) || 0;
  if (!uid) return null;
  const token = randomBytes(18).toString("base64url");
  const expires_at = new Date(Date.now() + days * 86400000).toISOString();
  db.prepare("INSERT INTO enroll_invites (token, user_id, created_by, expires_at) VALUES (?,?,?,?)")
    .run(token, uid, createdBy || null, expires_at);
  return { token, user_id: uid, expires_at };
}
// Returns { user_id, name, valid, reason } — validity checked (unused + unexpired).
export function getEnrollInvite(token) {
  const row = db.prepare("SELECT * FROM enroll_invites WHERE token=?").get(String(token || ""));
  if (!row) return null;
  const u = db.prepare("SELECT name, role FROM users WHERE id=?").get(row.user_id);
  let valid = true, reason = "";
  if (row.used_at) { valid = false; reason = "used"; }
  else if (row.expires_at && new Date(row.expires_at) < new Date()) { valid = false; reason = "expired"; }
  return { user_id: row.user_id, name: u?.name || null, role: u?.role || null, valid, reason, expires_at: row.expires_at };
}
export function useEnrollInvite(token) {
  db.prepare("UPDATE enroll_invites SET used_at=datetime('now','localtime') WHERE token=? AND used_at IS NULL").run(String(token || ""));
}

export function identityStats() {
  const row = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN face_embedding IS NOT NULL THEN 1 ELSE 0 END) AS enrolled
    FROM user_identity
  `).get();
  return { total: row.total || 0, verified: row.verified || 0, pending: row.pending || 0, enrolled: row.enrolled || 0 };
}

// ---- Document library ----------------------------------------------------
export function createDocument({ doc_type, subject_name, doc_number, fields, score, access_id, captured_by }) {
  const info = db.prepare(
    "INSERT INTO documents (doc_type, subject_name, doc_number, fields, score, access_id, captured_by) VALUES (?,?,?,?,?,?,?)"
  ).run(
    String(doc_type || "").slice(0, 40),
    subject_name ? String(subject_name).slice(0, 200) : null,
    doc_number ? String(doc_number).slice(0, 80) : null,
    fields ? JSON.stringify(fields) : null,
    Number.isFinite(score) ? Math.round(score) : 0,
    access_id ? String(access_id).slice(0, 40) : null,
    captured_by ? String(captured_by).slice(0, 120) : null,
  );
  return { id: Number(info.lastInsertRowid) };
}
function rowToDoc(r) {
  let fields = {};
  try { fields = r.fields ? JSON.parse(r.fields) : {}; } catch { fields = {}; }
  return { ...r, fields };
}
export function listDocuments({ type, accessId, limit = 100 } = {}) {
  const where = [], args = [];
  if (type)     { where.push("doc_type = ?"); args.push(type); }
  if (accessId) { where.push("access_id = ?"); args.push(accessId); }
  const sql = "SELECT * FROM documents" + (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY captured_at DESC, id DESC LIMIT ?";
  return db.prepare(sql).all(...args, Math.min(Number(limit) || 100, 500)).map(rowToDoc);
}
// Free-text search across the denormalized columns + the raw fields JSON.
export function searchDocuments(q, { limit = 50 } = {}) {
  const term = String(q || "").trim();
  if (!term) return [];
  const like = "%" + term.replace(/[%_]/g, (m) => "\\" + m) + "%";
  return db.prepare(`
    SELECT * FROM documents
    WHERE subject_name LIKE ? ESCAPE '\\' OR doc_number LIKE ? ESCAPE '\\'
       OR fields LIKE ? ESCAPE '\\' OR doc_type LIKE ? ESCAPE '\\'
    ORDER BY captured_at DESC, id DESC LIMIT ?
  `).all(like, like, like, like, Math.min(Number(limit) || 50, 200)).map(rowToDoc);
}
export function getDocument(id) {
  const r = db.prepare("SELECT * FROM documents WHERE id=?").get(Number(id));
  return r ? rowToDoc(r) : null;
}
export function deleteDocument(id) {
  db.prepare("DELETE FROM documents WHERE id=?").run(Number(id));
  return { ok: true };
}
// Mask a value for display — never ship raw secrets to the browser.
function maskSecret(v) {
  const s = String(v || "");
  if (!s) return "";
  if (s.length <= 4) return "••••";
  return "••••••••" + s.slice(-4);
}
// Merge the known-integration registry with what's actually stored / in env,
// returning display-safe metadata only (masked value, source, timestamp).
export function listSecretsMeta(registry = []) {
  let stored = [];
  try { stored = db.prepare("SELECT key, value, updated_at, updated_by FROM app_secrets").all(); } catch { stored = []; }
  const storedMap = new Map(stored.map(r => [r.key, r]));
  const seen = new Set();
  const rows = [];
  const push = (key, meta) => {
    const s = storedMap.get(key);
    const envVal = process.env[key] || "";
    const source = s ? "stored" : (envVal ? "env" : "none");
    const val = s ? s.value : envVal;
    rows.push({
      key,
      name: meta?.name || key,
      powers: meta?.powers || "",
      docs: meta?.docs || "",
      clientExposed: !!meta?.clientExposed,
      known: !!meta,
      source,
      masked: val ? maskSecret(val) : "",
      updated_at: s?.updated_at || null,
      updated_by: s?.updated_by || null,
    });
    seen.add(key);
  };
  for (const item of registry) push(item.key, item);
  // Any stored key that isn't in the registry (custom keys the user added)
  for (const r of stored) if (!seen.has(r.key)) push(r.key, null);
  return rows;
}

// ---- Archive / soft-delete system ----------------------------------------
// Every archivable entity declares its source table + how to summarize a row.
const ARCHIVABLE = {
  expense:   { table: "expenses",   label: (r) => r.description || "Expense", detail: (r) => [r.category, r.amount ? "$" + Number(r.amount).toLocaleString() : null].filter(Boolean).join(" · ") },
  user:      { table: "users",      label: (r) => r.name || r.email || r.username || "User", detail: (r) => r.role || "" },
  inventory: { table: "inventory",  label: (r) => r.name || "Inventory item", detail: (r) => [r.sku, r.quantity != null ? `qty ${r.quantity}` : null].filter(Boolean).join(" · ") },
  dev_task:  { table: "dev_tasks",  label: (r) => r.title || "Task", detail: (r) => r.category || "", guard: (r) => r.is_custom === 1 },
  payment:   { table: "project_payments", label: (r) => "$" + Number(r.amount || 0).toLocaleString() + " " + (r.kind || "payment"), detail: (r) => [r.project_access_id, r.method, r.source].filter(Boolean).join(" · ") },
  project:   { table: "projects",   label: (r) => r.customer || r.access_id || "Project", detail: (r) => [r.access_id, r.stage].filter(Boolean).join(" · ") },
  support:   { table: "support_articles", label: (r) => r.title || "Article", detail: (r) => r.category || "" },
};
const ARCHIVE_TABLES = new Set(Object.values(ARCHIVABLE).map((c) => c.table));

// Move a row into the archive, then remove it from its source table. Returns {ok}.
export function archiveAndDelete(entityType, id, actor) {
  const cfg = ARCHIVABLE[entityType];
  if (!cfg) throw new Error("Unknown archivable type: " + entityType);
  const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(Number(id));
  if (!row) return { ok: false, error: "Record not found." };
  if (cfg.guard && !cfg.guard(row)) return { ok: false, error: "This item is protected and cannot be deleted." };
  db.prepare(`INSERT INTO archive (entity_type, source_table, entity_id, label, detail, payload, archived_by_id, archived_by_name)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(entityType, cfg.table, Number(id), cfg.label(row) || "(untitled)", cfg.detail(row) || null,
         JSON.stringify(row), actor?.id ?? null, actor?.name ?? null);
  db.prepare(`DELETE FROM ${cfg.table} WHERE id=?`).run(Number(id));
  return { ok: true };
}

export function getArchives() {
  return db.prepare("SELECT id, entity_type, source_table, entity_id, label, detail, archived_by_name, archived_at FROM archive ORDER BY archived_at DESC, id DESC")
    .all().map((r) => ({ ...r }));
}
export function getArchiveCount() {
  return db.prepare("SELECT COUNT(*) AS n FROM archive").get().n;
}

// Re-insert an archived row back into its source table, then drop the archive entry.
export function restoreArchive(archiveId) {
  const a = db.prepare("SELECT * FROM archive WHERE id=?").get(Number(archiveId));
  if (!a) return { ok: false, error: "Archive entry not found." };
  if (!ARCHIVE_TABLES.has(a.source_table)) return { ok: false, error: "Unknown source table." };
  let payload;
  try { payload = JSON.parse(a.payload); } catch (_) { return { ok: false, error: "Corrupt archive payload." }; }
  const cols = Object.keys(payload);
  if (!cols.length) return { ok: false, error: "Empty archive payload." };
  const colSql = cols.map((c) => `"${c}"`).join(",");
  const ph = cols.map(() => "?").join(",");
  db.prepare(`INSERT OR REPLACE INTO ${a.source_table} (${colSql}) VALUES (${ph})`).run(...cols.map((c) => payload[c]));
  db.prepare("DELETE FROM archive WHERE id=?").run(Number(archiveId));
  return { ok: true, entityType: a.entity_type };
}

export function purgeArchive(archiveId) {
  db.prepare("DELETE FROM archive WHERE id=?").run(Number(archiveId));
  return { ok: true };
}
export function purgeAllArchives() {
  const n = getArchiveCount();
  db.prepare("DELETE FROM archive").run();
  return { ok: true, count: n };
}

// Archive ONE project by its access_id (soft/recoverable → /archives). The per-project counterpart
// to archiveCustomer — lets an admin remove a single job without touching the customer's others.
export function archiveProject(accessId, actor) {
  const row = db.prepare("SELECT id, customer, access_id FROM projects WHERE access_id = ? COLLATE NOCASE").get(String(accessId || "").trim());
  if (!row) return { ok: false, error: "Project not found." };
  const res = archiveAndDelete("project", row.id, actor);
  return res.ok ? { ok: true, customer: row.customer, access_id: row.access_id } : res;
}

// A "customer" is every project sharing a customer name — archive them all (soft/recoverable).
export function archiveCustomer(customerName, actor) {
  const rows = db.prepare("SELECT id FROM projects WHERE customer = ?").all(String(customerName));
  if (!rows.length) return { ok: false, error: "No projects for that customer." };
  let count = 0;
  for (const r of rows) if (archiveAndDelete("project", r.id, actor).ok) count++;
  return { ok: true, count };
}
// Wipe every project into the archive (recoverable) — the "start from scratch" action.
export function archiveAllProjects(actor) {
  const rows = db.prepare("SELECT id FROM projects").all();
  let count = 0;
  for (const r of rows) if (archiveAndDelete("project", r.id, actor).ok) count++;
  return { ok: true, count };
}

// ---- Proposal view tracking ----
export function recordProposalView(accessId, { role, name, ip }) {
  if (!accessId || !role) return;
  // Dedupe: don't log the same viewer (role+ip) more than once per 2 minutes.
  const recent = db.prepare(
    `SELECT id FROM proposal_views WHERE project_access_id=? AND viewer_role=?
       AND ifnull(ip,'')=ifnull(?,'') AND viewed_at > datetime('now','localtime','-2 minutes') LIMIT 1`
  ).get(String(accessId), role, ip || null);
  if (recent) return;
  db.prepare("INSERT INTO proposal_views (project_access_id, viewer_role, viewer_name, ip) VALUES (?,?,?,?)")
    .run(String(accessId), role, name || null, ip || null);
}
export function getProposalViews(accessId) {
  return db.prepare(
    "SELECT id, viewer_role, viewer_name, ip, geo, viewed_at FROM proposal_views WHERE project_access_id=? ORDER BY viewed_at DESC, id DESC LIMIT 200"
  ).all(String(accessId)).map((r) => ({ ...r }));
}

// Private / loopback / unroutable IPs never geolocate — don't waste an API call.
function isPrivateIp(ip) {
  const s = String(ip || "").trim();
  if (!s || s === "::1" || s === "127.0.0.1" || s.startsWith("::ffff:127.")) return true;
  if (s.startsWith("10.") || s.startsWith("192.168.") || s.startsWith("169.254.") || s.startsWith("fc") || s.startsWith("fd")) return true;
  const m = s.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  return false;
}

// Resolve an IP to a short "City, Region, Country" label — IP-based (approximate), the same
// approach analytics tools use. Cached in ip_geo so each IP is looked up at most once. Returns
// "" for private IPs or on any failure (never throws, never blocks a page for long).
async function resolveIpGeo(ip) {
  if (isPrivateIp(ip)) return "";
  const cached = db.prepare("SELECT label FROM ip_geo WHERE ip=?").get(String(ip));
  if (cached) return cached.label || "";
  let label = "";
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country,country_code`,
      { signal: AbortSignal.timeout(2500), cache: "no-store" });
    const d = await res.json();
    if (d && d.success) {
      label = [d.city, d.region, d.country_code || d.country].filter(Boolean).join(", ");
    }
  } catch { /* network/timeout — leave blank, we still cache the miss below */ }
  db.prepare("INSERT OR REPLACE INTO ip_geo (ip, label) VALUES (?,?)").run(String(ip), label);
  return label;
}

// Views list with location backfilled — call this from staff view paths only (customers never wait
// on a geo lookup). Resolves any rows missing geo, caches per IP, and writes the label back.
export async function getProposalViewsWithGeo(accessId) {
  const rows = getProposalViews(accessId);
  const need = rows.filter((r) => !r.geo && r.ip && !isPrivateIp(r.ip));
  const uniq = [...new Set(need.map((r) => r.ip))];
  const map = {};
  for (const ip of uniq) map[ip] = await resolveIpGeo(ip);
  for (const r of rows) {
    if (!r.geo && map[r.ip]) {
      r.geo = map[r.ip];
      db.prepare("UPDATE proposal_views SET geo=? WHERE id=?").run(r.geo, r.id);
    }
  }
  return rows;
}

// ---- Proposals (versioned; see table DDL in init) ----
// Active = newest non-superseded row for the project.
// Older proposals stored the preparer as their login email (created_by_name = "admin@…").
// Resolve it to the person's actual name for display — look the user up by email, and fall back
// to a title-cased local-part so a document never shows a raw email as the "Prepared by".
function resolvePreparerName(v) {
  const s = String(v || "").trim();
  if (!s || !s.includes("@")) return s;
  const u = getUserByEmail(s);
  if (u?.name) return u.name;
  const local = s.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

export function getActiveProposal(accessId) {
  const r = db.prepare(
    "SELECT * FROM proposals WHERE project_access_id=? AND status != 'superseded' ORDER BY version DESC, id DESC LIMIT 1"
  ).get(String(accessId));
  return r ? { ...r, created_by_name: resolvePreparerName(r.created_by_name) } : null;
}
export function getProposalHistory(accessId) {
  return db.prepare("SELECT id, version, status, sent_at, sent_by_name, selected_option, updated_at FROM proposals WHERE project_access_id=? ORDER BY version DESC")
    .all(String(accessId)).map((r) => ({ ...r }));
}

// ---- PCP (Performance Credit Program) ----
// Customer acknowledges the PCP agreement in one click — records their signature + issues
// an agreement number. Leaves the credit itself PENDING until admin finalizes at payment.
export function approvePcpAgreement(accessId, name, signatureData) {
  const cur = getActiveProposal(accessId);
  if (!cur) return null;
  const agrNo = cur.pcp_agreement_no || ("AGR-PCP-" + String(cur.id).padStart(4, "0"));
  db.prepare(`UPDATE proposals SET pcp_agreed_at=datetime('now','localtime'), pcp_agreed_sig=?, pcp_agreement_no=?,
              pcp_status=COALESCE(NULLIF(pcp_status,''),'pending'), updated_at=datetime('now','localtime') WHERE id=?`)
    .run(signatureData || name || null, agrNo, cur.id);
  return getActiveProposal(accessId);
}
// Admin/manager correction: void the customer's PCP agreement signature so it can be re-approved.
// Record preserved (agreement number kept); only the signature + agreed timestamp are cleared.
export function voidPcpAgreement(accessId) {
  const cur = getActiveProposal(accessId);
  if (!cur) return null;
  db.prepare("UPDATE proposals SET pcp_agreed_at=NULL, pcp_agreed_sig=NULL, updated_at=datetime('now','localtime') WHERE id=?").run(cur.id);
  return getActiveProposal(accessId);
}
// Admin finalizes / adjusts the discretionary credit at the payment stage (status + grant source).
export function finalizePcp(accessId, { status, grantSource } = {}) {
  const cur = getActiveProposal(accessId);
  if (!cur) return null;
  const st = ["pending", "approved"].includes(status) ? status : (cur.pcp_status || "pending");
  const gs = grantSource != null ? String(grantSource) : cur.pcp_grant_source;
  if (st === "approved") {
    db.prepare("UPDATE proposals SET pcp_status='approved', pcp_grant_source=?, pcp_approved_at=COALESCE(pcp_approved_at, datetime('now','localtime')), updated_at=datetime('now','localtime') WHERE id=?").run(gs, cur.id);
  } else {
    db.prepare("UPDATE proposals SET pcp_status=?, pcp_grant_source=?, updated_at=datetime('now','localtime') WHERE id=?").run(st, gs, cur.id);
  }
  return getActiveProposal(accessId);
}
// Every active proposal carrying a PCP credit — raw rows for the ledger page (amounts computed there).
export function getPcpLedger() {
  return db.prepare(`
    SELECT pr.id, pr.project_access_id, pr.payload, pr.tax_rate, pr.deposit_pct, pr.selected_option,
           pr.pcp_status, pr.pcp_agreed_at, pr.pcp_agreement_no, pr.pcp_grant_source, pr.pcp_approved_at,
           pr.status AS proposal_status, pr.updated_at,
           p.customer, p.stage
    FROM proposals pr
    LEFT JOIN projects p ON p.access_id = pr.project_access_id COLLATE NOCASE
    WHERE pr.status != 'superseded'
    ORDER BY pr.updated_at DESC
  `).all().map((r) => ({ ...r }));
}
// Insert a fresh draft, or update the payload of the current draft in place.
// Sent rows are immutable — callers must reviseProposal() first.
export function saveProposalDraft(accessId, { payload, taxRate, depositPct }, byName) {
  const cur = getActiveProposal(accessId);
  const json = JSON.stringify(payload);
  if (cur && cur.status === "draft") {
    db.prepare("UPDATE proposals SET payload=?, tax_rate=?, deposit_pct=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(json, +taxRate || 0, +depositPct || 0, cur.id);
    return getActiveProposal(accessId);
  }
  if (cur && cur.status !== "draft") return null; // must revise first
  db.prepare("INSERT INTO proposals (project_access_id, version, payload, tax_rate, deposit_pct, created_by_name) VALUES (?,?,?,?,?,?)")
    .run(String(accessId), 1, json, +taxRate || 0, +depositPct || 0, byName || null);
  return getActiveProposal(accessId);
}
// Update ONLY the technician pricing on the active proposal, in place — no version bump,
// works even on a sent/accepted row. `techMap` is { itemId: techPrice }. Internal admin edit;
// the customer-facing payload (names, qty, customer price) is left untouched.
export function setProposalTechPricing(accessId, techMap) {
  const cur = getActiveProposal(accessId);
  if (!cur) return null;
  let payload;
  try { payload = JSON.parse(cur.payload); } catch { return null; }
  const apply = (it) => {
    if (it.id in techMap) it.techPrice = Math.max(0, Math.min(1000000, +techMap[it.id] || 0));
    (it.sub || []).forEach((x) => { if (x.id in techMap) x.techPrice = Math.max(0, Math.min(1000000, +techMap[x.id] || 0)); });
  };
  (payload.options || []).forEach((o) => (o.services || []).forEach((s) => (s.items || []).forEach(apply)));
  db.prepare("UPDATE proposals SET payload=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(JSON.stringify(payload), cur.id);
  return getActiveProposal(accessId);
}
export function markProposalSent(accessId, byName) {
  const cur = getActiveProposal(accessId);
  if (!cur || cur.status !== "draft") return null;
  db.prepare("UPDATE proposals SET status='sent', sent_at=datetime('now','localtime'), sent_by_name=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(byName || null, cur.id);
  return getActiveProposal(accessId);
}
// Office finalizes the auto-created work order (payout reviewed) — this is what lets a tech accept
// it. `on=false` re-opens it for edits (clears the stamp). No-op if there's no proposal.
export function setWorkOrderFinalized(accessId, on, byName) {
  const cur = getActiveProposal(accessId);
  if (!cur) return null;
  if (on) db.prepare("UPDATE proposals SET wo_finalized_at=datetime('now','localtime'), wo_finalized_by=?, updated_at=datetime('now','localtime') WHERE id=?").run(byName || null, cur.id);
  else    db.prepare("UPDATE proposals SET wo_finalized_at=NULL, wo_finalized_by=NULL, updated_at=datetime('now','localtime') WHERE id=?").run(cur.id);
  return getActiveProposal(accessId);
}
// Clone the sent/changes_requested version into a new editable draft; supersede the old row.
export function reviseProposal(accessId, byName) {
  const cur = getActiveProposal(accessId);
  if (!cur || cur.status === "draft") return cur;
  db.prepare("INSERT INTO proposals (project_access_id, version, payload, tax_rate, deposit_pct, created_by_name) VALUES (?,?,?,?,?,?)")
    .run(String(accessId), cur.version + 1, cur.payload, cur.tax_rate, cur.deposit_pct, byName || null);
  db.prepare("UPDATE proposals SET status='superseded', updated_at=datetime('now','localtime') WHERE id=?").run(cur.id);
  return getActiveProposal(accessId);
}
// Accepting and declining are tracked as two INDEPENDENT per-option sets so a customer can
// accept Option A while declining Option B without one undoing the other:
//   accepted_options  = ["A", ...]           (JSON array)
//   declined_options  = { "B": "reason", … } (JSON object → per-option decline reason)
// The proposal-level status is "accepted" when ≥1 option is accepted, else "declined" when
// ≥1 is declined, else "sent". selected_option mirrors the first accepted for back-compat.
function _readOptSets(cur) {
  let acc; try { acc = JSON.parse(cur.accepted_options || "[]"); } catch { acc = []; }
  if (!Array.isArray(acc)) acc = [];
  let dec; try { dec = JSON.parse(cur.declined_options || "{}"); } catch { dec = {}; }
  if (!dec || typeof dec !== "object" || Array.isArray(dec)) dec = {};
  return { acc, dec };
}
function _writeOptSets(cur, acc, dec) {
  const any = acc.length > 0;
  const anyDec = Object.keys(dec).length > 0;
  const status = any ? "accepted" : (anyDec ? "declined" : "sent");
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const firstReason = anyDec ? String(Object.values(dec)[0] || "") : null;
  db.prepare("UPDATE proposals SET accepted_options=?, declined_options=?, selected_option=?, selected_at=?, status=?, declined_reason=?, declined_at=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(JSON.stringify(acc), JSON.stringify(dec), any ? acc[0] : null, any ? now : null,
      status, firstReason, anyDec ? now : null, cur.id);
  return getActiveProposal(accessId_of(cur));
}
function accessId_of(cur) { return cur.project_access_id; }
// Toggle an option in the ACCEPTED set. Accepting also clears any prior decline of that same option.
export function selectProposalOption(accessId, optKey) {
  const cur = getActiveProposal(accessId);
  if (!cur || !["sent", "changes_requested", "accepted", "declined"].includes(cur.status)) return null;
  const { acc, dec } = _readOptSets(cur);
  const k = String(optKey);
  const i = acc.indexOf(k);
  if (i >= 0) acc.splice(i, 1);          // un-accept
  else { acc.push(k); delete dec[k]; }   // accept → drop any decline of the same option
  return _writeOptSets(cur, acc, dec);
}
// Toggle an option in the DECLINED set (per option, with a reason). Declining also removes that
// option from the accepted set, but leaves every OTHER accepted option untouched.
export function declineOption(accessId, optKey, reason) {
  const cur = getActiveProposal(accessId);
  if (!cur || !["sent", "changes_requested", "accepted", "declined"].includes(cur.status)) return null;
  const { acc, dec } = _readOptSets(cur);
  const k = String(optKey);
  if (dec[k] !== undefined) delete dec[k];              // un-decline
  else { dec[k] = String(reason || "").slice(0, 300); const i = acc.indexOf(k); if (i >= 0) acc.splice(i, 1); }
  return _writeOptSets(cur, acc, dec);
}
// Staff resolve one customer change-request flag (Mark done / Discard both clear it).
export function resolveCustomerFlag(accessId, itemId) {
  const cur = getActiveProposal(accessId);
  if (!cur) return null;
  let flags;
  try { flags = JSON.parse(cur.customer_flags || "{}"); } catch { flags = {}; }
  delete flags[String(itemId)];
  const remaining = Object.keys(flags).length;
  db.prepare("UPDATE proposals SET customer_flags=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(JSON.stringify(flags), cur.id);
  return getActiveProposal(accessId);
}
export function requestProposalChanges(accessId, note) {
  const cur = getActiveProposal(accessId);
  if (!cur || !["sent", "accepted"].includes(cur.status)) return null;
  db.prepare("UPDATE proposals SET status='changes_requested', change_note=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(String(note || "").slice(0, 2000), cur.id);
  return getActiveProposal(accessId);
}
// Per-line customer revision flags: { itemId: { type:"remove"|"change", note } }. Stored on
// the active proposal and flips it to changes_requested so staff know to revise. The line
// items themselves are NOT modified — a flag is just a customer request for us to act on.
export function setProposalCustomerFlags(accessId, flags, note) {
  const cur = getActiveProposal(accessId);
  if (!cur || !["sent", "accepted", "changes_requested"].includes(cur.status)) return null;
  const clean = {};
  Object.entries(flags || {}).forEach(([id, f]) => {
    if (!f || !["remove", "change"].includes(f.type)) return;
    clean[String(id)] = { type: f.type, note: String(f.note || "").slice(0, 500) };
  });
  const anyFlags = Object.keys(clean).length > 0;
  db.prepare("UPDATE proposals SET customer_flags=?, status=?, change_note=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(JSON.stringify(clean), anyFlags ? "changes_requested" : cur.status, note != null ? String(note).slice(0, 2000) : cur.change_note, cur.id);
  return getActiveProposal(accessId);
}

// ---- Signature + payments + stage acceptances (Approval & Deposit stage) ----
// Customer signs the accepted proposal (typed name, optional drawn signature data URL).
export function signProposal(accessId, name, signatureData) {
  const cur = getActiveProposal(accessId);
  if (!cur || cur.status !== "accepted") return null;
  db.prepare("UPDATE proposals SET signed_name=?, signed_at=datetime('now','localtime'), signature_data=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(String(name || "").slice(0, 120), signatureData ? String(signatureData).slice(0, 200000) : null, cur.id);
  return getActiveProposal(accessId);
}
// Technician accepts the (customer-accepted) work order: records the tech's signature on the
// proposal AND assigns them to the project (projects.tech = name). Only allowed once the
// customer has accepted — a tech can't accept a work order that isn't live.
export function acceptWorkOrder(accessId, name, signatureData) {
  const cur = getActiveProposal(accessId);
  // The tech can sign as soon as the proposal has been SENT — they don't wait on the customer.
  if (!cur || !cur.sent_at) return null;
  db.prepare("UPDATE proposals SET tech_signed_name=?, tech_signed_at=datetime('now','localtime'), tech_signature_data=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(String(name || "").slice(0, 120), signatureData ? String(signatureData).slice(0, 200000) : null, cur.id);
  db.prepare("UPDATE projects SET tech=? WHERE access_id=?").run(String(name || "").slice(0, 120), String(accessId));
  return getActiveProposal(accessId);
}
export function getProjectPayments(accessId) {
  return db.prepare("SELECT * FROM project_payments WHERE project_access_id=? ORDER BY id DESC").all(String(accessId)).map((r) => ({ ...r }));
}
export function addProjectPayment(accessId, { amount, method, kind, source, note, paidAt }, byName) {
  // Customer submissions await staff confirmation of receipt; staff entries are money-in-hand.
  const src = source === "customer" ? "customer" : "staff";
  // paid_at = the date the money changed hands (staff-set, YYYY-MM-DD). Defaults to today.
  const paid = /^\d{4}-\d{2}-\d{2}$/.test(String(paidAt || "")) ? String(paidAt) : new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO project_payments (project_access_id, amount, method, kind, source, note, recorded_by, status, paid_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(String(accessId), Math.max(0, +amount || 0), String(method || "").slice(0, 60) || null,
      ["deposit", "final", "partial", "other"].includes(kind) ? kind : "deposit",
      src, String(note || "").slice(0, 500) || null, byName || null,
      src === "customer" ? "pending" : "confirmed", paid);
  return getProjectPayments(accessId);
}
// Staff confirm a customer-submitted payment once the money is actually received.
export function confirmProjectPayment(accessId, id) {
  db.prepare("UPDATE project_payments SET status='confirmed' WHERE id=? AND project_access_id=?").run(+id, String(accessId));
  return getProjectPayments(accessId);
}
export function deleteProjectPayment(accessId, id, actor) {
  // Archive before removing — a deleted payment stays recoverable for the money trail.
  const row = db.prepare("SELECT * FROM project_payments WHERE id=? AND project_access_id=?").get(+id, String(accessId));
  if (!row) return getProjectPayments(accessId);
  archiveAndDelete("payment", +id, actor);
  return getProjectPayments(accessId);
}

// Void a customer signature on the active proposal (admin/manager correction path). The proposal
// record is preserved; only the signature fields are cleared so it can be re-signed.
export function voidProposalSignature(accessId) {
  const cur = getActiveProposal(accessId);
  if (!cur) return null;
  db.prepare("UPDATE proposals SET signed_name=NULL, signed_at=NULL, signature_data=NULL, updated_at=datetime('now','localtime') WHERE id=?").run(cur.id);
  return getActiveProposal(accessId);
}
// Admin/manager correction: void the technician's work-order signature (which is also their
// self-assignment) so the work order can be re-accepted/re-assigned. Record preserved, not erased.
export function voidTechSignature(accessId) {
  const cur = getActiveProposal(accessId);
  if (!cur) return null;
  db.prepare("UPDATE proposals SET tech_signed_name=NULL, tech_signed_at=NULL, tech_signature_data=NULL, updated_at=datetime('now','localtime') WHERE id=?").run(cur.id);
  return getActiveProposal(accessId);
}
// Confirmed money only — the number the balance and stage gates trust.
export function confirmedPaymentTotal(accessId, kind) {
  const rows = db.prepare("SELECT amount, kind FROM project_payments WHERE project_access_id=? AND status='confirmed'").all(String(accessId));
  return rows.filter((r) => !kind || r.kind === kind).reduce((s, r) => s + (+r.amount || 0), 0);
}
// ---- Browser-tool data backup (survey / mockup / schedule JSON blobs) ----
// "tracking" = equipment shipment info for the Schedule stage ({number, carrier, note}) —
// staff set it, the customer's scheduling page displays it.
export const TOOL_KEYS = new Set(["survey", "survey2", "mockup", "schedule", "tracking", "install", "addendum", "receiving", "techs", "qc"]);
export function getToolData(accessId, tool) {
  const r = db.prepare("SELECT data, updated_by, updated_at FROM project_tool_data WHERE project_access_id=? AND tool=?")
    .get(String(accessId), String(tool));
  return r ? { data: r.data, updated_by: r.updated_by, updated_at: r.updated_at } : null;
}
export function saveToolData(accessId, tool, data, byName) {
  db.prepare(`
    INSERT INTO project_tool_data (project_access_id, tool, data, updated_by, updated_at)
    VALUES (?,?,?,?,datetime('now','localtime'))
    ON CONFLICT(project_access_id, tool)
    DO UPDATE SET data=excluded.data, updated_by=excluded.updated_by, updated_at=excluded.updated_at
  `).run(String(accessId), String(tool), String(data), byName || null);
  return getToolData(accessId, tool);
}

// ---- Appointment reminders (24h) ------------------------------------------------------------
// Every project's booked appointments (the scheduling widget's `schedule` blob) — the reminder
// sweep reads these to find visits happening within the next 24h.
export function allScheduleBlobs() {
  return db.prepare("SELECT project_access_id, data FROM project_tool_data WHERE tool='schedule'").all();
}
// Atomically claim a reminder: returns true only the FIRST time this event_key is seen, so the
// hourly sweep sends each 24h reminder exactly once even if instances/sweeps overlap.
export function claimAppointmentReminder(eventKey) {
  const r = db.prepare("INSERT OR IGNORE INTO appt_reminders (event_key) VALUES (?)").run(String(eventKey));
  return r.changes > 0;
}

// ---- Uploaded media (HEIC-safe photos). Bytes are already-converted JPEG from /api/media. ----
export function insertMedia({ id, projectAccessId, kind, mime, bytes, w, h, createdBy }) {
  db.prepare(
    `INSERT INTO media (id, project_access_id, kind, mime, bytes, w, h, created_by)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(String(id), projectAccessId ? String(projectAccessId) : null, kind || null,
        mime || "image/jpeg", bytes, w || null, h || null, createdBy || null);
  return id;
}
export function getMedia(id) {
  return db.prepare("SELECT id, mime, bytes, voided FROM media WHERE id=?").get(String(id)) || null;
}
export function voidMedia(id) {
  db.prepare("UPDATE media SET voided=1 WHERE id=?").run(String(id));
}

// The project's canonical camera list, derived from the Site Survey (tool "survey2"): every placed
// camera device (k==="cam") across all floors, with its name/tag and view photo. This is the single
// source of truth the CCTV mockup grid — and later the proposal/PDF — reflect, so cameras are entered
// ONCE, in the survey, and everything downstream builds from them.
export function getProjectCameras(accessId) {
  const row = getToolData(accessId, "survey2");
  const out = [];
  try {
    const d = JSON.parse(row?.data || "{}");
    const floors = Array.isArray(d.floors) ? d.floors : [];
    floors.forEach((f, fi) => {
      (Array.isArray(f?.devices) ? f.devices : []).forEach((dev, di) => {
        if (dev && dev.k === "cam") {
          out.push({
            name: dev.name || null,
            tag: dev.tag || null,
            photo: dev.photo || null,       // /api/media/:id (or a legacy/fallback data-URL)
            photoName: dev.photoName || null,
            floor: fi,
            floorName: f?.name || `Floor ${fi + 1}`,
            di,                              // index in floors[fi].devices — the locator for setSurveyCameraPhoto
          });
        }
      });
    });
  } catch { /* bad blob → no cameras */ }
  return out;
}

// Attach / replace / clear a survey camera's view photo, targeting one device by (floor, di) — the
// locator getProjectCameras hands out. This is the server-side twin the page-level camera list writes
// through, so a photo edited there lands in the same survey2 blob the survey tool and mockup read.
// (photo=null clears it.) Returns the refreshed camera list, or null if the target no longer matches.
export function setSurveyCameraPhoto(accessId, floor, di, photo, photoName) {
  const row = getToolData(accessId, "survey2");
  let d;
  try { d = JSON.parse(row?.data || "{}"); } catch { return null; }
  const dev = d?.floors?.[floor]?.devices?.[di];
  if (!dev || dev.k !== "cam") return null;         // moved/removed since read → refuse rather than clobber
  dev.photo = photo || null;
  dev.photoName = photo ? (photoName || dev.photoName || dev.name || null) : null;
  saveToolData(accessId, "survey2", JSON.stringify(d), "camera-list");
  return getProjectCameras(accessId);
}

// Approved job-site add-ons (addendums) — customer totals fold into the amount owed.
export function getApprovedAddons(accessId) {
  const rec = getToolData(accessId, "addendum");
  let list = [];
  try { list = (JSON.parse(rec?.data || "{}").addendums || []).filter((a) => a && a.status === "approved"); } catch { list = []; }
  const each = list.map((a) => {
    const sub = (a.items || []).reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
    const discount = +a.discount || 0;
    return {
      id: a.id, title: a.title || "Job-site add-on", signedName: a.signedName || null, signedAt: a.signedAt || null,
      discount, total: Math.max(0, sub - discount), // customer owes the discounted total
      items: (a.items || []).map((it) => ({ name: it.name, qty: +it.qty || 1, price: +it.price || 0 })),
    };
  });
  return { total: each.reduce((s, a) => s + a.total, 0), list: each };
}

// ---- Inquiry notes + appointment point-of-contact ----
export function getProjectNotes(accessId) {
  return db.prepare("SELECT * FROM project_notes WHERE project_access_id=? ORDER BY id DESC LIMIT 100").all(String(accessId)).map((r) => ({ ...r }));
}
// Notes for one surface (e.g. 'survey'). Legacy rows have scope NULL → treated as 'general'.
export function getScopedNotes(accessId, scope) {
  return db.prepare("SELECT * FROM project_notes WHERE project_access_id=? AND COALESCE(scope,'general')=? ORDER BY id DESC LIMIT 100")
    .all(String(accessId), String(scope)).map((r) => ({ ...r }));
}
export function addProjectNote(accessId, { role, name, body, scope, anchor, isPublic }) {
  // A customer's note is always public; staff choose (default internal).
  const pub = role === "customer" ? 1 : (isPublic ? 1 : 0);
  db.prepare("INSERT INTO project_notes (project_access_id, author_role, author_name, body, scope, anchor, public) VALUES (?,?,?,?,?,?,?)")
    .run(String(accessId), String(role || "").slice(0, 30) || null, String(name || "").slice(0, 120) || null, String(body || "").slice(0, 2000), String(scope || "general").slice(0, 20), anchor ? String(anchor).slice(0, 80) : null, pub);
  return scope ? getScopedNotes(accessId, scope) : getProjectNotes(accessId);
}
// Set a note public/internal outright (admin/manager). Always clears any pending request.
export function setNotePublic(accessId, id, isPublic) {
  db.prepare("UPDATE project_notes SET public=?, pending_public=0 WHERE id=? AND project_access_id=?")
    .run(isPublic ? 1 : 0, Number(id), String(accessId));
  return getProjectNotes(accessId);
}
// A tech/sales rep requests public — flags it pending for an admin/manager to approve.
export function requestNotePublic(accessId, id) {
  db.prepare("UPDATE project_notes SET pending_public=1 WHERE id=? AND project_access_id=? AND public=0")
    .run(Number(id), String(accessId));
  return getProjectNotes(accessId);
}
// Job Log events — append-only activity (calls, etc.), newest first.
export function getProjectEvents(accessId) {
  return db.prepare("SELECT * FROM project_events WHERE project_access_id=? ORDER BY id DESC LIMIT 200").all(String(accessId)).map((r) => ({ ...r }));
}
export function logProjectEvent(accessId, { kind, label, actor }) {
  db.prepare("INSERT INTO project_events (project_access_id, kind, label, actor) VALUES (?,?,?,?)")
    .run(String(accessId), String(kind || "note").slice(0, 30), String(label || "").slice(0, 300) || null, String(actor || "").slice(0, 120) || null);
  return getProjectEvents(accessId);
}
export function setProjectPoc(accessId, { name, phone }) {
  db.prepare("UPDATE projects SET poc_name=?, poc_phone=? WHERE access_id=?")
    .run(String(name || "").slice(0, 120) || null, String(phone || "").slice(0, 40) || null, String(accessId));
  return getJobByAccessId(accessId);
}

export function getStageAcceptances(accessId) {
  const rows = db.prepare("SELECT stage, accepted_by, created_at, fingerprint FROM stage_acceptances WHERE project_access_id=?").all(String(accessId));
  const out = {};
  rows.forEach((r) => { out[r.stage] = { by: r.accepted_by, at: r.created_at, fingerprint: r.fingerprint || null }; });
  return out;
}
// Re-approving with a new fingerprint UPDATES the record (INSERT OR IGNORE would keep the stale
// one), so a fresh approval after a change captures the current data's fingerprint.
export function acceptStage(accessId, stage, byName, fingerprint) {
  db.prepare(`
    INSERT INTO stage_acceptances (project_access_id, stage, accepted_by, fingerprint, created_at)
    VALUES (?,?,?,?,datetime('now','localtime'))
    ON CONFLICT(project_access_id, stage)
    DO UPDATE SET accepted_by=excluded.accepted_by, fingerprint=excluded.fingerprint, created_at=excluded.created_at
  `).run(String(accessId), String(stage), byName || null, fingerprint || null);
  return getStageAcceptances(accessId);
}
// Server-authoritative per-tool meta: does the tool have data, and its current fingerprint.
// Uses the project_tool_data backup + lib/tool-data.js so the gate agrees with what the customer sees.
export function getToolMeta(accessId) {
  // The redesigned survey tool writes "survey2"; prefer it, fall back to the legacy "survey"
  // store for older projects so their approvals keep working.
  const s2Row = getToolData(accessId, "survey2");
  const surveyTool = toolHasData("survey2", s2Row?.data) ? "survey2" : "survey";
  const surveyRow = surveyTool === "survey2" ? s2Row : getToolData(accessId, "survey");
  const mockupRow = getToolData(accessId, "mockup");
  // Shipment tracking: count + all-delivered, so the office-only "shipping" step can stay hidden
  // until a tracking # exists and auto-complete once every package is delivered.
  const trackRow = getToolData(accessId, "tracking");
  let trkCount = 0, trkDelivered = false;
  try {
    const t = JSON.parse(trackRow?.data || "{}");
    const list = Array.isArray(t.shipments) ? t.shipments : (t.number ? [t] : []);
    const ships = list.filter((s) => s && s.number);
    trkCount = ships.length;
    trkDelivered = ships.length > 0 && ships.every((s) => (typeof s.stage === "number" ? s.stage : 0) === 4);
  } catch { /* bad blob */ }
  // Job-site add-ons count, so the "Add-ons" step stays hidden for the customer until one is submitted.
  const addRow = getToolData(accessId, "addendum");
  let addCount = 0;
  try { addCount = (JSON.parse(addRow?.data || "{}").addendums || []).length; } catch { /* bad blob */ }
  // Scheduled visits (survey + install share this store): drives "Scheduling" step green/open state
  // and keeps the scheduler hidden from the customer until a real booking exists.
  const schedRow = getToolData(accessId, "schedule");
  let schedCount = 0;
  try { const s = JSON.parse(schedRow?.data || "{}"); schedCount = (Array.isArray(s.events) ? s.events : []).length; } catch { /* bad blob */ }
  return {
    survey: { has: toolHasData(surveyTool, surveyRow?.data), fingerprint: toolFingerprint(surveyTool, surveyRow?.data) },
    mockup: { has: toolHasData("mockup", mockupRow?.data), fingerprint: toolFingerprint("mockup", mockupRow?.data) },
    tracking: { count: trkCount, delivered: trkDelivered },
    addendum: { count: addCount },
    schedule: { count: schedCount },
  };
}
// The survey stage is satisfied when every tool that HAS data has a current (fingerprint-matching)
// approval. No data on either tool → nothing to approve → satisfied.
export function surveyStageSatisfied(accessId) {
  const meta = getToolMeta(accessId);
  const acc = getStageAcceptances(accessId);
  const ok = (metaTool, accKey) => !metaTool.has || !!(acc[accKey] && acc[accKey].fingerprint === metaTool.fingerprint);
  return ok(meta.survey, "site_survey") && ok(meta.mockup, "mockup");
}
export function unacceptStage(accessId, stage) {
  db.prepare("DELETE FROM stage_acceptances WHERE project_access_id=? AND stage=?").run(String(accessId), String(stage));
  return getStageAcceptances(accessId);
}

// ---- Company-wide default price book (single row) ----
// Shape: { prices: {name:price}, names: {name:renamedTo}, hidden: {service:[name,...]},
// custom: {service:[{name,price},...]} }. Stored in the same `prices` column (legacy name);
// old rows that are just a flat {name:price} map still parse fine (falls back to prices only).
export function getPriceBook() {
  const r = db.prepare("SELECT prices FROM price_book WHERE id=1").get();
  try {
    const d = JSON.parse(r?.prices || "{}") || {};
    const looksStructured = d && (d.prices || d.names || d.hidden || d.custom || d.presets);
    return looksStructured
      ? { prices: d.prices || {}, names: d.names || {}, hidden: d.hidden || {}, custom: d.custom || {}, presets: Array.isArray(d.presets) ? d.presets : [] }
      : { prices: d || {}, names: {}, hidden: {}, custom: {}, presets: [] }; // legacy flat map
  } catch { return { prices: {}, names: {}, hidden: {}, custom: {}, presets: [] }; }
}
export function setPriceBook(book, byName) {
  const cleanPrices = {};
  Object.entries(book?.prices || {}).forEach(([k, v]) => { if (v != null && v !== "" && +v >= 0) cleanPrices[String(k)] = +v; });
  const cleanNames = {};
  Object.entries(book?.names || {}).forEach(([k, v]) => { if (v) cleanNames[String(k)] = String(v).slice(0, 120); });
  const cleanHidden = {};
  Object.entries(book?.hidden || {}).forEach(([svc, arr]) => { if (Array.isArray(arr) && arr.length) cleanHidden[svc] = arr.map(String); });
  const cleanCustom = {};
  Object.entries(book?.custom || {}).forEach(([svc, arr]) => {
    if (!Array.isArray(arr)) return;
    const items = arr.filter((c) => c?.name).map((c) => ({ name: String(c.name).slice(0, 120), price: +c.price >= 0 ? +c.price : 0 }));
    if (items.length) cleanCustom[svc] = items;
  });
  // Preset bundles: { id, name, service, items:[{name, qty}] } — one-click line bundles.
  const cleanPresets = (Array.isArray(book?.presets) ? book.presets : [])
    .filter((p) => p && p.name && p.service)
    .slice(0, 60)
    .map((p) => ({
      id: String(p.id || "").slice(0, 40) || ("p" + Math.random().toString(36).slice(2, 9)),
      name: String(p.name).slice(0, 60),
      service: String(p.service).slice(0, 20),
      items: (Array.isArray(p.items) ? p.items : [])
        .filter((x) => x && x.name)
        .slice(0, 30)
        .map((x) => ({ name: String(x.name).slice(0, 120), qty: (+x.qty > 0 && +x.qty <= 999) ? +x.qty : 1 })),
    }))
    .filter((p) => p.items.length);
  const clean = { prices: cleanPrices, names: cleanNames, hidden: cleanHidden, custom: cleanCustom, presets: cleanPresets };
  db.prepare("UPDATE price_book SET prices=?, updated_by=?, updated_at=datetime('now','localtime') WHERE id=1")
    .run(JSON.stringify(clean), byName || null);
  return clean;
}

// ---- Technician work-order rate library ----
// Valid rate keys — per-step labor payouts for the install work order.
export const RATE_KEYS = ["cam_drop", "cam_mgmt", "cam_term", "cam_mount", "cam_program", "cam_waterproof", "pos_drop", "pos_mgmt", "pos_term", "pos_install", "nvr_setup", "hdd_install", "monitor_mount"];
// Company defaults (used when a scope hasn't set a key). Owner-set 2026-08: camera bundle = drop
// $10 + cable mgmt $18 + termination $12 + mounting $10 + programming $8 + waterproofing $0 =
// $58/camera; NVR setup $15; HDD/storage drive install $10; monitor + mount $10.
export const DEFAULT_RATES = { cam_drop: 10, cam_mgmt: 18, cam_term: 12, cam_mount: 10, cam_program: 8, cam_waterproof: 0, pos_drop: 10, pos_mgmt: 18, pos_term: 12, pos_install: 12, nvr_setup: 15, hdd_install: 10, monitor_mount: 10 };
function cleanRates(data) {
  const out = {};
  RATE_KEYS.forEach((k) => { const v = data?.[k]; if (v != null && v !== "" && +v >= 0) out[k] = Math.round(+v * 100) / 100; });
  return out;
}
// Full library: { default:{...}, techs:{ "Devon Carter":{...} } } — raw stored overrides only.
export function getRateBook() {
  const rows = db.prepare("SELECT scope, data FROM rate_book").all();
  const book = { default: {}, techs: {} };
  rows.forEach((r) => {
    let d = {}; try { d = JSON.parse(r.data || "{}") || {}; } catch { d = {}; }
    if (r.scope === "default") book.default = cleanRates(d);
    else if (r.scope.startsWith("tech:")) book.techs[r.scope.slice(5)] = cleanRates(d);
  });
  return book;
}
export function saveRateScope(scope, data, byName) {
  const sc = String(scope || "").slice(0, 130);
  if (sc !== "default" && !sc.startsWith("tech:")) return false;
  db.prepare("INSERT INTO rate_book (scope, data, updated_by, updated_at) VALUES (?,?,?,datetime('now','localtime')) ON CONFLICT(scope) DO UPDATE SET data=excluded.data, updated_by=excluded.updated_by, updated_at=excluded.updated_at")
    .run(sc, JSON.stringify(cleanRates(data)), byName || null);
  return true;
}
// Effective rates for a technician: company defaults ← default-scope overrides ← this tech's overrides.
export function getEffectiveRates(techName) {
  const book = getRateBook();
  const tech = techName && book.techs[techName] ? book.techs[techName] : {};
  return { ...DEFAULT_RATES, ...book.default, ...tech };
}

// ---- Action Center: cross-project pending items needing a decision ----
export function getPendingExpenses() {
  return db.prepare("SELECT * FROM expenses WHERE status='pending' ORDER BY created_at DESC").all().map(r => ({ ...r }));
}
export function getPendingRequests() {
  return db.prepare("SELECT * FROM requests WHERE status='pending' ORDER BY created_at DESC").all().map(r => ({ ...r }));
}
export function getPendingWorkOrders() {
  return db.prepare("SELECT * FROM work_orders WHERE status='pending' ORDER BY submitted_at DESC").all().map(r => ({ ...r }));
}

export function getWorkOrdersByProject(accessId) {
  return db.prepare("SELECT * FROM work_orders WHERE project_access_id=? ORDER BY submitted_at DESC").all(accessId).map(r=>({...r}));
}
export function createWorkOrder(accessId, {submittedById, submittedByName, notes}) {
  const r = db.prepare("INSERT INTO work_orders (project_access_id,submitted_by_id,submitted_by_name,notes) VALUES (?,?,?,?)").run(accessId, submittedById??null, submittedByName??null, notes??null);
  return {id: r.lastInsertRowid};
}
export function updateWorkOrderNotes(id, notes) {
  db.prepare("UPDATE work_orders SET notes=? WHERE id=?").run(notes??null, id);
}
export function approveWorkOrder(id, {reviewedById, reviewedByName}) {
  db.prepare("UPDATE work_orders SET status='approved',reviewed_by_id=?,reviewed_by_name=?,reviewed_at=datetime('now','localtime') WHERE id=?").run(reviewedById??null, reviewedByName??null, id);
}
export function rejectWorkOrder(id, {reviewedById, reviewedByName, reviewNotes}) {
  db.prepare("UPDATE work_orders SET status='rejected',reviewed_by_id=?,reviewed_by_name=?,reviewed_at=datetime('now','localtime'),review_notes=? WHERE id=?").run(reviewedById??null, reviewedByName??null, reviewNotes??null, id);
}

export function getProjectAssignments(accessId) {
  return db.prepare("SELECT * FROM project_assignments WHERE project_access_id=? ORDER BY granted_at ASC").all(accessId).map(r=>({...r}));
}
// Auto-grant base access to a project (once each). All current managers and the inquiry customer
// are added as removable assignments; the *_granted flags ensure we never re-add someone the team
// has removed. (Admins are NOT stored — they always have access, enforced live in the UI.)
export function ensureBaseAccess(accessId) {
  const p = db.prepare("SELECT id, contact_email, contact_name, customer, customer_granted, managers_granted FROM projects WHERE access_id=? COLLATE NOCASE").get(String(accessId));
  if (!p) return;
  const ins = db.prepare("INSERT INTO project_assignments (project_access_id, user_id, user_name, user_email, role, granted_by) VALUES (?,?,?,?,?,?)");

  // Managers — auto-add every current manager once (removable thereafter)
  if (!p.managers_granted) {
    const managers = db.prepare("SELECT id, name, email FROM users WHERE role='manager' AND (disabled IS NULL OR disabled=0)").all();
    for (const m of managers) {
      const dup = db.prepare("SELECT id FROM project_assignments WHERE project_access_id=? AND user_id=?").get(String(accessId), m.id);
      if (!dup) ins.run(String(accessId), m.id, m.name || null, m.email || null, "manager", null);
    }
    db.prepare("UPDATE projects SET managers_granted=1 WHERE id=?").run(p.id);
  }

  // Customer — auto-add the inquiry contact once, when a contact email exists (removable thereafter)
  if (!p.customer_granted) {
    const email = p.contact_email ? String(p.contact_email).trim() : null;
    if (email) {
      const dup = db.prepare("SELECT id FROM project_assignments WHERE project_access_id=? AND LOWER(user_email)=LOWER(?)").get(String(accessId), email);
      if (!dup) ins.run(String(accessId), null, p.contact_name || p.customer || "Customer", email, "customer", null);
      db.prepare("UPDATE projects SET customer_granted=1 WHERE id=?").run(p.id);
    }
  }
}

export function addProjectAssignment(accessId, {userId, userName, userEmail, role, grantedBy}) {
  const dup = db.prepare("SELECT id FROM project_assignments WHERE project_access_id=? AND ((user_id IS NOT NULL AND user_id=?) OR (user_email IS NOT NULL AND user_email=?))").get(accessId, userId??null, userEmail??null);
  if (dup) return {id: dup.id, existed: true};
  const r = db.prepare("INSERT INTO project_assignments (project_access_id,user_id,user_name,user_email,role,granted_by) VALUES (?,?,?,?,?,?)").run(accessId, userId??null, userName??null, userEmail??null, role, grantedBy??null);
  return {id: r.lastInsertRowid};
}
export function removeProjectAssignment(id) {
  db.prepare("DELETE FROM project_assignments WHERE id=?").run(id);
}
export function getStaffUsers() {
  // Returns all active users (staff + customers) so the project add-member search can find anyone.
  return db.prepare("SELECT id, name, email, role, phone, username, tech_cert FROM users WHERE (disabled IS NULL OR disabled != 1) ORDER BY role, name").all().map(r=>({...r, tech_cert: safeJson(r.tech_cert, null)}));
}

export function getProjectsForUser(userId) {
  return db.prepare(`
    SELECT p.access_id, p.customer, p.address, p.stage, p.service_code, p.project_type, p.value,
           pa.role AS assignment_role
    FROM projects p
    JOIN project_assignments pa ON pa.project_access_id = p.access_id
    WHERE pa.user_id = ?
    ORDER BY p.id DESC
  `).all(Number(userId)).map(r => ({ ...r, service: SERVICE_CODES[r.service_code] || r.service_code || "General" }));
}
