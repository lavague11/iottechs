// Merge: System Preview folded into the Site Survey. One entry card (no "System Preview" card), a
// Map/Photos toggle in the survey, and Photos = the phone mockup (works alongside the map).
// Signs in as the seeded manager (dev seed: manager@iot-techs.com / password).
import { test, expect } from "@playwright/test";

const LOGIN = { email: process.env.E2E_EMAIL || "manager@iot-techs.com", password: process.env.E2E_PASSWORD || "password" };
const PROJECT = process.env.E2E_PROJECT || "ASC0056";

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

test("merge: no System Preview card, and the survey has a Map/Photos toggle with a working Photos grid", async ({ page }) => {
  await signIn(page);

  // The project page no longer shows a separate "System Preview" card — Site Survey is the only entry.
  await page.goto(`/project/${PROJECT}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await expect(page.getByText("System Preview", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Site Survey", { exact: true }).first()).toBeVisible();

  // Open the survey → the Map/Photos toggle is present.
  await page.goto(`/project/${PROJECT}?view=survey`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const toggle = page.locator(".syp-fb-viewtog");
  await expect(toggle).toBeVisible({ timeout: 15000 });
  await expect(toggle.getByRole("button", { name: "Map", exact: true })).toBeVisible();
  await expect(toggle.getByRole("button", { name: "Photos", exact: true })).toBeVisible();

  // Flip to Photos → the phone mockup grid loads (the merged System Preview, straight to the grid).
  await toggle.getByRole("button", { name: "Photos", exact: true }).click();
  await page.waitForTimeout(2500);
  const mock = page.frameLocator('iframe[src*="cctv-mockup"]');
  await expect(mock.locator("text=/CAM 1/i").first()).toBeVisible({ timeout: 12000 });

  // And back to Map.
  await toggle.getByRole("button", { name: "Map", exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(toggle.getByRole("button", { name: "Map", exact: true })).toHaveClass(/on/);
});
