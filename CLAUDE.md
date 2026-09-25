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

## UI DESIGN CONSTITUTION

The permanent, non-negotiable design standard for ALL UI — every screen, tool, modal, dashboard, form, admin page, and customer portal, current and future. Read and obey this BEFORE designing or changing any UI. Full reference: `dashboard/docs/DESIGN_SYSTEM.md` (read it before non-trivial UI work).

**Assume the user is competent.** Do not explain obvious controls, narrate the interface, or add instructional copy. Communicate through hierarchy, position, familiar icons, state, spacing, typography, and context — not paragraphs.

**The label ladder — the fundamental rule:** icon-only → one word (only if an icon would be unclear) → two words (only when one word is materially worse) → a sentence (only when the feature is genuinely incomprehensible without it, and 3+ words needs real justification). Never turn a button label into an instruction.
- Icon-only for familiar actions: back/next (arrows), close (×), delete (trash), edit (pencil), upload/download, reset (rotate), fullscreen, layout (grid), search (magnifier), filter, more (•••), settings (gear), view (eye), play/pause, approve (check). Never `[icon] Fullscreen` when `[icon]` alone is clear.
- One-word actions: Save, Send, Submit, Add, Edit, Delete, Share, Filter, Search, Export, Reset, Approve, Reject, Notes, Layout, Plan, Views, Replay, Assign, Pay, Print, Status, Next, Back, Close, Cancel. Not "Send report", "Attach a screenshot", "Continue to Proposal", "Add New Camera" → Send, [icon], Continue →, + Camera.

**Icons:** inline SVG only — never emoji, Unicode, or mixed icon families. One consistent family, consistent stroke/viewBox/alignment. 16–18px in compact controls, 20–22px where more prominent.

**Tooltips:** for icon-only controls where useful. Usually ONE word (Fullscreen, Reset, Layout, Markup, Notes). Never a tutorial sentence.

**No redundant text:** never repeat what's already conveyed by the page/section title, an icon, selected state, the route, button placement, or a placeholder. A section whose content is self-explanatory (a table, a list) gets no subtitle.

**Helper text — off by default.** Add it ONLY for: unusual input format, irreversible actions, legal meaning, security implications, or non-obvious validation. Otherwise delete it. Placeholders are short (Search, Email, "What happened?"), never sentences.

**Structure:** cards only for a genuinely useful grouping — never cards inside cards. Borders sparingly (one subtle boundary, not box-in-box). Pills only for status/tags/compact filters — not every button. One clearly dominant task per screen; split multiple tasks into modes/tabs, don't show everything at once. Contextual controls appear only when relevant (markup tools in markup mode). Low-frequency actions live under •••. Progressive disclosure.

**Buttons:** compact — icon 32–36px, text 34–40px, primary 38–44px; never default to 48–56px. Exactly one obvious primary action per view; secondary actions quiet; tertiary are text/icon only. Never five equally-prominent buttons in a row.

**Copy:** headings are short nouns (Orders, Planner, Report), not "Manage Your Customer Orders". Subheadings only when they add info (3–8 words), never paragraphs. Empty states compact ("No orders", optional `+ Add`). Confirmations explain risk only when risk exists ("Delete camera?" / Cancel · Delete). Status values are terse (Pending, Ready, Paid, Sent, Draft, Done, Failed, Open, Closed). No robotic AI microcopy ("Let's get started", "You're all set!", "Manage everything in one place"). Nav and table headings are one word where possible.

**Accessibility is not sacrificed:** icon-only controls still get an `aria-label`, keyboard focus, and a tooltip where helpful. Screen readers may get a descriptive name even when the visible UI stays minimal.

**Enforce with primitives:** prefer the shared minimal primitives (e.g. `IconButton` in `dashboard/app/components/ui/`) so the restrained default is automatic — don't hand-roll verbose one-offs.

**Copy-deletion pass — mandatory before shipping ANY UI.** For every heading/button/helper/placeholder/tooltip/empty-state/label: can this sentence disappear? can this label become one word? can this word become an icon? can this explanation become a one-word tooltip? If yes, do it. **Auto-reject and refactor** any design where: every icon has a text label, a button is 3+ words without strong reason, a familiar action has a sentence explaining it, instructional text sits above an obvious control, cards are needlessly nested, every section has a subtitle, every empty state has a paragraph, or it feels like onboarding software.

