// scripts/seed-demo.js — LOCALHOST demo seed for journey testing.
//
// Creates a separate demo ADMIN account (not the owner) and 8 fake projects, one at each lifecycle
// stage, every row tagged so clean-demo.js can remove exactly these and nothing else:
//   • projects: source = 'journey-test'  +  a visible "[JOURNEY-TEST]" business-name prefix
//   • customers: fake @journey-test.local emails + 555-01xx phones (reserved fictional ranges)
//
// SAFETY: email is force-disabled (EMAIL_DISABLED=1), the script refuses to run with NODE_ENV=production,
// and it only ever writes tagged rows. It never touches real customer data. Run from dashboard/:
//   node scripts/seed-demo.js
//
// It is idempotent: it first removes any existing [JOURNEY-TEST] projects/customers, then re-creates them.

"use strict";
process.env.EMAIL_DISABLED = "1"; // belt-and-suspenders: no Resend send can fire during the seed

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const TAG = "[JOURNEY-TEST]";
const DEMO_SOURCE = "journey-test";
const DEMO_DOMAIN = "journey-test.local"; // non-routable; guarantees no real email is ever used
const ADMIN_EMAIL = `demo-admin@${DEMO_DOMAIN}`;
const ENV_PATH = path.join(__dirname, "..", ".env");

// A minimal but realistic proposal payload (matches lib/proposal-reuse.js's shape).
const demoPayload = () => ({
  options: [{
    id: "A", name: "Option A",
    services: [{
      key: "custom", label: "Security Cameras",
      items: [
        { id: "it1", name: "4K Dome Camera", qty: 6, price: 220 },
        { id: "it2", name: "8-Channel NVR", qty: 1, price: 650 },
        { id: "it3", name: "Installation & Configuration", qty: 1, price: 900 },
      ],
      note: `Demo proposal — ${TAG}`,
    }],
    note: "", includeMockup: false, includeSurvey: false,
  }],
  discount: { type: "flat", value: 0 },
  pcp_credit: { type: "flat", value: 0 },
  payment_plan: "50_30_20",
});

// The 8 journey stops → canonical stages (lib/stage-flow.js MASTER_ORDER).
const DEMO_PROJECTS = [
  { biz: "Riverside Diner",      person: "Maria Lopez",     prop: "commercial",  stage: "inquiry",          status: "New",       proposal: null },
  { biz: "Oakwood Dental",       person: "James Carter",    prop: "commercial",  stage: "site_survey",      status: "Survey",    proposal: null },
  { biz: "Summit Auto Body",     person: "Dylan Reed",      prop: "commercial",  stage: "proposal",         status: "Proposal",  proposal: "draft" },
  { biz: "Harbor Coffee Co",     person: "Priya Nair",      prop: "commercial",  stage: "proposal",         status: "Sent",      proposal: "sent" },
  { biz: "Lakeside Residence",   person: "Evan Brooks",     prop: "residential", stage: "approval_deposit", status: "Signed",    proposal: "sent" },
  { biz: "Granite Fitness",      person: "Alex Morgan",     prop: "commercial",  stage: "schedule",         status: "Scheduled", proposal: "sent" },
  { biz: "Cedar Pharmacy",       person: "Sofia Ramirez",   prop: "commercial",  stage: "install",          status: "Install",   proposal: "sent" },
  { biz: "Maple Street Market",  person: "Noah Bennett",    prop: "commercial",  stage: "completion",       status: "Complete",  proposal: "sent" },
];

const fakeAddress = (i) => `${100 + i * 10} Demo ${["Street", "Avenue", "Boulevard", "Lane", "Court", "Way", "Drive", "Plaza"][i % 8]}, Springfield, IL 6270${i % 10}`;
const fakeEmail = (person) => `${String(person).toLowerCase().replace(/[^a-z]+/g, ".")}@${DEMO_DOMAIN}`;
const fakePhone = (i) => `(555) 010-${String(i).padStart(4, "0")}`; // 555-01xx reserved fictional range

