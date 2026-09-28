// Service call — structured diagnostic chain, e2e. Creates a call from the staff modal for a client
// with a surveyed system, diagnoses four cameras as one PoE-switch issue, generates the estimate,
// signs, and checks the report. Calls it creates carry the issue prefix "E2E SVC" for cleanup.
//
// The diagnosis UI is progressive-disclosure: at rest each field is a compact row and the choices open
// in a selector sheet (.sd-sel) only when the row is tapped — so this drives sheets, not pill walls.
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
// Creating a call now lands with ?run=1 and auto-opens the TRACE runner overlay; close it to reach
// the structured diagnosis panel underneath.
async function dismissRunner(page) {
  await page.waitForTimeout(600);   // the runner auto-opens on mount (?run=1)
  const x = page.locator(".svc-run-x");
  if (await x.isVisible().catch(() => false)) { await x.click(); await page.locator(".svc-run").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {}); }
}

// --- New-UI diagnosis helpers (each field opens a .sd-sel sheet) ---------------------------------
const issueBody = (sd) => sd.locator(".sd-issue-b");
async function addIssue(sd) { await sd.getByRole("button", { name: "+ Issue", exact: true }).click(); await sd.locator(".sd-issue-b").first().waitFor(); }
async function pick(page, opener, option, { multi = false } = {}) {
  await opener.click();
  const sh = page.locator(".sd-sel");
  await sh.waitFor({ state: "visible" });
  await sh.getByRole("button", { name: option, exact: true }).click();
  if (multi) await sh.getByRole("button", { name: "Done", exact: true }).click();
  await sh.waitFor({ state: "hidden" });
}
async function addTest(page, sd, name) {
  await sd.getByRole("button", { name: "Tests", exact: true }).click();
  const sh = page.locator(".sd-sel");
  await sh.waitFor({ state: "visible" });
  await sh.getByRole("button", { name, exact: true }).click();   // adds the test (NOT TESTED) and closes
  await sh.waitFor({ state: "hidden" });
}
async function pickDevices(page, sd, indices) {
  await issueBody(sd).getByRole("button", { name: "Affected", exact: true }).click();
  const sh = page.locator(".sd-sel");
  await sh.waitFor({ state: "visible" });
  const optb = sh.locator(".sd-sel-opt");
  for (const i of indices) await optb.nth(i).click();
  await sh.getByRole("button", { name: "Done", exact: true }).click();
  await sh.waitFor({ state: "hidden" });
}

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
  await box.getByPlaceholder("What's the problem?").fill("E2E SVC: cameras 2–5 offline");
  await box.getByRole("button", { name: "Create Call" }).click();
  await page.waitForURL(/\/service-calls\/SVC/);
  await dismissRunner(page);
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
  await box.getByPlaceholder("What's the problem?").fill("E2E SVC: cameras 2–5 offline");
  await box.getByRole("button", { name: "Create Call" }).click();
  await page.waitForURL(/\/service-calls\/SVC/);
  await dismissRunner(page);
  const svcUrl = page.url();
  const sd = page.locator(".sd");

  // Chain: issue → four devices → symptom → tests → root cause → outcome
  await addIssue(sd);
  await pickDevices(page, sd, [1, 2, 3, 4]);                                   // cameras 2..5 (skip the first)
  await pick(page, issueBody(sd).getByRole("button", { name: "Symptom", exact: true }), "Offline", { multi: true });
  await addTest(page, sd, "Camera direct-connect");
  await sd.locator(".sd-test-r").nth(0).click();                              // NOT TESTED → PASS
  await addTest(page, sd, "Verify PoE");
  await sd.locator(".sd-test-r").nth(1).click();                             // → PASS
  await sd.locator(".sd-test-r").nth(1).click();                             // → FAIL
  await expect(sd.locator(".sd-test-r.r-FAIL")).toHaveCount(1);
  await pick(page, issueBody(sd).getByRole("button", { name: "Root cause", exact: true }), "PoE switch", { multi: true });
  await issueBody(sd).getByPlaceholder(/Recommendation/).fill("Replace 8-port PoE switch.");
  await pick(page, issueBody(sd).getByRole("button", { name: "Outcome", exact: true }), "Needs replacement");
  await sd.locator(".sd-more").click();                                       // reveal Type / Billing / manual times
  await sd.locator('input[type="time"]').nth(0).fill("09:15");
  await sd.locator('input[type="time"]').nth(1).fill("11:40");
  await expect(sd.locator(".sd-visit-t em")).toContainText("2h 25m");         // time on site computed
  await expect(sd.locator(".sd-save")).toHaveText(/Saved/, { timeout: 10000 }); // autosaved server-side
  await expect(sd.locator(".sd-issue-sum").first()).toContainText("Offline");
  await expect(sd.locator(".sd-issue-sum").first()).toContainText("Needs replacement");

  // Reload: the diagnosis comes back from the server
  await page.reload();
  await expect(sd.locator(".sd-issue-sum").first()).toContainText("PoE switch");
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
  await expect(sd.locator(".sd-fr").first()).toBeDisabled();                  // locked: fields no longer editable

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
  await dismissRunner(page);
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
  await box.getByPlaceholder("What's the problem?").fill("E2E SVC: app shows cameras offline");
  await box.getByRole("button", { name: "Create Call" }).click();
  await page.waitForURL(/\/service-calls\/SVC/);
  await dismissRunner(page);
  const sd = page.locator(".sd");
  await addIssue(sd);
  await pick(page, issueBody(sd).getByRole("button", { name: "System", exact: true }), "Network / Internet");
  await pick(page, issueBody(sd).getByRole("button", { name: "Symptom", exact: true }), "ISP offline", { multi: true });
  await pick(page, issueBody(sd).getByRole("button", { name: "Root cause", exact: true }), "ISP", { multi: true });
  await pick(page, issueBody(sd).getByRole("button", { name: "Outcome", exact: true }), "Third-party / ISP issue");
  await expect(sd.locator(".sd-save")).toHaveText(/Saved/, { timeout: 10000 });
  await expect(sd.getByRole("button", { name: "Estimate" })).toHaveAttribute("title", "1× Diagnostic, 1× Roll out");
  await sd.locator(".sd-more").click();
  await sd.locator(".sd-meta select").nth(0).selectOption("Warranty Visit");
  await sd.locator(".sd-meta select").nth(1).selectOption("warranty");
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
  await box.getByPlaceholder("What's the problem?").fill(issue);
  await box.getByRole("button", { name: "Create Call" }).click();
  await page.waitForURL(/\/service-calls\/SVC/);
  await dismissRunner(page);
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
  await addIssue(sd);
  await pickDevices(page, sd, [1, 2]);                                        // two cameras in one cable issue
  await pick(page, issueBody(sd).getByRole("button", { name: "Symptom", exact: true }), "No video", { multi: true });
  await pick(page, issueBody(sd).getByRole("button", { name: "Root cause", exact: true }), "Cable", { multi: true });
  await issueBody(sd).getByPlaceholder(/Finding/).fill("Cables pulled from the pole bundle.");
  const per = issueBody(sd).locator(".sd-perdev");
  await per.locator("summary").click();
  await expect(per.locator(".sd-devrow")).toHaveCount(2);
  await per.locator(".sd-devrow").nth(0).locator("select").selectOption("FAILED");
  await per.locator(".sd-devrow").nth(0).getByPlaceholder("Cable").fill("Visible pull damage");
  await per.locator(".sd-devrow").nth(1).locator("select").selectOption("RESTORED");
  await pick(page, issueBody(sd).getByRole("button", { name: "Outcome", exact: true }), "Needs replacement");
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
  await addIssue(sd);
  await pick(page, issueBody(sd).getByRole("button", { name: "System", exact: true }), "Network / Internet");
  await pick(page, issueBody(sd).getByRole("button", { name: "Symptom", exact: true }), "ISP offline", { multi: true });
  await pick(page, issueBody(sd).getByRole("button", { name: "Root cause", exact: true }), "ISP", { multi: true });
  await pick(page, issueBody(sd).getByRole("button", { name: "Outcome", exact: true }), "Third-party / ISP issue");
  await expect(sd.locator(".sd-save")).toHaveText(/Saved/, { timeout: 10000 });
  await page.goto(url + "/report");
  await expect(page.locator(".sr-type")).toHaveText("Service Diagnostic");
  await expect(page.locator(".sr-pill")).toHaveText("Network Diagnostic");
  await expect(page.locator(".sr-sec-t", { hasText: "Cost Comparison" })).toHaveCount(0);
  await expect(page.locator(".sr-sec-t", { hasText: "Charges" })).toHaveCount(0);
  await expect(page.locator(".sr-sec-t", { hasText: "Root Cause" })).toHaveCount(1);
});