Target: a quiet, sharp, fast, precise professional tool — not a tutorial, wizard, or AI-generated SaaS dashboard.

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

## Lifecycle, roles and deck tools — the single sources

- **Phases / stages / steps:** `dashboard/lib/spec.js` `PHASES` (5) · `dashboard/lib/stage-flow.js` `MASTER_ORDER` (9, asserted equal to `STAGES`) and `STAGE_FLOW` (16 requirement-steps, all `check()`-backed). The gate is `phaseGate()`; facts come from `db.buildStageFacts` / `getToolMeta` and the client must use the same field names. Trace + resolution log: `dashboard/docs/lifecycle-sources.md`.
- **Who may do what:** `dashboard/lib/roles.js` `can(role, cap)` — 7 roles (admin, manager, sales, tech, customer, vendor, readonly). Components read it; server actions enforce it. Don't add `role === "..."` comparisons in JSX.
- **Which deck card a role sees:** `dashboard/lib/deck-tools.js` `DECK_TOOLS` + `sees(role, phase, name)`. `PHASE_BLOCKS` (role map) IS this object; `deckToolsFor()` gates through `sees()`; `npm test` fails if a card is gated by hand.
- **Sign-offs and flags:** everything binds to a content fingerprint in `stage_acceptances` (survey, mockup, QC whole-list + per item) or on the row (`proposals.signed_fingerprint`, addendum `signedFingerprint`); install issue flags live in `install_issues` (server-owned state machine, NEEDS_REVIEW → NEEDS_REWORK → RESOLVED | DISMISSED).
- **Starting a proposal from something else:** `db.cloneProposal` / `db.createProposalFromImport` are the only ways (pure half in `dashboard/lib/proposal-reuse.js`; UI in `proposal-start.jsx`; extraction route `app/api/proposal-import`). New draft, new ids, provenance columns, source never mutated. Never clone in frontend state or add a second editor.
- Tests: `npm test` (node --test, `dashboard/tests/`).

## Build & Test

- Run tests after code changes when the project has them for the affected area
- Verify the build succeeds before committing

## Model routing

Route each task to the cheapest model that can do it correctly — don't use one model for everything.

- **Opus** — architecture & DB-schema decisions, debugging where the cause isn't known yet, anything
  touching auth / payments / permissions / role-visibility, refactors spanning many files, and
  reviewing a plan before it runs.
- **Sonnet** — the default: features from a clear spec, editing existing components, writing tests,
  fixing bugs with a known cause, turning audit reports into issue lists.
- **Haiku** — renames, copy & label edits, formatting, boilerplate scaffolding, file moves,
  mechanical find-and-replace.

Plan on Opus, execute on Sonnet. Don't let the expensive model do the mechanical typing.

## Subagents

Defined in `.claude/agents/*.md`. These are **available for delegation, not a mandatory pipeline** —
the "Working style — solo by default" rule above still wins. Reach for one only when a subtask is
genuinely independent, large enough to justify the overhead, or explicitly requested.

| Agent | Job | Model |
|---|---|---|
| `spec-writer`   | Turn a rough ask / voice note into a full spec (surfaces, roles, data, flows, edge cases) before any code | opus |
| `db-schema`     | node:sqlite tables, the `db.js` ensure-column migration pattern, relationships, server-side access control | opus |
| `code-reviewer` | Review a diff before it lands — correctness, security/role-visibility, house conventions | opus |
| `ui-auditor`    | Run/interpret `dashboard/scripts/audit.mjs`; produce a fix list | sonnet |
| `bug-triage`    | Turn audit output into paste-ready `/bugs` entries | sonnet |
| `test-writer`   | Write tests against a spec or existing behavior | sonnet |
| `docs-keeper`   | Keep this file, `/dev` conventions, and READMEs current | haiku |

**Stack note for all agents:** this repo is **Next.js (App Router, SWC — no Babel) + node:sqlite**
(`dashboard/lib/db.js`), **not** Supabase. Access control is **server-side** (role checks, server-action
guards, `sanitize*` payload stripping), not Postgres RLS.
