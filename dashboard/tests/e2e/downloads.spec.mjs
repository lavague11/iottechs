// Real browser downloads carry the canonical filename: "<identity> - <service> - <last4> - vN.pdf" and
// the Detailed variant. Uses a seeded dev project with a proposal (E2E_PROJECT overrides).
import { test, expect } from "@playwright/test";

const LOGIN = { email: process.env.E2E_EMAIL || "manager@iot-techs.com", password: process.env.E2E_PASSWORD || "password" };
const PROJECT = process.env.E2E_PROJECT || "ASC0038";

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

test("Standard and Detailed proposal downloads use the canonical filename", async ({ page }) => {
  await signIn(page);
  await page.goto(`/project/${PROJECT}?deck=1&stage=proposal`);
  const menu = page.locator(".prop-dl");
  await expect(menu).toBeVisible({ timeout: 20000 });
  const last4 = PROJECT.slice(-4);
  const base = new RegExp(`^[^_()]+ - [^_()]+ - ${last4} - v\\d+(?: - Draft)?\\.pdf$`);

  await menu.locator("summary").click();
  const [std] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), menu.getByRole("button", { name: "Standard PDF" }).click()]);
  expect(std.suggestedFilename()).toMatch(base);
  expect(std.suggestedFilename()).not.toMatch(/IOT|_|\(\d\)|ASC/);

  await menu.locator("summary").click();
  const [det] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), menu.getByRole("button", { name: "Detailed PDF" }).click()]);
  expect(det.suggestedFilename()).toMatch(new RegExp(`^[^_()]+ - [^_()]+ - ${last4} - v\\d+ - Detailed(?: - Draft)?\\.pdf$`));
  expect(det.suggestedFilename().replace(" - Detailed", "")).toBe(std.suggestedFilename());
});
