// Expenses upgrade — the pure model (categories, validation, amount/date parsing, vendor colours, CSV,
// duplicate matching) is exercised functionally; the DB + action + route wiring is asserted at source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, ITEM_TYPES, SOURCES, SOURCE_DEFAULTS,
  vendorColor, normalizeCategory, normalizeDate, parseAmount, validateExpense,
  parseExpensesCSV, parseCSVText, CSV_TEMPLATE, softDuplicate, sameReference,
  shortenDescription,
} from "../lib/expense-model.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the fixed option lists are the required values", () => {
  assert.deepEqual(EXPENSE_CATEGORIES, ["Equipment", "Tools", "Cable & Materials", "Software/Subscriptions", "Vehicle & Fuel", "Tolls & Parking", "Insurance", "Labor/Subcontractor", "Office & Supplies", "Marketing", "Rent", "Other"]);
  assert.deepEqual(PAYMENT_METHODS, ["PayPal", "Amazon", "Home Depot", "Zelle", "Other"]);
  assert.equal(SOURCES.join(","), "PayPal,Amazon,Home Depot");
  assert.ok(ITEM_TYPES.includes("Camera") && ITEM_TYPES.includes("Connectors/Jacks") && ITEM_TYPES.includes("Ladder"));
  assert.equal(SOURCE_DEFAULTS.Amazon.vendor, "Amazon");
  assert.equal(SOURCE_DEFAULTS["Home Depot"].payment_method, "Home Depot");
});

test("normalizeCategory maps legacy values to the enum (unknown → Other, never deletes)", () => {
  assert.equal(normalizeCategory("Materials"), "Cable & Materials");
  assert.equal(normalizeCategory("Gas"), "Vehicle & Fuel");
  assert.equal(normalizeCategory("Payroll"), "Labor/Subcontractor");
  assert.equal(normalizeCategory("Operations"), "Other");
  assert.equal(normalizeCategory("Equipment"), "Equipment");       // already valid, unchanged
  assert.equal(normalizeCategory(""), "Other");
  assert.equal(normalizeCategory("Zzz"), "Other");
});

test("parseAmount handles $, commas, negatives and accounting parens; normalizeDate reads common formats", () => {
  assert.equal(parseAmount("$1,234.56"), 1234.56);
  assert.equal(parseAmount("(436.00)"), -436);       // accounting negative
  assert.equal(parseAmount("-55.22"), -55.22);       // refund
  assert.equal(parseAmount("abc"), null);
  assert.equal(normalizeDate("1/22/2026"), "2026-01-22");
  assert.equal(normalizeDate("2026-01-22"), "2026-01-22");
  assert.equal(normalizeDate("nope"), null);
});

test("validateExpense flags bad rows and cleans good ones", () => {
  const bad = validateExpense({ description: "", amount: "x", spent_on: "???" });
  assert.ok(bad.errors.description && bad.errors.amount && bad.errors.spent_on);
  const zero = validateExpense({ description: "x", amount: "0" });
  assert.ok(zero.errors.amount, "zero amount is invalid");
  const ok = validateExpense({ description: "Cam", amount: "$100.50", category: "Gas", vendor: "Annke", spent_on: "1/5/2026", payment_method: "paypal", item_type: "camera", source: "paypal" });
  assert.equal(Object.keys(ok.errors).length, 0);
  assert.deepEqual([ok.cleaned.amount, ok.cleaned.category, ok.cleaned.spent_on, ok.cleaned.payment_method, ok.cleaned.item_type], [100.5, "Vehicle & Fuel", "2026-01-05", "PayPal", "Camera"]);
});

test("vendorColor maps Annke / Amazon / Home Depot with readable text, else null", () => {
  assert.equal(vendorColor("Annke USA").key, "annke");
  assert.equal(vendorColor("安科").key, "annke");
  assert.equal(vendorColor("ZenGen Tech").key, "annke");
  assert.equal(vendorColor("AMAZON").bg, "#FFD814");
  assert.equal(vendorColor("The Home Depot").fg, "#ffffff");   // white text on orange
  assert.equal(vendorColor("Graybar"), null);
});

