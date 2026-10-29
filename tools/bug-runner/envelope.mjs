import fs from "node:fs";
import path from "node:path";

// Download the bug's Evidence screenshots into the worktree (./.bug-evidence/) so Claude can open them
// locally while debugging. Public-by-link /api/media/<id> — no auth needed. Best-effort: a failed image
// is skipped, never fatal. Returns the local file paths that succeeded.
export async function downloadEvidence(api, bug, wt) {
  const dir = path.join(wt, ".bug-evidence");
  await fs.promises.mkdir(dir, { recursive: true });
  const saved = [];
  const urls = Array.isArray(bug.imageUrls) ? bug.imageUrls : [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(api.mediaUrl(urls[i]));
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = (res.headers.get("content-type") || "").includes("png") ? "png" : "jpg";
      const fp = path.join(dir, `shot-${i + 1}.${ext}`);
      await fs.promises.writeFile(fp, buf);
      saved.push(fp);
    } catch { /* skip this image */ }
  }
  return saved;
}

// Build the task envelope prompt. The ORIGINAL report is verbatim and authoritative; Generate/Analyze
// outputs are SUPPLEMENTAL. Claude must find the real root cause and make the smallest safe fix, and must
// NOT run git (the runner owns the repository lifecycle).
export function buildPrompt(bug, shotPaths) {
  const L = [];
  L.push("You are an automated bug-fixing agent working in an isolated git worktree of an internal web app");
  L.push("(Next.js App Router + React 19, SWC, node:sqlite; the app lives in `dashboard/`). Fix ONE bug.");
  L.push("");
  L.push(`BUG #${bug.id}   severity: ${bug.severity || "medium"}`);
  if (bug.path) L.push(`PAGE / ROUTE (where it was reported — NOT necessarily the file to change): ${bug.path}`);
  if (bug.area) L.push(`AREA: ${bug.area}`);
  L.push("");
  L.push("ORIGINAL REPORT (verbatim — preserve its intent; it may not name the real cause):");
  L.push(bug.description || "(none)");
  L.push("");
  const ctx = bug.context || {};
  if (bug.userAgent) L.push(`ENVIRONMENT: ${bug.userAgent}`);
  if (ctx.viewport) L.push(`VIEWPORT: ${ctx.viewport}`);
  if (Array.isArray(ctx.routes) && ctx.routes.length > 1) L.push(`RECENT PAGES: ${ctx.routes.join(" → ")}`);
  if (Array.isArray(ctx.errors) && ctx.errors.length) {
    L.push("CAPTURED ERRORS (clues, not the spec):");
    for (const e of ctx.errors.slice(0, 6)) L.push(`  - [${e.type || "error"}] ${e.message || ""}${e.occurrences > 1 ? ` ×${e.occurrences}` : ""}`);
  }
  if (shotPaths.length) {
    L.push("");
    L.push(`SCREENSHOTS (${shotPaths.length}) — open and inspect these local files:`);
    for (const p of shotPaths) L.push(`  - ${p}`);
  }
  if (bug.fixPrompt) { L.push(""); L.push("SUPPLEMENTAL — a previously generated fix prompt (context only, verify independently):"); L.push(bug.fixPrompt); }
  if (bug.uiPrompt) { L.push(""); L.push("SUPPLEMENTAL — a previous screenshot/UI analysis (context only, verify independently):"); L.push(bug.uiPrompt); }
  L.push("");
  L.push("INSTRUCTIONS:");
  L.push("- Investigate this bug against the existing application. Inspect the relevant implementation before making changes.");
  L.push("- Determine the ACTUAL root cause rather than blindly implementing the reporter's or the supplemental suggestions.");
  L.push("- Make the SMALLEST safe fix that addresses the problem. Avoid unrelated changes.");
  L.push("- Follow the repo conventions (dashboard/CLAUDE.md) and keep the existing design language.");
  L.push("- You MAY run `npm test` or `npm run build` from `dashboard/` to check your work.");
  L.push("- Do NOT run ANY git command (no branch/commit/push/stash/reset/checkout/clean). The runner owns Git.");
  L.push("- When done, write a concise summary: the root cause, what you changed, and anything that still needs human review.");
  return L.join("\n");
}
