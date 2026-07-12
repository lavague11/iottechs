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