test("CSV parsing: template + quoted fields + case-insensitive headers", () => {
  const rows = parseExpensesCSV(CSV_TEMPLATE);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].vendor, "Annke");
  assert.equal(rows[1].reference, "114-2876562-1537803");
  const quoted = parseCSVText('a,b\n"x, y","he said ""hi"""');
  assert.deepEqual(quoted[1], ["x, y", 'he said "hi"']);
  const mixedHeader = parseExpensesCSV("Date,Description,Amount\n2026-01-01,Test,10");
  assert.equal(mixedHeader[0].description, "Test");
});

test("duplicate matching: same reference (hard) and same vendor+amount within ±1 day (soft)", () => {
  assert.ok(sameReference("PP-1", "pp-1"));
  assert.ok(!sameReference("", ""));
  const a = { vendor: "Annke", amount: 436, spent_on: "2026-01-22" };
  assert.ok(softDuplicate(a, { vendor: "annke", amount: 436, spent_on: "2026-01-23" }), "the two $436 Annke payments on adjacent days");
  assert.ok(!softDuplicate(a, { vendor: "Annke", amount: 436, spent_on: "2026-01-25" }), "3 days apart is not a soft dup");
  assert.ok(!softDuplicate(a, { vendor: "Amazon", amount: 436, spent_on: "2026-01-22" }), "different vendor");
});

test("shortenDescription collapses a multi-item receipt to first + (+N more); single items untouched", () => {
  assert.equal(shortenDescription("4K dome cameras"), "4K dome cameras");                 // single item unchanged
  assert.equal(shortenDescription("Cat6 cable; RJ45 jacks; power supply"), "Cat6 cable (+2 more)");
  assert.equal(shortenDescription("Drill\nBits\nScrews\nAnchors"), "Drill (+3 more)");     // newlines too
  assert.equal(shortenDescription("  spaced  "), "spaced");
  assert.equal(shortenDescription(""), "");
  const imported = parseExpensesCSV("date,description,amount\n2026-01-01,\"A; B; C\",10");
  assert.equal(imported[0].description, "A (+2 more)", "import shortens multi-item descriptions");
});

test("db + actions wire the new fields, batch import, and duplicate guard", () => {
  const db = read("../lib/db.js");
  assert.ok(db.includes("ADD COLUMN reference TEXT") && db.includes("ADD COLUMN item_type TEXT") && db.includes("ADD COLUMN source TEXT") && db.includes("ADD COLUMN receipt_media_id TEXT"), "schema migration adds the new columns");
  assert.ok(db.includes("export function addExpensesBatch") && db.includes('db.exec("BEGIN")'), "batch insert in a transaction");
  assert.ok(db.includes("export function findExpenseDuplicates") && db.includes("LOWER(TRIM(reference))=LOWER(TRIM(?))") && db.includes("ABS(amount - ?) < 0.005"), "duplicate finder (hard ref + soft vendor/amount/day)");
  assert.ok(db.includes("_normalizeExpenseCategory(category)") && db.includes("category IS NOT NULL"), "non-destructive category migration");
  const actions = read("../app/expenses/actions.js");
  assert.ok(actions.includes("export async function importExpensesAction") && actions.includes("addExpensesBatch"), "CSV batch import action");
  assert.ok(actions.includes('return { duplicate: "reference"') && actions.includes('return { duplicate: "soft"') && actions.includes("force"), "add guards duplicates unless forced");
});

test("receipt upload + serve are staff-gated", () => {
  const up = read("../app/api/receipt/route.js");
  assert.ok(up.includes('["admin", "manager"].includes(user.role)') && up.includes("10 * 1024 * 1024") && up.includes('kind: "receipt"'), "upload is staff-only, 10MB, stored as a receipt");
  const serve = read("../app/api/receipt/[id]/route.js");
  assert.ok(serve.includes('["admin", "manager", "sales", "tech"].includes(user.role)') && serve.includes('m.kind !== "receipt"'), "serve is gated to authenticated dashboard users");
});
