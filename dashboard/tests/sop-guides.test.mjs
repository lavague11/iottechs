// Guides / SOP lifecycle: draft → save → publish → edit → remove → restore.
// The SQL is EXECUTED (schema and statements lifted out of lib/db.js, so a rename breaks the test
// rather than silently passing), and the gates around it are asserted at the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");
const actions = read("../app/tools/sop-builder/actions.js");
const builder = read("../app/tools/sop-builder/sop-builder.jsx");
const persist = read("../app/tools/sop-builder/sop-persist.js");
const library = read("../app/tools/sop-builder/sop-library.jsx");
const capture = read("../app/tools/sop-builder/sop-capture.jsx");
const guides = read("../app/guides/guides-client.jsx");
const guidesPage = read("../app/guides/page.jsx");

// The real DDL for the three SOP tables, pulled from db.js.
function ddl(name) {
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n    \\)`).exec(db);
  assert.ok(m, `${name} DDL found`);
  return m[0];
}
// The body of an exported function, so statements can be lifted from the one that owns them.
function fnBody(src, name) {
  const i = src.indexOf(`export function ${name}`);
  assert.ok(i >= 0, `${name} exported`);
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}
// Every db.prepare("…") SQL string inside a function body, in order.
function sqlIn(body) {
  return [...body.matchAll(/db\.prepare\(\s*(["'`])([\s\S]*?)\1\s*\)/g)].map((m) => m[2].trim());
}

function fresh() {
  const d = new DatabaseSync(":memory:");
  d.exec(ddl("sops"));
  d.exec(ddl("sop_steps"));
  d.exec(ddl("sop_versions"));
  return d;
}
// A guide at a given status, with one step and (when published) a snapshot.
function seed(d, { id = "s1", status = "draft", version = 0, owner = 7, published = null, updated = "2026-01-01 10:00:00" } = {}) {
  d.prepare("INSERT INTO sops (id, slug, title, status, version, created_by_id, published_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, status === "published" ? `g-${id}` : null, "Reset the NVR", status, version, owner, published, updated);
  d.prepare("INSERT INTO sop_steps (id, sop_id, position, title) VALUES (?,?,?,?)").run(`${id}-a`, id, 0, "Open the panel");
  if (version > 0) d.prepare("INSERT INTO sop_versions (sop_id, version, snapshot) VALUES (?,?,?)").run(id, version, "{}");
  return id;
}

/* ---------------- archive is not a delete ---------------- */

test("archiveSop hides the guide everywhere but keeps the row, its steps and its snapshots", () => {
  const d = fresh();
  seed(d, { status: "published", version: 2, published: "2026-01-01 09:00:00" });
  const [update] = sqlIn(fnBody(db, "archiveSop"));
  assert.match(update, /UPDATE sops SET status='archived'/);
  assert.ok(d.prepare(update).run("s1").changes > 0);

  const row = d.prepare("SELECT * FROM sops WHERE id='s1'").get();
  assert.equal(row.status, "archived");
  assert.ok(row.archived_at, "archived_at stamped");
  assert.equal(row.slug, "g-s1", "slug kept, so a restore brings the same URL back");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sop_steps WHERE sop_id='s1'").get().n, 1, "steps kept");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sop_versions WHERE sop_id='s1'").get().n, 1, "published snapshot kept");

  // Gone from the public library AND from its own public URL (both require status='published').
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sops WHERE status='published'").get().n, 0);
  assert.equal(d.prepare("SELECT * FROM sops WHERE slug='g-s1' AND status='published'").get(), undefined);
});

test("archiveSop is a no-op on an already archived guide (Undo can't be double-fired into a wrong state)", () => {
  const d = fresh();
  seed(d, { status: "archived" });
  const [update] = sqlIn(fnBody(db, "archiveSop"));
  assert.equal(d.prepare(update).run("s1").changes, 0);
});

test("restoreSop returns a published guide to published and a never-published one to draft", () => {
  const d = fresh();
  seed(d, { id: "pub", status: "archived", version: 3 });
  seed(d, { id: "drf", status: "archived", version: 0 });
  const [select, update] = sqlIn(fnBody(db, "restoreSop"));
  for (const id of ["pub", "drf"]) {
    const s = d.prepare(select).get(id);
    assert.ok(s, `${id} found as archived`);
    d.prepare(update).run((s.version || 0) > 0 ? "published" : "draft", id);
  }
  assert.equal(d.prepare("SELECT status FROM sops WHERE id='pub'").get().status, "published");
  assert.equal(d.prepare("SELECT status FROM sops WHERE id='drf'").get().status, "draft");
  assert.equal(d.prepare("SELECT archived_at FROM sops WHERE id='pub'").get().archived_at, null);
});

