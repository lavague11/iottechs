# Maya — Implementation Audit vs Spec

Compares the current codebase to [maya-spec.md](maya-spec.md). Status legend: **✅ Done** · **🟡 Partial**
· **❌ Missing**. Paths are repo-relative to `dashboard/`.

## Framing: the stack is not Supabase

The spec is written for **Supabase + Row-Level Security**. This codebase is **Next.js (App Router) +
`node:sqlite`** with **server-side access control**: `lib/roles.js` `can(role, cap)`, per-action role checks,
`sanitize*` payload stripping, and `getVisibleJobs` / `customerOwnsProjectAccount` scoping. Every "RLS /
Supabase auth" spec item is satisfied by that existing pattern — **we are not adding Supabase.** The
security review below confirms this model holds (one bypass class to fix). Treat "RLS" in the spec as
"server-side `can()` + ownership scoping" throughout.

Maya's architecture to preserve (verified sound): she emits a **validated intent** → a pure registry
(`lib/ai-project-actions.js`) previews it → on confirm, `ai-actions.js` dispatches the **existing guarded
server action**, which **re-derives the caller from the session cookie** and re-checks `can(role, cap)`.
No duplicate business logic. Every applied command is logged to the Job Log (`kind:"ai"`).

---

## Security risks (do first)

| # | Sev | Risk | File | Fix |
|---|---|---|---|---|
| S1 | **High** | `aiApplyNoteAction` only calls `authorize()` (staff + flag), then writes via the raw `addProjectNote` helper — **no `aiCanEdit` gate, no tech project-scope**. A technician (staff, not an editor) can POST a note to *any* project, including ones they aren't on. | `app/project/[accessId]/ai-actions.js:626` | Add `aiCanEdit` + tech-scope guard, or route through the guarded `addNoteAction`. |
| S2 | Medium | `aiAuditAction` likewise only `authorize()`s, then writes a free-text `kind:"ai"` Job Log line to any project — cross-project log pollution with attacker-controlled label text. | `app/project/[accessId]/ai-actions.js:565` | Same `aiCanEdit` + scope guard; prefer a server-derived label over raw client text. |
| S3 | Low | `/api/tts` + `/api/transcribe` are correctly **staff-only** (`aiGate`). Before giving **customers** voice, add a distinct *customer + owns-project* gate — do **not** widen `aiGate` (that would hand customers the staff STT/TTS surface). | `app/api/tts/route.js`, `app/api/transcribe/route.js` | New customer-voice gate at rollout. |

**Confirmed safe (no change):** the action-apply authz funnel (every arg re-resolved server-side, per-action
caps are authority), read scoping (non-admin confined to `getVisibleJobs`; money double-gated; a tech sees
only their own payout), the customer surface (deterministic-router-only, no model call on untrusted text,
target forced to the owned project, injection can't resolve another customer), and secret handling (keys
server-only via `secretValue`, no `NEXT_PUBLIC_*`, browser sees only booleans).

---

## Phase 0 — Foundation

| Spec item | Status | Notes / hook |
|---|---|---|
| Explore repo (schema, auth, roles, Role & Flow Map, guides, VAULT SIGN, handlers) | ✅ Done | This audit. |
| Core prompt (identity + non-negotiable rules), Claude wiring | 🟡 Partial | A task-specific system prompt exists in `buildClaudeBody` (`lib/ai-command.js:445`), but no short **identity/personality core prompt** ("Maya", Fortune-500 secretary, principal-agent rules). Needs a compact core prompt + the playbook/role-map loaded on demand. |
| Model routing | 🟡 Partial | Hardcoded `claude-haiku-4-5` (`lib/ai-command.js:387`); **no escalation** to a stronger model for invoicing / diagnostics / large quotes / multi-step. Single hook: `interpret()` in `ai-actions.js`. |
| Role-aware sessions + RLS | ✅ Done (as `can()`) | `aiGate` + `getSessionRole` from cookie; server-side caps. Not Supabase. |
| Audit log table | ✅ Done | Job Log (`logProjectEvent`, `kind:"ai"`). |
| Abuse: rate limits, spending cap, spam filter | ❌ Missing | Per-IP throttles exist on auth/intake routes only; **none on AI paths**, **no spending cap**, **no spam/bot filter**. No Claude usage is even recorded. |
| Test harness + starting test set | 🟡 Partial | `node --test` suite exists (`tests/ai-*.test.mjs`), but **not** the spec's adversarial set (haggling, cross-customer/QR, injection, unsold products, wrong recipient, label math). |

## Phase 1 — Admin assistant (read-only) + bug reporting

