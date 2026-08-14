"use client";
import { useState, useEffect } from "react";
import { getApprovalDataAction, createWorkOrderAction, finalizeWorkOrderAction } from "./proposal-actions";
import { addAssignmentAction, removeAssignmentAction, setInternalJobAction } from "./actions";
import TechPricingEditor from "./proposal-tech-pricing";

// Third card of the proposal-phase flow (admin/manager): everything to stand up the work order once
// the proposal is signed + the deposit is in. Groups, in order: assign the technician(s) → set their
// per-line payout (the pricing editor, moved here from Install) → create the work order. Self-contained
// (fetches its own approval data for the signed/deposit gate) so it drops in as its own collapsible.
export default function WorkOrderCard({ accessId, proposal, onProposalChange, assignments = [], staffUsers = [], onAssignmentsChange, onStageChange, internalJob = false, embedded = false }) {
  // `embedded` = mounted in the deck (the row already names it) → drop our own title/collapse
  // header and stay open. Standing convention for deck-embedded tools.
  const [openState, setOpen] = useState(false);   // collapsed by default — part of the compact flow
  const open = embedded ? true : openState;
  const [data, setData] = useState(null);
  const [intern, setIntern] = useState(!!internalJob);   // internal / legacy job — skips the sign+deposit gate
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [pick, setPick] = useState("");

  useEffect(() => {
    let live = true;
    getApprovalDataAction(accessId).then((r) => { if (live && r?.ok) setData(r); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  const p = data?.proposal;
  const signed = !!p?.signed_name;
  const depositPaid = (data?.payments || []).filter((x) => x.status !== "pending" && x.kind === "deposit").reduce((s, x) => s + (+x.amount || 0), 0);
  const depositOk = depositPaid > 0;
  const techSigned = !!p?.tech_signed_name;
  const [woCreated, setWoCreated] = useState(false);
  const created = woCreated || techSigned;

  // Finalize: the office reviews the auto-seeded payout, then finalizes so a tech can accept it.
  const [finBusy, setFinBusy] = useState(false);
  const [finalizedAt, setFinalizedAt] = useState(proposal?.wo_finalized_at || null);
  const [finalizedBy, setFinalizedBy] = useState(proposal?.wo_finalized_by || null);
  useEffect(() => { setFinalizedAt(proposal?.wo_finalized_at || null); setFinalizedBy(proposal?.wo_finalized_by || null); }, [proposal?.wo_finalized_at, proposal?.wo_finalized_by]);
  async function toggleFinalize(on) {
    setFinBusy(true); setErr(null);
    const r = await finalizeWorkOrderAction(accessId, on);
    setFinBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setFinalizedAt(r.proposal?.wo_finalized_at || null);
    setFinalizedBy(r.proposal?.wo_finalized_by || null);
    onProposalChange?.(r.proposal);
  }

  const techs = assignments.filter((a) => a.role === "tech");
  const availableTechs = staffUsers.filter((u) => u.role === "tech" && !techs.some((t) => String(t.user_id) === String(u.id)));

  async function assignTech() {
    const u = staffUsers.find((x) => String(x.id) === String(pick));
    if (!u || busy) return;
    setBusy(true); setErr(null);
    const r = await addAssignmentAction(accessId, { userId: u.id, userName: u.name, userEmail: u.email, role: "tech" });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onAssignmentsChange?.((prev) => [...prev, { id: r.id, user_id: u.id, user_name: u.name, user_email: u.email, role: "tech" }]);
    setPick("");
  }
  async function unassign(a) {
    if (busy) return;
    setBusy(true); setErr(null);
    const r = await removeAssignmentAction(accessId, a.id);
    setBusy(false);
    if (r?.ok) onAssignmentsChange?.((prev) => prev.filter((x) => x.id !== a.id));
  }
  async function createWO() {
    setBusy(true); setErr(null);
    const r = await createWorkOrderAction(accessId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setWoCreated(true);
    onStageChange?.(r.stage);
  }

  // Internal / legacy jobs (no customer sale) skip the customer sign + deposit requirement.
  const gateOk = intern || depositOk;   // the work order is INTERNAL — no customer signature required, just a deposit
  async function toggleInternal(on) {
    setIntern(on);   // optimistic
    const r = await setInternalJobAction(accessId, on);
    if (r?.error) { setIntern(!on); setErr(r.error); }
  }

  const statusTxt = created ? (techSigned ? "Accepted" : "Created") : "Not created";
  const gateNote = created
    ? (techSigned ? `Work order accepted by ${p.tech_signed_name}.` : "Work order created — project is in scheduling.")
    : intern
      ? "Internal job — no customer sign-off needed. Assign a technician, set their payout, then create the work order."
      : depositOk
        ? "Deposit on file — assign a technician, set their payout, then create the work order."
        : "Needs a deposit before the work order can go out — or mark it an internal job below.";

  return (
    <div className="woc-card">
      <style>{WOC_CSS}</style>
      {!embedded && (
        <button type="button" className="woc-head" onClick={() => setOpen((o) => !o)}>
          <span className={`woc-ic${created ? " done" : ""}`}>
            {created
              ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg>}
          </span>
          <span className="woc-title">Create Work Order</span>
          <span className={`woc-status ${created ? "done" : "pending"}`}>{statusTxt}</span>
          <span className="woc-chev">{open ? "▲" : "▼"}</span>
        </button>
      )}

      {open && (
        <div className="woc-body">
          {err && <div className="woc-err">{err}</div>}

          {/* ① Assign the technician(s) who will run this job */}
          <div className="woc-sec">
            <div className="woc-sec-h">Assigned Technician{techs.length !== 1 ? "s" : ""}</div>
            {techs.length > 0 ? (
              <div className="woc-techs">
                {techs.map((a) => (
                  <span key={a.id} className="woc-tech">
                    <span className="woc-tech-av">{(a.user_name || a.user_email || "?")[0].toUpperCase()}</span>
                    {a.user_name || a.user_email}
                    {!created && <button type="button" className="woc-tech-x" title="Unassign" disabled={busy} onClick={() => unassign(a)}>✕</button>}
                  </span>
                ))}
              </div>
            ) : <div className="woc-none">No technician assigned yet.</div>}
            {!created && (
              <div className="woc-assign">
                <select className="woc-select" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Select a technician…</option>
                  {availableTechs.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </select>
                <button type="button" className="woc-add" disabled={busy || !pick} onClick={assignTech}>+ Assign</button>
              </div>
            )}
          </div>

          {/* ② Their per-line payout — the pricing editor, moved here from Install */}
          {proposal?.payload?.options?.length > 0 && (
            <div className="woc-sec">
              <TechPricingEditor accessId={accessId} proposal={proposal} onSaved={onProposalChange} />
            </div>
          )}

          {/* ③ Finalize the payout so a technician can accept the work order */}
          {proposal?.payload?.options?.length > 0 && (
            <div className="woc-sec">
              {finalizedAt ? (
                <div className="woc-final done">
                  <span className="woc-final-msg">
                    <b>✓ Finalized{finalizedBy ? ` by ${finalizedBy}` : ""}</b> — technicians can now accept this work order.
                  </span>
                  {!created && <button type="button" className="woc-reopen" disabled={finBusy} onClick={() => toggleFinalize(false)}>Re-open</button>}
                </div>
              ) : (
                <div className="woc-final">
                  <p className="woc-final-msg">Payout auto-filled from your standard rates. Review it above, then finalize so a technician can accept.</p>
                  <button type="button" className="woc-final-btn" disabled={finBusy} onClick={() => toggleFinalize(true)}>{finBusy ? "Finalizing…" : "Finalize Work Order"}</button>
                </div>
              )}
            </div>
          )}

          {/* ④ Create it */}
          <div className="woc-sec">
            {!created && (
              <label className="woc-intern">
                <input type="checkbox" checked={intern} disabled={busy} onChange={(e) => toggleInternal(e.target.checked)} />
                <span>
                  <b>Internal job</b> — no customer sale. Skip the signature + deposit gate.
                </span>
              </label>
            )}
            <div className="woc-create">
              <p className="woc-gate">{gateNote}</p>
              {!created && (
                <button className="woc-create-btn" disabled={busy || !gateOk} onClick={createWO}>Create Work Order →</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const WOC_CSS = `
/* Deck-themed — neutral surfaces, thin lines, ink primary button, no gold rail / Bricolage.
   Tokens fall back to hex so the card also works on the legacy page. */
.woc-card{background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;overflow:hidden;margin:12px 0;font-family:inherit}
.woc-head{width:100%;display:flex;align-items:center;gap:10px;padding:13px 16px;background:var(--dv-raise,#FBFBFA);border:none;cursor:pointer;font-family:inherit;text-align:left;transition:background .12s}
.woc-head:hover{background:rgba(16,20,24,.028)}
.woc-ic{width:30px;height:30px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--dv-meta,#787D84);background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF)}
.woc-ic.done{color:var(--dv-green,#2E7D5B);background:#e9f3ed;border-color:#cfe6d8}
.woc-title{font-family:inherit;font-weight:600;font-size:.97rem;color:var(--dv-ink,#101418)}
.woc-status{margin-left:auto;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;padding:4px 11px;border-radius:100px;white-space:nowrap}
.woc-status.done{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.woc-status.pending{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.woc-chev{font-size:.7rem;color:var(--dv-faint,#A1A6AC);margin-left:4px}
.woc-body{padding:6px 16px 16px;display:flex;flex-direction:column;gap:14px}
.woc-err{padding:8px 11px;border-radius:8px;background:#fbe9e6;border:1px solid #e3b4ab;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600}
.woc-sec-h{font-size:.72rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-bottom:8px}
.woc-techs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:9px}
.woc-tech{display:inline-flex;align-items:center;gap:7px;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);color:var(--dv-ink,#101418);border-radius:100px;padding:5px 10px 5px 6px;font-size:.8rem;font-weight:600}
.woc-tech-av{width:22px;height:22px;border-radius:50%;background:var(--dv-ink,#101418);color:#fff;display:grid;place-items:center;font-size:.7rem;font-weight:600}
.woc-tech-x{border:none;background:none;color:var(--dv-meta,#787D84);cursor:pointer;font-size:.72rem;padding:0 2px}
.woc-tech-x:hover{color:var(--dv-red,#C4553D)}
.woc-none{font-size:.82rem;color:var(--dv-meta,#787D84);margin-bottom:9px}
.woc-assign{display:flex;gap:8px;flex-wrap:wrap}
.woc-select{flex:1;min-width:180px;height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-ink,#101418);padding:0 11px;font-size:.82rem;font-family:inherit;outline:none}
.woc-select:focus{border-color:var(--dv-gold,#C9A96E)}
.woc-add{height:38px;padding:0 16px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.woc-add:hover{filter:brightness(1.12)}
.woc-add:disabled{opacity:.5;cursor:default}
.woc-create{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:13px 15px;background:var(--dv-paper,#F4F4F2)}
.woc-gate{margin:0;font-size:.8rem;color:var(--dv-meta,#787D84);flex:1;min-width:200px}
.woc-create-btn{height:40px;padding:0 20px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.woc-create-btn:hover{filter:brightness(1.12)}
.woc-create-btn:disabled{opacity:.45;cursor:default}
.woc-intern{display:flex;align-items:flex-start;gap:9px;margin-bottom:10px;padding:10px 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;cursor:pointer;font-size:.8rem;color:var(--dv-meta,#787D84)}
.woc-intern input{margin-top:2px;width:15px;height:15px;accent-color:var(--dv-ink,#101418);cursor:pointer;flex-shrink:0}
.woc-intern b{color:var(--dv-ink,#101418);font-weight:600}
.woc-final{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:13px 15px;background:var(--dv-paper,#F4F4F2)}
.woc-final.done{border-color:#cfe6d8;background:#eef7f1}
.woc-final-msg{margin:0;font-size:.8rem;color:var(--dv-meta,#787D84);flex:1;min-width:200px}
.woc-final.done .woc-final-msg{color:var(--dv-ink-soft,#3A4048)}
.woc-final-msg b{color:var(--dv-green,#2E7D5B);font-weight:700}
.woc-final-btn{height:40px;padding:0 20px;border:none;border-radius:9px;background:var(--dv-green,#2E7D5B);color:#fff;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.woc-final-btn:hover{filter:brightness(1.08)}
.woc-final-btn:disabled{opacity:.5;cursor:default}
.woc-reopen{height:34px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.woc-reopen:hover{border-color:var(--dv-red,#C4553D);color:var(--dv-red,#C4553D)}
.woc-reopen:disabled{opacity:.5;cursor:default}
`;
