// audit.mjs — Playwright UI + quality audit (adapted for IOT TECHS local dev).
//
// Walks the app's routes and, per page, captures:
//   • full-page screenshots at mobile / tablet / desktop
//   • accessibility violations (axe-core)
//   • first-letter capitalization slips on labels, headings, buttons, placeholders
//   • low-contrast text — including HOVER state (catches black-on-black)
//   • broken links (checked once, across the whole site)
//   • visual regression vs a saved baseline (diff images for anything that moved)
//   • console errors + failed network requests
//
// Setup (once), from the dashboard/ folder:
//   npm i -D @axe-core/playwright pixelmatch pngjs      # optional passes (script degrades without them)
//   npx playwright install chromium                     # @playwright/test is already a devDependency
//
// Run (from dashboard/):
//   node scripts/audit.mjs             audits the local dev server (auto-logs in as the seeded manager)
//   node scripts/audit.mjs --login     force a fresh MANUAL login in a headful browser (session expired)
//   node scripts/audit.mjs --baseline  promote this run's screenshots to the new baseline
//
// Target + credentials are env-overridable:
//   AUDIT_BASE=http://localhost:3100  AUDIT_EMAIL=manager@iot-techs.com  AUDIT_PASSWORD=password
// Point AUDIT_BASE at https://iot-techs.com to audit production (auto-login only works if those creds
// are valid there; otherwise use --login and sign in by hand once).
//
// Then: "read summary.md + the screenshots in audit/<date>, then walk report.json."

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

// Local dev by default — start the app first (preview_start / npm run dev on :3100).
const BASE = (process.env.AUDIT_BASE || 'http://localhost:3100').replace(/\/$/, '');
// Seeded dev staff account (lib/db.js STAFF seed). Override via env for other users / production.
const LOGIN_EMAIL    = process.env.AUDIT_EMAIL    || 'manager@iot-techs.com';
const LOGIN_PASSWORD = process.env.AUDIT_PASSWORD || 'password';

// Broad staff sweep — the console pages a manager can reach. A /project/<id> page needs a real access
// id, so it's left commented (fill in one from your data to include the project deck in the audit).
const ROUTES = [
  '/dashboard',
  '/projects',
  '/customers',
  '/sales',
  '/tech',
  '/manager',
  '/finances',
  '/expenses',
  '/inventory',
  '/activity',
  '/operations',
  '/users',
  '/notifications',
  '/portal',
  '/receivables',
  '/archives',
  '/hiring',
  '/adt-applications',
  '/bugs',
  '/dev',
  // '/project/ASC0042',   // a real project deck — set a valid access id from your DB
];

// Desktop LAST — the analysis passes run at whatever size the page ends on.
const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844  },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1440, height: 900  },
];

const CONTRAST_MIN   = 3.0;   // ratios below this are flagged (WCAG large-text floor)
const DIFF_THRESHOLD = 0.005; // >0.5% changed pixels = visual regression
const HOVER_CAP      = 80;    // max interactive elements hover-checked per page

const AUTH_FILE   = 'auth.json';
const BASELINE    = path.join('audit', 'baseline');
const forceLogin  = process.argv.includes('--login');
const setBaseline = process.argv.includes('--baseline');

// ---- optional deps: degrade gracefully if not installed ----
let AxeBuilder = null, pixelmatch = null, PNG = null;
try { const ax = await import('@axe-core/playwright'); AxeBuilder = ax.AxeBuilder || ax.default; }
catch { console.log('  (skip a11y — run: npm i -D @axe-core/playwright)'); }
try {
  const pm = await import('pixelmatch'); pixelmatch = pm.default || pm;
  const pg = await import('pngjs');       PNG = pg.PNG || pg.default?.PNG;
} catch { console.log('  (skip visual regression — run: npm i -D pixelmatch pngjs)'); }

// ---- helpers ----
const slug  = (r) => r.replace(/^\//, '').replace(/\//g, '_') || 'home';
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT   = path.join('audit', stamp);
const DIFFS = path.join(OUT, 'diffs');
fs.mkdirSync(OUT, { recursive: true });

function pause(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(msg, () => { rl.close(); res(); }));
}

// Non-interactive login against the app's two-step /login form (email → Continue → password → Sign In).
// Returns true on success. Used for local dev so the audit is one command; falls back to manual (--login
// path) when it can't confirm a signed-in session.
async function autoLogin(page) {
  try {
    await page.goto(BASE + '/login', { waitUntil: 'load', timeout: 30000 });
    const email = page.getByPlaceholder(/email or phone/i).first();
    await email.waitFor({ timeout: 8000 });
    await email.fill(LOGIN_EMAIL);
    await page.getByRole('button', { name: /continue/i }).first().click();
    const pw = page.getByPlaceholder(/password/i).first();
    await pw.waitFor({ timeout: 8000 });
    await pw.fill(LOGIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    // Signed in when we're no longer on /login.
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 12000 });
    return true;
  } catch (e) {
    console.log('  (auto-login failed: ' + e.message.split('\n')[0] + ')');
    return false;
  }
}