test("archive and restore leave updated_at alone, so the unpublished-changes signal stays honest", () => {
  const archive = fnBody(db, "archiveSop"), restore = fnBody(db, "restoreSop");
  assert.ok(!/UPDATE sops SET[^"'`]*updated_at/.test(archive), "archive must not touch updated_at");
  assert.ok(!/UPDATE sops SET[^"'`]*updated_at/.test(restore), "restore must not touch updated_at");
});

test("no hard delete is reachable: deleteSop exists but nothing imports or calls it", () => {
  assert.ok(db.includes("export function deleteSop"), "kept for a future audited purge");
  assert.ok(!/deleteSop/.test(actions), "server actions never import or call it");
  for (const [n, src] of [["builder", builder], ["persist", persist], ["library", library]]) assert.ok(!/deleteSop/.test(src), `${n} never calls it`);
  assert.ok(/archiveSop/.test(actions) && /restoreSop/.test(actions));
});

/* ---------------- who may write ---------------- */

test("every SOP write action runs the owner gate, and reads stay open to staff", () => {
  assert.ok(/function mayWrite\(u, id\)/.test(actions));
  assert.ok(/if \(isManager\(u\)\) return true;/.test(actions), "admin/manager may write any guide");
  assert.ok(/if \(owner === undefined\) return true;/.test(actions), "a brand-new id is a create, not a takeover");
  for (const fn of ["saveSopDraftAction", "archiveSopAction", "archiveSopBySlugAction", "restoreSopAction", "publishSopAction"]) {
    const i = actions.indexOf(`export async function ${fn}`);
    assert.ok(i >= 0, `${fn} exists`);
    const body = actions.slice(i, actions.indexOf("\nexport async function", i + 10) >>> 0 || undefined);
    assert.ok(/mayWrite\(u,/.test(body.slice(0, 700)), `${fn} checks mayWrite`);
  }
  // The gate must sit BEFORE the write in the one action that creates as well as updates.
  const save = actions.slice(actions.indexOf("export async function saveSopDraftAction"));
  assert.ok(save.indexOf("mayWrite") < save.indexOf("saveSopDraft("), "gate precedes the write");
});

test("publishing an archived guide is refused in the engine, not just the UI", () => {
  assert.ok(/if \(sop\.status === "archived"\) throw new Error/.test(fnBody(db, "publishSop")));
});

/* ---------------- published vs. draft ---------------- */

test("listSops flags a published guide whose draft has moved on since it was published", () => {
  const d = fresh();
  seed(d, { id: "clean", status: "published", version: 1, published: "2026-02-01 10:00:00", updated: "2026-02-01 10:00:00" });
  seed(d, { id: "dirty", status: "published", version: 1, published: "2026-02-01 10:00:00", updated: "2026-02-03 11:30:00" });
  const dirty = (id) => {
    const s = d.prepare("SELECT * FROM sops WHERE id=?").get(id);
    return s.status === "published" && !!s.published_at && String(s.updated_at || "") > String(s.published_at);
  };
  assert.equal(dirty("clean"), false);
  assert.equal(dirty("dirty"), true);
  // The same expression ships in listSops, so the library and the editor can't disagree.
  assert.ok(/dirty: s\.status === "published" && !!s\.published_at && String\(s\.updated_at \|\| ""\) > String\(s\.published_at\)/.test(db));
});

test("listSops archived:true returns the removed guides instead of the live ones", () => {
  const d = fresh();
  seed(d, { id: "live", status: "published", version: 1 });
  seed(d, { id: "gone", status: "archived" });
  const pick = (archived) => d.prepare(`SELECT id FROM sops WHERE ${archived ? "status='archived'" : "status!='archived'"}`).all().map((r) => r.id);
  assert.deepEqual(pick(false), ["live"]);
  assert.deepEqual(pick(true), ["gone"]);
  assert.ok(/const test = archived \? "status='archived'" : "status!='archived'"/.test(db));
});

/* ---------------- the editor saves what it shows ---------------- */

test("the autosave payload carries every field a step round-trips, `kind` included", () => {
  const m = /export const stepOut = \(s\) => \(\{([\s\S]*?)\}\);/.exec(persist);
  assert.ok(m, "one shared step-out shape");
  for (const f of ["id", "title", "instruction", "target", "where", "img", "enh", "useEnh", "video", "kind", "tags"]) {
    assert.ok(new RegExp(`\\b${f}:`).test(m[1]), `${f} is saved`);
  }
  // And it is the ONLY shape sent, so publish can't quietly save a different one.
  assert.equal((persist.match(/steps: [a-z]+\.steps\.map\(stepOut\)/g) || []).length >= 1, true);
  assert.ok(!/steps: sop\.steps\.map\(\(s\) => \(\{ id: s\.id/.test(builder + persist), "no second hand-rolled payload");
});

test("a pending autosave is flushed on leave and warned about on a tab close", () => {
  assert.ok(/addEventListener\("beforeunload", warn\)/.test(persist));
  assert.ok(/if \(pending\.current\) saveNowRef\.current\(pending\.current\)/.test(persist), "flush on unmount");
  const pub = builder.slice(builder.indexOf("async function doPublish"));
  const pubHead = pub.slice(0, pub.indexOf("publishSopAction("));
  assert.ok(/cancelPending\(\)/.test(pubHead) && /await saveNow\(sop\)/.test(pubHead),
    "publish cancels the pending autosave and writes the latest edits before freezing the snapshot");
});

test("the editor reports save state and says when a published guide is serving an older snapshot", () => {
  assert.ok(/saveState === "saving" \? "Saving…" : saveState === "saved" \? "Saved"/.test(builder));
  assert.ok(/Unpublished changes/.test(builder));
  assert.ok(/sop\.status === "published" \? \(pubDirty \? "Publish update" : "Republish"\) : "Publish"/.test(builder));
});

test("the un-built draft persists photo URLs only — never the image bytes", () => {
  assert.ok(/export const PRE_KEY = "sopb_pre_v1"/.test(persist));
  const m = /const keep = photos\.filter[\s\S]*?;\n/.exec(persist);
  assert.ok(m && !/dataUrl/.test(m[0]), "dataUrl bytes are never written to localStorage");
  assert.ok(/localStorage\.setItem\(PRE_KEY/.test(persist) && /localStorage\.removeItem\(PRE_KEY/.test(persist));
  assert.ok(/clearPre\(\)/.test(builder), "cleared once a real guide exists");
});

/* ---------------- destructive actions confirm, and never use a native dialog ---------------- */

test("no native confirm() anywhere in the guides surface — removal is a two-step in-page confirm", () => {
  assert.ok(!/\bconfirm\(/.test(builder), "builder uses inline confirms");
  assert.ok(!/\bconfirm\(/.test(guides), "guides cards use inline confirms");
  assert.ok(/ask === s\.id/.test(library) && /onAsk\(s\.id\)/.test(library), "library row asks before it removes");
  assert.ok(/askArch/.test(builder) && /onAsk=\{setAskArch\}/.test(builder), "the builder owns that state");
  assert.ok(/ask === s\.slug/.test(guides) && /setAsk\(s\.slug\)/.test(guides));
  assert.ok(/label: "Undo"/.test(builder) && /onClick=\{note\.undo\}/.test(guides), "both offer Undo");
});

test("guide cards show Edit/Delete only to someone allowed to write that guide, and leak no author id", () => {
  assert.ok(/editable: canBuild && \(manager \|\| \(ownerId != null && Number\(ownerId\) === Number\(user\.id\)\)\)/.test(guidesPage));
  assert.ok(/\.map\(\(\{ ownerId, \.\.\.s \}\) =>/.test(guidesPage), "ownerId is stripped before it reaches the browser");
  assert.ok(/\{s\.editable && \(/.test(guides));
  assert.ok(!/\{canBuild && \(\s*<div className="supl-acts"/.test(guides), "the flag alone no longer shows the controls");
});

test("a /guides card describes the PUBLISHED snapshot, not the draft that has moved past it", () => {
  const d = fresh();
  d.prepare("INSERT INTO sops (id, slug, title, status, version, visibility, published_at) VALUES ('g1','how-to','Draft title v2','published',1,'public','2026-03-01 09:00:00')").run();
  d.prepare("INSERT INTO sop_steps (id, sop_id, position, title, image_path) VALUES ('g1-a','g1',0,'New step','/api/media/new.jpg')").run();
  d.prepare("INSERT INTO sop_steps (id, sop_id, position, title) VALUES ('g1-b','g1',1,'Another new step')").run();
  d.prepare("INSERT INTO sop_versions (sop_id, version, snapshot) VALUES ('g1',1,?)")
    .run(JSON.stringify({ title: "Published title", business: "IOT", category: "Cameras", steps: [{ img: "/api/media/old.jpg" }] }));

  const row = d.prepare("SELECT * FROM sops WHERE id='g1'").get();
  const snap = JSON.parse(d.prepare("SELECT snapshot FROM sop_versions WHERE sop_id='g1' ORDER BY version DESC LIMIT 1").get().snapshot);
  const pub = snap.steps;
  assert.equal(snap.title || row.title, "Published title", "title comes from the snapshot");
  assert.equal(pub.length, 1, "step count is the snapshot's, not the draft's 2");
  assert.equal(pub.find((x) => x.img).img, "/api/media/old.jpg", "thumbnail is the published photo");

  // And the shape that ships does the same.
  const body = fnBody(db, "listPublishedSops");
  assert.ok(/title: snap\?\.title \|\| s\.title/.test(body));
  assert.ok(/steps: pub \? pub\.length :/.test(body), "falls back to the live count only without a snapshot");
  assert.ok(/ORDER BY version DESC LIMIT 1/.test(body));
});
