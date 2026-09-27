// New Project → CRM client flow (Existing / New). Signs in as the seeded manager. Everything it creates
// is named "Zed Client …" (contact; a name the server's capitalizer leaves alone) with 201-555-02xx phones
// so the cleanup script can find it.
import { test, expect } from "@playwright/test";

const LOGIN = { email: process.env.E2E_EMAIL || "manager@iot-techs.com", password: process.env.E2E_PASSWORD || "password" };
const STAMP = Date.now().toString(36).slice(-4);
const CLIENT = { name: "Zed Client Alpha", phone: "2015550201", email: `zed.client.${STAMP}@example.com`, company: "Zed Client Co" };

async function signIn(page) {
  // The dev server's first compile of a route can abort the initial navigation — retry once.
  for (let i = 0; i < 3; i++) { try { await page.goto("/login", { waitUntil: "domcontentloaded" }); break; } catch (e) { if (i === 2) throw e; await page.waitForTimeout(1500); } }
  const who = page.getByPlaceholder("Email or phone number");
  await who.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(800);                                                  // let the form hydrate (dev server)
  await who.fill(LOGIN.email);
  const pw = page.getByPlaceholder("Password");
  for (let i = 0; i < 3 && !(await pw.isVisible().catch(() => false)); i++) {   // a pre-hydration click is swallowed — press again
    await page.getByRole("button", { name: /Continue/ }).click();
    await pw.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  }
  await pw.fill(LOGIN.password);
  await page.getByRole("button", { name: /Sign In/ }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname));
  await page.goto("/dashboard");
}
async function openModal(page) {
  await page.getByRole("button", { name: /New Project/ }).first().click();
  const box = page.locator(".np-box");
  await expect(box).toBeVisible();
  return box;
}
const mode = (box, m) => box.getByRole("radio", { name: m, exact: true }).click();
async function createdId(box) {
  await expect(box.getByText("Project created.")).toBeVisible({ timeout: 20000 });
  return (await box.locator(".np-mono").textContent()).trim();
}
// Create the shared client once (New mode) and remember the customer it got.
async function ensureClient(page) {
  const box = await openModal(page);
  await mode(box, "New");
  await box.locator("input").first().fill(CLIENT.name);
  await box.getByPlaceholder("Business name").fill(CLIENT.company);
  await box.locator('input[type="email"]').fill(CLIENT.email);
  await box.locator('input[type="tel"]').fill(CLIENT.phone);
  await box.getByRole("button", { name: "Create Project" }).click();
  // Second run onwards: the duplicate guard fires → use the existing client instead.
  await expect(box.locator(".np-dup, .np-check").first()).toBeVisible({ timeout: 20000 });
  const dup = box.locator(".np-dup");
  if (await dup.isVisible()) {
    await dup.getByRole("button", { name: "Use client" }).click();
    await expect(box.locator(".np-csel")).toBeVisible();
    await box.getByRole("button", { name: "Create Project" }).click();
  }
  const id = await createdId(box);
  await box.getByRole("button", { name: "Done" }).click();
  return id;
}

test.beforeEach(async ({ page }) => { await signIn(page); });

test("TEST 1/2: Existing → search by name and by phone find the same client; fields populate, no new customer", async ({ page }) => {
  await ensureClient(page);
  const box = await openModal(page);
  await expect(box.getByRole("radio", { name: "Existing", exact: true })).toHaveAttribute("aria-checked", "true");
  const search = box.getByLabel("Search client");
  await search.fill("Zed Client Al");
  const row = box.locator(".np-crow").first();
  await expect(row).toContainText(CLIENT.name);
  await row.click();
  const sel = box.locator(".np-csel");
  await expect(sel).toContainText(CLIENT.name);
  await expect(sel).toContainText("(201) 555-0201");
  await expect(sel).toContainText(CLIENT.email);
  const idByName = await sel.getAttribute("data-client-id");
  await expect(box.locator('input[type="email"]')).toHaveCount(0);               // contact fields stay hidden (no casual CRM edits)
  await sel.getByRole("button", { name: "Change" }).click();
  await search.fill("(201) 555-0201");                                           // TEST 2: phone, different formatting
  await box.locator(".np-crow").first().click();
  await expect(box.locator(".np-csel")).toHaveAttribute("data-client-id", idByName);
});

