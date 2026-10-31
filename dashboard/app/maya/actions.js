"use server";
// Admin ▸ Maya — the management surface. Admin-only (re-checked from the session cookie on every call, never
// the client). Settings write to the vault (app_secrets) so changes take effect with no deploy; Health +
// Activity read the AI usage ledger; Training reads the unanswered-question queue (teach Maya → resolve).
import { getSessionUser } from "../../lib/session";
import { aiUsageSummary, recentAiActivity, listMayaUnanswered, resolveMayaUnanswered, setSecret, secretValue,
  listLearnItems, getLearnItem, updateLearnItem, learnAnalytics } from "../../lib/db";

async function admin() { const u = await getSessionUser().catch(() => null); return u && u.role === "admin" ? u : null; }

export async function mayaDashboardAction() {
  const u = await admin(); if (!u) return { error: "Admin only." };
  return {
    ok: true,
    usage: aiUsageSummary(),
    activity: recentAiActivity(40),
    unanswered: listMayaUnanswered({ limit: 60 }),
    flags: { commands: secretValue("AI_COMMANDS") === "on", customer: secretValue("AI_CUSTOMER") === "on", proactive: secretValue("MAYA_PROACTIVE") === "on", hasKey: !!secretValue("ANTHROPIC_API_KEY") },
    briefingHour: +secretValue("MAYA_BRIEFING_HOUR") || 7,
  };
}

export async function mayaSetBriefingHourAction(hour) {
  const u = await admin(); if (!u) return { error: "Admin only." };
  setSecret("MAYA_BRIEFING_HOUR", String(Math.max(0, Math.min(23, Math.round(+hour || 7)))), u.name);
  return { ok: true };
}

export async function mayaSetCapAction(capDollars, alertPct) {
  const u = await admin(); if (!u) return { error: "Admin only." };
  const cents = Math.round(Math.max(0, +capDollars || 0) * 100);
  const pct = Math.max(1, Math.min(100, Math.round(+alertPct || 70)));
  setSecret("AI_SPEND_CAP_CENTS", String(cents), u.name);
  setSecret("AI_SPEND_ALERT_PCT", String(pct), u.name);
  return { ok: true };
}

export async function mayaSetFlagAction(flag, on) {
  const u = await admin(); if (!u) return { error: "Admin only." };
  const key = flag === "customer" ? "AI_CUSTOMER" : flag === "proactive" ? "MAYA_PROACTIVE" : "AI_COMMANDS";
  setSecret(key, on ? "on" : "off", u.name);
  return { ok: true };
}

export async function mayaResolveUnansweredAction(id) {
  const u = await admin(); if (!u) return { error: "Admin only." };
  return resolveMayaUnanswered(id);
}

// ---- Learn Queue (Learn Mode review) — admin only ----
export async function mayaLearnQueueAction(filter = {}) {
  const u = await admin(); if (!u) return { error: "Admin only." };
  const f = {};
  if (filter.open) f.open = true;
  if (filter.status) f.status = filter.status;
  if (filter.severity) f.severity = filter.severity;
  if (filter.category) f.category = filter.category;
  if (filter.recurring) f.recurring = true;
  return { ok: true, analytics: learnAnalytics(), items: listLearnItems(f) };
}
export async function mayaLearnGetAction(id) {
  const u = await admin(); if (!u) return { error: "Admin only." };
  const item = getLearnItem(id);
  return item ? { ok: true, item } : { error: "Not found." };
}
export async function mayaLearnUpdateAction(id, patch = {}) {
  const u = await admin(); if (!u) return { error: "Admin only." };
  // Only the reviewable fields; status is validated against the lifecycle.
  const { LEARN_STATUSES } = await import("../../lib/maya-learn");
  const clean = {};
  if (patch.status && LEARN_STATUSES.includes(patch.status)) clean.status = patch.status;
  for (const k of ["severity", "category", "resolution", "title", "expected", "proposed_fix", "related_to"]) if (patch[k] != null) clean[k] = patch[k];
  if (!Object.keys(clean).length) return { error: "Nothing to update." };
  return updateLearnItem(id, clean, u.name || u.email || "Admin");
}
