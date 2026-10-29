import fs from "node:fs";
import path from "node:path";
import { runSync, must } from "./proc.mjs";

// All Git for a bug happens in an ISOLATED worktree off the AUTOMATION BASE clone — never the primary
// workspace. The base clone stays on `main` (only ff-pulled); each bug gets its own branch+worktree.
// Dependency definition files that would invalidate the shared node_modules junction.
const DEP_FILES = ["dashboard/package.json", "dashboard/package-lock.json"];

export function branchFor(id) { return `claude/bug-${id}`; }
export function worktreePath(base, id) { return path.join(base, "worktrees", `bug-${id}`); }

// Bring the base clone's main up to date, then create a fresh worktree+branch off origin/main and give it
// the base's node_modules via a directory junction (no reinstall; no admin needed on Windows).
export function setupWorktree(base, id) {
  const branch = branchFor(id);
  const wt = worktreePath(base, id);
  must("git", ["-C", base, "fetch", "origin", "--prune"]);
  must("git", ["-C", base, "checkout", "main"]);
  must("git", ["-C", base, "pull", "--ff-only", "origin", "main"]);
  // Clean any stale remnants from an aborted earlier run of this same bug id.
  runSync("git", ["-C", base, "worktree", "remove", "--force", wt]);
  runSync("git", ["-C", base, "worktree", "prune"]);
  runSync("git", ["-C", base, "branch", "-D", branch]);
  must("git", ["-C", base, "worktree", "add", "-b", branch, wt, "origin/main"]);
  // node_modules: junction the worktree's dashboard/node_modules to the base clone's (installed once).
  const target = path.join(base, "dashboard", "node_modules");
  const link = path.join(wt, "dashboard", "node_modules");
  try { if (!fs.existsSync(link)) fs.symlinkSync(target, link, "junction"); }
  catch (e) { throw new Error(`Could not junction node_modules (${e.message}). Ensure \`npm ci\` ran in ${target}.`); }
  return { wt, branch };
}

// True if the fix touched dependency definitions — the shared node_modules can no longer be trusted, so
// the bug must go to manual dependency review rather than a blind green.
export function depChanged(wt) {
  const out = runSync("git", ["-C", wt, "status", "--porcelain", "--", ...DEP_FILES]).stdout || "";
  return out.trim().length > 0;
}

// Everything the fix changed (staged), relative paths.
export function changedFiles(wt) {
  must("git", ["-C", wt, "add", "-A"]);
  const out = (runSync("git", ["-C", wt, "diff", "--cached", "--name-only"]).stdout || "").trim();
  return out ? out.split(/\r?\n/) : [];
}

// Commit everything in the worktree and push the branch. Returns the commit SHA. Never merges to main.
export function commitAndPush(wt, branch, message) {
  must("git", ["-C", wt, "add", "-A"]);
  must("git", ["-C", wt, "commit", "-m", message]);
  const sha = must("git", ["-C", wt, "rev-parse", "HEAD"]).trim();
  must("git", ["-C", wt, "push", "-u", "origin", branch, "--force-with-lease"]);
  return sha;
}

export function hasChanges(wt) {
  return ((runSync("git", ["-C", wt, "status", "--porcelain"]).stdout || "").trim().length > 0);
}

// The repo's web URL (for View Branch / View Commit) derived from the clone's own `origin` remote — never
// hardcoded. Converts git@host:owner/repo(.git) or https://host/owner/repo(.git) → https://host/owner/repo.
export function repoWebUrl(base) {
  try {
    let u = (runSync("git", ["-C", base, "remote", "get-url", "origin"]).stdout || "").trim();
    if (!u) return null;
    u = u.replace(/\.git$/, "");
    const ssh = /^git@([^:]+):(.+)$/.exec(u);
    if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
    return /^https?:\/\//.test(u) ? u.replace(/^http:/, "https:") : null;
  } catch { return null; }
}

// Remove a worktree (branch stays on origin for review). Only call on SUCCESS; keep it on failure.
export function removeWorktree(base, wt) {
  runSync("git", ["-C", base, "worktree", "remove", "--force", wt]);
  runSync("git", ["-C", base, "worktree", "prune"]);
}
