// The Users & Roles role dropdown saves instantly on change — no "Save Role" button — and the actor
// authorizing the change is resolved with the fresh DB role (a just-promoted admin can manage users).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const client = readFileSync(new URL("../app/users/users-client.jsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/users/actions.js", import.meta.url), "utf8");

test("the role select autosaves on change, with no Save Role button", () => {
  assert.ok(!client.includes("Save Role"), "the Save Role button is gone");
  assert.ok(client.includes("onChange={(e) => saveRole(e.target.value)}"), "changing the dropdown saves immediately");
  assert.ok(client.includes("function saveRole(next)") && client.includes("updateRoleAction(user.id, next)"), "saveRole persists the pick");
  assert.ok(client.includes('if (res.error) { setErr(res.error); setRole(user.role); }'), "reverts to the stored role on error");
  assert.ok(client.includes("setUser((u) => ({ ...u, role: next }))"), "reflects the saved role in the row");
});

test("updateRoleAction authorizes the actor with the fresh DB role", () => {
  assert.ok(actions.includes("withFreshRole(await parseToken(token))"), "getActor resolves the actor's current role");
  assert.ok(/updateRoleAction\(targetId, newRole\) \{\s*const actor = await getActor\(\);/.test(actions), "updateRoleAction uses getActor (fresh role), not the raw token");
});
