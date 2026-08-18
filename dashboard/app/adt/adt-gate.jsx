"use client";

import { useRouter } from "next/navigation";
import { GatewayScreen } from "../components/gateway-screen";
import { adtAttemptAccessAction } from "./actions";

const STAFF = ["admin", "manager", "sales", "tech"];

// ADT account gate — the SAME secure-access screen the project pages use (animated starfield keypad,
// Face ID, network diagnostics). Nothing new: it renders the shared GatewayScreen. The PIN is the
// last 4 digits of the account's phone number, or the master admin PIN. Entering the master PIN (or a
// staff login) resolves to a staff view and jumps to the admin Deck for this account.
export default function AdtGate({ adtId, firstName = "", onUnlocked = null }) {
  const router = useRouter();

  async function attemptAccess({ loginRole, pinValue, emailOrPhone, password } = {}) {
    return adtAttemptAccessAction(adtId, { loginRole, pinValue, emailOrPhone, password });
  }

  function onAuthenticated(view) {
    // Staff (master PIN / staff login) → the full admin Deck for this account.
    if (view && STAFF.includes(view)) { router.push(`/adt-applications/${adtId}`); return; }
    // Customer → reveal in place (client lock) or reload so the server re-renders the account.
    if (onUnlocked) onUnlocked();
    else window.location.reload();
  }

  return <GatewayScreen attemptAccess={attemptAccess} onAuthenticated={onAuthenticated} />;
}
