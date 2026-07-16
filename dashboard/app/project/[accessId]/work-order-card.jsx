"use client";
import { useState, useEffect } from "react";
import { getApprovalDataAction, createWorkOrderAction } from "./proposal-actions";
import { addAssignmentAction, removeAssignmentAction } from "./actions";
import TechPricingEditor from "./proposal-tech-pricing";

// Third card of the proposal-phase flow (admin/manager): everything to stand up the work order once
// the proposal is signed + the deposit is in. Groups, in order: assign the technician(s) → set their
// per-line payout (the pricing editor, moved here from Install) → create the work order. Self-contained
// (fetches its own approval data for the signed/deposit gate) so it drops in as its own collapsible.
export default function WorkOrderCard({ accessId, proposal, onProposalChange, assignments = [], staffUsers = [], onAssignmentsChange, onStageChange }) {
  const [open, setOpen] = useState(false);   // collapsed by default — part of the compact flow
  const [data, setData] = useState(null);
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

  const statusTxt = created ? (techSigned ? "Accepted" : "Created") : "Not created";
  const gateNote = created
    ? (techSigned ? `Work order accepted by ${p.tech_signed_name}.` : "Work order created — project is in scheduling.")
    : signed && depositOk
      ? "Signed and deposit on file — assign a technician, set their payout, then create the work order."
      : [!signed && "customer signature", !depositOk && "a deposit"].filter(Boolean).join(" and ").replace(/^./, (c) => "Needs " + c) + " before the work order can go out.";

  return (
    <div className="woc-card">
      <style>{WOC_CSS}</style>
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

          {/* ③ Create it */}
          <div className="woc-sec">
            <div className="woc-create">
              <p className="woc-gate">{gateNote}</p>
              {!created && (
                <button className="woc-create-btn" disabled={busy || !signed || !depositOk} onClick={createWO}>Create Work Order →</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const WOC_CSS = `
.woc-card{background:#fff;border:1px solid var(--line,var(--line));border-left:3px solid var(--gold,var(--gold));border-radius:14px;overflow:hidden;margin:12px 0;
  font-family:var(--font)}
.woc-head{width:100%;display:flex;align-items:center;gap:10px;padding:13px 16px;background:#fff;border:none;cursor:pointer;font-family:inherit;text-align:left;transition:background .12s}
.woc-head:hover{background:var(--bg-soft,var(--bg-soft))}
.woc-ic{width:30px;height:30px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--gold,var(--gold));
  background:color-mix(in srgb,var(--gold,var(--gold)) 14%,#fff);border:1px solid color-mix(in srgb,var(--gold,var(--gold)) 30%,transparent)}
.woc-ic.done{color:var(--green,var(--green));background:var(--green-soft,var(--green-soft));border-color:color-mix(in srgb,var(--green,var(--green)) 30%,transparent)}
.woc-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.97rem;color:var(--ink,var(--ink))}
.woc-status{margin-left:auto;font-size:.68rem;font-weight:800;letter-spacing:.02em;padding:4px 11px;border-radius:100px;white-space:nowrap;border:1px solid transparent}
.woc-status.done{background:var(--green-soft,var(--green-soft));color:var(--green,var(--green));border-color:#bfe0c9}
.woc-status.pending{background:color-mix(in srgb,var(--gold,var(--gold)) 14%,#fff);color:var(--gold-deep,var(--gold-deep));border-color:color-mix(in srgb,var(--gold,var(--gold)) 35%,transparent)}
.woc-chev{font-size:.7rem;color:var(--muted,var(--muted));margin-left:4px}
.woc-body{padding:6px 16px 16px;display:flex;flex-direction:column;gap:14px}
.woc-err{padding:8px 11px;border-radius:8px;background:var(--red-soft);color:var(--red);font-size:.78rem;font-weight:700}
.woc-sec-h{font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,var(--muted));margin-bottom:8px}
.woc-techs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:9px}
.woc-tech{display:inline-flex;align-items:center;gap:7px;background:var(--green-soft,var(--green-soft));border:1px solid #bfe0c9;color:var(--green);border-radius:100px;padding:5px 10px 5px 6px;font-size:.8rem;font-weight:700}
.woc-tech-av{width:22px;height:22px;border-radius:50%;background:var(--green,var(--green));color:#fff;display:grid;place-items:center;font-size:.7rem;font-weight:800}
.woc-tech-x{border:none;background:none;color:#4a6b56;cursor:pointer;font-size:.72rem;padding:0 2px}
.woc-tech-x:hover{color:var(--red)}
.woc-none{font-size:.82rem;color:var(--muted,var(--muted));margin-bottom:9px}
.woc-assign{display:flex;gap:8px;flex-wrap:wrap}
.woc-select{flex:1;min-width:180px;height:38px;border:1px solid var(--line,var(--line));border-radius:8px;background:#fff;color:var(--ink,var(--ink));padding:0 11px;font-size:.82rem;font-family:inherit;outline:none}
.woc-select:focus{border-color:var(--green,var(--green))}
.woc-add{height:38px;padding:0 16px;border:none;border-radius:9px;background:var(--green,var(--green));color:#fff;font-size:.8rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.woc-add:hover{filter:brightness(1.06)}
.woc-add:disabled{opacity:.5;cursor:default}
.woc-create{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;border:1px solid var(--line,var(--line));border-radius:10px;padding:13px 15px;background:var(--bg-soft,var(--bg-soft))}
.woc-gate{margin:0;font-size:.8rem;color:var(--muted,var(--muted));flex:1;min-width:200px}
.woc-create-btn{height:40px;padding:0 20px;border:none;border-radius:9px;background:var(--green,var(--green));color:#fff;font-size:.84rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.woc-create-btn:hover{filter:brightness(1.05)}
.woc-create-btn:disabled{opacity:.45;cursor:default}
`;
