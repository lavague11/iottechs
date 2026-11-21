// Stage 5 items 3, 4 and 9 of docs/customer-flow-v2.md — the customer emails that fire because a DATE
// arrived. lib/email.js can't be imported outside Next (extensionless ./db), so the sweep's wiring is
// read from source; its arithmetic is exercised directly.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { milestoneDueAt, halfwayReached } from "../lib/milestone-due.js";
import { priceLockWindow, PRICE_LOCK_DAYS } from "../lib/proposal.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const sweep = read("../lib/customer-flow-sweep.js");

test("the ledger, not the arithmetic, is what makes a sweep email unrepeatable", () => {
  // A sweep is the thing most likely to run twice: overlapping timers, a manual cron hit, two instances.
  const claims = [...sweep.matchAll(/onceForProject\(job\.access_id, ([^,]+),/g)].map((m) => m[1]);
  assert.ok(claims.length >= 4, "every send is claimed");
  assert.ok(!/sendCustomerEmail\(/.test(sweep.replace(/onceForProject\([\s\S]*?\n  \}\);/g, "")) ||
    sweep.indexOf("onceForProject") < sweep.indexOf("sendCustomerEmail"), "nothing sends outside a claim");
  for (const k of ['"quote_expiring"', '"quote_expired"', '"signed_unpaid_2d"'])
    assert.ok(sweep.includes(k), `${k} has its own key`);
  assert.match(sweep, /milestone_due:\$\{m\.idx\}/, "a milestone's key names the installment");
});

test("item 3: two days before, then once on expiry, then nothing", () => {
  const now = Date.UTC(2026, 0, 10);
  const sentAt = new Date(now - 6 * 864e5).toISOString();      // 6 days ago → 1 day left
  const w = priceLockWindow({ status: "sent", sent_at: sentAt }, {}, { now });
  assert.equal(PRICE_LOCK_DAYS, 7);
  assert.ok(w.active && !w.expired, "still inside the window");
  assert.ok(w.until - now <= 2 * 864e5, "and inside the 2-day warning");
  const gone = priceLockWindow({ status: "sent", sent_at: new Date(now - 9 * 864e5).toISOString() }, {}, { now });
  assert.ok(gone.expired && gone.priceExpired);
  // Signed or paid ends the window entirely — no expiry mail to someone who already committed.
  assert.ok(!priceLockWindow({ status: "sent", sent_at: sentAt, signed_name: "Pat" }, {}, { now }).active);
  assert.ok(!priceLockWindow({ status: "sent", sent_at: sentAt }, {}, { paid: 500, now }).active);
  // The spec's "nothing after that": the only keys are the two.
  assert.ok(!/quote_expired:r\d|quote_final/.test(sweep), "no third chase after expiry");
});

test("item 9: when each kind of installment becomes due", () => {
  assert.equal(milestoneDueAt("begin", { installStart: 5 }), null, "the deposit is the signing email's job");
  assert.equal(milestoneDueAt("halfway", { halfwayAt: 900, installStart: 100 }), 900, "half the lines done");
  assert.equal(milestoneDueAt("halfway", { installStart: 100 }), 100, "else install start (a 2-line job)");
  assert.equal(milestoneDueAt("completion", { signoffAt: 42 }), 42, "sign-off, not install");
  assert.equal(milestoneDueAt("completion", {}), null, "never due before sign-off");
  assert.ok(milestoneDueAt("date", { dueDate: "2026-12-01" }) > 0);
  assert.equal(milestoneDueAt("date", {}), null);
});

test("item 9: reminders at 2 and 5 days, and a reminder never precedes what it reminds of", () => {
  assert.match(sweep, /after: 2 \* DAY/, "first reminder at 2 days");
  assert.match(sweep, /after: 5 \* DAY/, "second at 5");
  assert.match(sweep, /isFinal \? \[\{ k: `\$\{key\}:r2`/, "the 5-day one is final-balance only");
  assert.match(sweep, /if \(st\.after > 0 && !customerEmailSent\(job\.access_id, key\)\) continue;/,
    "a reminder only goes out if the original did");
  assert.match(sweep, /\(\+fin\.balance \|\| 0\) <= 0\.005\) return 0;/, "a paid job is never chased");
});

test("item 9 replaced the invoice reminders rather than running beside them", () => {
  const inv = read("../lib/invoice-emails.js");
  assert.match(inv, /const INVOICE_REMINDERS_ENABLED = false;/, "the old 3-day / due-date pair is off");
  assert.match(inv, /reminder: "pre"/, "…but kept, so re-enabling is one line");
});

test("the sweep is scheduled and reachable, and the route is protected", () => {
  const instr = read("../instrumentation.js");
  assert.match(instr, /sweepCustomerFlowEmails/, "runs from the boot scheduler");
  assert.match(instr, /setInterval\(sweepCustomerFlow, 60 \* 60 \* 1000\)/, "hourly");
  const route = read("../app/api/cron/customer-flow/route.js");
  assert.match(route, /user\?\.role === "admin" \|\| \(key && provided && provided === key\)/, "admin or CRON_KEY");
  assert.match(route, /return new Response\("Forbidden", \{ status: 403 \}\)/);
});

test("halfway: a job of 2 lines or fewer has no halfway point", () => {
  const line = (status, at) => ({ key: Math.random(), state: { status, status_at: at } });
  assert.equal(halfwayReached([line("complete"), line("complete")]).reached, false, "2 lines → install start instead");
  assert.equal(halfwayReached([line("complete"), line("complete")]).reason, "too-few-lines");
  const four = [line("complete", "2026-01-02 10:00:00"), line("complete", "2026-01-03 09:00:00"), line("incomplete"), line("incomplete")];
  const h = halfwayReached(four);
  assert.equal(h.reached, true, "2 of 4 is halfway");
  assert.equal(new Date("2026-01-03T09:00:00").getTime(), h.at, "dated by the LAST line that got it there");
  assert.equal(halfwayReached([line("complete"), line("incomplete"), line("incomplete"), line("incomplete")]).reached, false);
  // Child lines don't count toward the total — they are parts of a parent, not work in their own right.
  assert.equal(halfwayReached([line("complete"), line("complete"), { parentKey: "x", state: { status: "incomplete" } }]).reason, "too-few-lines");
});
