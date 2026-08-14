# Deck Design System — internal build reference

The living reference for the redesigned **project page** ("the deck"). Every role renders the
same shell; only the data and role-gating differ. This captures the tokens, patterns, and the
running list of decisions so new work matches what's already built. **When in doubt, match this.**

Scope note: we are redesigning the **outside** (shell, chrome, interaction), not the **inside**
(the tool widgets and their server-side role gates). Tool logic and the security boundary are
reused as-is.

---

## 1. Where it lives

| Piece | File |
|---|---|
| Deck shell (top bar · job bar · swipe deck · overlay · footer) | `app/project/[accessId]/deck-view.jsx` |
| Standalone prototype (sample data) | `app/deck-preview/page.jsx` → `/deck-preview` |
| Gateway wiring (real data, behind a flag) | `app/project/[accessId]/gateway-client.jsx` (`deckMode`) |
| Job Log tool | `app/project/[accessId]/job-log.jsx` |
| Self-hosted fonts | `app/layout.jsx` (`next/font` → `--font-sans`, `--font-mono`) |

**Rollout is additive.** The deck renders only when the URL carries `?deck=1`; the legacy page
stays the default until every stage × role is validated. `deckMode` is read after mount to avoid
a hydration mismatch. Never break the legacy path while building the deck.

---

## 2. Tokens (single source of truth)

Defined on `.dv-shell` in `deck-view.jsx`. Never hand-type hex/px outside these.

```
--dv-ink       #101418   text / primary buttons
--dv-ink-soft  #3A4048
--dv-meta      #787D84   secondary text
--dv-faint     #A1A6AC   timestamps / hints
--dv-paper     #F4F4F2   page ground
--dv-raise     #FBFBFA   raised surfaces (inputs, embeds)
--dv-line      #E4E4DF   borders
--dv-line-soft #EDEDE9   hairlines
--dv-gold      #C9A96E   accent (focus, hover)
--dv-gold-deep #A8842F   accent text
--dv-green     #2E7D5B   done / approved / paid
--dv-red       #C4553D   gated / internal
--dv-blue      #3E6C9E   submitted / reviewed / public
```

Motion easings: `--dv-e: cubic-bezier(.22,.9,.24,1)`, `--dv-eo: cubic-bezier(.16,1,.3,1)`.

**Semantic color is separate from the accent.** Gold is decoration/interaction; green/red/blue
carry meaning (see §6).

---

## 3. Typography

- **Sans**: Instrument Sans (`var(--font-sans)`), self-hosted via `next/font`. UI + body.
- **Mono**: JetBrains Mono (`var(--font-mono)`). Uppercase micro-labels, timestamps, hints.
- Embedded static tool widgets (`public/widgets/*.html`, canvas) use the **system stack**
  (`-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, …`) — it reads as the same
  clean UI font without loading a webfont into an iframe/canvas. Match this when restyling a tool;
  don't ship Helvetica/bold.
- Titles: weight 600, `letter-spacing:-.01em`. Micro-labels: 11px, `letter-spacing:.16em`, uppercase.

---

## 4. Layout patterns

- **Horizontal stage deck.** One slide per lifecycle phase (Consulting · Proposal · Install ·
  Closeout · Completion). Drag / wheel-x / ← → to move. Slides are clamped, not looped.
- **Drag vs tap:** pointer capture engages only after a >5px horizontal move, so taps still fire
  button clicks. Anything interactive inside a slide carries `data-stop`.
