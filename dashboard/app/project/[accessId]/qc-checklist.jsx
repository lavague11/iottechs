"use client";
import { useState, useEffect, useRef } from "react";
import { titleCase } from "../../../lib/proposal";
import { getToolDataAction, saveToolDataAction } from "./proposal-actions";
import { setStage } from "./actions";

// Quality-control checklist for the QC stage. The office (or the installing tech) verifies each
// installed device works before the job closes. Items come from the accepted proposal — same list
// the install checklist worked from. When every item passes, admin/manager can advance to Completion.
// Stored in the "qc" tool record. The customer sees a read-only pass summary; no pricing anywhere.

// Standard checks per device type. An item passes QC only when ALL of its checks are ticked.
const CHECKS = {
  camera: ["Online", "Angle OK", "Recording", "Night Vision"],
  nvr:    ["Powered On", "Recording", "Remote Access"],
  pos:    ["Online", "Recording"],
  equip:  ["Working"],
};
const checksFor = (type) => CHECKS[type] || CHECKS.equip;

const LABOR_RX = /drop|cable|run|termination|mount|management|program|setup|labor|install|per diem|test|tone|waterproof/i;

export default function QCChecklist({ accessId, proposal, customerName, role, readOnly, userName, onStageChange }) {
  const isCustomer = role === "customer";
  const canEdit = !readOnly && ["admin", "manager", "tech"].includes(role);
  const canAdvance = !readOnly && ["admin", "manager"].includes(role);

  // Derive the installed items from the accepted option (cameras, recorder, other equipment).
  const items = (() => {
    const out = [];
    const opt = proposal?.payload?.options?.find((o) => o.id === proposal.selected_option) || proposal?.payload?.options?.[0];
    (opt?.services || []).forEach((s) => {
      (s.items || []).forEach((it) => {
        const hasSub = (it.sub || []).length > 0;
        if (s.key === "camera" && hasSub) { out.push({ id: it.id, name: it.name, type: "camera" }); return; }
        if ((s.key === "toast" || s.key === "pos") && hasSub) { out.push({ id: it.id, name: it.name, type: "pos" }); return; }
        if (/\bnvr\b|recorder/i.test(it.name)) { out.push({ id: it.id, name: it.name, type: "nvr" }); return; }
        if (!hasSub && !LABOR_RX.test(it.name)) { out.push({ id: it.id, name: it.name, type: "equip" }); }
      });
    });
    // One recorder only — collapse a stale double-NVR to the highest channel count.
    const nvrs = out.filter((e) => e.type === "nvr");
    if (nvrs.length > 1) {
      const chanOf = (n) => { const m = String(n).match(/(\d+)\s*-?\s*channel/i); return m ? +m[1] : 0; };
      const best = nvrs.reduce((a, b) => (chanOf(b.name) > chanOf(a.name) ? b : a));
      return out.filter((e) => e.type !== "nvr" || e === best);
    }
    return out;
  })();

  const [checks, setChecks] = useState({}); // { itemId: { checkName: true } }
  const [issues, setIssues] = useState({}); // { itemId: "issue note" }
  const [issueOpen, setIssueOpen] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [err, setErr] = useState(null);
  const saveTimer = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    let live = true;
    getToolDataAction(accessId, "qc").then((r) => {
      if (!live || !r?.ok || !r.saved?.data) return;
      try { const d = JSON.parse(r.saved.data); setChecks(d.checks || {}); setIssues(d.issues || {}); } catch { /* bad blob */ }
    }).catch(() => {});
    return () => { live = false; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [accessId]);

  // Debounced persist (skip the initial hydrate; customers never write).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!canEdit) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToolDataAction(accessId, "qc", JSON.stringify({ checks, issues })), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, issues]);

  const itemPass = (it) => checksFor(it.type).every((c) => checks[it.id]?.[c]);
  const passedCount = items.filter(itemPass).length;
  const pct = items.length ? Math.round((passedCount / items.length) * 100) : 0;
  const allPass = items.length > 0 && passedCount === items.length;

  const toggle = (id, c) => { if (!canEdit) return; setChecks((s) => ({ ...s, [id]: { ...(s[id] || {}), [c]: !s[id]?.[c] } })); };
  const passItem = (it) => { if (!canEdit) return; setChecks((s) => ({ ...s, [it.id]: Object.fromEntries(checksFor(it.type).map((c) => [c, true])) })); };
  const passAll = () => { if (!canEdit) return; const next = {}; items.forEach((it) => { next[it.id] = Object.fromEntries(checksFor(it.type).map((c) => [c, true])); }); setChecks(next); };
  const setIssue = (id, v) => setIssues((s) => ({ ...s, [id]: v }));

  async function advance() {
    setAdvancing(true); setErr(null);
    const r = await setStage(accessId, role, "completion");
    setAdvancing(false);
    if (r?.error) { setErr(r.error); return; }
    onStageChange?.("completion");
  }

  if (!items.length) {
    return <div className="qc-root"><style>{QC_CSS}</style><div className="qc-empty">Nothing to QC yet — the installed equipment appears here once a proposal is accepted.</div></div>;
  }

  return (
    <div className="qc-root">
      <style>{QC_CSS}</style>
      <div className="qc-head">
        <div><span className="qc-title">Quality Control</span><span className="qc-sub">{canEdit ? "Verify each device before closing the job" : "Final quality check on your system"}</span></div>
        <span className={`qc-badge${allPass ? " done" : ""}`}>{allPass ? "All passed" : `${passedCount} / ${items.length} passed`}</span>
      </div>

      <div className="qc-bar"><span className="qc-bar-fill" style={{ width: `${pct}%` }} /></div>

      {canEdit && !allPass && (
        <div className="qc-tools"><button type="button" className="qc-passall" onClick={passAll}>Pass all</button></div>
      )}

      <div className="qc-list">
        {items.map((it) => {
          const pass = itemPass(it);
          const issue = issues[it.id];
          const open = issueOpen === it.id;
          return (
            <div key={it.id} className={`qc-item${pass ? " pass" : ""}`}>
              <div className="qc-item-top">
                <span className={`qc-check-dot${pass ? " on" : ""}`}>{pass ? "✓" : ""}</span>
                <span className="qc-item-name">{titleCase(it.name)}</span>
                {canEdit && !pass && <button type="button" className="qc-item-pass" onClick={() => passItem(it)}>Pass</button>}
                {issue && <span className="qc-flag" title={issue}>Issue</span>}
              </div>
              <div className="qc-checks">
                {checksFor(it.type).map((c) => {
                  const on = !!checks[it.id]?.[c];
                  return (
                    <button key={c} type="button" className={`qc-chk${on ? " on" : ""}`} disabled={!canEdit} onClick={() => toggle(it.id, c)}>
                      <span className="qc-chk-box">{on ? "✓" : ""}</span>{c}
                    </button>
                  );
                })}
              </div>
              {!isCustomer && (open || issue) && (
                <div className="qc-issue">
                  {canEdit ? (
                    <input className="qc-issue-in" placeholder="Note an issue (blocks close until resolved)…" value={issue || ""} onChange={(e) => setIssue(it.id, e.target.value)} />
                  ) : <span className="qc-issue-ro">{issue}</span>}
                </div>
              )}
              {canEdit && !open && !issue && (
                <button type="button" className="qc-add-issue" onClick={() => setIssueOpen(it.id)}>+ Note issue</button>
              )}
            </div>
          );
        })}
      </div>

      {err && <div className="qc-err">{err}</div>}

      {allPass ? (
        canAdvance ? (
          <button type="button" className="qc-advance" disabled={advancing} onClick={advance}>
            {advancing ? "Closing…" : "QC Passed — Close Job"}
          </button>
        ) : (
          <div className="qc-done-note">All devices passed QC{isCustomer ? " — your installer is wrapping up." : " — an admin or manager can close the job."}</div>
        )
      ) : (
        !isCustomer && <div className="qc-pending-note">{items.length - passedCount} device{items.length - passedCount === 1 ? "" : "s"} still need a pass before the job can close.</div>
      )}
    </div>
  );
}

