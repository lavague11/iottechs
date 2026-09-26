// New Project modal — e2e. Signs in as the seeded manager (dev seed: manager@iot-techs.com / password),
// which may create projects. Projects it creates are named "E2E Modal …" so a cleanup can find them.
import { test, expect } from "@playwright/test";

const LOGIN = { email: process.env.E2E_EMAIL || "manager@iot-techs.com", password: process.env.E2E_PASSWORD || "password" };

async function signIn(page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email or phone number").fill(LOGIN.email);
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByPlaceholder("Password").fill(LOGIN.password);
  await page.getByRole("button", { name: /Sign In/ }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname));   // role home varies (manager → /tickets)
  await page.goto("/dashboard");
}
async function openModal(page) {
  await page.getByRole("button", { name: /New Project/ }).first().click();
  const box = page.locator(".np-box");
  await expect(box).toBeVisible();
  return box;
}
const property = (box) => box.locator(".np-seg-b.on");

test.beforeEach(async ({ page }) => { await signIn(page); });

test("TEST 1: no project-kind cards, one Service dropdown, Commercial selected", async ({ page }) => {
  const box = await openModal(page);
  await expect(box.getByText("What kind of project is this?")).toHaveCount(0);
  await expect(box.getByRole("button", { name: "Security System" })).toHaveCount(0);
  const svc = box.getByRole("combobox", { name: "Service" });
  await expect(svc).toHaveValue("SC");
  const options = await svc.locator("option").allTextContents();
  expect(options).toEqual(expect.arrayContaining(["Security Cameras / CCTV", "ADT Monitoring", "Toast / POS Cabling", "Access Control / Door Entry"]));
  await expect(property(box)).toHaveText("Commercial");
  await expect(box.getByRole("combobox", { name: "Start from" })).toHaveValue("blank");
});

test("TEST 4/5: company auto-sets Commercial; a manual Residential survives later company edits", async ({ page }) => {
  const box = await openModal(page);
  await box.getByRole("radio", { name: "Residential" }).click();
  await expect(property(box)).toHaveText("Residential");
  await box.getByPlaceholder("Business name").fill("Crazy Cars");            // override stands
  await expect(property(box)).toHaveText("Residential");
  await page.reload(); const box2 = await openModal(page);
  await box2.getByPlaceholder("Business name").fill("Crazy Cars");           // no override → Commercial
  await expect(property(box2)).toHaveText("Commercial");
  await box2.getByRole("radio", { name: "Residential" }).click();
  await box2.getByPlaceholder("Business name").fill("Crazy Cars Inc");
  await expect(property(box2)).toHaveText("Residential");
});

test("TEST 6/10: a residential project with no company lands in the project shell with the chosen service", async ({ page }) => {
  const box = await openModal(page);
  await box.locator("input").first().fill("E2E Modal Residential");
  await box.locator('input[type="tel"]').fill("2015550101");
  await box.getByRole("combobox", { name: "Service" }).selectOption("TP");
  await box.getByRole("radio", { name: "Residential" }).click();
  await box.getByRole("button", { name: "Create Project" }).click();
  await expect(box.getByText("Project created.")).toBeVisible();
  const id = (await box.locator(".np-mono").textContent()).trim();
  expect(id.startsWith("ATP")).toBeTruthy();                                  // Toast / POS service code
  await page.goto(`/project/${id}?deck=1`);
  await expect(page.getByRole("button", { name: "Residential", exact: true })).toBeVisible();   // canonical property on the project header
});

test("TEST 2: ADT Monitoring hands off to the ADT module, prefilled", async ({ page }) => {
  const box = await openModal(page);
  await box.locator("input").first().fill("E2E Modal ADT");
  await box.getByPlaceholder("Business name").fill("ADT Test Co");
  await box.getByRole("combobox", { name: "Service" }).selectOption("ADT");
  await expect(box.getByRole("combobox", { name: "Start from" })).toHaveCount(0);   // ADT has its own intake — no proposal to start from
  await box.getByRole("button", { name: /Continue to ADT/ }).click();
  await page.waitForURL(/\/adt\?/);
  await expect(page.locator('input[value="ADT Test Co"]')).toBeVisible();
});

test("TEST 7/9: Start From → Previous Project clones at creation; the form's property wins", async ({ page }) => {
  const box = await openModal(page);
  await box.locator("input").first().fill("E2E Modal Clone");
  await box.locator('input[type="tel"]').fill("2015550102");
  await box.getByRole("radio", { name: "Residential" }).click();
  await box.getByRole("combobox", { name: "Start from" }).selectOption("previous");
  const sheet = page.locator(".rp-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByPlaceholder("Search").fill("Joe");
  await sheet.locator(".rp-row").first().click();
  await sheet.getByRole("button", { name: "Use" }).click();
  await expect(box.locator(".np-src")).toContainText("items");
  await box.getByRole("button", { name: "Create Project" }).click();
  await page.waitForURL(/\/project\/A[A-Z]{2}[0-9A-Z]{4}/);
  await expect(page.locator(".prop-block").first()).toBeVisible();            // cloned line items
  await expect(page.getByRole("button", { name: "Residential", exact: true })).toBeVisible();   // TEST 9: destination stays Residential
});
