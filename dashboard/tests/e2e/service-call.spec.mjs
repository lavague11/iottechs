// Service call — structured diagnostic chain, e2e. Creates a call from the staff modal for a client
// with a surveyed system, diagnoses four cameras as one PoE-switch finding, generates the estimate,
// signs, and checks the report. Calls it creates carry the issue prefix "E2E SVC" for cleanup.
import { test, expect } from "@playwright/test";

const LOGIN = { email: process.env.E2E_EMAIL || "manager@iot-techs.com", password: process.env.E2E_PASSWORD || "password" };
const CLIENT_QUERY = process.env.E2E_SVC_CLIENT || "(201) 702-3575";   // a client with a surveyed CCTV system

async function signIn(page) {
  for (let i = 0; i < 3; i++) { try { await page.goto("/login", { waitUntil: "domcontentloaded" }); break; } catch (e) { if (i === 2) throw e; await page.waitForTimeout(1500); } }
  const who = page.getByPlaceholder("Email or phone number");
  await who.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(800);
  await who.fill(LOGIN.email);
  const pw = page.getByPlaceholder("Password");
  for (let i = 0; i < 3 && !(await pw.isVisible().catch(() => false)); i++) {
    await page.getByRole("button", { name: /Continue/ }).click();
    await pw.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  }
  await pw.fill(LOGIN.password);
  await page.getByRole("button", { name: /Sign In/ }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname));
}
const chip = (scope, text) => scope.locator(".sd-chip", { hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(PASS|FAIL|NOT TESTED)?$`) });

test.beforeEach(async ({ page }) => { await signIn(page); });

test("create from an existing client + system: customer, address and equipment auto-populate", async ({ page }) => {
  await page.goto("/service-calls");
  await page.getByRole("button", { name: "+ Service Call" }).click();
  const box = page.locator(".np-box");
  await box.getByLabel("Search client").fill(CLIENT_QUERY);
  await box.locator(".np-crow").first().click();
  const sys = box.getByRole("combobox", { name: "System" });
  await expect(sys).toBeVisible();
  await expect(sys.locator("option")).not.toHaveCount(1);                     // the client's systems load in
  await sys.selectOption({ index: 1 });
  await box.getByPlaceholder("What's wrong?").fill("E2E SVC: cameras 2–5 offline");
  await box.getByRole("button", { name: "Create Call" }).click();
  await page.waitForURL(/\/service-calls\/SVC/);
  await expect(page.locator(".svc-hero h1")).not.toHaveText("—");
  await expect(page.locator(".svc-dl a.mono")).toBeVisible();                 // linked system
  await expect(page.locator(".sd-dev").first()).toBeVisible();                // equipment loaded from the survey
  await expect(page.locator(".sd-dev-nvr")).toHaveText("NVR");
});

test("bulk diagnosis → autosave/reload → estimate from the rate card → signatures → report", async ({ page }) => {
  await page.goto("/service-calls");
  await page.getByRole("button", { name: "+ Service Call" }).click();
  const box = page.locator(".np-box");
  await box.getByLabel("Search client").fill(CLIENT_QUERY);
  await box.locator(".np-crow").first().click();
  await expect(box.getByRole("combobox", { name: "System" }).locator("option")).not.toHaveCount(1);
  await box.getByRole("combobox", { name: "System" }).selectOption({ index: 1 });
  await box.getByPlaceholder("What's wrong?").fill("E2E SVC: cameras 2–5 offline");
  await box.getByRole("button", { name: "Create Call" }).click();
  await page.waitForURL(/\/service-calls\/SVC/);
  const svcUrl = page.url();
  const sd = page.locator(".sd");

  // Chain: system → finding → four devices → symptom → tests → root cause → outcome
  await chip(sd.locator(".sd-sec").first(), "Cameras / CCTV").click();
  await sd.getByRole("button", { name: "+ Finding" }).click();
  const fb = sd.locator(".sd-find-b");
  const devs = fb.locator(".sd-step").nth(0).locator(".sd-chip");
  const n = await devs.count();
  for (let i = 1; i < Math.min(n, 5); i++) await devs.nth(i).click();         // cameras 2..5 (skip the first)
  await chip(fb.locator(".sd-step").nth(1), "Offline").click();
  await chip(fb.locator(".sd-step").nth(2), "Camera direct-connect").click();           // PASS
  await chip(fb.locator(".sd-step").nth(2), "Verify PoE").click();                      // PASS
  await chip(fb.locator(".sd-step").nth(2), "Verify PoE").click();                      // FAIL
  await expect(fb.locator(".sd-chip.r-FAIL")).toHaveCount(1);
  await chip(fb.locator(".sd-step").nth(3), "PoE switch").click();
  await fb.getByPlaceholder("Recommendation").fill("Replace 8-port PoE switch.");
  await fb.getByRole("combobox", { name: "Outcome" }).selectOption("needs_replace");
  await sd.locator('input[type="time"]').nth(0).fill("09:15");
  await sd.locator('input[type="time"]').nth(1).fill("11:40");
  await expect(sd.locator(".sd-f em")).toHaveText("2h 25m");                  // time on site computed
  await expect(sd.locator(".sd-save")).toHaveText(/Saved/, { timeout: 10000 }); // autosaved server-side
  await expect(sd.locator(".sd-find-h b")).toContainText("Offline · PoE switch · Needs replacement");

  // Reload: the diagnosis comes back from the server
  await page.reload();
  await expect(sd.locator(".sd-find-h b")).toContainText("PoE switch · Needs replacement");
  await expect(sd.getByRole("button", { name: "Follow-up" })).toBeVisible();

  // Estimate: base visit + the switch (no camera hardware), priced by the office
  await sd.getByRole("button", { name: "Estimate" }).click();
  const rows = page.locator(".svc-inv-row");
  await expect(rows).toHaveCount(3);
  for (const [i, desc] of ["Diagnostic", "Roll out", "PoE switch replacement"].entries()) await expect(rows.nth(i).locator(".svc-inv-in-desc")).toHaveValue(desc);
  await expect(rows.nth(0).locator(".svc-inv-in-price")).toHaveValue("150");
  await rows.nth(2).locator(".svc-inv-in-price").fill("260");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".svc-inv-total b")).toHaveText("$460.00");

  // Signatures freeze the record; the report shows the whole chain + charges
  await sd.getByRole("button", { name: "Sign · tech" }).click();
  await expect(sd.locator(".sd-locked")).toContainText("tech");
  await sd.locator(".sd-sign input").fill("Test Customer");
  await sd.getByRole("button", { name: "Sign · customer" }).click();
  await expect(sd.locator(".sd-locked")).toContainText("customer Test Customer");
  await expect(sd.getByRole("combobox", { name: "System" }).first()).toBeDisabled();

  await page.goto(svcUrl.replace(/\/?$/, "/report"));
  const doc = page.locator(".sr-doc");
  await expect(doc).toContainText("Verify PoE — FAIL");
  await expect(doc).toContainText("Root cause");
  await expect(doc).toContainText("PoE switch");
  await expect(doc).toContainText("Needs replacement");
  await expect(doc).toContainText("On site");
  await expect(doc).toContainText("2h 25m");
  await expect(doc).toContainText("$460.00");
  await expect(doc).toContainText("Test Customer");
  await expect(doc).not.toContainText("Internal notes");

  // Follow-up: a new call linked to this one, same client and system
  await page.goto(svcUrl);
  await sd.getByRole("button", { name: "Follow-up" }).click();
  await page.waitForURL((u) => /\/service-calls\/SVC/.test(u.pathname) && u.href !== svcUrl);
  await expect(page.locator(".svc-hero-issue")).toContainText("Follow-up to SVC");
  await expect(page.locator(".sd-dev").first()).toBeVisible();
});

test("a warranty visit suggests no charges; ISP root cause suggests the visit only", async ({ page }) => {
  await page.goto("/service-calls");
  await page.getByRole("button", { name: "+ Service Call" }).click();
  const box = page.locator(".np-box");
  await box.getByLabel("Search client").fill(CLIENT_QUERY);
  await box.locator(".np-crow").first().click();
  await expect(box.getByRole("combobox", { name: "System" }).locator("option")).not.toHaveCount(1);
  await box.getByRole("combobox", { name: "System" }).selectOption({ index: 1 });
  await box.getByPlaceholder("What's wrong?").fill("E2E SVC: app shows cameras offline");
  await box.getByRole("button", { name: "Create Call" }).click();
  await page.waitForURL(/\/service-calls\/SVC/);
  const sd = page.locator(".sd");
  await chip(sd.locator(".sd-sec").first(), "Network / Internet").click();
  await sd.getByRole("button", { name: "+ Finding" }).click();
  const fb = sd.locator(".sd-find-b");
  await chip(fb.locator(".sd-step").nth(1), "ISP offline").click();
  await chip(fb.locator(".sd-step").nth(3), "ISP").click();
  await fb.getByRole("combobox", { name: "Outcome" }).selectOption("third_party");
  await expect(sd.locator(".sd-save")).toHaveText(/Saved/, { timeout: 10000 });
  await expect(sd.getByRole("button", { name: "Estimate" })).toHaveAttribute("title", "1× Diagnostic, 1× Roll out");
  await sd.getByRole("combobox").first().selectOption("Warranty Visit");
  await sd.locator("select").nth(1).selectOption("warranty");
  await expect(sd.getByRole("button", { name: "Estimate" })).toHaveCount(0);   // nothing to bill
});
