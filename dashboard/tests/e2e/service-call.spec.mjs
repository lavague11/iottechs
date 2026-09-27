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
  const doc = page.locator(".sr");
  await expect(doc).toContainText("Verify PoE — FAIL");
  await expect(doc).toContainText("Root Cause");
  await expect(doc).toContainText("PoE");
  await expect(doc.locator(".sr-cam .st", { hasText: "REPLACE" }).first()).toBeVisible();   // per-device status from the outcome
  await expect(doc).toContainText("On site 2h 25m");
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

// ---- Generated document (GNZ-style): per-device table, badges, options, page two, empty regions ----
async function createCall(page, issue) {
  await page.goto("/service-calls");
  await page.getByRole("button", { name: "+ Service Call" }).click();
  const box = page.locator(".np-box");
  await box.getByLabel("Search client").fill(CLIENT_QUERY);
  await box.locator(".np-crow").first().click();
  await expect(box.getByRole("combobox", { name: "System" }).locator("option")).not.toHaveCount(1);
  await box.getByRole("combobox", { name: "System" }).selectOption({ index: 1 });
  await box.getByPlaceholder("What's wrong?").fill(issue);
  await box.getByRole("button", { name: "Create Call" }).click();
  await page.waitForURL(/\/service-calls\/SVC/);
  return page.url();
}

test("document: mixed OK/FAIL devices, cause badges, repair vs replace, cost comparison, two pages; draft has no acceptance", async ({ page }) => {
  const url = await createCall(page, "E2E SVC: truck pulled the pole cable bundle");
  const sd = page.locator(".sd");
  // Draft: the document exists but carries a draft watermark and no acceptance region
  await page.goto(url + "/report");
  await expect(page.locator(".sr-page")).toHaveCount(1);
  await expect(page.locator(".sr-page.draft")).toHaveCount(1);
  await expect(page.locator(".sr-sec-t", { hasText: "Acceptance" })).toHaveCount(0);

  await page.goto(url);
  await chip(sd.locator(".sd-sec").first(), "Cameras / CCTV").click();
  await sd.getByRole("button", { name: "+ Finding" }).click();
  const fb = sd.locator(".sd-find-b");
  const devs = fb.locator(".sd-step").nth(0).locator(".sd-chip");
  await devs.nth(1).click(); await devs.nth(2).click();                      // two cameras in one cable finding
  await chip(fb.locator(".sd-step").nth(1), "No video").click();
  await chip(fb.locator(".sd-step").nth(3), "Cable").click();
  await fb.getByPlaceholder("Finding").fill("Cables pulled from the pole bundle.");
  const per = fb.locator(".sd-step", { has: page.locator(".sd-lab", { hasText: "Per device" }) });
  await expect(per.locator(".sd-devrow")).toHaveCount(2);
  await per.locator(".sd-devrow").nth(0).locator("select").selectOption("FAILED");
  await per.locator(".sd-devrow").nth(0).getByPlaceholder("Cable").fill("Visible pull damage");
  await per.locator(".sd-devrow").nth(1).locator("select").selectOption("RESTORED");
  await fb.getByRole("combobox", { name: "Outcome" }).selectOption("needs_replace");
  await expect(sd.locator(".sd-save")).toHaveText(/Saved/, { timeout: 10000 });
  await expect(sd.locator(".sd-link")).toHaveText("Diagnostic");                // no money yet → diagnostic document

  // Options: repair (range) vs replace (estimate total) → proposal
  await page.locator(".sde-h").click();
  await page.getByRole("button", { name: "+ Repair" }).click();
  await page.getByRole("button", { name: "+ Replace" }).click();
  const opts = page.locator(".sde-opt");
  await opts.nth(0).getByRole("combobox", { name: "Cost" }).selectOption("range");
  await opts.nth(0).getByRole("spinbutton", { name: "Low" }).fill("4800");
  await opts.nth(0).getByRole("spinbutton", { name: "High" }).fill("5400");
  await opts.nth(0).getByPlaceholder("Warranty").fill("None");
  await opts.nth(1).getByRole("combobox", { name: "Cost" }).selectOption("estimate");
  await opts.nth(1).getByPlaceholder("Warranty").fill("Full");
  await expect(sd.locator(".sd-link")).toHaveText("Proposal");
  await sd.getByRole("button", { name: "Estimate" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".svc-inv-total b")).toHaveText("$500.00");        // 150 + 50 + 2 × 150 cable rerun
  await expect(sd.locator(".sd-save")).toHaveText(/Saved/, { timeout: 10000 });

  await page.goto(url + "/report");
  await expect(page.locator(".sr-type")).toHaveText("Service Call Proposal");
  await expect(page.locator(".sr-pill")).toHaveText("CCTV Diagnostic");
  await expect(page.locator(".sr-page")).toHaveCount(2);
  await expect(page.locator(".sr-page.draft")).toHaveCount(0);
  const rows = page.locator(".sr-cam tbody tr");
  await expect(rows.nth(1).locator(".st")).toHaveText("FAIL");
  await expect(rows.nth(1)).toContainText("Visible pull damage");
  await expect(rows.nth(1).locator(".sr-badge")).toHaveText("Cable");
  await expect(rows.nth(2).locator(".st")).toHaveText("RESTORED");
  await expect(rows.nth(0).locator(".st")).toHaveText("—");                    // untested stays untested
  await expect(page.locator(".sr-summary")).toContainText("1 of");
  await expect(page.locator(".sr-summary")).toContainText("1 cable");
  await expect(page.locator(".sr-summary")).toContainText("1 restored on-site");
  const p2 = page.locator(".sr-page").nth(1);
  await expect(p2.locator(".sr-sec-t")).toHaveText(["Repair vs Replace", "Cost Comparison", "Recommendation", "Scope", "Charges", "Acceptance"]);
  await expect(p2.locator(".sr-cost").first().locator("tbody tr").nth(0)).toContainText("$4,800.00 – $5,400.00");
  await expect(p2.locator(".sr-cost").first().locator("tbody tr").nth(1)).toContainText("$500.00");
  await expect(p2.locator(".sr-rec")).toContainText("Full replacement");
  // Mobile preview still renders every region without horizontal page overflow
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sr-page")).toHaveCount(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});

test("document: ISP-only call is a one-page diagnostic with no comparison, no charges beyond the visit", async ({ page }) => {
  const url = await createCall(page, "E2E SVC: remote viewing down");
  const sd = page.locator(".sd");
  await chip(sd.locator(".sd-sec").first(), "Network / Internet").click();
  await sd.getByRole("button", { name: "+ Finding" }).click();
  const fb = sd.locator(".sd-find-b");
  await chip(fb.locator(".sd-step").nth(1), "ISP offline").click();
  await chip(fb.locator(".sd-step").nth(3), "ISP").click();
  await fb.getByRole("combobox", { name: "Outcome" }).selectOption("third_party");
  await expect(sd.locator(".sd-save")).toHaveText(/Saved/, { timeout: 10000 });
  await page.goto(url + "/report");
  await expect(page.locator(".sr-type")).toHaveText("Service Diagnostic");
  await expect(page.locator(".sr-pill")).toHaveText("Network Diagnostic");
  await expect(page.locator(".sr-sec-t", { hasText: "Cost Comparison" })).toHaveCount(0);
  await expect(page.locator(".sr-sec-t", { hasText: "Charges" })).toHaveCount(0);
  await expect(page.locator(".sr-sec-t", { hasText: "Root Cause" })).toHaveCount(1);
});
