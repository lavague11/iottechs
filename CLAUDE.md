# IOT Dashboard — Claude Code Configuration

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER add a `Co-Authored-By` trailer to user commits unless this project's `.claude/settings.json` has `attribution.commit` set (#2078). The Claude Code Bash tool may suggest one in its default commit-message template — ignore it. `Co-Authored-By` is semantic authorship attribution under git/GitHub convention; the tool is the facilitator, not a co-author.
- Keep files under 500 lines
- Validate input at system boundaries

## Definition of Done (IOT Dashboard — every feature must pass ALL 8 before showing the user)

Derived from ~690 prompts of recurring corrections. Apply these BEFORE presenting any new feature or UI, not after feedback.

1. **Smart defaults & autosave** — If the system already knows a value, prefill it (names, dates→today/tomorrow, PIN=last-4-phone, quantities from proposal/survey, NVR sized to camera count). Auto-capitalize names. No empty fields the data can fill. Everything persists automatically — no Save buttons unless a deliberate submit/sign step.
2. **Admin full control from birth** — Every entity ships with admin (and manager where sensible) edit + void/archive. Nothing is ever hard-deleted: confirm → void/archive, keep for audit. Signed documents are voidable (record preserved), never erased. Undo where feasible.
3. **Zero redundancy** — Never display information already visible on the same screen. Never label what context implies. No decorative extras (arrows, scale readouts, placeholder boxes). When in doubt, leave it out.
4. **Role visibility pass** — Before shipping, walk the matrix: customer never sees payout/cost/margin/commission/internal notes/assigned crew; tech never sees retail prices or customer financials; sales sees only their own commission. Server-side stripping (sanitize), not just hidden UI.
5. **Render only when real** — Sections with no data don't render at all (no empty shells). Conditional reveals: tracking only with a tracking number, commission only once a rep is assigned. Heavy sections collapsible, default collapsed.
6. **Confirm destructive, archive not delete** — Two-step confirm on anything irreversible-feeling (delete, void, submit, stage move). Deleted things go to archive/void state.
7. **Labels: 1–2 words, SVG only** — Buttons are one or two words max ("Submit", "+ Add", "Void"). Icons are inline SVG, never emojis. Minimalist vault-dark styling matching existing pages.
8. **Bulk actions & everything links** — Any repeated-item list gets All/None/Reset-all bulk controls. Phone, email, address (→maps), project ID, and person names are always clickable links.

Also: gate features on the EARLIEST valid signal (e.g., work order from *sent* proposal, not accepted); show "awaiting X" states instead of blocking. Every role always sees one clear next action per stage.

## Working style — solo by default

This is a single-developer project. Work directly — read, edit, verify — without spawning
multi-agent swarms, background workers, or calling memory/coordination MCP tools as a matter of
routine. Each of those is extra model calls that cost real credits on top of the actual work, and
for a project this size the overhead isn't worth it.

- Default to doing the work yourself in the main thread.
- Use the `Agent` tool for a subtask only when it's genuinely independent, large enough to justify
  the overhead (e.g. broad research across many files), or the user explicitly asks for parallel/
  swarm work.
- Skip `memory_store`/`memory_search`/`hooks_*` calls unless the user asks for them or you have a
  specific reason to believe stored history will change the approach — this project's memory
  system (`~/.claude/projects/.../memory/`) already covers durable context and doesn't need a
  second, project-local memory layer.
- Match verification depth to the change: a build/compile check is often enough; reach for live
  browser testing, synthetic stress data, or log forensics only when the bug is actually elusive.
- Keep audits and "check everything" sweeps scoped to what was asked — open-ended forensic digs
  are expensive and should be an explicit, deliberate request, not a default response to a bug report.

## Build & Test

- Run tests after code changes when the project has them for the affected area
- Verify the build succeeds before committing
