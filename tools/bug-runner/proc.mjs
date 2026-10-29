import { spawnSync, spawn } from "node:child_process";

// Windows spawn helper. `.cmd` shims (npm/npx/claude) can't be spawned directly on Windows (Node blocks
// it); route them through `cmd /c`. `git` is a real .exe so it runs directly. We pass args as an ARRAY
// (shell:false) so Node quotes each one — paths with spaces (e.g. "La Vague") are handled correctly.
const isWin = process.platform === "win32";
const SHIM = new Set(["npm", "npx", "claude"]);

function wrap(cmd, args) {
  if (isWin && SHIM.has(cmd)) return ["cmd.exe", ["/c", cmd, ...args]];
  return [cmd, args];
}

export function runSync(cmd, args, opts = {}) {
  const [c, a] = wrap(cmd, args);
  return spawnSync(c, a, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, ...opts });
}

export function runSpawn(cmd, args, opts = {}) {
  const [c, a] = wrap(cmd, args);
  return spawn(c, a, opts);
}

// Run a command, throwing on non-zero exit (used for git, where a failure must stop the step).
export function must(cmd, args, opts = {}) {
  const r = runSync(cmd, args, opts);
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || r.error?.message || "").toString().trim().slice(0, 600);
    throw new Error(`${cmd} ${args.join(" ")} → exit ${r.status}: ${detail}`);
  }
  return (r.stdout || "").toString();
}
