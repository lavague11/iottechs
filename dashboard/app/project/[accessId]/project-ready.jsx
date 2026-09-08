"use client";
import { customerStatus, customerToneHex } from "../../../lib/customer-status";

// The customer's post-approval home. Replaces the old scheduling step: the customer never books —
// they see a calm, read-only state that moves itself from Approved → Preparing → Installation Confirmed.
// Deposit is a requirement, not a chapter: "Approved" holds (with a quiet note + a pay option) until
// the deposit is recorded; only then "Preparing"; then "Installation Confirmed" with date + window.
export default function ProjectReady({ facts = {}, stage, installDateStr, installWindowStr, onViewProposal, onPayDeposit, preview }) {
  const cs = customerStatus(stage, facts);
  const accepted = facts.proposal_status === "accepted";
  const depositIn = !!facts.deposit_recorded;
  const confirmed = !!facts.install_date;
  const depositPending = accepted && !depositIn;
  const accent = customerToneHex(cs.tone);

  // The three milestones the customer can see — only render the ones that have actually happened.
  const steps = [
    { label: "Proposal approved", done: accepted },
    { label: "Deposit received", done: depositIn },
    confirmed && { label: "Installation scheduled", done: true },
  ].filter(Boolean);

  return (
    <div className="prdy">
      <style>{PRDY_CSS}</style>
      <div className="prdy-card" style={{ "--acc": accent }}>
        <span className={`prdy-mark ${confirmed ? "done" : depositPending ? "hold" : "prep"}`} aria-hidden="true">
          {confirmed || depositIn ? (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          )}
        </span>

        <h2 className="prdy-title">{cs.label}</h2>
        {cs.sub && <p className="prdy-sub">{cs.sub}</p>}

        {confirmed && (
          <div className="prdy-appt">
            <div className="prdy-appt-date">{installDateStr || "Scheduled"}</div>
            {installWindowStr && <div className="prdy-appt-win">{installWindowStr}</div>}
            <div className="prdy-appt-by">Confirmed by IoT Techs</div>
          </div>
        )}

        {steps.length > 0 && (
          <ul className="prdy-steps">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? "done" : ""}>
                <span className="prdy-tick">{s.done && <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}</span>
                {s.label}
              </li>
            ))}
          </ul>
        )}

        <div className="prdy-actions">
          {depositPending && onPayDeposit && (
            <button type="button" className="prdy-btn primary" disabled={preview} onClick={() => !preview && onPayDeposit()}>Pay deposit</button>
          )}
          {onViewProposal && (
            <button type="button" className="prdy-btn ghost" onClick={() => onViewProposal()}>View proposal</button>
          )}
        </div>
      </div>
    </div>
  );
}

const PRDY_CSS = `
.prdy{display:flex;justify-content:center;padding:6px 0}
.prdy-card{width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:11px;
  padding:30px 24px 26px;border:1px solid var(--dv-line,#E4E4DF);border-top:3px solid var(--acc,#2E7D5B);
  border-radius:16px;background:var(--dv-raise,#FBFBFA);box-shadow:0 1px 2px rgba(16,20,24,.04),0 22px 50px -34px rgba(16,20,24,.4)}
.prdy-mark{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;color:#fff;background:var(--acc,#2E7D5B);margin-bottom:2px}
.prdy-mark.hold{background:var(--dv-gold,#C9A96E)}
.prdy-mark.prep{background:var(--dv-blue,#3E6C9E)}
.prdy-title{font-size:1.28rem;font-weight:700;letter-spacing:-.01em;color:var(--dv-ink,#101418);margin:0;line-height:1.15}
.prdy-sub{margin:0;font-size:.9rem;line-height:1.55;color:var(--dv-meta,#787D84);max-width:34ch}
.prdy-appt{margin:6px 0 2px;padding:14px 22px;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-paper,#F4F4F2);display:flex;flex-direction:column;gap:2px}
.prdy-appt-date{font-size:1.35rem;font-weight:700;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.prdy-appt-win{font-size:.95rem;font-weight:600;color:var(--dv-ink-soft,#3A4048)}
.prdy-appt-by{font-size:.72rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--dv-green,#2E7D5B);margin-top:4px}
.prdy-steps{list-style:none;margin:8px 0 2px;padding:0;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.prdy-steps li{display:flex;align-items:center;gap:9px;font-size:.86rem;color:var(--dv-meta,#787D84)}
.prdy-steps li.done{color:var(--dv-ink,#101418)}
.prdy-tick{width:18px;height:18px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;border:1.5px solid var(--dv-line,#E4E4DF);color:#fff}
.prdy-steps li.done .prdy-tick{background:var(--dv-green,#2E7D5B);border-color:var(--dv-green,#2E7D5B)}
.prdy-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:12px}
.prdy-btn{height:42px;padding:0 20px;border-radius:10px;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid transparent}
.prdy-btn.primary{background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A}
.prdy-btn.primary:hover{filter:brightness(1.04)}
.prdy-btn.primary:disabled{opacity:.5;cursor:default}
.prdy-btn.ghost{background:transparent;border-color:var(--dv-line,#E4E4DF);color:var(--dv-ink-soft,#3A4048)}
.prdy-btn.ghost:hover{border-color:var(--dv-ink,#101418);color:var(--dv-ink,#101418)}
@media (max-width:600px){
  .prdy-card{padding:26px 18px 22px;border-radius:14px}
  .prdy-title{font-size:1.18rem}
  .prdy-btn{flex:1 1 auto}
}
`;
