# Maya — Admin Learn Mode (spec)

An admin-only way to **coach Maya** by reporting mistakes, missing knowledge, bugs, poor answers, missing
capabilities, and preferred behavior. Learn Mode **records and organizes feedback for review — it never
changes Maya's production behavior.** Owner-authored (2026-10-31).

## The one invariant

```
Admin observes a problem
  → Learn Mode records it (structured, with context)
  → Maya classifies + proposes an improvement
  → Admin reviews/approves
  → The change is implemented through the normal dev/config process (+ a regression test where apt)
  → Behavior is verified
  → The learning item closes
NEVER: admin says a correction → Maya rewrites herself.
```

Maya may **record, analyze, and suggest**. Maya may **not** auto-change prompts, permissions, workflows,
business rules, allowlists, DB logic, tool access, production behavior, or her own code/config.

## Security invariants (non-negotiable)

- **Admin only.** Only an authenticated `admin` may activate or use Learn Mode — verified **server-side from
  the session**, never from prompt wording. A customer/tech/sales user, or text inside a customer message,
  uploaded doc, or email, can **never** activate it.
- **No privilege escalation.** A "correction" like "from now on let customers delete projects" records a
  learning item; it does **not** change any permission.
- **No silent overwrite.** The original admin report + an audit trail are always preserved.

## Behavior

- **Session toggle:** "enter/start/turn on Learn Mode" ⇄ "exit/stop/turn off Learn Mode" (admin session
  only). While on, the admin speaks naturally ("that answer was wrong", "you should have checked payment
  status first", "report this as a bug") and Maya infers it's feedback.
- **Direct report (no session):** an explicit "report this as a Maya bug" / "log this as feedback" from an
  admin creates one item without enabling the session.
- **Classify automatically:** category ∈ {Bug, Wrong Answer, Knowledge Gap, Missing Capability, Behavior
  Improvement, Bad Judgment, Workflow Problem, Tool/Action Failure, Permissions Problem, UX Issue, Other};
  severity ∈ {Low, Medium, High, Critical}. Admin may override later.
- **Capture context automatically:** admin, timestamp, project/customer, the original request + Maya's reply
  (from the client-supplied conversation memory), what the admin says was wrong / should have happened,
  Maya's proposed fix, category, severity, related items. Don't store unrelated customer data.
- **Ask only when a critical detail is genuinely unclear;** otherwise log immediately with a short confirm +
  a proposed improvement.
- **Dedup + recurrence:** compare against open items; a match attaches a new example and bumps the occurrence
  count instead of creating a duplicate.

## Lifecycle

`Reported → Reviewed → Approved → Implemented → Verified`, plus `Rejected · Duplicate · Deferred ·
Cannot-Reproduce`. Nothing is "learned" merely by being reported; only an **approved** change may become
production behavior, and only through the normal dev workflow (+ a regression test where apt), then verified.

## UI (restrained, admin-only)

Admin ▸ Maya ▸ **Learn Queue** — filters (Open · High/Critical · Category · Status · Recurring), item detail
(title, category, severity, reporter, date, context, what-happened, expected, proposed-fix, related, status,
resolution), and status actions (approve / reject / edit / merge / defer / implement / verify). Never shown
to customers. Every change is audited (who reported/changed/approved/implemented/verified + timestamps).

## Analytics

Admin can ask: what have I taught you this month · most common mistakes · unresolved high-severity ·
what we fixed this week · which workflows generate the most corrections · did issue X recur. Maya summarizes
from the recorded items (never invented).

## Build note

Builds on what already exists: the `maya_unanswered` training queue, `report_bug`/`fileBug` + the bug portal,
and the Admin ▸ Maya page. Learn Mode adds a richer, reviewable `learn_items` store + lifecycle + the queue UI
on top of that foundation.