- **Content column** caps at `max-width:840px`, centered.
- **No inner side-scrollbar.** The tool region scrolls but the scrollbar is hidden
  (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`), no fade mask.
- **Hard footer.** The advance bar (`.dv-advance`) is a solid, pinned footer on **every** slide:
  Job Log button on the left, advance status + "Continue to <next>" on the right. Content scrolls
  above it; the footer never scrolls away.

---

## 5. Interaction patterns

### The row IS the trigger (no intermediate step)
A tool row opens its tool in **one click** — no "expand, then press Open" and no card that just
re-labels the tool. Two open modes, flagged per tool:

- **Heavy** (`heavy: true` — Site Survey, Mockups, Proposal): the row (→ arrow) launches the tool
  **full-screen** in the deck overlay (`setOverlay`). Big-canvas tools need the room.
- **Light** (chevron ˅ — scheduling, sign, pay): the row expands its content **inline** in place.
- **Stub** (no `node`): row is disabled/dimmed ("ports next").

### Full-screen overlay (`.dv-overlay`)
Top bar (tool name + Close, Esc to exit) over `.dv-overlay-body`. Accepts either a stage tool
`node` or a direct `node` (used by the Job Log button). Embedded tools carry `.pvx`-scoped CSS
(`.ss-embed`, `.mk-controls`) — the overlay restyles the embed shell so the iframe fills the
screen and only the redundant "Full screen" button is hidden (tool controls stay).

### Tool-open UX rule
Heavy tools full-screen, light tools inline. Don't cram a canvas tool into an inline row; don't
open a two-field form full-screen.

---

## 6. The Job Log (`job-log.jsx`)

A per-project record opened from the footer "Log" button (every stage). Two columns.

**Activity** — a timestamped trail, newest first, with **Inquiry received** pinned at the origin
(from `projects.created_at`). Sources:
- Milestones from `stage_acceptances` — submitted (blue) · approved (green) · signed (gold) ·
  reviewed (blue) · paid (green).
- Logged events from `project_events` — calls, logins, and (as instrumented) views/changes.
- **Basic vs Advanced toggle** (staff only). Basic = customer-safe milestones + inquiry.
  Advanced = adds forensic events (`ADVANCED_KINDS = call, login, view, change, resubmit`).
  Customers only ever get Basic.

**Notes** —
- **Internal = RED, Public = BLUE** (badge, compose toggle, and the visibility dot). Internal is
  the default.
- Staff toggle any note Internal↔Public (per-note badge). A **customer's own note is always
  public**; customers only ever see public notes — **stripped server-side** in `getNotesAction`,
  not merely hidden in the UI.
- **@mentions**: type `@` for a teammate typeahead (from `staffUsers`); `@Name` renders
  blue-highlighted in the body.

**Data / actions.** `project_notes.public` (0/1) + `setNotePublic` / `setNotePublicAction`.
`project_events(kind,label,actor,created_at)` + `logProjectEvent` / `getProjectEvents`, surfaced
via `getEventsAction` (refuses the customer role) and written by `logCallAction`, the customer
PIN branch in `actions.js`, etc. **New forensic events are drop-in `logProjectEvent` calls** at
the relevant code path — no schema work.

---

## 7. Copy & content rules (from the Definition of Done)

- **Button labels: 1–2 words.** "Add", "Save Event", "Log", "Void". Icons are inline SVG, never emoji.
- **Less description.** Cut helper subtitles and long placeholders. Labels are short ("On site",
  "Notes"); placeholders are short or blank ("Add a note…", empty search).
- **Smart defaults (prefill what the system knows).** Event title = property street address +
  visit type ("2503 Jay Pl — Site Survey"); location = customer address; date = tomorrow; on-site
  contact = the customer; event invitees auto-include the customer + whoever is booking (`AUTO`).
- **Zero redundancy.** Never restate what the row/context already says. No decorative extras.
- **Render only when real.** Sections with no data don't render.

---

## 8. Role visibility (the load-bearing rule)

`view` = the authenticated role; `cView` = the render role (`previewRole ?? view`). **The security
boundary is server-side stripping** (`sanitizeProposal`, `getNotesAction`'s customer filter,
`getEventsAction` refusing customers) — UI-hiding alone is never sufficient. Customer never sees
cost/payout/margin/commission/internal notes/forensics; tech never sees retail prices/financials;
sales sees only their own commission. Walk the matrix before shipping a stage.

---

## 9. Decisions log (the little things)

Newest first. Append when we make a call worth not re-litigating.

- **No double title bars — the `embedded` convention.** The deck already names every tool (the
  full-screen overlay bar for heavy tools; the row label for light tools). A tool must NOT render
  its own name/collapse header on top of that. The standing pattern: give the tool an `embedded`
  prop — when true it drops its top fold/title header and stays open (never CSS-hide a collapse
  header; that can trap the body closed). Done for `ApprovalPanel` + `WorkOrderCard`; the gateway
  passes `embedded` when mounting them in the deck. **Any new deck-embedded tool with a top
  name-header must take `embedded` and honor it.** (Section headers that differ from the tool name
  and carry status — e.g. the billing "Record a Payment · deposit due" head — are fine to keep.)
- **All 5 phases are wired** (admin): Consulting · Proposal · Install · Closeout · Completion each
  mount their real tool components with the legacy role gates. Heavy tools (Proposal, Approval,
  QC, Site Survey…) open full-screen; Completion renders inline via the slide `completion` slot.
  Panels needing accordion context (`ApprovalPanel`) are wrapped per-node in `AccordionProvider`.
  Next: validate the customer/tech/sales role variants and re-integrate the submit/approve bars.
- **Note visibility is governed, not free.** Making a note public asks first (inline confirm).
  Only admin/manager set visibility outright; tech/sales can only *request* public → the note
  goes `pending_public` and an admin/manager approves/rejects. Customer notes are always public.
- **Job Log affordances:** Basic/Advanced is a single pill toggle; each column has a search icon
  (activity filters verb+actor, notes filter body+author); note bodies are single-line, click to expand.
- **Contact editing** is inline in the deck drawer (verified-address autocomplete) and every change
  is logged at the mutation point (`updateProjectInfoAction`), covering the legacy header too.
- **Site Survey chrome** keeps shrinking: device panel collapses until placement, satellite "Show"
  became a search icon, one identity line (name · full address), Upload → device directly.
- **Forensic events wired via `logProjectEvent`:** submits/resubmits (from `submitToolAction`,
  annotated with the survey camera count — `submit` kind is Basic-visible, `resubmit` is
  Advanced), customer proposal views (from `page.jsx`, deduped ~30 min, Advanced), customer PIN
  logins, and calls. Submits are logged as events, so `submit_*` are **not** in the log's
  acceptance map (would double). Camera count = device kind `"cam"` via `survey2CameraCount`.
  Next: "customer viewed the survey" (needs a server hook — the survey is an iframe) and
  surfacing `proposal_views` geo/metrics in Advanced.
- Details & Notes panel **removed** from the scheduler; its function moved into the Job Log.
- Legacy `.pv-tool-panel` chrome (card border, gold rail, icon chip, Bricolage title) is
  **flattened** to the deck look when mounted inside a light tool (`.pvx-deck .dv-tinline …`).
- Mockup tool restyled to the system font (kept the phone frame); its control bar stays usable
  inside the overlay.
- Satellite/enhance and survey capture keep their own internal chrome; the deck only frames them.

---

*Keep this current. If a new pattern lands (a stage wired, a tool restyled, a rule set), add it
here the same turn — future work reads this to stay consistent.*
