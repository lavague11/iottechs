"use client";

// THE WORK ORDER (docs/WORK_ORDERS.md) — one surface, built from the SAME ProposalItemsEditor the
// proposal builder uses, in payout mode. It replaces three overlapping surfaces: work-order-sheet.jsx
// and proposal-tech-pricing.jsx (two editors for the same payout field) and the "Create Work Order"
// card. The document is a COPY of the published proposal: every save here writes `wo`, never `proposals`.
//
// What a work order never shows: a customer price, a discount, tax, or a payment plan. Those aren't
// hidden — payout mode computes no retail figure at all, and the snapshot dropped them.
import { useState, useEffect, useRef, useCallback } from "react";
import ProposalItemsEditor from "./proposal-items-editor";
import MicButton from "../../components/mic-button";
import { can } from "../../../lib/roles";
import {
  getWorkOrderAction, createWorkOrderDocAction, saveWorkOrderDraftAction,
  setWorkOrderNotesAction, setWorkOrderPayoutVisibilityAction, reseedWorkOrderPayoutsAction,
} from "./work-order-actions";
import { addAssignmentAction, removeAssignmentAction } from "./actions";
import { WOE_CSS } from "./work-order-editor-css";
// The items editor's own stylesheet lives with the proposal panel. One renderer, one stylesheet — the
// work order must not carry a second copy of the `prop-*` rules that would then drift from the proposal.
import { PROP_CSS } from "./proposal-panel";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const woNumber = (doc) => "WO-" + String(doc?.id || 0).padStart(4, "0") + (doc?.version ? `-v${doc.version}` : "");

