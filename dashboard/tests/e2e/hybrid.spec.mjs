// Phase 4 hybrid Site Survey — e2e. The widget is a static page (/widgets/site-survey-merged.html) that restores from
// localStorage["iottechs_survey2_<PID>"], so we SEED a hybrid-capable floor (ctx aerial + transparent plan layer + opaque
// ctx-framed bg + bgCtx) before the widget script runs — no Google Maps, no outline → Done flow needed.
import { test, expect } from "@playwright/test";

const PID = "E2EHYB" + Date.now();
const VB = "0 0 336 224";
const svg = (fill, extra = "") => "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" width="336" height="224">${fill ? `<rect width="336" height="224" fill="${fill}"/>` : ""}${extra}</svg>`);
const AERIAL = svg("#3A6B35");                                                   // aerial crop (green)
const PLAN_OPAQUE = svg("#F4F1E8", '<rect x="60" y="50" width="216" height="124" fill="none" stroke="#222222"/>');   // ctx-framed opaque plan = floor.bg
const PLAN_LAYER = svg(null, '<rect x="60" y="50" width="216" height="124" fill="#FFFFFF" fill-opacity=".85" stroke="#222222"/>');   // transparent plan layer

const FLOOR = {
  id: "f_e2ehyb01", name: "Floor 1", started: true, bgSource: "draw", view: "hybrid",
  bg: PLAN_OPAQUE, planSvg: PLAN_LAYER, bgCtx: true,
  ctx: { src: AERIAL, rect: { x: 0.22, y: 0.22, w: 0.56, h: 0.56 }, northDeg: 0, ftW: 60, ftH: 40 },
  scale: { ftW: 60, ftH: 40 },
  plan: { v: 1, cells: ["5,5"], rooms: [], metersPerPx: 0.0586 },    // 26 plan px * .0586 m / .3048 = 5 ft per grid box
  aerial: { northDeg: 0, rotationDeg: 0 },
  devices: [
    { k: "cam", x: 30, y: 40, aim: 90, aimed: true, fov: 90, range: 15, name: "A", cid: "ca" },
    { k: "cam", x: 70, y: 60, aim: 90, aimed: true, fov: 90, range: 15, name: "B", cid: "cb" },
  ],
};
const SAVED = { floors: [FLOOR], curFloor: 0, step: 1 };                         // same shape the widget's save() writes (+ showGrid defaults on)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key, saved]) => { try { localStorage.setItem(key, saved); } catch (e) {} }, ["iottechs_survey2_" + PID, JSON.stringify(SAVED)]);
  await page.goto(`/widgets/site-survey-merged.html?project=${PID}&prop=residential`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#viewSeg")).toBeVisible({ timeout: 15000 });         // restored + hybrid-capable
  await expect(page.locator(".devNode")).toHaveCount(2);
});

const view = (page, v) => page.locator(`#viewSeg [data-v="${v}"]`);
const setView = async (page, v) => {
  await view(page, v).click();
  await expect(view(page, v)).toHaveClass(/\bon\b/);
};
const markers = (page) => page.evaluate(() => [...document.querySelectorAll(".devNode")].map((n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
const layers = (page) => page.evaluate(() => {
  const cs = (id) => getComputedStyle(document.getElementById(id));
  return { aerialDisplay: cs("aerialImg").display, aerialBg: cs("aerialImg").backgroundImage, stageBg: cs("stageImg").backgroundImage };
});

test("view pill is present and defaults to Hybrid", async ({ page }) => {
  await expect(page.locator("#viewSeg")).toBeVisible();
  await expect(view(page, "hybrid")).toHaveClass(/\bon\b/);
  await expect(view(page, "plan")).not.toHaveClass(/\bon\b/);
  await expect(view(page, "satellite")).not.toHaveClass(/\bon\b/);
});

test("markers do not move across Hybrid / Aerial / Plan", async ({ page }) => {
  await expect.poll(async () => (await markers(page)).length).toBe(2);
  const hybrid = await markers(page);
  await setView(page, "satellite");
  const sat = await markers(page);
  await setView(page, "plan");
  const plan = await markers(page);
  await setView(page, "hybrid");
  const back = await markers(page);
  for (let i = 0; i < hybrid.length; i++) {
    for (const other of [sat, plan, back]) {
      expect(Math.abs(other[i].x - hybrid[i].x)).toBeLessThan(0.5);
      expect(Math.abs(other[i].y - hybrid[i].y)).toBeLessThan(0.5);
    }
  }
});

test("layer visibility per mode", async ({ page }) => {
  await setView(page, "plan");
  let l = await layers(page);
  expect(l.aerialDisplay).toBe("none");
  expect(l.stageBg).toContain("url(");                                           // opaque plan

  await setView(page, "satellite");
  l = await layers(page);
  expect(l.aerialDisplay).not.toBe("none");
  expect(l.aerialBg).toContain("url(");
  expect(l.stageBg).not.toContain("url(");                                       // plan layer transparent

  await setView(page, "hybrid");
  l = await layers(page);
  expect(l.aerialDisplay).not.toBe("none");
  expect(l.aerialBg).toContain("url(");
  expect(l.stageBg).toContain("url(");                                           // aerial + transparent plan
});

test("grid overlay and scale label show, toggle off and on", async ({ page }) => {
  const grid = page.locator("#gridLayer"), lab = page.locator("#gridScale");
  await expect(grid).toHaveCSS("display", "block");
  await expect(lab).toBeVisible();
  await expect(lab).toHaveText(/1 box = .* ft/);
  await page.locator("#showBtn").click();
  await expect(page.locator("#showGridTog")).toBeVisible();
  await page.locator("#showGridTog").click();
  await expect(grid).toHaveCSS("display", "none");
  await expect(lab).toBeHidden();
  await page.locator("#showGridTog").click();
  await expect(grid).toHaveCSS("display", "block");
  await expect(lab).toBeVisible();
  await expect(lab).toHaveText(/1 box = .* ft/);
});

test("side chips are Hybrid-only", async ({ page }) => {
  const chips = page.locator("#working .sidechip");
  await expect(chips).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(chips.nth(i)).toBeVisible();
  await setView(page, "plan");
  for (let i = 0; i < 4; i++) await expect(chips.nth(i)).toBeHidden();
  await setView(page, "satellite");
  for (let i = 0; i < 4; i++) await expect(chips.nth(i)).toBeHidden();
  await setView(page, "hybrid");
  for (let i = 0; i < 4; i++) await expect(chips.nth(i)).toBeVisible();
});

test("background tool shows the Back strip and Back returns to the working canvas", async ({ page }) => {
  await expect(page.locator("#working")).toBeVisible();
  await page.evaluate(() => enterBg());                                           // opens the satellite tool (same path as the chooser door)
  await expect(page.locator("#bgWiz")).toBeVisible();
  await expect(page.locator("#satBack")).toBeVisible();
  await page.locator("#satBack").click();
  await expect(page.locator("#bgWiz")).toBeHidden();
  await expect(page.locator("#working")).toBeVisible();
  await expect(page.locator("#viewSeg")).toBeVisible();
});
