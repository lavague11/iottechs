// scripts/clean-demo.js — remove everything the demo seed created, and nothing else.
//
// Deletes ONLY rows tagged by seed-demo.js:
//   • projects where source = 'journey-test'  (+ their child rows in any table keyed by access_id)
//   • demo customers with @journey-test.local emails
// The demo ADMIN account and .env are left in place so you can re-seed instantly (pass --all to also
// remove the demo admin). Real customer data is never matched.
//
//   node scripts/clean-demo.js          # delete tagged demo data
//   node scripts/clean-demo.js --dry    # preview what would be deleted, change nothing
//   node scripts/clean-demo.js --all    # also delete the demo admin account

"use strict";
process.env.EMAIL_DISABLED = "1";

const path = require("node:path");

const DEMO_SOURCE = "journey-test";
const DEMO_DOMAIN = "journey-test.local";
const ADMIN_EMAIL = `demo-admin@${DEMO_DOMAIN}`;
const DRY = process.argv.includes("--dry");
const ALL = process.argv.includes("--all");
const SANITY_MAX = 30; // the seed makes 8; refuse to run if far more match (guards against a logic bug)

(async () => {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run against NODE_ENV=production. Localhost only."); process.exit(1);
  }
  const m = await import("../lib/db.js");
  const h = m.sqliteHandle();
  console.log(`[clean] DB: ${m.getDbPath ? m.getDbPath() : path.join(m.dbDir(), "dashboard.db")}${DRY ? "  (DRY RUN)" : ""}`);

  const demoIds = h.prepare("SELECT access_id FROM projects WHERE source = ?").all(DEMO_SOURCE).map((r) => r.access_id);
  const demoCustomers = h.prepare(`SELECT id, email FROM users WHERE email LIKE ? AND role = 'customer'`).all(`%@${DEMO_DOMAIN}`);

  if (demoIds.length > SANITY_MAX) {
    console.error(`[clean] ABORT: ${demoIds.length} projects matched source='${DEMO_SOURCE}' (max ${SANITY_MAX}). Not deleting — inspect first.`);
    process.exit(1);
  }
  console.log(`[clean] matched ${demoIds.length} demo project(s), ${demoCustomers.length} demo customer(s)${ALL ? ", + demo admin" : ""}`);
  demoIds.forEach((id) => console.log(`        project ${id}`));

  if (!demoIds.length && !demoCustomers.length && !ALL) { console.log("[clean] nothing to remove."); process.exit(0); }

  if (DRY) {
    // Report child-row counts without deleting.
    if (demoIds.length) {
      const ph = demoIds.map(() => "?").join(",");
      const tables = h.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
      for (const t of tables) {
        if (t === "projects") continue;
        const cols = h.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
        const col = cols.includes("project_access_id") ? "project_access_id" : (cols.includes("access_id") ? "access_id" : null);
        if (!col) continue;
        const n = h.prepare(`SELECT COUNT(*) c FROM ${t} WHERE ${col} IN (${ph})`).get(...demoIds).c;
        if (n) console.log(`        would delete ${n} row(s) from ${t}`);
      }
    }
    console.log("[clean] DRY RUN — no changes made."); process.exit(0);
  }

  const tx = h.prepare("BEGIN"); tx.run();
  try {
    let childTotal = 0;
    if (demoIds.length) {
      const ph = demoIds.map(() => "?").join(",");
      const tables = h.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
      for (const t of tables) {
        if (t === "projects") continue;
        const cols = h.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
        const col = cols.includes("project_access_id") ? "project_access_id" : (cols.includes("access_id") ? "access_id" : null);
        if (!col) continue;
        const info = h.prepare(`DELETE FROM ${t} WHERE ${col} IN (${ph})`).run(...demoIds);
        childTotal += Number(info.changes || 0);
      }
      h.prepare(`DELETE FROM projects WHERE access_id IN (${ph})`).run(...demoIds);
    }
    for (const c of demoCustomers) h.prepare("DELETE FROM users WHERE id = ?").run(c.id);
    if (ALL) h.prepare("DELETE FROM users WHERE email = ?").run(ADMIN_EMAIL);
    h.prepare("COMMIT").run();
    console.log(`[clean] deleted ${demoIds.length} project(s), ${childTotal} child row(s), ${demoCustomers.length} customer(s)${ALL ? ", demo admin" : ""}.`);
    if (!ALL) console.log(`[clean] demo admin (${ADMIN_EMAIL}) left in place — re-run seed-demo.js to repopulate.`);
  } catch (e) {
    try { h.prepare("ROLLBACK").run(); } catch {}
    console.error("[clean] FAILED, rolled back:", e); process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error("[clean] FAILED:", e); process.exit(1); });
