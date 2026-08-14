"use client";
import { useState, useEffect, useRef } from "react";
import { titleCase } from "../../../lib/proposal";
import { getToolDataAction, saveToolDataAction } from "./proposal-actions";

// Equipment receiving checklist — imports every physical item from the accepted proposal (cameras,
// recorders/hard drives, displays, HDMI, speakers, amps, POS gear, custom lines) with quantities,
// and tracks how many of each have actually arrived ("8 of 12 received"). Internal (staff + tech).
const LABOR_RX = /(cat6 drop|termination|mounting|programming|waterproof|cabling|tuning|wire run|setup|\blabor\b|install|labor)/i;

function deriveEquipment(proposal) {
  const opt = proposal?.payload?.options?.find((o) => o.id === proposal.selected_option) || proposal?.payload?.options?.[0];
  const order = []; const map = new Map();
  const add = (key, name, qty) => {
    if (!map.has(key)) { map.set(key, { key, name, qty: 0 }); order.push(key); }
    map.get(key).qty += qty;
  };
  (opt?.services || []).forEach((s) => {
    (s.items || []).forEach((it) => {
      const nm = String(it.name || "").trim(); if (!nm) return;
      const hasSub = (it.sub || []).length > 0;
      // Cameras (and POS devices) are grouped into a single count line each.
      if (s.key === "camera" && hasSub) { add("cameras", "Cameras", 1); return; }
      if (LABOR_RX.test(nm)) return;                 // skip pure labor lines
      add(nm.toLowerCase(), titleCase(nm), +it.qty || 1);
    });
  });
  let out = order.map((k) => map.get(k));
  // Only ONE recorder — if stale data has both an 8- and 16-channel, keep the highest.
  const isNvr = (n) => /\bnvr\b|recorder/i.test(n);
  const chanOf = (n) => { const m = String(n).match(/(\d+)\s*-?\s*channel/i); return m ? +m[1] : 0; };
  const nvrs = out.filter((e) => isNvr(e.name));
  if (nvrs.length > 1) { const best = nvrs.reduce((a, b) => (chanOf(b.name) > chanOf(a.name) ? b : a)); out = out.filter((e) => !isNvr(e.name) || e === best); }
  return out;
}