| Spec item | Status | Notes / hook |
|---|---|---|
| Floating chat for admin | ✅ Done | AI Core orb (`ai-core.jsx`) + ⌘K (`global-command-bar.jsx`). |
| Tools: past-due invoices, stuck-by-gate, follow-ups, inventory, projects/customers lookup | 🟡 Partial | `ai-answer.js` covers totals/status/next/money/payout/issues/timeline/awaiting-signature/collections/by-stage + project-intel blockers. **Inventory reads not wired**; "past-due invoices" = collections queue (proposal-based, not svc invoices). |
| Company playbook (admin-editable), loaded on demand | 🟡 Partial | `lib/ai-knowledge.js` + `docs/ai-playbook.md` exist; **not admin-editable**, not a tool-fetched playbook with pricing/labels/"never promise" rules. |
| "What can you do?" by role | 🟡 Partial | A caps line exists on misses (`classifyMiss`); not a first-class role-aware capability list. |
| Morning briefing (email + portal) | ❌ Missing | No briefing job; needs the background runner. |
| Bug reporting (user → Maya → bug portal; Maya files her own errors) | 🟡 Partial | `POST /api/bug-report` captures page/role/screenshot/browser/steps and is fully callable; **not yet a Maya intent/tool**, and Maya doesn't auto-file her own tool failures. |

## Phase 2 — Maya admin page (Admin ▸ Maya)

| Spec item | Status |
|---|---|
| Training (rules, playbook, chat corrections → rules) · Conversations (ratings, handoffs) · Activity log · Settings · Health (tests, API cost, spending cap) | ❌ Missing (whole page) |
| Corrections saved as rules, checked by the test set | ❌ Missing |

## Phase 3 — Customer & public support

| Spec item | Status | Notes / hook |
|---|---|---|
| Customer mode (logged-in) | 🟡 Partial | `aiCustomerInterpretAction` exists (flag `AI_CUSTOMER`, ownership-gated, router-only) — navigate + comment + objection + FAQ. No guide control, no CCTV flow, no voice. |
| Receptionist mode (public visitor) | ❌ Missing | No public/unauthenticated assistant surface. |
| Support guide control (open guide, auto iPhone/Android, step tracking, no DRAFT) | 🟡 Partial | Guides + DRAFT flag (`ready`) + platform paths + store buttons **all exist**; deep-link `/guide/<slug>?project=` works. **Missing:** programmatic open/"Start", **persisted step tracking**, a **customer-facing help route** (`/support` is staff-only), and Maya returning a guide-open result. |
| QR security (server-filtered to own projects; auto-select/ask; never unverified/public) | ✅ Done | No code path leaks another customer's QR; scoped resolvers enforce it. Maya just needs to drive the existing picker. |
| CCTV diagnostic → service ticket → email + portal notify (no self-schedule) | 🟡 Partial | `createServiceCallAction` + TRACE diagnostic model exist; **email+portal notify-on-create is unwired** (S-primitives `notifyRoles`/`sendOfficeEmail` exist). Maya-driven TRACE flow not built. |
| Photo upload / image reading | 🟡 Partial | `/api/media` (HEIC-safe) + bug screenshot capture exist; not wired into a Maya vision flow. |
| Conversation history (per customer) | ❌ Missing | Session-only rolling memory; nothing persisted per account. |
| Human handoff + after-hours rules | ❌ Missing | |
| Multilingual replies (customer language; notes/tickets stay English) | 🟡 Partial | STT detects language (Whisper); free-form replies can follow it, but deterministic answers aren't localized, and the customer path is router-only (no model) so no localized generation yet. |
| Live two-way translation (Ahmed ↔ customer) | ❌ Missing | |
| Voice-first UI (big tap-to-talk, typing + photo "+" backups) | 🟡 Partial | Voice (neural TTS + Whisper STT + conversation loop) exists on the staff orb; not a customer voice-first surface, no photo "+". |

## Phase 4 — Admin actions

