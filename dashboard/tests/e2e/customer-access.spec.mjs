// Customer View access — e2e (Issue 01). A customer opens a project link, enters the PIN, and the
// project must render — never Next's "This page couldn't load" card. Includes the confirmed regression:
// a SENT proposal with empty/missing options crashed ProposalCustomerView (opt.id / opt.services on an
// undefined option); it must now render the "Preparing…" state instead. Seeds its own throwaway data
// (POST /api/demo + a direct row), so it never touches real customer data and is order-independent.
import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";

// last-4 of this phone is the project's default customer PIN
const PHONE = "5550007788";
const PIN = "7788";

async function makeProject(request, suffix) {
  const res = await request.post("/api/demo", {
    data: { name: `E2E CustAccess ${suffix}`, phone: PHONE, email: `e2e-cv-${suffix}@example.com`,
            address: "2503 Jay Pl", service: "cctv", company: `E2E CV Co ${suffix}` },
  });
  expect(res.ok()).toBeTruthy();
  const j = await res.json();
  expect(j.ok).toBeTruthy();
  return j.accessId;
}

async function enterPin(page, pin) {
  await expect(page.getByText(/Enter your PIN/i)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500); // let the keypad hydrate on the dev server
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).first().click();
}

const NO_ERROR = async (page) => {
  // No Next error UI (prod card text) and no dev runtime-error overlay.
  await expect(page.getByText(/This page couldn.?t load/i)).toHaveCount(0);
  await expect(page.getByText(/A server error occurred/i)).toHaveCount(0);
  await expect(page.locator("#__next_error__")).toHaveCount(0);
};

test("happy path: fresh session + correct PIN renders the customer view (no error card)", async ({ page, request, context }) => {
  const accessId = await makeProject(request, "happy");
  await context.clearCookies();
  await page.goto(`/project/${accessId}`, { waitUntil: "domcontentloaded" });
  await enterPin(page, PIN);
  // Customer view header shows the business name; the role selector reads "Customer view".
  await expect(page.getByText("Customer view")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/E2E CV Co happy/)).toBeVisible();
  await NO_ERROR(page);
});

test("regression: a SENT proposal with empty options renders 'Preparing', not a crash", async ({ page, request, context }) => {
  const accessId = await makeProject(request, "empty-opts");
  // Seed the exact failing shape: a sent proposal whose payload has no options, at the proposal stage.
  const db = new DatabaseSync("./data/dashboard.db");
  db.exec("PRAGMA busy_timeout=5000");
  db.prepare("INSERT INTO proposals (project_access_id,version,status,payload,tax_rate,deposit_pct,sent_at,created_by_name) VALUES (?,?,?,?,?,?,datetime('now','localtime'),?)")
    .run(accessId, 1, "sent", '{"options":[]}', 0, 50, "E2E");
  db.prepare("UPDATE projects SET stage='proposal' WHERE access_id=?").run(accessId);
  db.close();

  await context.clearCookies();
  await page.goto(`/project/${accessId}`, { waitUntil: "domcontentloaded" });
  await enterPin(page, PIN);
  await expect(page.getByText("Customer view")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Preparing your proposal/i)).toBeVisible();
  await NO_ERROR(page);
});

test("regression: a real (populated) proposal renders the full customer view, not a crash", async ({ page, request, context }) => {
  const accessId = await makeProject(request, "real-prop");
  // A sent proposal WITH options/services exercises the full proposal render (past the empty-options
  // short-circuit) — the path that referenced the dropped `depositPct` and crashed every real customer.
  const db = new DatabaseSync("./data/dashboard.db");
  db.exec("PRAGMA busy_timeout=5000");
  const payload = JSON.stringify({ options: [{ id: "A", name: "Premium", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "nvr", name: "NVR", qty: 1, price: 150 }] }] }], payment_plan: "50_50", discount: { type: "flat", value: 0 } });
  db.prepare("INSERT INTO proposals (project_access_id,version,status,payload,tax_rate,deposit_pct,sent_at,created_by_name) VALUES (?,?,?,?,?,?,datetime('now','localtime'),?)")
    .run(accessId, 1, "sent", payload, 0, 50, "E2E");
  db.prepare("UPDATE projects SET stage='proposal' WHERE access_id=?").run(accessId);
  db.close();

  await context.clearCookies();
  await page.goto(`/project/${accessId}`, { waitUntil: "domcontentloaded" });
  await enterPin(page, PIN);
  await expect(page.getByText("Customer view")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Total Investment/i)).toBeVisible();   // the full proposal summary rendered (no depositPct ReferenceError)
  await NO_ERROR(page);
});

test("refresh after auth keeps the customer in (no re-gate, no error)", async ({ page, request, context }) => {
  const accessId = await makeProject(request, "refresh");
  await context.clearCookies();
  await page.goto(`/project/${accessId}`, { waitUntil: "domcontentloaded" });
  await enterPin(page, PIN);
  await expect(page.getByText("Customer view")).toBeVisible({ timeout: 30_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Customer view")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Enter your PIN/i)).toHaveCount(0); // not bounced back to the gate
  await NO_ERROR(page);
});

test("the internal staff directory is not shipped to the customer payload", async ({ page, request, context }) => {
  const accessId = await makeProject(request, "noleak");
  await context.clearCookies();
  await page.goto(`/project/${accessId}`, { waitUntil: "domcontentloaded" });
  await enterPin(page, PIN);
  await expect(page.getByText("Customer view")).toBeVisible({ timeout: 30_000 });
  // The RSC payload is serialized into <script> tags; staff ACCOUNT emails must never be in it.
  const html = await page.content();
  expect(html).not.toContain("manager@iot-techs.com");
  expect(html).not.toContain("admin@iot-techs.com");
});

test("wrong PIN does not open the project (no data leak)", async ({ page, request, context }) => {
  const accessId = await makeProject(request, "wrongpin");
  await context.clearCookies();
  await page.goto(`/project/${accessId}`, { waitUntil: "domcontentloaded" });
  await enterPin(page, "0000"); // not the project PIN, not a dev global PIN
  await page.waitForTimeout(1500);
  await expect(page.getByText("Customer view")).toHaveCount(0);
  await expect(page.getByText(/E2E CV Co wrongpin/)).toHaveCount(0);
  // still on the secure-access gate (the keypad is present) — not inside the project
  await expect(page.getByText(/SECURE ACCESS/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "5", exact: true }).first()).toBeVisible();
});
