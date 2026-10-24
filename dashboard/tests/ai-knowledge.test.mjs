// Phase 3.1 — approved-knowledge (FAQ) retrieval. The retriever is PURE (articles injected), so these prove
// the relevance bar (strong match answers; weak/unrelated stays null → "I don't have that"), the title>cat>body
// weighting, the pinned tie-break, that the snippet is a slice of the REAL body (never invented), and that the
// audience tag rides through so the server links to the right library (the no-leak discipline).
import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, bodyText, scoreArticle, snippetOf, findKnowledge } from "../lib/ai-knowledge.js";

const ARTICLES = [
  { id: 1, title: "Reset your camera password", body: "To reset the password on your camera, hold the reset button for 10 seconds, then set a new password in the app.", category: "Cameras", kind: "article", pinned: 0, audience: "customer" },
  { id: 2, title: "Warranty coverage", body: "Equipment is covered by a limited warranty for 12 months from the completion date. Labor is covered for 90 days.", category: "Billing", kind: "article", pinned: 1, audience: "customer" },
  { id: 3, title: "NVR hard drive replacement", body: "Power down the recorder, remove the cover, and swap the SATA drive. Only a certified technician should open the NVR.", category: "Service", kind: "article", pinned: 0, audience: "tech" },
];

test("tokenize drops stopwords + short words and dedupes", () => {
  assert.deepEqual(tokenize("How do I reset the camera password?"), ["reset", "camera", "password"]);
  assert.deepEqual(tokenize("warranty warranty WARRANTY"), ["warranty"]);
  assert.deepEqual(tokenize("is it on?"), []);   // all stop/short → nothing to match on
});

test("findKnowledge returns the best STRONG match with a real-body snippet", () => {
  const hit = findKnowledge("how long is the warranty on my equipment", { articles: ARTICLES });
  assert.ok(hit, "a multi-term question about warranty should match");
  assert.equal(hit.id, 2);
  assert.equal(hit.audience, "customer");              // tag rides through → server links to /support
  assert.match(hit.snippet, /limited warranty for 12 months/);  // snippet is a slice of the stored body
  // The snippet must be a substring of the real body text — never generated.
  assert.ok(bodyText(ARTICLES[1]).includes(hit.snippet.replace(/^…|…$/g, "")));
});

test("findKnowledge weights title over body; single incidental word does NOT answer", () => {
  // "password" hits article 1's title (strong, single-term title hit allowed).
  assert.equal(findKnowledge("password", { articles: ARTICLES }).id, 1);
  // "button" appears only in article 1's body as one word of an unrelated 1-term query → no title/cat hit → null.
  assert.equal(findKnowledge("button", { articles: ARTICLES }), null);
  // A 3-term question that only grazes one incidental body word stays null (coverage guard).
  assert.equal(findKnowledge("where is the cover screw", { articles: ARTICLES }), null);
});

test("unrelated question → null (assistant says 'I don't have that', never invents)", () => {
  assert.equal(findKnowledge("what time do you close on saturday", { articles: ARTICLES }), null);
  assert.equal(findKnowledge("", { articles: ARTICLES }), null);
  assert.equal(findKnowledge("reset password", { articles: [] }), null);
});

test("audience is the CALLER's scope: a customer-only set can never surface a tech article", () => {
  const customerOnly = ARTICLES.filter((a) => a.audience === "customer");
  // A question that would best match the tech NVR article finds nothing in a customer-scoped set.
  assert.equal(findKnowledge("how do I replace the NVR hard drive", { articles: customerOnly }), null);
  // The same question against the tech set resolves to the tech article (tagged tech → /tech-support).
  const techOnly = ARTICLES.filter((a) => a.audience === "tech");
  const hit = findKnowledge("how do I replace the NVR hard drive", { articles: techOnly });
  assert.equal(hit.id, 3);
  assert.equal(hit.audience, "tech");
});

test("pinned breaks a score tie", () => {
  const tie = [
    { id: 10, title: "Deposit terms", body: "A deposit secures your schedule.", category: "Billing", pinned: 0, audience: "customer" },
    { id: 11, title: "Deposit terms", body: "A deposit secures your schedule.", category: "Billing", pinned: 1, audience: "customer" },
  ];
  assert.equal(findKnowledge("deposit terms", { articles: tie }).id, 11);
});

test("bodyText flattens a guide's JSON body so a guide can still match + snippet", () => {
  const guide = { id: 20, title: "Mobile app setup", kind: "guide", category: "Getting Started", pinned: 1,
    body: JSON.stringify({ intro: "Install the mobile app and sign in.", steps: [{ title: "Download", caption: "Get it from the App Store." }] }) };
  assert.match(bodyText(guide), /Install the mobile app .* App Store/);
  assert.equal(findKnowledge("how do I set up the mobile app", { articles: [guide] }).id, 20);
  assert.equal(scoreArticle(guide, tokenize("mobile app")).matched, 2);
  assert.ok(snippetOf(guide, tokenize("mobile")).length > 0);
});
