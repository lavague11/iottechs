"use server";

import { verifyApptToken } from "../../lib/auth";
import { getJobByAccessId, logProjectEvent, notifyRoles, getToolData, saveToolData } from "../../lib/db";
import { sendOfficeEmail } from "../../lib/email";

// Customer taps "Confirm" in their appointment email → records their RSVP (they'll attend). Marks the
// event confirmed in the schedule blob (best-effort) and reliably logs it + notifies the office.
export async function confirmAppointmentAction(token) {
  const t = await verifyApptToken(token);
  if (!t) return { ok: false, error: "This link is invalid or expired." };
  const p = getJobByAccessId(t.accessId);
  if (!p) return { ok: false, error: "Project not found." };
  const who = p.contact_name || p.customer || "The customer";

  try {
    const raw = getToolData(t.accessId, "schedule")?.data;
    const d = raw ? JSON.parse(raw) : null;
    const ev = d && Array.isArray(d.events) ? d.events.find((e) => String(e.id) === String(t.eventId)) : null;
    if (ev && !ev.confirmed_at) { ev.confirmed_at = new Date().toISOString().slice(0, 19).replace("T", " "); saveToolData(t.accessId, "schedule", JSON.stringify(d), "customer-confirm"); }
  } catch { /* the log + notification below are the reliable record */ }
  try {
    logProjectEvent(t.accessId, { kind: "approve", label: `${who} confirmed their appointment — will attend`.slice(0, 300), actor: who });
  } catch {}
  try {
    notifyRoles(["admin", "manager"], { type: "appt-confirm", title: "Appointment confirmed", body: `${who} (${t.accessId}) confirmed they'll attend their appointment.`, link: `/project/${t.accessId}` });
  } catch {}
  try {
    await sendOfficeEmail({ accessId: t.accessId, subject: `Appointment confirmed — ${who} (${t.accessId})`, heading: "Appointment confirmed", lines: [`${who} confirmed they'll attend their appointment.`, `Project ${t.accessId}.`] });
  } catch {}

  return { ok: true };
}

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
  try {
    await sendOfficeEmail({ accessId: t.accessId, subject: `Appointment ${action} requested — ${who} (${t.accessId})`, heading: `Appointment ${action} requested`, lines: [`${who} asked to ${action} their appointment.`, clean ? `Note: “${clean}”` : null, `Project ${t.accessId}.`] });
  } catch {}

  return { ok: true, action };
}
