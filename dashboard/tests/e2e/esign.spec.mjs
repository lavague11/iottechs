// E-sign P1 — the PDF viewer: the stored proposal PDF renders page by page and the signature / name /
// date fields sit on the acceptance block (desktop + phone). Seeds its own throwaway project.
import { test, expect } from "@playwright/test";
import { makeProject, seedSentProposal, openSigner } from "./esign-helpers.mjs";

// Colour of the canvas pixel under the centre of a field: the generator draws every field over a cream
// (250,248,243) box, so a field laid on the right place reads cream underneath.
async function underField(page, key) {
  return page.evaluate((k) => {
    const f = document.querySelector(`[data-field="${k}"]`);
    const pg = f.closest(".esg-page"), c = pg.querySelector("canvas");
    const fr = f.getBoundingClientRect(), pr = pg.getBoundingClientRect();
    const cx = ((fr.left + fr.width / 2 - pr.left) / pr.width) * c.width, cy = ((fr.top + fr.height * 0.5 - pr.top) / pr.height) * c.height;
    const d = c.getContext("2d").getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
    return { rgb: [d[0], d[1], d[2]], box: { l: (fr.left - pr.left) / pr.width, t: (fr.top - pr.top) / pr.height, w: fr.width / pr.width, h: fr.height / pr.height }, page: +pg.dataset.page };
  }, key);
}

const near = (a, b, t = 6) => a.every((v, i) => Math.abs(v - b[i]) <= t);

for (const [label, size] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  test(`P1 ${label}: pages render and the fields sit on the acceptance block`, async ({ page, request, context }) => {
    await page.setViewportSize(size);
    const accessId = await makeProject(request, `p1-${label}`);
    seedSentProposal(accessId);
    await openSigner(page, context, accessId);

    await expect(page.locator(".esg-page canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => page.locator(".esg-page").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    const fields = page.getByTestId("esign-field");
    await expect(fields).toHaveCount(3);
    // The PDF actually painted (not a blank canvas): the page is non-uniform.
    await page.waitForFunction(() => { const c = document.querySelector(".esg-page canvas"); if (!c || !c.width) return false; const d = c.getContext("2d").getImageData(0, 0, c.width, Math.min(c.height, 200)).data; for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1]) return true; return false; }, null, { timeout: 30_000 });

    for (const k of ["name_A", "date_A", "signature_A"]) {
      const u = await underField(page, k);
      expect(near(u.rgb, [250, 248, 243]), `${k} sits over the cream acceptance box (${u.rgb})`).toBeTruthy();
      expect(u.box.l).toBeGreaterThanOrEqual(0); expect(u.box.l + u.box.w).toBeLessThanOrEqual(1.001);
      expect(u.box.t).toBeGreaterThan(0.3); expect(u.box.t + u.box.h).toBeLessThanOrEqual(1.001);
    }
    // Aligned after a reflow: resize the viewport and the same fractions still land on the cream box.
    const before = await underField(page, "signature_A");
    await page.setViewportSize({ width: size.width === 390 ? 430 : 1000, height: size.height });
    await page.waitForTimeout(800);
    const after = await underField(page, "signature_A");
    expect(near(after.rgb, [250, 248, 243])).toBeTruthy();
    expect(Math.abs(after.box.l - before.box.l)).toBeLessThan(0.005);
    expect(Math.abs(after.box.t - before.box.t)).toBeLessThan(0.005);
  });
}

test("P1: a stranger can't read the stored PDF; the owner can", async ({ page, request, context }) => {
  const accessId = await makeProject(request, "p1-gate");
  seedSentProposal(accessId);
  await openSigner(page, context, accessId);
  await expect(page.locator(".esg-page canvas").first()).toBeVisible({ timeout: 30_000 });
  const id = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/api/proposal-doc/")));
  expect(id).toBeTruthy();
  const ok = await page.request.get(id);
  expect(ok.status()).toBe(200);
  expect((await ok.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const anon = await request.get(id, { headers: { cookie: "" } });
  expect(anon.status()).toBe(404);
});