const QC_CSS = `
.qc-root{margin:16px 0 4px;background:#fff;border:1px solid #d9d4ca;border-top:4px solid #2f7d5a;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.qc-empty{color:#6f7686;font-size:.9rem;padding:8px 2px}
.qc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.qc-title{display:block;font-size:.94rem;font-weight:800;color:#0B0F1A}
.qc-sub{font-size:.76rem;color:#6f7686}
.qc-badge{background:#eef3fa;border:1px solid #ccd6e6;color:#3a4a72;font-weight:800;font-size:.76rem;border-radius:100px;padding:5px 12px;white-space:nowrap}
.qc-badge.done{background:#f2f9f4;border-color:#bfe0c9;color:#1d7a3a}
.qc-bar{height:7px;background:#eee9df;border-radius:100px;overflow:hidden}
.qc-bar-fill{display:block;height:100%;background:linear-gradient(90deg,#2f7d5a,#4bbd86);border-radius:100px;transition:width .3s}
.qc-tools{display:flex;justify-content:flex-end}
.qc-passall{height:28px;padding:0 12px;border:1px solid #bfe0c9;background:#f2f9f4;color:#1d7a3a;border-radius:8px;font-size:.74rem;font-weight:800;cursor:pointer;font-family:inherit}
.qc-list{display:flex;flex-direction:column;gap:8px}
.qc-item{background:#fbfaf8;border:1px solid #e2ddd2;border-left:3px solid #c9c2b4;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.qc-item.pass{background:#f2f9f4;border-color:#bfe0c9;border-left-color:#2f7d5a}
.qc-item-top{display:flex;align-items:center;gap:10px}
.qc-check-dot{width:22px;height:22px;flex-shrink:0;border-radius:6px;border:1.5px solid #c9d2e0;background:#fff;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:800;color:#2f7d5a}
.qc-check-dot.on{background:#2f7d5a;border-color:#2f7d5a;color:#fff}
.qc-item-name{flex:1;min-width:0;font-size:.88rem;font-weight:700;color:#0B0F1A}
.qc-item-pass{height:26px;padding:0 11px;border:1px solid #bfe0c9;background:#fff;color:#1d7a3a;border-radius:7px;font-size:.72rem;font-weight:800;cursor:pointer;font-family:inherit}
.qc-flag{background:#fdeceb;border:1px solid #e0b0a8;color:#a8442f;font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;border-radius:100px;padding:2px 8px}
.qc-checks{display:flex;flex-wrap:wrap;gap:6px}
.qc-chk{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border:1px solid #d9d4ca;background:#fff;border-radius:8px;font-size:.76rem;font-weight:600;color:#41485a;cursor:pointer;font-family:inherit}
.qc-chk:disabled{cursor:default;opacity:.85}
.qc-chk.on{background:#eaf6ef;border-color:#2f7d5a;color:#1d7a3a}
.qc-chk-box{width:16px;height:16px;border-radius:4px;border:1.5px solid #c9d2e0;display:inline-flex;align-items:center;justify-content:center;font-size:.66rem;font-weight:800;background:#fff;color:#2f7d5a}
.qc-chk.on .qc-chk-box{background:#2f7d5a;border-color:#2f7d5a;color:#fff}
.qc-add-issue{align-self:flex-start;background:none;border:none;color:#8a8378;font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit;padding:0}
.qc-add-issue:hover{color:#a8442f}
.qc-issue-in{width:100%;height:34px;border:1px solid #e0b0a8;border-radius:8px;padding:0 10px;font-size:.82rem;font-family:inherit;background:#fffdfc}
.qc-issue-ro{font-size:.82rem;color:#a8442f;font-style:italic}
.qc-err{font-size:.82rem;color:#a8442f;background:#fdeceb;border:1px solid #e0b0a8;border-radius:8px;padding:8px 10px}
.qc-advance{height:44px;border:none;border-radius:10px;background:#2f7d5a;color:#fff;font-size:.9rem;font-weight:800;cursor:pointer;font-family:inherit}
.qc-advance:hover:not(:disabled){filter:brightness(1.08)}
.qc-advance:disabled{opacity:.6;cursor:default}
.qc-done-note{text-align:center;font-size:.84rem;font-weight:700;color:#1d7a3a;padding:6px}
.qc-pending-note{text-align:center;font-size:.8rem;color:#8a8378;padding:2px}
`;