| Spec item | Status | Notes / hook |
|---|---|---|
| Signature requests (VAULT SIGN) | ✅ Done | `request_signature` → `requestSignatureEmailAction`, already wired. |
| Line-item edits ("1B: rename to 4K Camera, set price $65") | ✅ Done | `edit_item` (price/qty/name/move) in `ai-command.js` + `applyIntentToPayload`. |
| Labels — "existing wire" waives install fee; "customer supplied equipment" waives equipment cost | 🟡 Partial | **CPE already waives its line** (`cxEquip` → waiver cause; my P3 work). **"Existing wire waives install" does NOT exist** — `existingCable` is badge-only. Needs a waiver cause (or a wiring-credit line) + a Maya label intent. |
| Invoices (create, add items, send) | 🟡 Partial | Exist for **service calls** (`saveSvcInvoiceAction`/`sendSvcInvoiceAction`); **no project invoice** entity, and not in Maya's registry. |
| Addendums (create + send for signature, Install) | 🟡 Partial | Create via generic blob save + `logAddendumAction`; **no discrete "send for signature"** action; not a Maya intent. |
| "Any app action on command" | 🟡 Partial | 11 project actions wired; invoices/addendums/tickets/bug/close not yet. |
| One-line recipient confirmation before sending | 🟡 Partial | Sends confirm today; the spec wants to *keep* this for customer-facing sends while **removing** routine-edit confirmations (see below). |
| Confirmation policy: routine edits instant + Undo; confirm only irreversible/unusual | ❌ Missing | Today **every** write confirms. Needs: instant-apply + Undo for routine edits; confirm only sends/payments/large waivers/large discounts. |
| Close projects + lock closed (future) | 🟡 Partial | `closeProjectAction` exists; **edit-lock on closed/completed is missing**; no Maya `close_project` intent (spec marks it future). |

## Phase 5 — Proactive

| Spec item | Status |
|---|---|
| Customer nudges · weekly report · lead capture · review requests · smart alerts · morning briefing | ❌ Missing (needs the background runner) |

## Cross-cutting

| Spec item | Status | Notes |
|---|---|---|
| Personality (polished, warm, witty; adapts) | 🟡 Partial | Voice/copy tuned; no explicit persona prompt. |
| Principal-agent rules (never invent price/inventory/promises; sells only approved) | 🟡 Partial | "Never invent data/price" is enforced in the prompt + code; a formal **playbook** of offerings/pricing/never-promise is missing. |
| Role & Flow Map as rulebook | 🟡 Partial | Lifecycle facts drive project-intel; Maya doesn't yet *read the live Role & Flow Map config* to answer "what needs closing" from gate status directly (she derives next-action, close). |
| Background job runner | 🟡 Partial | In-process boot scheduler (`instrumentation.js`) runs appointment + receivables sweeps; **no briefing/nudge/report/alert jobs**; per-instance (would double-fire if scaled). |

---

## Gap plan by phase (build order)

- **P0 hardening (do first):** fix **S1 + S2** (the two authz gaps); add AI **rate-limiting + a daily spend cap + usage recording** on `interpret()` (the one Claude funnel); add the adversarial **test set** (haggling, cross-customer/QR, injection, unsold, wrong-recipient, label math). Name **Maya** in the UI + retitle the playbook. Confirmation policy (instant + Undo; confirm only sensitive).
- **P-core:** compact **identity/core prompt** + **model routing** (escalate to a stronger Claude model for invoicing/diagnostics/large-quote/multi-step) parameterized through `buildClaudeBody`.
- **P4 actions (high value, infra exists):** wire new Maya intents for **invoices** (svc), **addendums** (build + a new send-for-signature), **labels** (CPE already; add "existing wire waives install"), **bug filing** (+ auto-file her own errors), **service-ticket create + notify** (wire `notifyRoles`/`sendOfficeEmail`), **close project**.
- **P2 admin page:** Admin ▸ Maya (Training / Conversations / Activity / Settings / Health) + corrections-as-rules + **approved knowledge base + unanswered-question training loop**.
- **P5 proactive + runner:** a durable job runner (extend `instrumentation.js` or a `CRON_KEY`-gated route set) → morning briefing, nudges, weekly report, smart alerts.
- **P3 customer rollout (highest risk, last):** customer guide control (open/Start + **persisted step tracking** + a customer help route), CCTV TRACE → ticket + notify, photo "+", conversation history, handoff + after-hours, multilingual + live translation, customer voice (with the S3 gate). Keep emit-intent + backend validation throughout.

## Open questions for Ahmed (saved for the end; not blocking)

1. Confirm the stack framing: server-side `can()` + ownership scoping in place of Supabase RLS (assumed yes).
2. "Invoices" — do you want a **project-level** invoice document, or is the proposal + payment ledger the
   invoice for projects (service calls already have real invoices)?
3. Daily **API spend cap** amount + the alert threshold.
4. Which **stronger Claude model** for escalation (e.g. Sonnet) and the budget tolerance per escalated call.
5. "Existing wire waives install fee" — fixed waiver of the drop/install line, or a visible **wiring credit**
   line item? (Either is easy; it's a customer-facing wording choice.)