const Ico = ({ d, s = 16 }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const RESET_D = "M3 12a9 9 0 1 0 3-6.7M3 4v5h5";

export default function WorkOrderEditor({ accessId, role, assignments = [], staffUsers = [], onAssignmentsChange, preview = false }) {
  const [doc, setDoc] = useState(undefined);        // undefined = loading, null = not created yet
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState("");   // "" | "saving" | "saved" | an error message
  const [notes, setNotes] = useState("");
  const [pick, setPick] = useState("");
  const [askReset, setAskReset] = useState(false);
  const saveTimer = useRef(null);
  const notesTimer = useRef(null);

  const canEdit = can(role, "wo.edit") && !preview;
  const canPay = can(role, "wo.payout.edit") && !preview;
  const canAssign = can(role, "assignment.edit") && !preview;
  const showMoney = doc ? (can(role, "wo.payout.view") && (doc.showPayouts || can(role, "wo.edit"))) : false;

  useEffect(() => {
    let live = true;
    getWorkOrderAction(accessId).then((r) => {
      if (!live) return;
      if (r?.error) { setErr(r.error); setDoc(null); return; }
      setDoc(r.doc || null); setNotes(r.doc?.notes || "");
    }).catch(() => { if (live) setDoc(null); });
    return () => { live = false; };
  }, [accessId]);

  // Autosave (DoD #1 — no Save button). The whole working payload goes up; the server validates it and
  // syncs the per-line field rows. Flushed on unmount so leaving the page can't drop the last keystroke.
  const flush = useRef(null);
  const saveNow = useCallback(async (payload) => {
    setSaveState("saving");
    const r = await saveWorkOrderDraftAction(accessId, payload);
    if (r?.error) { setSaveState(r.error); return; }
    setDoc(r.doc); setSaveState("saved");
  }, [accessId]);
  flush.current = saveNow;
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); if (notesTimer.current) clearTimeout(notesTimer.current); }, []);

  function patchPayload(next) {
    setDoc((d) => ({ ...d, payload: next }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flush.current?.(next), 600);
  }
  const opt = doc?.payload?.options?.[0] || null;
  const patchServices = (services) => patchPayload({ options: [{ ...opt, services }] });

  function onNotes(v) {
    setNotes(v);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => setWorkOrderNotesAction(accessId, v), 700);
  }

  async function create() {
    setBusy(true); setErr(null);
    const r = await createWorkOrderDocAction(accessId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setDoc(r.doc); setNotes(r.doc?.notes || "");
  }
  async function togglePayouts(on) {
    setDoc((d) => ({ ...d, showPayouts: on }));   // optimistic
    const r = await setWorkOrderPayoutVisibilityAction(accessId, on);
    if (r?.error) { setErr(r.error); setDoc((d) => ({ ...d, showPayouts: !on })); return; }
    setDoc(r.doc);
  }
  async function resetToStandard() {
    setAskReset(false); setBusy(true);
    const r = await reseedWorkOrderPayoutsAction(accessId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setDoc(r.doc); setSaveState("saved");
  }

  const techs = assignments.filter((a) => a.role === "tech");
  const availableTechs = staffUsers.filter((u) => u.role === "tech" && !techs.some((t) => String(t.user_id) === String(u.id)));
  async function assign() {
    const u = staffUsers.find((x) => String(x.id) === String(pick));
    if (!u || busy) return;
    setBusy(true); setErr(null);
    let r = await addAssignmentAction(accessId, { userId: u.id, userName: u.name, userEmail: u.email, role: "tech" });
    // Certification gate: the server reports what this job needs and the tech lacks; the office may override.
    if (r?.gate) {
      const ok = typeof window !== "undefined" && window.confirm(`${r.techName} isn't certified for ${r.missing.join(", ")}. Assign anyway?`);
      if (!ok) { setBusy(false); setPick(""); return; }
      r = await addAssignmentAction(accessId, { userId: u.id, userName: u.name, userEmail: u.email, role: "tech", override: true });
    }
    setBusy(false); setPick("");
    if (r?.error) { setErr(r.error); return; }
    onAssignmentsChange?.((prev) => [...prev, { id: r.id, user_id: u.id, user_name: u.name, user_email: u.email, role: "tech" }]);
  }
  async function unassign(a) {
    if (busy) return;
    setBusy(true);
    const r = await removeAssignmentAction(accessId, a.id);
    setBusy(false);
    if (r?.ok) onAssignmentsChange?.((prev) => prev.filter((x) => x.id !== a.id));
  }

  if (doc === undefined) return <div className="woe"><style>{WOE_CSS}</style><div className="woe-empty">Loading…</div></div>;
  const css = <style>{PROP_CSS + WOE_CSS}</style>;

  // Not created yet. One button, and the reason it may not be available — the work order is copied from
  // the version the customer received, so there is nothing to copy before the proposal is sent.
  if (!doc) {
    return (
      <div className="woe">
        {css}
        <div className="woe-start">
          <p>No work order yet.</p>
          {err && <div className="woe-err">{err}</div>}
          {canEdit && <button type="button" className="woe-cta" disabled={busy} onClick={create}>Create</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="woe">
      {css}

      <div className="woe-head">
        <div className="woe-hl">
          <b className="woe-t">Work Order</b>
          <span className="woe-num">{woNumber(doc)}</span>
          {doc.status !== "draft" && <span className={`woe-badge ${doc.status}`}>{doc.status === "signed" ? "Signed" : doc.status === "closed" ? "Closed" : "Sent"}</span>}
        </div>
        <div className="woe-hr">
          <span className={`woe-save ${saveState === "saved" ? "ok" : saveState === "saving" ? "sv" : saveState ? "er" : ""}`}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState}
          </span>
          {showMoney && <span className="woe-total">{money(doc.total)}</span>}
        </div>
      </div>

      {err && <div className="woe-err">{err}</div>}

      {/* Technicians — assignment lives at the top of the work order (it replaced the separate card). */}
      <div className="woe-row">
        <span className="woe-lbl">Technicians</span>
        <div className="woe-chips">
          {techs.map((a) => (
            <span key={a.id} className="woe-chip">
              <span className="woe-av">{(a.user_name || a.user_email || "?")[0].toUpperCase()}</span>
              {a.user_name || a.user_email}
              {canAssign && <button type="button" className="woe-chip-x" aria-label="Unassign" title="Unassign" disabled={busy} onClick={() => unassign(a)}>×</button>}
            </span>
          ))}
          {!techs.length && <span className="woe-none">None</span>}
        </div>
        {canAssign && availableTechs.length > 0 && (
          <span className="woe-assign">
            <select className="woe-sel" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Technician">
              <option value="">Add a technician…</option>
              {availableTechs.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
            </select>
            <button type="button" className="woe-add" disabled={busy || !pick} onClick={assign}>Assign</button>
          </span>
        )}
      </div>

      {/* Requirement 7 — the technician's copy can hide payout entirely. Payroll keeps every figure. */}
      {canPay && (
        <div className="woe-row">
          <span className="woe-lbl">Payouts</span>
          <label className="woe-tog">
            <input type="checkbox" checked={!!doc.showPayouts} onChange={(e) => togglePayouts(e.target.checked)} />
            <span>Visible to the technician</span>
          </label>
          {askReset ? (
            <span className="woe-confirm">
              Reset every payout to standard?
              <button type="button" className="woe-keep" onClick={() => setAskReset(false)}>Keep</button>
              <button type="button" className="woe-danger" disabled={busy} onClick={resetToStandard}>Reset</button>
            </span>
          ) : (
            <button type="button" className="woe-ib" title="Reset to standard rates" aria-label="Reset to standard rates" onClick={() => setAskReset(true)}><Ico d={RESET_D} /></button>
          )}
        </div>
      )}

      {/* The scope — the same renderer and the same grouping as the proposal, valued at payout. CPE and
          waived lines are present with their badges: the customer isn't charged, the tech still installs. */}
      {(opt?.services || []).map((s, i) => (
        <ProposalItemsEditor
          key={s.key + i}
          svc={s}
          payout
          readOnly={!canEdit}
          hidePrices={!showMoney}
          onChange={(next) => patchServices(opt.services.map((x, j) => (j === i ? next : x)))}
          onRemove={() => patchServices(opt.services.filter((_, j) => j !== i))}
          payload={doc.payload}
          activeOptId={opt.id}
          optionCount={1}
        />
      ))}
      {!(opt?.services || []).length && <div className="woe-empty">No lines on this work order.</div>}

      <div className="woe-notes">
        <span className="woe-lbl">Notes</span>
        <div className="woe-notewrap">
          <textarea value={notes} disabled={!canEdit} placeholder="Anything the crew needs to know on site…"
                    onChange={(e) => onNotes(e.target.value)} />
          {canEdit && <MicButton value={notes} onChange={onNotes} title="Dictate" />}
        </div>
      </div>

      {showMoney && (
        <div className="woe-sum">
          <span>Payout total</span>
          <span>{money(doc.total)}</span>
        </div>
      )}
    </div>
  );
}
