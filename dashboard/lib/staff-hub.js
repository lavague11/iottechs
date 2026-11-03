// Staff Project Hub (Phase 1) — resolves whether a project renders the clean, customer-style hub for STAFF
// instead of the stage deck. Pure (the secretValue read stays in the server layer); mirrors the Customer
// Portal V2 resolver exactly. The hub is presentation only: the same tools open from its cards, in staff
// (editable) mode, so no lifecycle / role / money logic changes.
import { eligibleForCustomerPortalV2 } from "./customer-portal";

// Same eligibility as the customer portal: install projects (type A/B). Service calls (type C) keep their
// own gateway, so they stay on the deck.
export function eligibleForStaffHub(project) {
  return eligibleForCustomerPortalV2(project);
}

// Precedence: ineligible → always deck; per-project override wins over global; else the global flag.
//   project.staff_view: "hub" force on · "deck" force off · null/undefined → inherit global
export function staffHubFor(project, { globalOn = false } = {}) {
  if (!eligibleForStaffHub(project)) return false;
  const ov = project?.staff_view;
  if (ov === "hub") return true;
  if (ov === "deck") return false;
  return !!globalOn;
}
