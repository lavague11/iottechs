import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeApi } from "./api.mjs";
import { setupWorktree, depChanged, changedFiles, commitAndPush, removeWorktree, hasChanges, branchFor, repoWebUrl } from "./git.mjs";
import { downloadEvidence, buildPrompt } from "./envelope.mjs";
import { runClaude } from "./claude.mjs";
import { runSync } from "./proc.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(HERE, ".runner-state.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);

// ---- config (.env next to this file) --------------------------------------------------------------
function loadEnv() {
  const f = path.join(HERE, ".env");
  const env = { ...process.env };
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}
const E = loadEnv();
const CFG = {
  baseUrl: E.QUEUE_BASE_URL,
  token: E.QUEUE_TOKEN,
  automationBase: E.AUTOMATION_BASE,
  primary: E.PRIMARY_WORKSPACE || "",
  claudeBin: E.CLAUDE_BIN || "claude",
  pollMs: Number(E.POLL_MS) || 12000,
  claudeTimeoutMs: Number(E.CLAUDE_TIMEOUT_MS) || 25 * 60 * 1000,
  testTimeoutMs: Number(E.TEST_TIMEOUT_MS) || 6 * 60 * 1000,
  buildTimeoutMs: Number(E.BUILD_TIMEOUT_MS) || 12 * 60 * 1000,
};

// ---- fail-safe startup guards (NEVER touch the primary workspace) ---------------------------------
function assertSafe() {
  const miss = ["QUEUE_BASE_URL", "QUEUE_TOKEN", "AUTOMATION_BASE"].filter((k) => !E[k]);
  if (miss.length) throw new Error(`Missing config: ${miss.join(", ")} (set them in tools/bug-runner/.env).`);
  const base = path.resolve(CFG.automationBase);
  if (!fs.existsSync(path.join(base, ".git"))) throw new Error(`AUTOMATION_BASE is not a git clone: ${base}`);
  if (!fs.existsSync(path.join(base, ".bug-runner-ok"))) throw new Error(`Safety marker missing. In the automation clone run:  echo ok > .bug-runner-ok  (this file is gitignored and must NOT exist in your primary workspace).`);
  if (CFG.primary && path.resolve(CFG.primary) === base) throw new Error("AUTOMATION_BASE equals PRIMARY_WORKSPACE — refusing to run against your primary workspace.");
  if (!fs.existsSync(path.join(base, "dashboard", "node_modules"))) throw new Error(`No node_modules in ${base}\\dashboard — run \`npm ci\` there once.`);
  CFG.automationBase = base;
}

// ---- state (one in-flight bug at a time) ----------------------------------------------------------
function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return null; } }
function writeState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }
function clearState() { try { fs.rmSync(STATE_FILE); } catch {} }

