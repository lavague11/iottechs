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

// Simple view (the hub, "V2") is the DEFAULT for eligible projects. Only an explicit "deck" override
// (Advanced view, "V1") opts out. `staff_view`: "deck" → Advanced deck · "hub"/null/undefined → Simple hub.
// (The old global STAFF_PROJECT_HUB flag is no longer consulted — Simple is simply the default now.)
export function staffHubFor(project) {
  if (!eligibleForStaffHub(project)) return false;
  return project?.staff_view !== "deck";
}
