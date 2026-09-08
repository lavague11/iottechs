// Customer-facing status translation layer.
//
// The internal lifecycle stays exactly as it is (inquiry → site_survey → proposal → approval_deposit →
// schedule → install → qc → payment → completion). This turns that operational state into ONE calm,
// human status the customer reads — never internal wording, never a task list. Two product rules baked in:
//   • The 50% deposit is a REQUIREMENT, not a chapter — an accepted proposal stays "Approved" (with a
//     quiet deposit note) until the deposit is actually recorded; only then does it become "Preparing".
//   • Scheduling is invisible to the customer — once dispatch assigns a date it simply reads
//     "Installation Confirmed" (date + arrival window), read-only.
//
// facts (from the same custFacts the flow gates on):
//   { proposal_status, proposal_signed, deposit_recorded, install_date, install_date_fmt, install_window }

const S = (label, tone, sub) => ({ label, tone, sub: sub || null });
// tone → the dot/badge colour: gold = your move, blue = we're working, green = settled/done.

export function customerStatus(stage, f = {}) {
  const accepted = f.proposal_status === "accepted";

  // ---- Before approval ----
  if (stage === "inquiry") return S("Getting Started", "blue", "We're setting up your project.");
  if (stage === "site_survey") return S("Site Survey", "blue", "We're mapping where your cameras go.");
  if (stage === "proposal" || (stage === "approval_deposit" && !accepted)) {
    if (!accepted) return S("Awaiting Approval", "gold", "Review and approve your proposed system.");
  }

  // ---- Approved, deposit not yet received → stays "Approved" (deposit is a requirement, not a stage) ----
  if (accepted && !f.deposit_recorded) {
    return S("Approved", "green", "A 50% deposit is required before project preparation begins.");
  }

  // ---- Deposit in, no installation date yet → Preparing ----
  if (f.deposit_recorded && !f.install_date && ["approval_deposit", "schedule"].includes(stage)) {
    return S("Preparing for Installation", "blue", "Your project has been released to our dispatch team.");
  }

  // ---- Installation date assigned → Confirmed (read-only date + arrival window) ----
  if (f.install_date && ["approval_deposit", "schedule"].includes(stage)) {
    return S("Installation Confirmed", "green", "Confirmed by IoT Techs.");
  }

  // ---- In the field and beyond ----
  if (stage === "install") return S("Installation in Progress", "gold", "Your technician is on the job.");
  if (stage === "qc") return S("Final Review", "blue", "Testing every device before we wrap up.");
  if (stage === "payment" || stage === "completion") return S("Complete", "green", "Your system is live.");

  return S("In Progress", "blue");
}

// The map colour token → the deck's hex, so the pill and Project Ready screen agree.
export const customerToneHex = (tone) => (tone === "green" ? "#2E7D5B" : tone === "gold" ? "#C9A96E" : "#3E6C9E");
