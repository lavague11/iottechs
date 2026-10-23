// Global command center — the app-wide navigation map (lib/ai-global.js). Pure + zero-token: phrase → app
// route. Project opens / in-project sections are handled by the shared interpreter in aiGlobalInterpretAction.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppRoute, looksLikeNav, looksLikeEdit, APP_ROUTES } from "../lib/ai-global.js";

test("resolveAppRoute maps common phrasings to the real staff routes", () => {
  const cases = [
    ["go to tickets", "/tickets"],
    ["open the inventory", "/inventory"],
    ["show me customers", "/customers"],
    ["take me to finances", "/finances"],
    ["expenses", "/expenses"],
    ["show outstanding invoices", "/receivables"],
    ["unpaid balances", "/receivables"],
    ["the sales pipeline", "/sales"],
    ["service calls", "/service-calls"],
    ["action center", "/operations"],
    ["open the dev roadmap", "/dev"],
    ["technicians", "/tech"],
    ["pcp ledger", "/pcp"],
    ["hiring", "/hiring"],
  ];
  for (const [phrase, href] of cases) assert.equal(resolveAppRoute(phrase)?.href, href, phrase);
  assert.equal(resolveAppRoute("rewrite the camera description"), null, "a proposal edit is not an app route");
  assert.equal(resolveAppRoute("open Crazy Cars"), null, "a project name is not an app route");
});

test("every app route has a label and a real-looking href", () => {
  for (const r of APP_ROUTES) { assert.ok(r.label && typeof r.label === "string"); assert.match(r.href, /^\/[a-z]/); assert.ok(r.re instanceof RegExp); }
});

test("looksLikeNav distinguishes navigation from create/edit", () => {
  for (const t of ["open crazy cars", "go to tickets", "take me to the proposal", "where are my invoices", "show me customers", "find the declutter account"]) assert.ok(looksLikeNav(t), t);
  for (const t of ["add 8 cameras at $300", "rewrite the description", "15% discount"]) assert.ok(!looksLikeNav(t), t);
});

test("looksLikeEdit flags proposal-edit phrasings so the global bar can send them to the proposal", () => {
  for (const t of ["can you rename a camera", "rename the cameras", "rewrite the camera description", "add a camera", "give a discount on the proposal", "change the nvr price"]) assert.ok(looksLikeEdit(t), t);
  for (const t of ["open tickets", "go to customers", "show me the inventory", "take me to the proposal"]) assert.ok(!looksLikeEdit(t), t);
});
