// Outbound email — transactional customer notifications.
//
// Transport is Resend's REST API (no SDK/dependency — just fetch), chosen for a near-zero
// setup and generous free tier. The whole module is a SAFE NO-OP until RESEND_API_KEY is set:
// with no key it logs and returns {skipped:true}, so local dev and the initial deploy keep
// working with nothing to configure. Nothing here ever throws into a caller — email is a
// side effect, never a blocker for the action that triggered it.
//
// Env:
//   RESEND_API_KEY   secret — enables real sending. Unset = no-op.
//   EMAIL_FROM       "IOT TECHS <notify@yourdomain.com>" (default uses Resend's shared sender).
//   APP_URL          absolute base for links in emails, e.g. https://yourdomain.com

const ENDPOINT = "https://api.resend.com/emails";

export function emailEnabled() {
  return !!process.env.RESEND_API_KEY;
}

function fromAddress() {
  return process.env.EMAIL_FROM || "IOT TECHS <onboarding@resend.dev>";
}

function appUrl() {
  return (process.env.APP_URL || "").replace(/\/+$/, "");
}

// Low-level send. Returns {ok,id} | {skipped:true} | {ok:false,error}. Never throws.
export async function sendEmail({ to, subject, html, text, replyTo }) {
  const recipient = String(to || "").trim();
  if (!recipient || !recipient.includes("@")) return { ok: false, error: "no-recipient" };
  if (!emailEnabled()) {
    console.log(`[email:skipped] no RESEND_API_KEY — would send "${subject}" to ${recipient}`);
    return { skipped: true };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [recipient],
        subject: String(subject || "").trim() || "Update from IOT TECHS",
        html,
        text: text || undefined,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email:error] ${res.status} sending to ${recipient}: ${body.slice(0, 300)}`);
      return { ok: false, error: `http_${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, id: data?.id || null };
  } catch (e) {
    console.error(`[email:error] ${e?.message || e}`);
    return { ok: false, error: "network" };
  }
}

// ---- Branded template -------------------------------------------------------
// Email clients render dark backgrounds unreliably, so the shell is light with IOT's gold
// accent — table-based, all styles inline, no external assets (max deliverability).
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function renderEmail({ heading, intro, lines = [], ctaLabel, ctaUrl, footNote }) {
  const bodyLines = lines.filter(Boolean).map(
    (l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2a2f3a;">${esc(l)}</p>`
  ).join("");
  const cta = ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
         <tr><td style="border-radius:8px;background:#0B0F1A;">
           <a href="${esc(ctaUrl)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#C9A96E;text-decoration:none;border-radius:8px;">${esc(ctaLabel)}</a>
         </td></tr>
       </table>`
    : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8ec;">
          <tr><td style="background:#0B0F1A;padding:20px 28px;">
            <span style="font-size:16px;font-weight:700;letter-spacing:.14em;color:#C9A96E;">IOT&nbsp;TECHS</span>
          </td></tr>
          <tr><td style="padding:28px 28px 24px;">
            <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0B0F1A;">${esc(heading)}</h1>
            ${intro ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2a2f3a;">${esc(intro)}</p>` : ""}
            ${bodyLines}
            ${cta}
            ${footNote ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#8a909c;">${esc(footNote)}</p>` : ""}
          </td></tr>
          <tr><td style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eef0f3;">
            <p style="margin:0;font-size:12px;color:#9aa0ac;">IOT TECHS · Security & automation, professionally installed.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

function plainText({ heading, intro, lines = [], ctaLabel, ctaUrl }) {
  return [heading, "", intro, ...lines, ctaUrl ? `\n${ctaLabel}: ${ctaUrl}` : ""]
    .filter((s) => s !== undefined && s !== null)
    .join("\n");
}

// ---- Customer-facing helper -------------------------------------------------
// Resolve the project's customer contact and send. Import getJobByAccessId lazily so this
// module stays usable from the edge and doesn't pull the sync DB into unrelated bundles.
async function customerContact(accessId) {
  const { getJobByAccessId } = await import("./db.js");
  const p = getJobByAccessId(accessId);
  if (!p) return null;
  return {
    email: p.contact_email || null,
    name: p.contact_name || p.customer || "there",
    project: p,
  };
}

function projectLink(accessId) {
  const base = appUrl();
  return base ? `${base}/project/${accessId}` : null;
}

// Send a customer email for a project. content = {heading, intro, lines, ctaLabel}.
// Fire-and-forget friendly: awaited internally but callers may choose not to await.
export async function sendCustomerEmail(accessId, content) {
  const c = await customerContact(accessId);
  if (!c || !c.email) return { ok: false, error: "no-customer-email" };
  const ctaUrl = projectLink(accessId);
  const payload = {
    heading: content.heading,
    intro: content.intro,
    lines: content.lines || [],
    ctaLabel: ctaUrl ? (content.ctaLabel || "Open Project") : null,
    ctaUrl,
    footNote: content.footNote || "Reply to this email if you have any questions.",
  };
  return sendEmail({
    to: c.email,
    subject: content.subject || content.heading,
    html: renderEmail(payload),
    text: plainText(payload),
  });
}

// ---- Event copy -------------------------------------------------------------
// Customer-facing stages only — internal churn (qc, install scheduling, payout) never emails
// the customer. Keyed by the master stage key from lib/spec.js.
export const STAGE_EMAIL = {
  site_survey: {
    subject: "Your site survey is ready to review",
    heading: "Your site survey is ready",
    intro: "We’ve completed the walkthrough of your property.",
    lines: ["Take a look at the proposed camera placements and let us know they look right — one click to approve."],
    ctaLabel: "Review Survey",
  },
  proposal: {
    subject: "Your proposal is ready",
    heading: "Your proposal is ready to review",
    intro: "We’ve put together your system and pricing.",
    lines: ["Review the equipment and total, then approve when you’re ready to move forward."],
    ctaLabel: "Review Proposal",
  },
  approval_deposit: {
    subject: "Approve & secure your install date",
    heading: "One step to lock in your install",
    intro: "Your proposal is approved — the last step is signing and your deposit.",
    lines: ["Sign your agreement and submit the deposit to reserve your installation slot."],
    ctaLabel: "Sign & Pay Deposit",
  },
  payment: {
    subject: "Final balance is ready",
    heading: "Your install is complete — final balance",
    intro: "The work is done and your system is live.",
    lines: ["Your final balance is ready to settle whenever you are."],
    ctaLabel: "View Balance",
  },
  completion: {
    subject: "You’re all set — welcome to IOT TECHS",
    heading: "Everything’s wrapped up",
    intro: "Your project is complete.",
    lines: ["Your completion certificate and full record are available any time on your project page."],
    ctaLabel: "View Project",
  },
};

// Fire an email for a stage advance if that stage is customer-facing. No-op otherwise.
// Safe to call unconditionally after a stage move; never throws.
export async function emailStageAdvance(accessId, stageKey) {
  try {
    const copy = STAGE_EMAIL[stageKey];
    if (!copy) return { ok: false, error: "not-customer-facing" };
    return await sendCustomerEmail(accessId, copy);
  } catch (e) {
    console.error(`[email:stage] ${e?.message || e}`);
    return { ok: false, error: "exception" };
  }
}

// Proposal explicitly sent to the customer (distinct from the stage moving to "proposal").
export async function emailProposalReady(accessId) {
  try {
    return await sendCustomerEmail(accessId, STAGE_EMAIL.proposal);
  } catch (e) {
    console.error(`[email:proposal] ${e?.message || e}`);
    return { ok: false, error: "exception" };
  }
}