function upsertEnv(kv) {
  let txt = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  for (const [k, v] of Object.entries(kv)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    if (re.test(txt)) txt = txt.replace(re, line);
    else txt += (txt && !txt.endsWith("\n") ? "\n" : "") + line + "\n";
  }
  fs.writeFileSync(ENV_PATH, txt, { encoding: "utf8" });
}

(async () => {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data with NODE_ENV=production. Localhost only."); process.exit(1);
  }
  const m = await import("../lib/db.js");
  const h = m.sqliteHandle();
  console.log(`[seed] DB: ${m.getDbPath ? m.getDbPath() : path.join(m.dbDir(), "dashboard.db")}`);

  // 1) Idempotency: remove any existing [JOURNEY-TEST] projects + their demo customers first.
  const existing = h.prepare("SELECT access_id FROM projects WHERE source = ?").all(DEMO_SOURCE).map((r) => r.access_id);
  if (existing.length) {
    const ph = existing.map(() => "?").join(",");
    h.prepare(`DELETE FROM proposals WHERE project_access_id IN (${ph})`).run(...existing);
    h.prepare(`DELETE FROM projects WHERE access_id IN (${ph})`).run(...existing);
    console.log(`[seed] cleared ${existing.length} pre-existing ${TAG} project(s)`);
  }
  h.prepare(`DELETE FROM users WHERE email LIKE ? AND role = 'customer'`).run(`%@${DEMO_DOMAIN}`);

  // 2) Demo ADMIN account (separate from the owner). Strong random password — never printed.
  const password = crypto.randomBytes(24).toString("base64url"); // ~32 chars, mixed classes
  const found = m.getUserByEmail(ADMIN_EMAIL);
  if (found) {
    m.resetUserPassword(found.id, password);
    if (found.role !== "admin") m.setUserRole(found.id, "admin");
    console.log(`[seed] demo admin exists → password reset (role: admin)`);
  } else {
    m.createStaffUser({ name: "Demo Admin", email: ADMIN_EMAIL, role: "admin", password });
    console.log(`[seed] demo admin created (role: admin)`);
  }
  upsertEnv({ TEST_ADMIN_EMAIL: ADMIN_EMAIL, TEST_ADMIN_PASSWORD: password, EMAIL_DISABLED: "1" });
  console.log(`[seed] wrote TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD (hidden) + EMAIL_DISABLED=1 to .env`);

  // 3) The 8 journey projects.
  const made = [];
  DEMO_PROJECTS.forEach((p, i) => {
    const company = `${TAG} ${p.biz}`;
    const { accessId } = m.createLeadProject(
      p.person, fakeEmail(p.person), fakePhone(i), fakeAddress(i),
      "Security Cameras", company, p.prop,
    );
    // Tag + stage + status (source is the authoritative cleanup key).
    h.prepare("UPDATE projects SET source = ?, status = ? WHERE access_id = ?").run(DEMO_SOURCE, p.status, accessId);
    if (p.stage !== "inquiry") m.updateStage(accessId, p.stage, "seed-demo");
    if (p.proposal) {
      m.saveProposalDraft(accessId, { payload: demoPayload(), taxRate: 8.25, depositPct: 50 }, "Demo Admin");
      if (p.proposal === "sent") m.markProposalSent(accessId, "Demo Admin");
    }
    if (p.stage === "completion") {
      h.prepare("UPDATE projects SET completed_at = datetime('now','localtime'), warranty_months = 12 WHERE access_id = ?").run(accessId);
    }
    made.push({ accessId, stage: p.stage, biz: p.biz });
  });

  console.log(`[seed] created ${made.length} ${TAG} projects:`);
  made.forEach((x) => console.log(`        ${x.accessId}  ${x.stage.padEnd(16)}  ${x.biz}`));
  console.log(`[seed] done. Log in at http://localhost:3100/login as ${ADMIN_EMAIL} (password in .env).`);
  process.exit(0);
})().catch((e) => { console.error("[seed] FAILED:", e); process.exit(1); });