test("TEST 3/4/8/9: several projects for one client share the customer, keep their own address; company → Commercial", async ({ page }) => {
  const first = await ensureClient(page);
  const ids = [first];
  for (const addr of ["100 First St, Hoboken, NJ 07030, USA", "200 Second Ave, Jersey City, NJ 07302, USA"]) {
    const box = await openModal(page);
    await box.getByLabel("Search client").fill(CLIENT.phone);
    await box.locator(".np-crow").first().click();
    await expect(box.locator(".np-csel")).toContainText(CLIENT.company);        // TEST 8: existing company referenced
    await expect(box.locator(".np-seg-b.on").last()).toHaveText("Commercial");  //         → Commercial default
    const addrInput = box.getByPlaceholder("Start typing, then choose the address");
    await expect(addrInput).toHaveValue("");                                    // TEST 9: never silently reuses an old address
    await addrInput.fill(addr);
    await box.getByRole("button", { name: "Create Project" }).click();
    await box.getByRole("button", { name: "Create Project" }).click();          // second press accepts an unverified address
    ids.push(await createdId(box));
    await box.getByRole("button", { name: "Done" }).click();
  }
  expect(new Set(ids).size).toBe(3);                                            // TEST 3/4: three distinct projects…
  const box = await openModal(page);
  await box.getByLabel("Search client").fill(CLIENT.email);
  await expect(box.locator(".np-crow").first()).toContainText(/[3-9]\d* projects/); // …one customer, project count grew
  await box.locator(".np-crow").first().click();
  await expect(box.locator(".np-chip")).toContainText(["200 Second Ave", "100 First St"]); // previous job sites offered, not selected
});

test("TEST 5/6: New mode with an existing email, or the same phone in another format, is caught; name alone is not (TEST 7)", async ({ page }) => {
  await ensureClient(page);
  const box = await openModal(page);
  await mode(box, "New");
  await box.locator("input").first().fill("Someone Else");
  await box.locator('input[type="email"]').fill(CLIENT.email.toUpperCase());
  await box.getByRole("button", { name: "Create Project" }).click();
  await expect(box.locator(".np-dup")).toContainText("Existing client found");
  await expect(box.locator(".np-dup")).toContainText(CLIENT.name);
  await box.locator('input[type="email"]').fill("");
  await box.locator('input[type="tel"]').fill("+1 (201) 555-0201");
  await box.getByRole("button", { name: "Create Project" }).click();
  await expect(box.locator(".np-dup")).toContainText(CLIENT.name);             // TEST 6: formatting differences don't matter
  // TEST 7: same name, different contact info → no merge, a distinct client + project is created.
  await box.locator("input").first().fill(CLIENT.name);
  await box.locator('input[type="tel"]').fill("2015550299");
  await box.getByRole("button", { name: "Create Project" }).click();
  await expect(box.locator(".np-dup")).toHaveCount(0);
  await createdId(box);
});

test("TEST 10: Start From → Previous Project ranks the selected client's own proposals first", async ({ page }) => {
  await ensureClient(page);
  // Give the client a proposal: a project started from any existing proposal (the clone lands on this client).
  let box = await openModal(page);
  await box.getByLabel("Search client").fill(CLIENT.phone);
  await box.locator(".np-crow").first().click();
  await box.getByRole("combobox", { name: "Start from" }).selectOption("previous");
  let sheet = page.locator(".rp-sheet");
  await expect(sheet).toBeVisible();
  await sheet.locator(".rp-row").first().click();
  await sheet.getByRole("button", { name: "Use" }).click();
  await box.getByRole("button", { name: "Create Project" }).click();
  await page.waitForURL(/\/project\/A[A-Z]{2}[0-9A-Z]{4}/);
  // Now the picker, for this client, must lead with that client's proposal.
  await page.goto("/dashboard");
  box = await openModal(page);
  await box.getByLabel("Search client").fill(CLIENT.phone);
  await box.locator(".np-crow").first().click();
  await box.getByRole("combobox", { name: "Start from" }).selectOption("previous");
  sheet = page.locator(".rp-sheet");
  await expect(sheet.locator(".rp-group").first()).toHaveText("From this customer");
  await expect(sheet.locator(".rp-row").first()).toContainText("Zed Client");
});
