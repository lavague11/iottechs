import { cookies } from "next/headers";
import { resolveServiceCallRef, getServiceCallEvents, getDiagnostics, getUserById } from "../../../lib/db";
import { parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import SvcGate from "./svc-gate";
import SvcTrackClient from "./svc-track-client";
import SvcNotFound from "./svc-not-found";

// Neutral, non-leaking social preview — a service-call link that gets texted/forwarded must
// preview as a branded "secure access" card, never the customer's name or issue. Fetches nothing.
export function generateMetadata() {
  return {
    title: "IOT TECHS · Service Call",
    description: "Secure access — authorized only.",
    robots: { index: false, follow: false },
    openGraph: { title: "IOT TECHS", description: "Secure access link — authorized only.", type: "website" },
  };
}

// A logged-in customer owns the call when their email OR phone matches its contact; a PIN visitor
// carries the iot_svc cookie scoped to this call. Anyone else meets the PIN gate — no call data
// crosses to the client until authorized, so a forwarded link leaks nothing.
async function authorize(call) {
  const jar = await cookies();
  const svcTok = jar.get("iot_svc")?.value;
  const svc = svcTok ? await parseSvcToken(svcTok) : null;
  if (svc && String(svc.svcId).toUpperCase() === String(call.svc_id).toUpperCase()) {
    return { ok: true, name: call.contact_name || call.customer || "Customer", loggedIn: false };
  }
  const user = await getSessionUser();
  if (user?.id && user.role === "customer") {
    const row = getUserById(user.id) || {};
    const digits = (s) => String(s || "").replace(/\D/g, "");
    const emailOwns = user.email && call.contact_email &&
      String(user.email).trim().toLowerCase() === String(call.contact_email).trim().toLowerCase();
    const phoneOwns = digits(row.phone).length >= 7 && digits(row.phone) === digits(call.contact_phone);
    if (emailOwns || phoneOwns) return { ok: true, name: row.name || "Customer", loggedIn: true };
  }
  // Staff who happen to be logged in get read access to the customer tracker too (their real
  // control surface is the staff portal at /service-calls/[svcId]).
  if (user?.id && ["admin", "manager", "tech"].includes(user.role)) {
    return { ok: true, name: user.name || "Staff", loggedIn: true, staff: true };
  }
  return { ok: false };
}

export default async function ServiceCallTrackPage({ params }) {
  const { svcId } = await params;
  const call = resolveServiceCallRef(svcId);
  if (!call) return <SvcNotFound />;

  const auth = await authorize(call);
  if (!auth.ok) {
    return <SvcGate svcId={call.svc_id} customerName={call.contact_name || call.customer || ""} />;
  }

  const events = getServiceCallEvents(call.svc_id);
  const diagnostics = getDiagnostics(call.svc_id);

  // Customer-safe slim: only what a customer should see. No internal ids, no ticket linkage.
  const safeCall = {
    svc_id: call.svc_id,
    customer: call.customer,
    contact_name: call.contact_name,
    address: call.address,
    issue: call.issue,
    category: call.category,
    stage: call.stage,
    stage_label: call.stage_label,
    status: call.status,
    priority: call.priority,
    outcome_route: call.outcome_route,
    assignee_name: call.assignee_name,   // reassuring to see "your technician" — safe
    created_at: call.created_at,
    resolved_at: call.resolved_at,
  };

  // Customer-safe events: drop internal-only kinds (assign is fine to show as "technician
  // assigned"); everything the customer or the office logs about the work is theirs to see.
  const plain = (r) => ({ ...r });

  return (
    <SvcTrackClient
      call={safeCall}
      events={events.map(plain)}
      diagnostics={diagnostics.map(plain)}
      viewerName={auth.name}
      loggedIn={!!auth.loggedIn}
      staff={!!auth.staff}
    />
  );
}
