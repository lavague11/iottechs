// Shared setup for the e-sign specs: a throwaway project (POST /api/demo) with a SENT proposal inserted
// straight into the dev DB, exactly as customer-access.spec.mjs seeds its data — never touches real data.
import { expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";

export const PHONE = "5550007788";
export const PIN = "7788";

export const PAYLOAD = {
  payment_plan: "50_50",
  options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: [
    { id: "li1", name: "Camera Location 1", qty: 4, price: 350 }, { id: "li2", name: "NVR 8-Channel", qty: 1, price: 600 } ] }] }],
};

export async function makeProject(request, suffix) {
  const res = await request.post("/api/demo", { data: { name: `E2E Esign ${suffix}`, phone: PHONE, email: `e2e-esign-${suffix}@example.com`, address: "2503 Jay Pl", service: "cctv", company: `E2E Esign Co ${suffix}` } });
  expect(res.ok()).toBeTruthy();
  const j = await res.json();
  expect(j.ok).toBeTruthy();
  return j.accessId;
}

export function openDb() { const db = new DatabaseSync("./data/dashboard.db"); db.exec("PRAGMA busy_timeout=5000"); return db; }

export function seedSentProposal(accessId, payload = PAYLOAD) {
  const db = openDb();
  db.prepare("INSERT INTO proposals (project_access_id,version,status,payload,tax_rate,deposit_pct,sent_at,created_by_name) VALUES (?,?,?,?,?,?,datetime('now','localtime'),?)")
    .run(accessId, 1, "sent", JSON.stringify(payload), 8, 50, "E2E");
  db.prepare("UPDATE projects SET stage='proposal' WHERE access_id=?").run(accessId);
  db.close();
}

export async function enterPin(page, pin = PIN) {
  await expect(page.getByText(/Enter your PIN/i)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).first().click();
}

// Customer opens the proposal and presses Approve & Sign → the PDF signer.
export async function openSigner(page, context, accessId) {
  await context.clearCookies();
  await page.goto(`/project/${accessId}?esign=1&stage=proposal&open=proposal`, { waitUntil: "domcontentloaded" });
  await enterPin(page);
  await expect(page.getByText("Customer view")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Approve & Sign|Review & Sign/ }).first().click();
  await expect(page.getByTestId("esign")).toBeVisible({ timeout: 30_000 });
}
