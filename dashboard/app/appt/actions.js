"use server";

import { verifyApptToken } from "../../lib/auth";
import { getJobByAccessId, logProjectEvent, notifyRoles } from "../../lib/db";

// Customer taps "Request to reschedule / cancel" in their appointment email → this files the request
// with the office (Job Log + a notification to admin/manager). It does NOT change the appointment —
// staff action it. Token-gated (long-lived HMAC of accessId+eventId); no login required.
export async function requestAppointmentChangeAction(token, kind, note) {
  const t = await verifyApptToken(token);
  if (!t) return { ok: false, error: "This link is invalid or expired." };
  const action = kind === "cancel" ? "cancel" : "reschedule";
  const p = getJobByAccessId(t.accessId);
  if (!p) return { ok: false, error: "Project not found." };
  const who = p.contact_name || p.customer || "The customer";
  const clean = String(note || "").trim().slice(0, 500);

  try {
    logProjectEvent(t.accessId, {
      kind: "request",
      label: `${who} requested to ${action} their appointment${clean ? ` — “${clean}”` : ""}`.slice(0, 300),
      actor: who,
    });
  } catch { /* best-effort */ }
  try {
    notifyRoles(["admin", "manager"], {
      type: "appt-change",
      title: `Appointment ${action} requested`,
      body: `${who} (${t.accessId}) asked to ${action} their appointment${clean ? `: ${clean}` : "."}`,
      link: `/project/${t.accessId}`,
    });
  } catch { /* best-effort */ }

  return { ok: true, action };
}
