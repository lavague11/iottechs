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
  const att = t.who;                                   // the specific recipient THIS link was minted for
  const who = (att?.name || "").trim() || p.contact_name || p.customer || "The customer";
  const role = att?.role || "customer";
  const roleTag = role && role !== "customer" ? ` (${role})` : "";

  try {
    const raw = getToolData(t.accessId, "schedule")?.data;
    const d = raw ? JSON.parse(raw) : null;
    const ev = d && Array.isArray(d.events) ? d.events.find((e) => String(e.id) === String(t.eventId)) : null;
    if (ev) {
      const at = new Date().toISOString().slice(0, 19).replace("T", " ");
      // Per-attendee RSVP — everyone confirms their OWN status, keyed by email (or "customer").
      ev.confirmations = ev.confirmations && typeof ev.confirmations === "object" ? ev.confirmations : {};
      ev.confirmations[(att?.email || "customer").toLowerCase()] = { name: who, role, at };
      if (role === "customer" && !ev.confirmed_at) ev.confirmed_at = at;   // keep the legacy customer flag
      saveToolData(t.accessId, "schedule", JSON.stringify(d), "appt-confirm");
    }
  } catch { /* the log + notification below are the reliable record */ }
  try {
    logProjectEvent(t.accessId, { kind: "approve", label: `${who}${roleTag} confirmed their appointment — will attend`.slice(0, 300), actor: who });
  } catch {}
  try {
    notifyRoles(["admin", "manager"], { type: "appt-confirm", title: "Appointment confirmed", body: `${who}${roleTag} (${t.accessId}) confirmed they'll attend.`, link: `/project/${t.accessId}` });
  } catch {}
  try {
    await sendOfficeEmail({ accessId: t.accessId, subject: `Appointment confirmed — ${who} (${t.accessId})`, heading: "Appointment confirmed", lines: [`${who}${roleTag} confirmed they'll attend their appointment.`, `Project ${t.accessId}.`] });
  } catch {}

  return { ok: true, who };
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
  const att = t.who;
  const who = (att?.name || "").trim() || p.contact_name || p.customer || "The customer";
  const role = att?.role || "customer";
  const roleTag = role && role !== "customer" ? ` (${role})` : "";
  const clean = String(note || "").trim().slice(0, 500);

  // Record the request on the event so it also surfaces on the project (schedule widget).
  try {
    const raw = getToolData(t.accessId, "schedule")?.data;
    const d = raw ? JSON.parse(raw) : null;
    const ev = d && Array.isArray(d.events) ? d.events.find((e) => String(e.id) === String(t.eventId)) : null;
    if (ev) {
      ev.changeRequests = Array.isArray(ev.changeRequests) ? ev.changeRequests : [];
      ev.changeRequests.push({ by: who, role, action, note: clean, at: new Date().toISOString().slice(0, 19).replace("T", " ") });
      saveToolData(t.accessId, "schedule", JSON.stringify(d), "appt-change-request");
    }
  } catch {}
  try {
    logProjectEvent(t.accessId, {
      kind: "request",
      label: `${who}${roleTag} requested to ${action} their appointment${clean ? ` — “${clean}”` : ""}`.slice(0, 300),
      actor: who,
    });
  } catch { /* best-effort */ }
  try {
    notifyRoles(["admin", "manager"], {
      type: "appt-change",
      title: `Appointment ${action} requested`,
      body: `${who}${roleTag} (${t.accessId}) asked to ${action} their appointment${clean ? `: ${clean}` : "."}`,
      link: `/project/${t.accessId}`,
    });
  } catch { /* best-effort */ }
  try {
    await sendOfficeEmail({ accessId: t.accessId, subject: `Appointment ${action} requested — ${who} (${t.accessId})`, heading: `Appointment ${action} requested`, lines: [`${who}${roleTag} asked to ${action} their appointment.`, clean ? `Note: “${clean}”` : null, `Project ${t.accessId}.`] });
  } catch {}

  return { ok: true, action, who };
}
