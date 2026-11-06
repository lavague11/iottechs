# BUGS — found during the journey audit (2026-11-05, read-only)

Only genuine defects are listed here; design/flow friction lives in `docs/journey-audit.md`.

## 1. Homepage stats show placeholder "0+" (trust dent) — ✅ FIXED
- **Where:** `/` home, "Security at your fingertips" stats band (`public/home.html`).
- **Observed:** read **"0+ Locations served · 0+ Cameras installed · 0+ yrs in business"** — counters that only animate to their targets when an on-scroll animation fires, and whose targets (1500 / 10000) are the unverified claims the file deliberately omits elsewhere.
- **Repro (before):** open `http://localhost:3100/` → scroll to the stats band. (`docs/journey-shots/01-customer-home.png`)
- **Fix shipped:** removed the stats band (left a comment to re-add with real, approved numbers).
- **Severity:** Medium (public-facing, cosmetic/trust).

## 2. Ops signal is buried in sign-in / PIN noise — ✅ FIXED (noise)
- **Where:** `/notifications` feed (`lib/db.js` `getNotificationFeed`).
- **Observed:** notifications (80) were dominated by **"X signed in"** and **"Master admin PIN → …"** events; new leads didn't stand out.
- **Repro (before):** `http://localhost:3100/notifications`. (`03c-admin-notifications.png`)
- **Fix shipped:** `login` / `logout` / `pin_access` events are no longer surfaced in the feed (they stay in the audit trail `getActivityLog`); only actionable activity (new inquiries, substantive notes) remains.
- **Open (deferred to fix #3 / item 6):** the dashboard "Needs Attention" count still mixes old open tickets with new leads — the **New-Leads lane** addresses the lead-surfacing half. Old *open* tickets are intentionally kept visible (they're unresolved work, not stale noise), so they are not auto-aged-out.
- **Severity:** Medium (operational — slow lead response).

## 3. Wrong next-action at the inquiry stage — ❌ NOT REPRODUCED (not a bug)
- **Claimed:** the prominent CTA is "Create Proposal" before any survey exists.
- **Investigation:** `resolveProjectStatus` resolves a fresh inquiry (no survey, no proposal) to **`BUILD_SURVEY`**, and the hub CTA map renders that as **"Open Site Survey"** — the correct next step. Verified live for ASC0122 (`state=BUILD_SURVEY`). There is **no literal "Create Proposal" CTA** anywhere in the app code (grep: only `"Open Proposal"` exists, for already-proposal states).
- **Conclusion:** the "Create Proposal / Open Proposal" text in the original screenshot's *text dump* was the proposal tool-card's own "Create → / Open" labels in the Internal section, not a premature primary CTA. **No fix needed.** Per-stage next-action correctness is covered by fix #5 (item 4).

---
*Note:* the single biggest finding — **no post-completion review request exists** — is an intentional gap/opportunity (top fix #1 in the audit), not a defect, so it's tracked in `journey-audit.md`, not here.