// ---- validation gate: targeted → full npm test → npm run build ------------------------------------
function npm(args, cwd, timeout) {
  const r = runSync("npm", args, { cwd, timeout });
  const tail = ((r.stdout || "") + "\n" + (r.stderr || "")).trim().slice(-1500);
  return { ok: r.status === 0 && !r.error, tail };
}
function targetedFiles(base, files) {
  const dash = path.join(base, "dashboard");
  const picks = new Set();
  for (const f of files) {
    if (/^dashboard\/tests\/.+\.test\.mjs$/.test(f)) picks.add(f.replace(/^dashboard\//, ""));
    const b = path.basename(f).replace(/\.(jsx?|mjs)$/, "");
    const guess = path.join("tests", `${b}.test.mjs`);
    if (b && fs.existsSync(path.join(dash, guess))) picks.add(guess.replace(/\\/g, "/"));
  }
  return [...picks];
}
function validate(base, files) {
  const dash = path.join(base, "dashboard");
  const v = { targeted: "n/a", test: "pending", build: "pending" };
  const targets = targetedFiles(base, files);
  if (targets.length) {
    // node --test on just the targeted files (a fast first gate, more precise than the whole suite).
    const t = runSync("node", ["--test", ...targets], { cwd: dash, timeout: CFG.testTimeoutMs });
    v.targeted = t.status === 0 ? "pass" : "fail";
    if (v.targeted === "fail") return { ok: false, v, gate: "targeted", tail: ((t.stdout || "") + (t.stderr || "")).slice(-1500) };
  }
  const test = npm(["test"], dash, CFG.testTimeoutMs);
  v.test = test.ok ? "pass" : "fail";
  if (!test.ok) return { ok: false, v, gate: "test", tail: test.tail };
  const build = npm(["run", "build"], dash, CFG.buildTimeoutMs);
  v.build = build.ok ? "pass" : "fail";
  if (!build.ok) return { ok: false, v, gate: "build", tail: build.tail };
  return { ok: true, v };
}

// ---- one bug --------------------------------------------------------------------------------------
async function processBug(api, bug) {
  const base = CFG.automationBase;
  const branch = branchFor(bug.id);
  let hb = null;
  const startHeartbeat = () => { hb = setInterval(() => api.heartbeat(bug.id), 45000); };
  const stopHeartbeat = () => { if (hb) clearInterval(hb); hb = null; };
  let wt = null;
  try {
    writeState({ bugId: bug.id, phase: "setup", startedAt: now() });
    log(`Bug #${bug.id}: creating worktree ${branch}`);
    ({ wt } = setupWorktree(base, bug.id));

    writeState({ bugId: bug.id, phase: "evidence", wt, branch });
    const shots = await downloadEvidence(api, bug, wt);
    log(`Bug #${bug.id}: ${shots.length} screenshot(s) downloaded`);

    writeState({ bugId: bug.id, phase: "claude", wt, branch });
    startHeartbeat();
    log(`Bug #${bug.id}: running Claude (fresh session)…`);
    const cl = await runClaude({ bin: CFG.claudeBin, prompt: buildPrompt(bug, shots), cwd: wt, timeoutMs: CFG.claudeTimeoutMs });
    stopHeartbeat();

    if (!cl.ok) {
      // Claude crashed / timed out → failed. Push any partial work for inspection; keep the worktree.
      const files = hasChanges(wt) ? changedFiles(wt) : [];
      let sha = null; try { if (files.length) sha = commitAndPush(wt, branch, `wip(bug-${bug.id}): incomplete — Claude did not finish`); } catch {}
      await api.result(bug.id, { outcome: "failed", summary: cl.summary, error: cl.timedOut ? "Claude timed out" : "Claude exited abnormally", filesChanged: files, branch: files.length ? branch : null, commitSha: sha, validation: { claude: "fail" } });
      log(`Bug #${bug.id}: FAILED (Claude). Worktree kept for inspection: ${wt}`);
      clearState();
      return;
    }

    writeState({ bugId: bug.id, phase: "validate", wt, branch });
    if (!hasChanges(wt)) {
      await api.result(bug.id, { outcome: "failed", summary: cl.summary, error: "Claude made no changes.", validation: { changes: "none" } });
      log(`Bug #${bug.id}: FAILED (no changes). Worktree kept: ${wt}`);
      clearState();
      return;
    }
    const files = changedFiles(wt);
    const dep = depChanged(wt);
    log(`Bug #${bug.id}: validating (${files.length} files${dep ? ", DEPS CHANGED" : ""})…`);
    const val = validate(base, files);

    if (!val.ok) {
      const sha = commitAndPush(wt, branch, `wip(bug-${bug.id}): fix attempt — ${val.gate} failed`);
      await api.result(bug.id, { outcome: "failed", summary: cl.summary, error: `${val.gate} failed:\n${val.tail || ""}`, filesChanged: files, branch, commitSha: sha, validation: val.v });
      log(`Bug #${bug.id}: FAILED (${val.gate}). Branch pushed, worktree kept: ${wt}`);
      clearState();
      return;
    }

    // Success. A dependency change still goes to review, flagged so it isn't trusted blindly.
    const note = dep ? "\n\n⚠ Dependency definitions changed (package.json / lock) — the shared node_modules was NOT reinstalled; REVIEW DEPENDENCIES before trusting this." : "";
    const sha = commitAndPush(wt, branch, `fix(bug-${bug.id}): ${firstLine(cl.summary) || "automated fix"}`);
    await api.result(bug.id, { outcome: "review", summary: (cl.summary || "") + note, filesChanged: files, branch, commitSha: sha, validation: { ...val.v, dependencyChange: dep } });
    removeWorktree(base, wt);
    log(`Bug #${bug.id}: READY FOR REVIEW → ${branch} (${sha.slice(0, 8)})`);
    clearState();
  } catch (e) {
    stopHeartbeat();
    log(`Bug #${bug.id}: ERROR — ${e.message}`);
    try { await api.result(bug.id, { outcome: "failed", error: e.message, branch: wt ? branch : null }); } catch {}
    // Keep the worktree on error for inspection; just clear our in-flight marker.
    clearState();
  }
}
const firstLine = (s) => String(s || "").split(/\r?\n/).map((x) => x.trim()).find(Boolean) || "";

// ---- main loop ------------------------------------------------------------------------------------
let REPO_URL = null;   // repo web URL (for View Branch/Commit), derived from the clone's origin remote

async function main() {
  assertSafe();
  REPO_URL = repoWebUrl(CFG.automationBase);
  const api0 = makeApi({ baseUrl: CFG.baseUrl, token: CFG.token });
  // Always attach repoUrl to results so the portal can link the branch/commit (auto-configures server-side).
  const api = { ...api0, result: (id, payload) => api0.result(id, { repoUrl: REPO_URL, ...payload }) };
  log(`Bug runner up. base=${CFG.automationBase}  server=${api.base}  repo=${REPO_URL || "(unknown)"}`);

  // Crash recovery: a leftover in-flight bug means we died mid-run. Do NOT re-run (avoids double work);
  // mark it failed (queue auto-stops) and keep its worktree for inspection.
  const prev = readState();
  if (prev?.bugId) {
    log(`Recovering: bug #${prev.bugId} was in-flight (phase ${prev.phase}) at restart → marking failed.`);
    try { await api.result(prev.bugId, { outcome: "failed", error: `Runner restarted during '${prev.phase}'. Worktree preserved for inspection.` }); } catch {}
    clearState();
  }

  for (;;) {
    let resp;
    try { resp = await api.claim(); }
    catch (e) { log(`claim error: ${e.message} — backing off`); await sleep(Math.max(CFG.pollMs, 15000)); continue; }
    if (!resp?.claimed) { await sleep(CFG.pollMs); continue; }
    await processBug(api, resp.bug);
  }
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
