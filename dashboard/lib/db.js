import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { makeAccessId, stageLabel, SERVICE_CODES } from "./spec.js";
import { missingReqs, nextStageOf, AUTO_STAGES } from "./stage-flow.js";
import { toolHasData, toolFingerprint } from "./tool-data.js";
import { optionTotals } from "./proposal.js";

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

function init() {
  // DB lives on disk. Locally that's ./data; in production point DB_DIR at a PERSISTENT mounted
  // volume (e.g. Render disk at /data) so the database survives deploys and restarts.
  const dir = process.env.DB_DIR || path.join(process.cwd(), "data");
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
  // Seed the built-in Mobile App Setup guide once (the animated device walkthrough).
  if (db.prepare("SELECT COUNT(*) AS n FROM support_articles WHERE kind='guide'").get().n === 0) {
    db.prepare("INSERT INTO support_articles (title, body, category, kind, slug, pinned, author) VALUES (?,?,?,?,?,?,?)")
      .run("Mobile App Setup", JSON.stringify(MOBILE_SETUP_GUIDE), "Getting Started", "guide", "mobile-setup", 1, "IOT TECHS");
  }
  // Backfill: the first guide predates slugs and its URL is already in customers' hands.
  db.prepare("UPDATE support_articles SET slug='mobile-setup' WHERE kind='guide' AND (slug IS NULL OR slug='') AND title LIKE 'Mobile App Setup%'").run();
  for (const g of db.prepare("SELECT id, title FROM support_articles WHERE kind='guide' AND (slug IS NULL OR slug='')").all()) {
    db.prepare("UPDATE support_articles SET slug=? WHERE id=?").run(slugify(g.title, g.id), g.id);
  }

  return db;
}

// The Mobile App Setup walkthrough — a sequence of animated steps rendered by GuideWalkthrough.
// Each step: `art` = which animated illustration to show, plus editable title/text. Ties into the
// System QR card the customer was handed. Kept brand-neutral so the owner can tailor the app name.
const MOBILE_SETUP_GUIDE = {
  intro: "",
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
export function getSupportArticles() {
  return db.prepare(
    "SELECT id, title, body, category, kind, pinned, author, created_at, updated_at FROM support_articles ORDER BY pinned DESC, category ASC, updated_at DESC, id DESC"
  ).all().map((r) => ({ ...r, pinned: !!r.pinned, kind: r.kind || "article" }));
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
export function createSupportArticle({ title, body, category, pinned, author }) {
  const info = db.prepare(
    "INSERT INTO support_articles (title, body, category, pinned, author) VALUES (?,?,?,?,?)"
  ).run(String(title || "").trim(), String(body || "").trim(), String(category || "General").trim() || "General", pinned ? 1 : 0, author || null);
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

const DB_VER = "v35";
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
  return db.prepare("SELECT id, name, username, email, phone, role, disabled FROM users WHERE id = ?").get(Number(id));
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
export function getActiveProposal(accessId) {
  const r = db.prepare(
    "SELECT * FROM proposals WHERE project_access_id=? AND status != 'superseded' ORDER BY version DESC, id DESC LIMIT 1"
  ).get(String(accessId));
  return r ? { ...r } : null;
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
export const TOOL_KEYS = new Set(["survey", "mockup", "schedule", "tracking", "install", "addendum", "receiving", "techs", "qc"]);
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
export function addProjectNote(accessId, { role, name, body, scope }) {
  db.prepare("INSERT INTO project_notes (project_access_id, author_role, author_name, body, scope) VALUES (?,?,?,?,?)")
    .run(String(accessId), String(role || "").slice(0, 30) || null, String(name || "").slice(0, 120) || null, String(body || "").slice(0, 2000), String(scope || "general").slice(0, 20));
  return scope ? getScopedNotes(accessId, scope) : getProjectNotes(accessId);
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
  const surveyRow = getToolData(accessId, "survey");
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
  return {
    survey: { has: toolHasData("survey", surveyRow?.data), fingerprint: toolFingerprint("survey", surveyRow?.data) },
    mockup: { has: toolHasData("mockup", mockupRow?.data), fingerprint: toolFingerprint("mockup", mockupRow?.data) },
    tracking: { count: trkCount, delivered: trkDelivered },
    addendum: { count: addCount },
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
export const RATE_KEYS = ["cam_drop", "cam_mgmt", "cam_term", "cam_mount", "pos_drop", "pos_mgmt", "pos_term", "pos_install", "nvr_setup"];
// Company defaults (used when a scope hasn't set a key). $52/camera & /POS device, $10 NVR.
export const DEFAULT_RATES = { cam_drop: 10, cam_mgmt: 18, cam_term: 12, cam_mount: 12, pos_drop: 10, pos_mgmt: 18, pos_term: 12, pos_install: 12, nvr_setup: 10 };
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
  return db.prepare("SELECT id, name, email, role, phone, username FROM users WHERE (disabled IS NULL OR disabled != 1) ORDER BY role, name").all().map(r=>({...r}));
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
