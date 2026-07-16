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
      body: "We've mapped out where every device goes. Take a look and approve it to keep things moving.",
      cta: "Review survey", target: "site_survey" };
  if (f.mockup_published && f.mockup_has && !f.mockup_done)
    return { key: "mockup", icon: "mockup",
      title: "Your system mockup is ready",
      body: "See the design we put together for your space, then approve it.",
      cta: "Review mockup", target: "site_survey" };
  if (f.proposal_status === "sent")
    return { key: f.proposal_version ? `proposal:v${f.proposal_version}` : "proposal", icon: "proposal",
      title: "Your proposal is ready",
      body: "Your options and pricing are in. Review them and accept the one you want.",
      cta: "View proposal", target: "proposal" };
  return null;
}

export function customerAction(stage, f = {}) {
  switch (stage) {
    case "inquiry":
      return f.appt_date
        ? S("Your site survey is being scheduled", "We'll confirm the appointment with you shortly.")
        : S("We've received your request", "Our team will reach out to schedule your site survey.");

    case "site_survey":
      if (f.survey_accepted) return S("Site survey approved", "We're preparing your proposal now.");
      if (f.survey_submitted) return A("Review and approve your site survey", "Check the device placement, then approve to continue.", "Review survey", "site_survey");
      return S("Your site survey is being prepared", "We'll let you know the moment it's ready to review.");

    case "proposal":
      if (f.proposal_status === "accepted") return S("Proposal accepted", "Next you'll sign the agreement and place your deposit.");
      if (f.proposal_status === "changes_requested") return S("We're revising your proposal", "We'll send you the updated version shortly.");
      if (f.proposal_status === "sent" || f.proposal_status === "declined")
        return A("Review your proposal", "See your options and pricing, then accept the one you want.", "Review proposal", "proposal");
      return S("Your proposal is being prepared", "We're putting together your options and pricing.");

    case "approval_deposit":
      // Same requirement order the flow matrix gates on: accept → sign → deposit → confirm.
      if (f.proposal_status !== "accepted")
        return A("Review and accept your proposal", "Choose your option to continue to signing and deposit.", "Review proposal", "proposal");
      if (!f.proposal_signed)   return A("Sign your agreement", "Add your signature to lock in your proposal.", "Sign agreement", "approval_deposit");
      if (!f.deposit_submitted) return A("Pay your deposit to get started", "Your deposit reserves your crew and equipment.", "Pay deposit", "approval_deposit");
      if (!f.deposit_recorded)  return S("Confirming your deposit", "We're verifying your payment — this only takes a moment.");
      return S("You're all set", "We're moving your project into scheduling.");

    case "schedule":
      return f.install_date
        ? S(`Your install is scheduled${f.install_date_fmt ? ` — ${f.install_date_fmt}` : ""}`, "We'll text you before your technician arrives.")
        : S("We're scheduling your install", "We're lining up your crew and equipment — your date is coming.");

    case "install":
      return S("Your install is underway", "Your technician is on site setting up your system.");

    case "qc":
      return S("Final quality check in progress", "We're testing every device before we hand it over.");

    case "payment":
      return A("Pay your final balance", "One last step and your project is complete.", "Pay balance", "approval_deposit");

    case "completion":
      return D("Your system is live", "Your completion certificate and warranty are ready in your project.");

    default:
      return null;
  }
}