export default function ReceivingChecklist({ accessId, proposal, role, preview }) {
  const isCustomer = role === "customer";
  const canEdit = !preview && !isCustomer; // staff + tech mark receiving; customer never sees this
  const equipment = deriveEquipment(proposal);
  const [counts, setCounts] = useState({}); // { key: receivedCount }
  const [confirmReset, setConfirmReset] = useState(false);
  const saveTimer = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    let live = true;
    getToolDataAction(accessId, "receiving").then((r) => {
      if (!live || !r?.ok || !r.saved?.data) return;
      try { setCounts(JSON.parse(r.saved.data).counts || {}); } catch { /* bad blob */ }
    }).catch(() => {});
    return () => { live = false; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [accessId]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!canEdit) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToolDataAction(accessId, "receiving", JSON.stringify({ counts })), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts]);

  if (!equipment.length) return null; // customer sees it too (read-only) once there's equipment

  const got = (e) => Math.min(counts[e.key] || 0, e.qty);
  const set = (e, n) => { if (!canEdit) return; setCounts((c) => ({ ...c, [e.key]: Math.max(0, Math.min(e.qty, n)) })); };
  const totalUnits = equipment.reduce((a, e) => a + e.qty, 0);
  const gotUnits = equipment.reduce((a, e) => a + got(e), 0);
  const fullItems = equipment.filter((e) => got(e) >= e.qty).length;
  const allIn = totalUnits > 0 && gotUnits === totalUnits;

  return (
    <div className={`rcv-root${allIn ? " done" : ""}`}>
      <style>{RCV_CSS}</style>
      <div className="rcv-hd">
        <div><span className="rcv-title">Equipment Received</span><span className="rcv-sub">{canEdit ? "Check off gear as it arrives from the proposal" : "Your equipment, tracked as it arrives"}</span></div>
        <span className={`rcv-badge${allIn ? " done" : ""}`}>{allIn ? "✓ All received" : `${gotUnits} / ${totalUnits} units`}</span>
      </div>
      <div className="rcv-list">
        {equipment.map((e) => {
          const g = got(e), done = g >= e.qty;
          return (
            <div key={e.key} className={`rcv-row${done ? " done" : ""}`}>
              <span className={`rcv-check${done ? " on" : ""}`}>{done ? "✓" : ""}</span>
              <span className="rcv-name">{e.name}</span>
              <span className="rcv-count">{g}<span className="rcv-of"> / {e.qty}</span></span>
              {canEdit ? (
                <span className="rcv-steppers">
                  <button type="button" className="rcv-step" disabled={g <= 0} onClick={() => set(e, g - 1)}>−</button>
                  <button type="button" className="rcv-step" disabled={g >= e.qty} onClick={() => set(e, g + 1)}>+</button>
                  {!done && <button type="button" className="rcv-all" onClick={() => set(e, e.qty)}>All</button>}
                </span>
              ) : (
                <span className="rcv-bar"><span className="rcv-bar-fill" style={{ width: `${e.qty ? (g / e.qty) * 100 : 0}%` }} /></span>
              )}
            </div>
          );
        })}
      </div>
      <div className="rcv-ft">
        <span>{fullItems} of {equipment.length} line items fully received</span>
        {canEdit && gotUnits > 0 && (confirmReset ? (
          <span className="rcv-reset-confirm">
            Reset all counts?
            <button type="button" className="rcv-reset-yes" onClick={() => { setCounts({}); setConfirmReset(false); }}>Reset</button>
            <button type="button" className="rcv-reset-no" onClick={() => setConfirmReset(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" className="rcv-reset" onClick={() => setConfirmReset(true)}>Reset</button>
        ))}
      </div>
    </div>
  );
}

const RCV_CSS = `
.rcv-root{margin:14px 0 0;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.rcv-root.done{border-color:rgba(46,125,91,.30)}
.rcv-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.rcv-title{display:block;font-size:.94rem;font-weight:600;color:var(--dv-ink,#101418)}
.rcv-sub{font-size:.76rem;color:var(--dv-meta,#787D84)}
.rcv-badge{background:rgba(201,169,110,.16);border:1px solid rgba(201,169,110,.42);color:var(--dv-gold-deep,#A8842F);font-weight:600;font-size:.76rem;border-radius:100px;padding:5px 12px;white-space:nowrap}
.rcv-badge.done{background:rgba(46,125,91,.08);border-color:rgba(46,125,91,.30);color:var(--dv-green,#2E7D5B)}
.rcv-list{display:flex;flex-direction:column;gap:7px}
.rcv-row{display:flex;align-items:center;gap:11px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:9px 12px}
.rcv-row.done{background:rgba(46,125,91,.06);border-color:rgba(46,125,91,.30)}
.rcv-check{width:22px;height:22px;flex-shrink:0;border-radius:6px;border:1.5px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:600;color:var(--dv-green,#2E7D5B)}
.rcv-check.on{background:var(--dv-green,#2E7D5B);border-color:var(--dv-green,#2E7D5B);color:#fff}
.rcv-name{flex:1;min-width:0;font-size:.86rem;font-weight:500;color:var(--dv-ink,#101418);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rcv-count{font-size:.9rem;font-weight:600;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums;flex-shrink:0}
.rcv-of{color:var(--dv-faint,#A1A6AC);font-weight:500}
.rcv-steppers{display:flex;align-items:center;gap:5px;flex-shrink:0}
.rcv-step{width:30px;height:30px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);border-radius:8px;font-size:1rem;font-weight:600;color:var(--dv-ink-soft,#3A4048);cursor:pointer;line-height:1}
.rcv-step:hover:not(:disabled){border-color:var(--dv-faint,#A1A6AC);background:var(--dv-paper,#F4F4F2)}
.rcv-step:disabled{opacity:.4;cursor:default}
.rcv-all{height:30px;padding:0 11px;border:1px solid rgba(46,125,91,.30);background:rgba(46,125,91,.08);color:var(--dv-green,#2E7D5B);border-radius:8px;font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.rcv-all:hover{background:rgba(46,125,91,.14)}
.rcv-bar{width:90px;height:7px;border-radius:100px;background:var(--dv-line-soft,#EDEDE9);overflow:hidden;flex-shrink:0}
.rcv-bar-fill{height:100%;background:var(--dv-green,#2E7D5B)}
.rcv-ft{font-size:.76rem;color:var(--dv-meta,#787D84);font-weight:500;display:flex;align-items:center;justify-content:space-between;gap:10px}
.rcv-reset{height:26px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);background:transparent;border-radius:7px;color:var(--dv-red,#C4553D);font-size:.72rem;font-weight:500;cursor:pointer;font-family:inherit}
.rcv-reset-confirm{display:inline-flex;gap:6px;align-items:center;color:var(--dv-gold-deep,#A8842F)}
.rcv-reset-yes{height:24px;padding:0 9px;border:none;border-radius:6px;background:var(--dv-red,#C4553D);color:#fff;font-size:.68rem;font-weight:600;cursor:pointer;font-family:inherit}
.rcv-reset-no{height:24px;padding:0 9px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;background:transparent;color:var(--dv-meta,#787D84);font-size:.68rem;font-weight:500;cursor:pointer;font-family:inherit}
`;
