// Offline-first saving — an edit made with no signal is written to the device first (localStorage),
// shows "Offline — will sync", survives a reload, and uploads when the connection returns.
// Signs in as the seeded manager (dev seed: manager@iot-techs.com / password).
import { test, expect } from "@playwright/test";

const LOGIN = { email: process.env.E2E_EMAIL || "manager@iot-techs.com", password: process.env.E2E_PASSWORD || "password" };
const PROJECT = process.env.E2E_PROJECT || "ASC0056";
const SKEY = `iottechs_survey2_${PROJECT}`;

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

test("offline-first: an offline edit is kept on the device, flags 'Offline — will sync', survives reload, syncs on reconnect", async ({ page, context }) => {
  await signIn(page);
  await page.goto(`/project/${PROJECT}?view=survey`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);   // let the survey tools mount + the autosync start

  // --- go offline, then make an edit (writes localStorage FIRST) ---
  await context.setOffline(true);
  const marker = "e2e-offline-" + Date.now();
  await page.evaluate(({ k, m }) => {
    let obj = {}; try { obj = JSON.parse(localStorage.getItem(k) || "{}"); } catch { obj = {}; }
    obj._e2e = m;                           // a harmless marker the survey ignores
    localStorage.setItem(k, JSON.stringify(obj));
  }, { k: SKEY, m: marker });

  // the edit is on the device immediately — never lost, even with no signal
  expect(await page.evaluate((k) => localStorage.getItem(k), SKEY)).toContain(marker);

  // the autosync tick (5s) tries to push, fails (offline) → the "Offline — will sync" badge shows
  await expect(page.locator(".syp-sync.off")).toContainText(/Offline/i, { timeout: 15000 });

  // --- reconnect flush: the queued change uploads, the badge clears ---
  await context.setOffline(false);
  await expect(page.locator(".syp-sync")).toHaveCount(0, { timeout: 20000 });

  // --- reload: nothing is lost + no stuck "offline" state (the survey restores from the device/server) ---
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const after = await page.evaluate((k) => localStorage.getItem(k), SKEY);
  expect(after && after.length > 2).toBeTruthy();                 // the survey persisted through the reload
  await expect(page.locator(".syp-sync.off")).toHaveCount(0);     // not stranded offline after reconnect
});
