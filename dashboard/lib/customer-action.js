// The customer's single next step, derived from the SAME facts the stage-flow matrix gates on.
// This is a promotion layer, not new logic: it turns "which customer-tagged requirement is unmet"
// into one hero card. When the ball is on the company's side, it returns a status (no CTA) so the
// customer is never left guessing whose move it is.
//
// Shape: { tone: "action" | "status" | "done", kicker, headline, sub, cta?, target? }
//   target = the stage key to browse to (where the REAL control lives). Only stages that actually
//   have a customer control get a CTA — never a dead button.

const A = (headline, sub, cta, target) => ({ tone: "action", kicker: "Your next step", headline, sub, cta, target });
const S = (headline, sub) => ({ tone: "status", kicker: "In progress", headline, sub });
const D = (headline, sub) => ({ tone: "done", kicker: "Complete", headline, sub });

// The master stage the customer's VIEW should sit on — their first unmet obligation, independent of
// how far the office has pushed the internal stage. This is the fix for "the admin moved ahead and
// now the customer is lost": their pointer follows THEIR to-do, not ops. Returns null once they're
// caught up on the getting-started obligations (survey → accept → sign → deposit) — after that their
// view just follows the real project (watch install; pay the final balance at closeout).
export function customerPointer(f = {}) {
  if (!f.survey_ok)                    return "site_survey";       // review/approve the survey (or wait for it)
  if (f.proposal_status !== "accepted") return "proposal";        // review + accept a proposal option
  if (!f.proposal_signed)              return "approval_deposit";  // sign the agreement
  if (!f.deposit_recorded)             return "approval_deposit";  // pay the deposit
  return null;                                                     // caught up → follow the real project
}

// The one "just published" item to celebrate for the customer right now: the first office-published
// review item that's available and not yet done, in order (survey → mockup → proposal). Returns null
// when there's nothing new to announce (caught up, or waiting on the office). Pair with the project's
// announced_seen set so each item pops exactly once. "One at a time" is by construction — the next
// item only surfaces once the current one is done.
export function customerAnnouncement(f = {}) {
  if (f.survey_published && f.survey_has && !f.survey_done)
    return { key: "survey", icon: "survey",
      title: "Your site survey is ready",
      body: "Review the device placement and approve.",
      cta: "Review survey", target: "site_survey" };
  if (f.mockup_published && f.mockup_has && !f.mockup_done)
    return { key: "mockup", icon: "mockup",
      title: "Your system mockup is ready",
      body: "Review the design and approve.",
      cta: "Review mockup", target: "site_survey" };
  if (f.proposal_status === "sent")
    return { key: f.proposal_version ? `proposal:v${f.proposal_version}` : "proposal", icon: "proposal",
      title: "Your proposal is ready",
      body: "Review and accept your option.",
      cta: "View proposal", target: "proposal" };
  return null;
}

// Server-friendly "does the customer owe an action right now?" — derived from db.buildStageFacts
// field names (survey_accepted / proposal_status / proposal_signed / deposit_recorded /
// final_balance_paid / stage). Returns { label, cta, target, order } or null when the ball is on the
// company's side. `order` = flow position, so a customer with several projects can be shown their
// pending actions in chronological order. `target` is the stage the project's gateway centers on.
export function customerTodo(f = {}) {
  const S = f.stage;
  if (S === "site_survey" && !f.survey_accepted)
    return { label: "Review & approve your site survey", cta: "Review survey", target: "site_survey", order: 1 };
  if ((S === "proposal" || S === "approval_deposit") && f.proposal_status !== "accepted")
    return { label: (f.proposal_version > 1 ? "Your proposal has been revised — review & accept" : "A new proposal is ready — review & accept"),
             cta: "Review proposal", target: "proposal", order: 2 };
  if (S === "approval_deposit" && !f.proposal_signed)
    return { label: "Sign your agreement to get started", cta: "Sign now", target: "approval_deposit", order: 3 };
  if (S === "approval_deposit" && !f.deposit_recorded)
    return { label: "Pay your deposit to lock in your install date", cta: "Pay deposit", target: "approval_deposit", order: 4 };
  if (S === "payment" && !f.final_balance_paid)
    return { label: "Pay your final balance to complete your project", cta: "Pay balance", target: "approval_deposit", order: 5 };
  return null;
}

export function customerAction(stage, f = {}) {
  switch (stage) {
    case "inquiry":
      return f.appt_date
        ? S("Your site survey is being scheduled", "We'll confirm shortly.")
        : S("We've received your request", "We'll reach out to schedule.");

    case "site_survey":
      if (f.survey_accepted) return S("Site survey approved", "Proposal coming next.");
      if (f.survey_submitted) return A("Review and approve your site survey", "Approve the device placement.", "Review survey", "site_survey");
      return S("Your site survey is being prepared", "We'll notify you when it's ready.");

    case "proposal":
      if (f.proposal_status === "accepted") return S("Proposal accepted", "Sign + deposit next.");
      if (f.proposal_status === "changes_requested") return S("We're revising your proposal", "Updated version coming shortly.");
      if (f.proposal_status === "sent" || f.proposal_status === "declined")
        return A("Review your proposal", "Accept the option you want.", "Review proposal", "proposal");
      return S("Your proposal is being prepared", "Putting together your pricing.");

    case "approval_deposit":
      // Same requirement order the flow matrix gates on: accept → sign → deposit → confirm.
      if (f.proposal_status !== "accepted")
        return A("Review and accept your proposal", "Choose your option to continue.", "Review proposal", "proposal");
      if (!f.proposal_signed)   return A("Sign your agreement", "Locks in your proposal.", "Sign agreement", "approval_deposit");
      if (!f.deposit_submitted) return A("Pay your deposit to get started", "Reserves your crew + gear.", "Pay deposit", "approval_deposit");
      if (!f.deposit_recorded)  return S("Confirming your deposit", "Verifying your payment.");
      return S("You're all set", "Moving to scheduling.");

    case "schedule":
      return f.install_date
        ? S(`Your install is scheduled${f.install_date_fmt ? ` — ${f.install_date_fmt}` : ""}`, "We'll text before arrival.")
        : S("We're scheduling your install", "Your date is coming.");

    case "install":
      return S("Your install is underway", "Technician on site.");

    case "qc":
      return S("Final quality check in progress", "Testing every device.");

    case "payment":
      return A("Pay your final balance", "One last step.", "Pay balance", "approval_deposit");

    case "completion":
      return D("Your system is live", "Certificate + warranty ready.");

    default:
      return null;
  }
}
