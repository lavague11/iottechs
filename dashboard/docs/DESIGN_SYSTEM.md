# DESIGN_SYSTEM.md — UI Design System

The working reference for the **UI Design Constitution** (see the section of the same name in the
root `CLAUDE.md`, which is the binding standard). This file is the practical companion: the ladder,
the primitives, the sizes, and before/after examples. Read it before non-trivial UI work.

> **The one rule everything derives from:** assume the user is competent. Communicate through
> hierarchy, position, familiar icons, state, and spacing — not copy. Icon-first → one word if
> needed → sentence only when genuinely required.

---

## The label ladder

Decide every label in this order. Stop at the first rung that is unambiguous.

1. **Icon only** — familiar action (close, delete, edit, back/next, upload/download, reset,
   fullscreen, search, filter, more, settings, view, play/pause, approve). Add `aria-label` + a
   one-word `title`.
2. **One word** — the icon alone would be unclear (Save, Send, Add, Approve, Reject, Export, Reset,
   Assign, Pay, Notes, Layout, Plan, Views, Replay).
3. **Two words** — one word is materially worse. Rare.
4. **A sentence** — the feature is genuinely incomprehensible without it. Needs real justification;
   3+ words is a smell.

Never turn a button into an instruction. `Attach a screenshot` → icon. `Send report` → `Send`.
`Continue to Proposal` → `Continue →`. `Add New Camera` → `+ Camera`.

---

## Sizes (compact by default)

| Control            | Height  | Notes                                            |
|--------------------|---------|--------------------------------------------------|
| Icon button        | 32–36px | square; 16–18px glyph                            |
| Text button        | 34–40px | one word                                         |
| Primary button     | 38–44px | exactly one per view                             |
| Glyph, prominent    | 20–22px | headers, empty states                            |

Never default a button to 48–56px. Icons 16–18px in controls.

## Hierarchy

- **One** dominant primary action per view. Secondary actions quiet (outline/ghost). Tertiary are
  text or icon only.
- Never a row of five equally-loud buttons.
- Low-frequency actions live under a `•••` **More** menu.
- Contextual controls appear only when relevant (markup tools only in markup mode).

## Icons

Inline SVG only. **Never** emoji, Unicode glyphs, or mixed families. One family, one stroke width,
consistent `viewBox`, aligned. `stroke="currentColor"` so they inherit color.

## Copy

- Headings: short nouns (Orders, Planner, Report). Not "Manage Your Customer Orders".
- Subheadings only when they add information (3–8 words). Never paragraphs.
- Placeholders: short (Search, Email, "What happened?"). Never sentences.
- Helper text: **off by default.** Only for unusual format, irreversible actions, legal/security
  meaning, or non-obvious validation.
- Empty states: compact ("No orders", optional `+ Add`). No paragraphs.
- Confirmations: explain risk only when risk exists ("Delete camera?" · Cancel · Delete).
- Status: terse (Pending, Ready, Paid, Sent, Draft, Done, Failed, Open, Closed).
- No robotic AI microcopy ("Let's get started", "You're all set!", "Manage everything in one place").

## Structure

- Cards only for a genuinely useful grouping. **Never** a card inside a card.
- Borders sparingly — one subtle boundary, not box-in-box.
- Pills only for status / tags / compact filters, never as the default button shape.
- Progressive disclosure: reveal detail on demand.

## Accessibility (never sacrificed for minimalism)

- Icon-only controls: `aria-label` + visible focus + a `title` where helpful.
- Screen readers may get a descriptive name even when the visible UI stays minimal.
- Keyboard reachable; `:focus-visible` styled.

---

## Primitives — `dashboard/app/components/ui/`

Use these so the restrained default is automatic. Don't hand-roll a verbose one-off.

### `IconButton` (`icon-button.jsx`) — shipped

Icon-only action, compact, with the accessibility baked in. Pass an SVG child + a one-word `label`
(used for both `aria-label` and the tooltip).

```jsx
import IconButton from "../components/ui/icon-button";

<IconButton label="Attach" onClick={pick}>
  <svg viewBox="0 0 24 24" ...><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
</IconButton>

// variants: tone="default|primary|danger|ghost", size={32|34|36}
<IconButton label="Delete" tone="danger" onClick={del}> … </IconButton>
```

Roadmap primitives (add when first genuinely needed, not speculatively): `Button` (one primary per
view), `Toolbar`, `Modal`, `Input`/`Textarea`, `Menu` (the `•••` More), `Status` chip, `Tabs`.
Each should make the minimal choice the default and the verbose choice extra effort.

---

## Worked example — the bug-report modal

The reference redesign. Applying the ladder end-to-end:

| Before                                    | After                          | Why                                  |
|-------------------------------------------|--------------------------------|--------------------------------------|
| Title "Report a bug"                      | **Report**                     | context (a form) implies "a bug"     |
| Placeholder "What went wrong? What did you expect?" | **What happened?**   | one question, not two                |
| `[icon] Screenshot` button                | icon only (tooltip Screenshot) | familiar camera glyph                |
| `[icon] Attach` button                    | icon only (tooltip Attach)     | familiar upload glyph                |
| "Send report"                             | **Send**                       | one word                             |
| Cancel + Send report                      | Cancel · **Send**              | one primary, one quiet               |

Result: `Report [✕]` / `[ What happened? ]` / `[📷] [⬆] [🎤]` / `Cancel  Send`. That is enough.

Screenshot annotator, same pass: title "Mark the problem in red" → tools speak for themselves;
`Attach` → the primary; Pen/Arrow become icon toggles with one-word tooltips.
