// Maya — proactive jobs: the morning briefing and weekly report. Composers are PURE (tested); the
// orchestrator (runMayaProactive) is driven once an hour by the boot scheduler (instrumentation.js) and is
// DARK until the owner enables it (MAYA_PROACTIVE=on) — so nothing fires unexpectedly. Dedup markers in the
// vault keep it to once per day / once per Monday even across restarts. Briefing + weekly go to staff only
// (admin/manager portal + office email) — never to customers.
import { getSecret, setSecret, secretValue, notifyRoles, mayaProactiveData, mayaNudgeCandidates, claimNudge, logProjectEvent } from "./db.js";

const moneyD = (d) => "$" + (Math.round((+d || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function briefingLines(d = {}) {
  const L = [];
  L.push(d.awaitingSig ? `${d.awaitingSig} proposal${d.awaitingSig === 1 ? "" : "s"} awaiting signature${d.sigOverdue ? ` — ${d.sigOverdue} past the deadline` : ""}.` : "No proposals waiting on a signature.");
  L.push(d.dueNow ? `${d.dueNow} payment${d.dueNow === 1 ? "" : "s"} due now — ${moneyD(d.dueAmt)} outstanding.` : "No payments currently due.");
  return L;
}
export function weeklyLines(d = {}) {
  return [
    `Quotes sent (7 days): ${d.sent7 || 0}`,
    `Proposals signed (7 days): ${d.signed7 || 0}`,
    `Collected (7 days): ${moneyD(d.collected7)}`,
    `Open now: ${d.awaitingSig || 0} awaiting signature, ${d.dueNow || 0} payment${(d.dueNow || 0) === 1 ? "" : "s"} due.`,
  ];
}

const dayStr = (now) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

// Run the due proactive jobs for `now` (Eastern — the process TZ is pinned). Returns a small status object.
export async function runMayaProactive(now = new Date()) {
  if (secretValue("MAYA_PROACTIVE") !== "on") return { skipped: "off" };
  const hour = +secretValue("MAYA_BRIEFING_HOUR") || 7;
  if (now.getHours() !== Math.max(0, Math.min(23, hour))) return { skipped: "not-hour" };
  const today = dayStr(now);
  const d = mayaProactiveData();
  const sendEmail = async (subject, heading, lines) => { try { const m = await import("./email.js"); await m.sendOfficeEmail?.({ subject, heading, lines }); } catch {} };
  const out = {};

  // Morning briefing — once per day.
  if (getSecret("MAYA_LAST_BRIEFING") !== today) {
    setSecret("MAYA_LAST_BRIEFING", today, "Maya");
    const lines = briefingLines(d);
    try { notifyRoles(["admin", "manager"], { type: "maya_briefing", title: "Maya — morning briefing", body: lines.join(" ") }); } catch {}
    await sendEmail("Maya — morning briefing", "Good morning — today at a glance", lines);
    out.briefing = true;
  }
  // Weekly report — Mondays only, once.
  if (now.getDay() === 1 && getSecret("MAYA_LAST_WEEKLY") !== today) {
    setSecret("MAYA_LAST_WEEKLY", today, "Maya");
    const lines = weeklyLines(d);
    try { notifyRoles(["admin"], { type: "maya_weekly", title: "Maya — weekly report", body: lines.join(" · ") }); } catch {}
    await sendEmail("Maya — weekly report", "This week", lines);
    out.weekly = true;
  }
  // Customer nudges — once per briefing hour, cooldown-deduped + per-project pause-respecting.
  const nudged = await runMayaNudges();
  if (nudged?.sent) out.nudges = nudged.sent;
  return { ok: true, ...out };
}

// Send polite customer reminders for unsigned proposals, unpaid deposits and final balances — only for
// projects NOT paused (projects.nudge_paused) and NOT nudged for that type within the cooldown (default 3
// days). Reuses the existing customer email senders (env-gated no-ops without RESEND_API_KEY). Unconfirmed
// APPOINTMENT reminders stay on the appointment-reminder sweep, which also skips paused projects.
export async function runMayaNudges() {
  if (secretValue("MAYA_PROACTIVE") !== "on") return { skipped: "off" };
  const cooldown = Math.max(1, +secretValue("MAYA_NUDGE_COOLDOWN_DAYS") || 3);
  const email = await import("./email.js").catch(() => null);
  let sent = 0;
  for (const c of mayaNudgeCandidates()) {
    // Atomic claim BEFORE sending — one winner per (project,type) per cooldown, even across workers.
    if (!claimNudge(c.accessId, c.type, cooldown)) continue;
    try {
      if (c.type === "unsigned") await email?.emailSignatureRequest?.(c.accessId);
      else if (c.type === "deposit") await email?.emailPaymentReminder?.(c.accessId, { kind: "deposit", amount: c.amount });
      else if (c.type === "balance") await email?.emailPaymentReminder?.(c.accessId, { kind: "final", amount: c.amount });
      try { logProjectEvent(c.accessId, { kind: "nudge", label: `Maya sent a ${c.type} reminder`, actor: "Maya" }); } catch {}
      sent++;
    } catch {}
  }
  return { ok: true, sent };
}
