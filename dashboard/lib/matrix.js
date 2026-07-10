// What Each Role SEES and can DO at every stage — aligned to the 9-stage lifecycle.
//
// Shape: MATRIX[stageKey][roleKey] = { see, do }
//   see: string  (plain status text) | null (no screen for this role/stage)
//   do:  string[] of control labels  | [] (passive / view only)
// [Advance Step] appears only in the manager do[] — Admin/Manager both move the project
// but the step-control strip (gateway-client) is the primary UI for Admin.

export const MATRIX = {
  inquiry: {
    admin:    { see: "Lead card: name, source, requested services, timestamp", do: ["Assign Rep", "Add Services", "Convert to Project", "Mark Spam"] },
    customer: { see: "Inquiry received — your reference #", do: ["Submit Inquiry", "Add Details"] },
    tech:     { see: null, do: [] },
    sales:    { see: "Pipeline lead: name + service interest", do: ["Claim Lead", "Log Contact", "Add Note"] },
    manager:  { see: "Lead count + source breakdown", do: ["Reassign", "Advance Step"] },
  },
  site_survey: {
    admin:    { see: "Survey panel: photos, floor plan, measurements, surveyor", do: ["Schedule Survey", "Upload Photos", "Add Floor Plan", "Edit"] },
    customer: { see: "Survey gallery: photos + floor plan", do: ["View Survey"] },
    tech:     { see: "Assigned survey + capture form (photos, measures)", do: ["Start Survey", "Capture Photos", "Add Measures", "Submit"] },
    sales:    { see: "Survey thumbnail in customer preview", do: ["View Survey"] },
    manager:  { see: "Survey status + surveyor", do: ["Review Survey", "Advance Step"] },
  },
  // Merged: Mockup + Proposal (were two separate stages)
  proposal: {
    admin:    { see: "Mockup & proposal builder: camera placements, line items, pricing, margin, options A/B/C", do: ["Open Placement Tool", "Build Proposal", "Set Price", "Set Margin", "Add Options"] },
    customer: { see: "Proposal in preparation — mockup and quote coming soon", do: [] },
    tech:     { see: "Work order: assigned scope, equipment list, job address, scheduled install date", do: ["View Work Order", "Sign Work Order"] },
    sales:    { see: "Mockup + proposal editor: items, pricing, options (no margin)", do: ["Build Proposal", "Attach Mockup", "Preview Customer"] },
    manager:  { see: "Pending approval: mockup status + price & margin per service", do: ["Review Mockup", "Approve Pricing", "Advance Step"] },
  },
  // Merged: Approval + Deposit (were two separate stages)
  approval_deposit: {
    admin:    { see: "Signature tracker per service + deposit invoice & payment status", do: ["Send Proposal", "Track Signatures", "Issue Deposit", "Record Payment"] },
    customer: { see: "Proposal viewer: options, per-service sign panel + deposit invoice & pay panel", do: ["Review", "Select Option", "Sign per Service", "Pay Deposit", "Download Invoice"] },
    tech:     { see: null, do: [] },
    sales:    { see: "Sent status + payment tracker", do: ["Send", "Follow Up", "Send Reminder"] },
    manager:  { see: "Approval & deposit gate: signed services + payment status", do: ["Approve Send", "Confirm Deposit", "Advance Step"] },
  },
  // Schedule = work order created & dispatched (procurement & dispatch removed)
  schedule: {
    admin:    { see: "Calendar: install date + time window per work order", do: ["Schedule", "Set Date", "Reschedule", "Assign Tech"] },
    customer: { see: "Scheduled date + arrival window", do: ["View Schedule", "Request Change"] },
    tech:     { see: "My schedule: date, address, time window + work order", do: ["View Schedule", "Confirm", "View Work Order"] },
    sales:    { see: "Project status", do: [] },
    manager:  { see: "Team calendar + workload", do: ["Review Calendar", "Advance Step"] },
  },
  install: {
    admin:    { see: "Live progress: checklist %, tech notes, field photos", do: ["Monitor", "Add Note"] },
    customer: { see: "Installation in progress — our team is on site", do: [] },
    tech:     { see: "Install details: date, address, time window, scope + active checklist and equipment list", do: ["Start Job", "Complete Checklist", "Log Expense", "Request Equipment", "Mark Done"] },
    sales:    { see: "Project status", do: [] },
    manager:  { see: "Progress across active jobs", do: ["Monitor", "Advance Step"] },
  },
  // Merged: Tech QC + Customer QC (were two separate stages)
  qc: {
    admin:    { see: "Tech QC results: checklist, photos, pass/fail + customer walk-through status & punch list", do: ["Review QC", "Approve / Reject", "Resolve Issue"] },
    customer: { see: "Walk-through checklist + sign-off panel — please review the installation", do: ["Walk-Through", "Sign Off", "Report Issue"] },
    tech:     { see: "QC checklist + required photo uploads + punch-list items", do: ["Run Checklist", "Upload Photos", "Submit QC", "Fix Punch List", "Resubmit"] },
    sales:    { see: "Project status", do: [] },
    manager:  { see: "QC sign-off panel + open escalations", do: ["Internal Sign-Off", "Handle Escalation", "Advance Step"] },
  },
  payment: {
    admin:    { see: "Final invoice + balance + payment status", do: ["Issue Final Invoice", "Record Payment"] },
    customer: { see: "Final invoice: balance, pay panel, receipt", do: ["Pay Balance", "Download Receipt"] },
    tech:     { see: "Payout summary: job completed, hours logged, payout amount pending release", do: ["View Payout", "Confirm Receipt"] },
    sales:    { see: "Commission line", do: ["View Commission"] },
    manager:  { see: "Payment confirmation + release-to-complete", do: ["Confirm Payment", "Release Completion"] },
  },
  completion: {
    admin:    { see: "Closed summary: certificate, warranty, photos, actual margin", do: ["Close Project", "Issue Certificate", "Generate Warranty"] },
    customer: { see: "Certificate, warranty, final photos — thank you for choosing IOT Techs", do: ["Download Certificate", "View Warranty", "Leave Review"] },
    tech:     { see: "Job complete + payroll entry", do: ["View Completion", "Payroll"] },
    sales:    { see: "Closed deal + commission", do: [] },
    manager:  { see: "Profitability (quoted vs actual) + final sign-off", do: ["Final Sign-Off", "Review Profit"] },
  },
};

// Resolve the cell for a role at a stage. Vendor/readonly are stripped views.
export function cellFor(stageKey, viewRole) {
  const stage = MATRIX[stageKey] || {};
  if (viewRole === "vendor") {
    const t = stage.tech || { see: null, do: [] };
    return { see: t.see, do: [] };
  }
  if (viewRole === "readonly") {
    const c = stage.customer || { see: null, do: [] };
    return { see: c.see, do: [] };
  }
  return stage[viewRole] || { see: null, do: [] };
}
