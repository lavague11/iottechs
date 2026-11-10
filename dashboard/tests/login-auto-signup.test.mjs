// /login — an unknown email/phone at the Continue step routes straight into creating an account
// (prefilled), instead of dead-ending on an error. Source-level: login actions touch auth + cookies.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const actions = readFileSync(new URL("../app/login/actions.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../app/login/login-client.jsx", import.meta.url), "utf8");

test("lookupAccountAction: unknown identifier → newAccount (not an error); disabled still errors", () => {
  assert.ok(actions.includes("if (user && user.disabled) return { error:"), "a disabled account is still refused");
  assert.ok(/if \(!user\)[\s\S]*newAccount: true/.test(actions), "no account on file → newAccount instead of the dead-end error");
  assert.ok(actions.includes('email: isEmail ? id : ""') && actions.includes('phone: isEmail ? "" : id'), "hands back what they typed so the create step can prefill it");
});

test("the client opens the create-account step, prefilled, on newAccount", () => {
  assert.ok(client.includes("if (r?.newAccount)") && client.includes('setMode("signup")') && client.includes("setNewAcct(true)"), "routes an unknown identifier into signup");
  assert.ok(client.includes("email: r.email || p.email") && client.includes("phone: r.phone ? suPhone(r.phone)"), "prefills the typed email/phone");
  assert.ok(client.includes("No account yet for that"), "explains why they're on the create step");
});

test("account creation accepts email OR phone (no longer forces both)", () => {
  assert.ok(client.includes("if (!hasEmail && !hasPhone)") && client.includes('setError("Enter an email or phone number.")'), "at least one of email/phone, not both");
  assert.ok(actions.includes("if (!email && !phone) return { error:"), "signupAction already allowed email-or-phone");
});
