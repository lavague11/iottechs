import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSpawn } from "./proc.mjs";

// Scoped permissions — Claude may read/search/edit/write and run ONLY the tests/build, and is explicitly
// denied every Git operation (the runner owns the repo lifecycle). This is the file we hand to `claude`.
const SETTINGS = {
  permissions: {
    allow: ["Read", "Grep", "Glob", "Edit", "Write", "MultiEdit", "Bash(npm test:*)", "Bash(npm run build:*)", "Bash(node --check:*)"],
    deny: ["Bash(git:*)", "Bash(git)", "WebFetch", "WebSearch"],
  },
};

// Run Claude Code headless on the worktree: a FRESH session per bug (no cross-bug memory). The prompt is
// piped on stdin (avoids Windows command-line length limits). Returns { ok, summary, raw }.
export function runClaude({ bin = "claude", prompt, cwd, timeoutMs = 25 * 60 * 1000, maxTurns = 60 }) {
  const settingsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bugrun-")), "settings.json");
  fs.writeFileSync(settingsPath, JSON.stringify(SETTINGS));
  const args = ["-p", "--output-format", "json", "--max-turns", String(maxTurns),
    "--permission-mode", "acceptEdits", "--settings", settingsPath];
  return new Promise((resolve) => {
    const child = runSpawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const killer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} resolve({ ok: false, timedOut: true, summary: "Claude run exceeded the time limit.", raw: out, stderr: err }); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(killer); resolve({ ok: false, summary: `Could not launch Claude (${e.message}).`, raw: "", stderr: err }); });
    child.on("close", (code) => {
      clearTimeout(killer);
      try { fs.rmSync(path.dirname(settingsPath), { recursive: true, force: true }); } catch {}
      let summary = "";
      try { const j = JSON.parse(out); summary = (j.result || j.text || (Array.isArray(j) ? j[j.length - 1]?.result : "") || "").toString().trim(); }
      catch { summary = out.trim().slice(-2000); }
      resolve({ ok: code === 0, code, summary: summary || "(no summary returned)", raw: out, stderr: err });
    });
    try { child.stdin.write(prompt); child.stdin.end(); } catch { /* process may have died */ }
  });
}