// Runs in the browser: computes text-vs-effective-background contrast for one element.
function contrastFn(node) {
  const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const s = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  };
  const eff = (el) => { // walk up until a non-transparent background is found
    let n = el;
    while (n) { const p = parse(getComputedStyle(n).backgroundColor); if (p.length >= 3 && p[3] !== 0) return p.slice(0, 3); n = n.parentElement; }
    return [255, 255, 255];
  };
  const cs = getComputedStyle(node);
  const fg = parse(cs.color).slice(0, 3);
  const bg = eff(node);
  const L1 = lum(fg) + 0.05, L2 = lum(bg) + 0.05;
  const ratio = +(Math.max(L1, L2) / Math.min(L1, L2)).toFixed(2);
  return { text: (node.innerText || '').trim().slice(0, 50), color: cs.color, bg: `rgb(${bg.join(',')})`, ratio };
}

// ---- Step 1: logged-in session ----
if (!fs.existsSync(AUTH_FILE) || forceLogin) {
  if (!forceLogin) {
    // Try the automated seeded-manager login headlessly first (local dev convenience).
    const b = await chromium.launch({ headless: true });
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const ok = await autoLogin(page);
    if (ok) { await ctx.storageState({ path: AUTH_FILE }); console.log('Auto-login OK -> ' + AUTH_FILE + '\n'); }
    await b.close();
  }
  // Manual fallback (or --login): open a real window and let a human sign in.
  if (forceLogin || !fs.existsSync(AUTH_FILE)) {
    const b = await chromium.launch({ headless: false });
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/login');
    await pause('\nLog in in the browser window, then press Enter here...\n');
    await ctx.storageState({ path: AUTH_FILE });
    await b.close();
    console.log('Saved login -> ' + AUTH_FILE + '\n');
  }
}

// ---- Step 2: audit headless ----
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: AUTH_FILE });
const report = [];
const allLinks = new Map(); // href -> Set(routes it appeared on)

