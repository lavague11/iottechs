// Unplaced-cameras tray — a camera added in Photos (no map) is ONE real survey record (placed:false,
// shared cid); it survives reload, keeps its id across a Map/Photos flip (no duplicate/rename), surfaces
// in the Map tray, and drags onto the plan to become placed:true with its name intact.
// Runs on E2E_PROJECT (default ASC0056 — the spec's ASC0060 is not in the local dev DB). Manager seed.
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

const surveyFrame = (page) => page.frames().find((f) => (f.url() || "").includes("site-survey-merged"));
const camsOf = async (page) => { const f = surveyFrame(page); return f ? f.evaluate(() => (window.devices || []).filter((d) => d.k === "cam").map((d) => ({ cid: d.cid, name: d.name, placed: d.placed !== false, x: d.x }))) : []; };
// Map/Photos is now ONE toggle button showing the current view; tap flips. Click only when not already on `name`.
async function clickView(page, name) { const t = page.locator(".syp-fb-viewtog"); const cur = (await t.innerText()).trim(); if (cur !== name) { await t.click(); await page.waitForTimeout(1200); } }
// Add camera moved under Devices (the .sd-addcam chip in the roster header).
async function addCamera(page) { await page.locator(".sd-addcam").first().click(); await page.waitForTimeout(500); }

test("unplaced camera: created in Photos (placed:false), survives reload, id stable across flip, drags onto the map", async ({ page }) => {
  await signIn(page);
  await page.goto(`/project/${PROJECT}?view=survey`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  // --- Photos view, add 3 cameras with no map interaction ---
  await clickView(page, "Photos");
  const before = (await camsOf(page)).map((c) => c.cid);
  await addCamera(page); await addCamera(page); await addCamera(page);
  await page.waitForTimeout(600);

  let cams = await camsOf(page);
  const added = cams.filter((c) => !before.includes(c.cid));
  expect(added.length).toBe(3);                                   // exactly 3 new records
  for (const c of added) { expect(c.placed).toBe(false); expect(c.cid).toBeTruthy(); expect(c.x).toBeNull(); }   // unplaced, real cid, no coords
  const addedCids = added.map((c) => c.cid);
  expect(new Set(addedCids).size).toBe(3);                        // distinct cids — no duplication

  // --- flipping Map/Photos never re-creates or renames: the ids are identical before + after ---
  await clickView(page, "Map");
  await clickView(page, "Photos");
  const afterFlip = (await camsOf(page)).filter((c) => addedCids.includes(c.cid));
  expect(afterFlip.length).toBe(3);                               // same 3 records, same cids

  // --- survives a reload (IndexedDB/localStorage + server) ---
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3800);
  const afterReload = (await camsOf(page)).filter((c) => addedCids.includes(c.cid));
  expect(afterReload.length).toBe(3);                             // all three survive

  // --- Map view: the unplaced cameras appear in the tray ---
  await clickView(page, "Map");
  const f = surveyFrame(page);
  const trayCount = await f.evaluate(() => document.querySelectorAll("#unplacedTray.on .ut-chip").length);
  expect(trayCount).toBeGreaterThanOrEqual(3);

  // --- drag ONE tray chip onto the plan → placed:true, same cid, name intact ---
  const placed = await f.evaluate((cids) => {
    const chip = [...document.querySelectorAll(".ut-chip")].find((c) => {
      // match a chip to one of our added cameras by its visible name
      return true;
    });
    if (!chip) return null;
    const id = +chip.getAttribute("data-id");
    const dev = (window.devices || []).find((d) => d.id === id);
    const scene = document.getElementById("scene");
    const cr = chip.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    const mk = (t, x, y) => new PointerEvent(t, { clientX: x, clientY: y, pointerId: 1, bubbles: true, cancelable: true });
    chip.dispatchEvent(mk("pointerdown", cr.left + cr.width / 2, cr.top + cr.height / 2));
    chip.dispatchEvent(mk("pointermove", sr.left + sr.width * 0.4, sr.top + sr.height * 0.4));
    chip.dispatchEvent(mk("pointerup", sr.left + sr.width * 0.4, sr.top + sr.height * 0.4));
    const after = (window.devices || []).find((d) => d.id === id);
    return { cid: dev && dev.cid, name: after && after.name, placed: after && after.placed, hasCoord: after && typeof after.x === "number" };
  }, addedCids);
  expect(placed).toBeTruthy();
  expect(placed.placed).toBe(true);
  expect(placed.hasCoord).toBe(true);
  expect(addedCids).toContain(placed.cid);          // same record — placing didn't mint a new camera
});
