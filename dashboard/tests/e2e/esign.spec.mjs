// E-sign P1 — the PDF viewer: the stored proposal PDF renders page by page and the signature / name /
// date fields sit on the acceptance block (desktop + phone). Seeds its own throwaway project.
import { test, expect } from "@playwright/test";
import { makeProject, seedSentProposal, openSigner, PAYLOAD } from "./esign-helpers.mjs";

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

// ---- P2: session + capture --------------------------------------------------------------------------
import { openDb } from "./esign-helpers.mjs";
const PAYLOAD_EDIT = { ...PAYLOAD, options: [{ ...PAYLOAD.options[0], services: [{ ...PAYLOAD.options[0].services[0], items: [{ id: "li1", name: "Camera Location 1", qty: 4, price: 999 }] }] }] };

const sessionRow = (accessId) => { const db = openDb(); const r = db.prepare("SELECT * FROM sign_sessions WHERE project_access_id=? ORDER BY rowid DESC LIMIT 1").get(accessId); db.close(); return r; };

async function adoptTyped(page, name = "Jordan Rivera") {
  await page.getByTestId("esign-next").click();
  await expect(page.getByTestId("esign-capture")).toBeVisible();
  await page.getByTestId("esign-tab-type").click();
  await page.locator("#esg-name").fill(name);
  await page.getByTestId("esign-adopt").click();
  await expect(page.getByTestId("esign-capture")).toHaveCount(0, { timeout: 15_000 });
}

for (const [label, size] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  test(`P2 ${label}: adopt (typed) fills name, signature and date; survives a reload; consent is saved`, async ({ page, request, context }) => {
    await page.setViewportSize(size);
    const accessId = await makeProject(request, `p2-typed-${label}`);
    seedSentProposal(accessId);
    await openSigner(page, context, accessId);
    await expect(page.getByTestId("esign-field")).toHaveCount(3, { timeout: 30_000 });
    await expect(page.getByTestId("esign-finish")).toBeDisabled();
    await adoptTyped(page);
    for (const t of ["name", "signature", "date"]) await expect(page.locator(`[data-type="${t}"]`)).toHaveAttribute("data-done", "1");
    await expect(page.locator('[data-type="name"]')).toContainText("Jordan Rivera");
    await expect(page.locator('[data-type="signature"] img')).toBeVisible();
    await expect(page.getByTestId("esign-finish")).toBeEnabled();

    // Saved server-side: the session row holds the validated values (signature as a PNG data URL ≤ 200KB).
    const v = JSON.parse(sessionRow(accessId).values_json);
    expect(v.name).toBe("Jordan Rivera");
    expect(v.signature.method).toBe("type");
    expect(v.signature.data.startsWith("data:image/png;base64,")).toBeTruthy();
    expect(v.signature.data.length).toBeLessThan(270_000);

    // Reload → the same session resumes with the adopted signature still on the page.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Approve & Sign|Review & Sign/ }).first().click();
    await expect(page.locator('[data-type="signature"] img')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-type="name"]')).toContainText("Jordan Rivera");

    // Finish → agreement: Sign stays disabled until the required acknowledgments are checked.
    await page.getByTestId("esign-finish").click();
    await expect(page.getByTestId("esign-consent")).toBeVisible();
    await expect(page.getByTestId("esign-confirm")).toBeDisabled();
    await page.getByTestId("esign-ack-terms").check();
    await expect(page.getByTestId("esign-confirm")).toBeDisabled();
    await page.getByTestId("esign-ack-payment").check();
    await expect(page.getByTestId("esign-confirm")).toBeEnabled();
    await page.getByTestId("esign-confirm").click();
    await expect(page.getByTestId("esign-toast")).toHaveText("Saved");
    const saved = JSON.parse(sessionRow(accessId).values_json);
    expect(saved.acks.terms && saved.acks.payment).toBe(true);
  });
}

test("P2: drawn signature (signature_pad) is stored as a PNG", async ({ page, request, context }) => {
  const accessId = await makeProject(request, "p2-draw");
  seedSentProposal(accessId);
  await openSigner(page, context, accessId);
  await expect(page.getByTestId("esign-field")).toHaveCount(3, { timeout: 30_000 });
  await page.getByTestId("esign-next").click();
  const pad = page.getByTestId("esign-pad");
  await expect(pad).toBeVisible();
  await expect(page.getByTestId("esign-adopt")).toBeDisabled();
  const b = await pad.boundingBox();
  await page.mouse.move(b.x + b.width * 0.15, b.y + b.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(b.x + b.width * (0.15 + i * 0.03), b.y + b.height * (0.6 - Math.sin(i / 3) * 0.25), { steps: 2 });
  await page.mouse.up();
  await page.locator("#esg-name").fill("sam lee");
  await expect(page.getByTestId("esign-adopt")).toBeEnabled();
  await page.getByTestId("esign-adopt").click();
  await expect(page.locator('[data-type="signature"] img')).toBeVisible({ timeout: 15_000 });
  const v = JSON.parse(sessionRow(accessId).values_json);
  expect(v.name).toBe("Sam Lee");
  expect(v.signature.method).toBe("draw");
  expect(v.signature.width).toBeGreaterThan(20);
});

test("P2: a proposal edited under an open session is refused (Reopen → review the update)", async ({ page, request, context }) => {
  const accessId = await makeProject(request, "p2-drift");
  seedSentProposal(accessId);
  await openSigner(page, context, accessId);
  await expect(page.getByTestId("esign-field")).toHaveCount(3, { timeout: 30_000 });
  // The office changes the price while the customer has the document open.
  const db = openDb();
  const edited = { ...PAYLOAD_EDIT };
  db.prepare("UPDATE proposals SET payload=? WHERE project_access_id=?").run(JSON.stringify(edited), accessId);
  db.close();
  await page.getByTestId("esign-next").click();
  await page.getByTestId("esign-tab-type").click();
  await page.locator("#esg-name").fill("Pat Doe");
  await page.getByTestId("esign-adopt").click();
  await expect(page.getByTestId("esign-fatal")).toContainText(/changed/i, { timeout: 15_000 });
  await page.getByTestId("esign-reopen").click();
  await expect(page.getByTestId("esign-field")).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByTestId("esign-fatal")).toHaveCount(0);
});