for (const route of ROUTES) {
  const url = BASE + route;
  const issues = { route, url, navError: null, consoleErrors: [], failedRequests: [], a11y: [], caps: [], contrast: [], visual: [] };
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && issues.consoleErrors.push(m.text()));
  page.on('requestfailed', (r) => issues.failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));

  // screenshots at each viewport (desktop ends up active, last in the array)
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `${slug(route)}__${vp.name}.png`), fullPage: true });
      console.log(`  OK ${route} @ ${vp.name}`);
    } catch (e) { issues.navError = e.message.split('\n')[0]; console.log(`  XX ${route} @ ${vp.name} — ${issues.navError}`); }
  }

  // --- analysis passes (once, at desktop) ---

  // accessibility
  if (AxeBuilder) {
    try {
      const res = await new AxeBuilder({ page }).analyze();
      issues.a11y = res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length }));
    } catch (e) { issues.a11y = [{ id: 'axe-error', help: e.message.split('\n')[0] }]; }
  }

  // capitalization: first visible letter should be uppercase
  issues.caps = await page.evaluate(() => {
    const out = [], seen = new Set();
    const lowerStart = (t) => { const m = (t || '').trim().match(/[a-zA-Z]/); return m && m[0] === m[0].toLowerCase(); };
    ['label', 'th', 'legend', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', '[role="tab"]', 'option'].forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        const t = (el.innerText || '').trim();
        if (!t || !lowerStart(t)) return;
        const k = sel + '|' + t.slice(0, 60); if (seen.has(k)) return; seen.add(k);
        out.push({ where: sel, text: t.slice(0, 80) });
      });
    });
    document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach((el) => {
      const t = el.getAttribute('placeholder'); if (lowerStart(t)) out.push({ where: 'placeholder', text: (t || '').slice(0, 80) });
    });
    return out;
  });

  // hover contrast (catches black-on-black on hover)
  const els = await page.$$('a, button, [role="button"], [role="link"]');
  let checked = 0;
  for (const el of els) {
    if (checked >= HOVER_CAP) break;
    if (!(await el.isVisible().catch(() => false))) continue;
    checked++;
    const rest = await el.evaluate(contrastFn).catch(() => null);
    await el.hover({ timeout: 800 }).catch(() => {});
    await page.waitForTimeout(60);
    const hover = await el.evaluate(contrastFn).catch(() => null);
    if (hover && hover.ratio < CONTRAST_MIN) issues.contrast.push({ state: 'hover', ...hover, restRatio: rest?.ratio ?? null });
    else if (rest && rest.ratio < CONTRAST_MIN) issues.contrast.push({ state: 'rest', ...rest });
  }

  // collect links for the global broken-link check
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
  hrefs.forEach((h) => {
    if (/^(mailto:|tel:|javascript:|data:|blob:|#)/i.test(h)) return;
    if (!allLinks.has(h)) allLinks.set(h, new Set());
    allLinks.get(h).add(route);
  });

  issues.consoleErrors = [...new Set(issues.consoleErrors)];
  issues.failedRequests = [...new Set(issues.failedRequests)];
  report.push(issues);
  await page.close();
}

// ---- broken links (once, across the site) ----
const brokenLinks = [];
console.log(`\nChecking ${allLinks.size} unique links...`);
for (const [href, routes] of allLinks) {
  try {
    const res = await context.request.get(href, { timeout: 15000, maxRedirects: 5 });
    if (res.status() >= 400) brokenLinks.push({ url: href, status: res.status(), foundOn: [...routes] });
  } catch (e) { brokenLinks.push({ url: href, status: 'ERR', error: e.message.split('\n')[0], foundOn: [...routes] }); }
}

await browser.close();

// ---- visual regression vs baseline ----
const shots = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
if (setBaseline || !fs.existsSync(BASELINE)) {
  fs.mkdirSync(BASELINE, { recursive: true });
  shots.forEach((f) => fs.copyFileSync(path.join(OUT, f), path.join(BASELINE, f)));
  console.log(setBaseline ? 'Baseline updated to this run.' : 'Baseline seeded from this run.');
} else if (pixelmatch && PNG) {
  fs.mkdirSync(DIFFS, { recursive: true });
  for (const f of shots) {
    const basePath = path.join(BASELINE, f);
    if (!fs.existsSync(basePath)) continue;
    const cur = PNG.sync.read(fs.readFileSync(path.join(OUT, f)));
    const old = PNG.sync.read(fs.readFileSync(basePath));
    const route = report.find((r) => f.startsWith(slug(r.route) + '__'));
    if (cur.width !== old.width || cur.height !== old.height) {
      route?.visual.push({ shot: f, change: 'size-changed', from: `${old.width}x${old.height}`, to: `${cur.width}x${cur.height}` });
      continue;
    }
    const diff = new PNG({ width: cur.width, height: cur.height });
    const changed = pixelmatch(cur.data, old.data, diff.data, cur.width, cur.height, { threshold: 0.1 });
    const ratio = changed / (cur.width * cur.height);
    if (ratio > DIFF_THRESHOLD) {
      fs.writeFileSync(path.join(DIFFS, f), PNG.sync.write(diff));
      route?.visual.push({ shot: f, change: `${(ratio * 100).toFixed(2)}% pixels moved`, diff: `diffs/${f}` });
    }
  }
}

// ---- write outputs ----
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, generated: stamp, routes: report, brokenLinks }, null, 2));

const line = (r) =>
  `### ${r.route}\n` +
  (r.navError ? `- nav error: ${r.navError}\n` : '') +
  (r.caps.length ? `- caps: ${r.caps.length} (${r.caps.slice(0, 4).map((c) => `"${c.text}"`).join(', ')}${r.caps.length > 4 ? '...' : ''})\n` : '') +
  (r.contrast.length ? `- contrast: ${r.contrast.length} low (${r.contrast.filter((c) => c.state === 'hover').length} on hover)\n` : '') +
  (r.a11y.length ? `- a11y: ${r.a11y.length} (${r.a11y.slice(0, 4).map((a) => a.id).join(', ')}${r.a11y.length > 4 ? '...' : ''})\n` : '') +
  (r.visual.length ? `- visual: ${r.visual.map((v) => `${v.shot} ${v.change}`).join('; ')}\n` : '') +
  (r.consoleErrors.length ? `- console: ${r.consoleErrors.length} error(s)\n` : '') +
  (r.failedRequests.length ? `- failed requests: ${r.failedRequests.length}\n` : '');

const summary =
  `# UI Audit — ${stamp}\n\n${BASE}\n\n` +
  report.map(line).join('\n') +
  (brokenLinks.length ? `\n### Broken links (${brokenLinks.length})\n` + brokenLinks.map((b) => `- [${b.status}] ${b.url} (on ${b.foundOn.join(', ')})`).join('\n') + '\n' : '\n### Broken links: none\n');
fs.writeFileSync(path.join(OUT, 'summary.md'), summary);

console.log(`\nDone -> ${OUT}`);
console.log(`  screenshots + report.json + summary.md${brokenLinks.length ? `  |  ${brokenLinks.length} broken link(s)` : ''}\n`);
