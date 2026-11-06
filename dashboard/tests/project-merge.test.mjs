// Project merge / duplicate / delete — the backend the project-card context menu drives. Source-level
// assertions (these touch the shared DB singleton, so functional coverage runs in an isolated-DB harness,
// not the shared suite process). Guards the invariants: older ID survives, BOTH proposals kept, non-destructive.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/projects/actions.js", import.meta.url), "utf8");

test("mergeProjects keeps the OLDER project and preserves BOTH proposal versions", () => {
  assert.ok(db.includes("export function mergeProjects"), "mergeProjects exists");
  assert.ok(db.includes("const [survivor, merged] = pa.id <= pb.id ? [pa, pb] : [pb, pa]"), "older project (lower id) survives — ID kept");
  // Carried proposals are renumbered after the survivor's max and marked superseded (kept as history).
  assert.ok(db.includes("SELECT MAX(version) AS v FROM proposals WHERE project_access_id=?") && db.includes("status='superseded', merged_from_project_id=?"), "both parties' proposal versions are preserved on the survivor as history");
  assert.ok(db.includes("UPDATE project_notes SET project_access_id=?") && db.includes("UPDATE media SET project_access_id=?") && db.includes("UPDATE project_events SET project_access_id=?") && db.includes("UPDATE sign_documents SET project_access_id=?"), "notes, files, log and signed PDFs move to the survivor");
  assert.ok(db.includes('db.exec("BEGIN")') && db.includes('db.exec("COMMIT")') && db.includes('db.exec("ROLLBACK")'), "the move is one transaction (node:sqlite BEGIN/COMMIT/ROLLBACK)");
  assert.ok(db.includes("archiveProject(mId, actor)"), "the merged shell is archived (recoverable), never hard-deleted");
  assert.ok(/kind: "merge"/.test(db), "the merge is logged on the survivor");
});

test("duplicateProject copies the customer + clones the proposal as a fresh draft", () => {
  assert.ok(db.includes("export function duplicateProject"), "duplicateProject exists");
  assert.ok(db.includes("customerId: p.customer_id") && db.includes("allowDuplicate: true"), "same customer, deliberate duplicate");
  assert.ok(db.includes('cloneProposal({ sourceProposalId: src.id, destAccessId: newId, actor: actor?.name'), "clones the active proposal (actor passed as a NAME string, not the object)");
});

test("duplicate flagging is conservative (same customer + address, not legit repeat business)", () => {
  assert.ok(db.includes("export function findLikelyDuplicateProjects"), "detector exists");
  assert.ok(db.includes("if (!addr) continue;") && db.includes("`${who}|${addr}`"), "groups by customer + normalized address (address required)");
  assert.ok(db.includes('g.every((p) => p.stage === "completion")'), "all-finished clusters are repeat business, not duplicates");
  assert.ok(db.includes("ar_archived_at IS NULL"), "archived/parked projects are excluded");
});

test("the card-menu server actions are role-gated and non-destructive", () => {
  assert.ok(actions.includes("export async function mergeProjectsAction") && /mergeProjectsAction[\s\S]*\["admin", "manager"\]\.includes\(user\.role\)/.test(actions), "merge is admin/manager only");
  assert.ok(actions.includes("export async function deleteProjectAction") && /deleteProjectAction[\s\S]*user\.role !== "admin"/.test(actions), "delete is admin only");
  assert.ok(actions.includes("export async function duplicateProjectAction") && actions.includes("export async function setProjectArchivedAction"), "duplicate + archive/restore actions exist");
  assert.ok(/deleteProjectAction[\s\S]*archiveProject\(accessId/.test(actions), "delete moves to /archives (recoverable), not a hard delete");
  assert.ok(actions.includes("createTicket(") , "merge/delete leave an audit ticket");
});
