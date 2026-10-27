"use client";
import { useState, useEffect } from "react";
import { loadPriceBook, savePriceBookCache } from "../../../lib/proposal";
import { loadConditions, CONDITION_TONES, LINE_CONDITION } from "../../../lib/proposal-terms";
import { getPriceBookAction, savePriceBookAction } from "./proposal-actions";

// Swatch colours for each tone token (the builder/customer renderers map the same token to their own space).
const TONE_HEX = { gold: "#C9A96E", orange: "#C56B2C", blue: "#5FB8DB", green: "#6FBF73", red: "#C4553D", grey: "#9AA1AC" };

// Configuration Center ▸ Conditions. Edits the DISPLAY of the built-in line-item conditions (the admin
// shorthand badge, the customer-facing label, the tooltip, and the colour) company-wide. The legal
// acknowledgment each condition carries is shown read-only — it's the exact sentence the customer initials
// at signing, so it stays canonical here. Saves to the server price book (`book.conditions`), like presets.
export default function ConditionEditor({ onSaved, embedded = false }) {
  const [book, setBook] = useState(() => loadPriceBook());
  const [conds, setConds] = useState(() => loadConditions(loadPriceBook()));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getPriceBookAction().then((r) => {
      if (live && r?.ok) { savePriceBookCache(r.book); setBook(r.book); setConds(loadConditions(r.book)); }
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const patch = (key, p) => setConds((list) => list.map((c) => (c.key === key ? { ...c, ...p } : c)));

  async function save() {
    setBusy(true); setErr(null);
    // Persist only fields that DIFFER from the canonical default (key + ack are never written). An
    // unchanged / reset condition stores nothing, so it always tracks the code default.
    const overrides = conds.map((c) => {
      const def = LINE_CONDITION[c.key]; if (!def) return null;
      const o = { key: c.key };
      if (c.badge !== def.badge) o.badge = c.badge;
      if (c.label !== def.label) o.label = c.label;
      if (c.note !== def.note) o.note = c.note;
      if (c.tone !== def.tone) o.tone = c.tone;
      return Object.keys(o).length > 1 ? o : null;
    }).filter(Boolean);
    const r = await savePriceBookAction({ ...book, conditions: overrides });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    savePriceBookCache(r.book);
    setBook(r.book);
    setConds(loadConditions(r.book));
    onSaved?.(r.book);
  }
  function resetAll() {
    const cleared = { ...book, conditions: [] };
    setBook(cleared);
    setConds(loadConditions(cleared));
  }

  return (
    <div className={`cnd-backdrop${embedded ? " cnd-embed" : ""}`}>
      <div className="cnd-modal">
        <div className="cnd-sub">Site/supply facts you can tag on a line (its badge, name and colour). The acknowledgment the customer initials at signing is fixed.</div>
        {err && <div className="cnd-err">{err}</div>}
        <div className="cnd-body">
          {conds.map((c) => (
            <div key={c.key} className="cnd-card">
              <div className="cnd-card-h">
                <span className="cnd-dot" style={{ background: TONE_HEX[c.tone] || TONE_HEX.grey }} />
                <span className="cnd-key">{c.key}</span>
              </div>
              <label className="cnd-field">
                <span className="cnd-lbl">Badge <em>(builder)</em></span>
                <input className="cnd-in" value={c.badge} maxLength={40} onChange={(e) => patch(c.key, { badge: e.target.value })} />
              </label>
              <label className="cnd-field">
                <span className="cnd-lbl">Customer label</span>
                <input className="cnd-in" value={c.label} maxLength={80} onChange={(e) => patch(c.key, { label: e.target.value })} />
              </label>
              <label className="cnd-field">
                <span className="cnd-lbl">Tooltip</span>
                <input className="cnd-in" value={c.note} maxLength={120} onChange={(e) => patch(c.key, { note: e.target.value })} />
              </label>
              <div className="cnd-field">
                <span className="cnd-lbl">Colour</span>
                <div className="cnd-tones">
                  {CONDITION_TONES.map((t) => (
                    <button key={t} type="button" className={`cnd-tone${c.tone === t ? " on" : ""}`} title={t}
                            style={{ background: TONE_HEX[t] }} aria-label={t} aria-pressed={c.tone === t}
                            onClick={() => patch(c.key, { tone: t })} />
                  ))}
                </div>
              </div>
              <div className="cnd-ack">
                <span className="cnd-lbl">Signed acknowledgment <em>(fixed)</em></span>
                <p className="cnd-ack-txt">{c.ack}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="cnd-acts">
          <button className="cnd-reset" onClick={resetAll}>Reset to defaults</button>
          <button className="cnd-save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
      <style>{CND_CSS}</style>
    </div>
  );
}

const CND_CSS = `
.pvx .cnd-backdrop.cnd-embed{display:block}
.pvx .cnd-modal{display:flex;flex-direction:column;background:none}
.pvx .cnd-sub{font-size:.78rem;color:var(--dv-meta,#787D84);padding:14px 22px 10px;line-height:1.45}
.pvx .cnd-err{margin:0 22px 12px;padding:8px 11px;border-radius:8px;background:rgba(196,85,61,.08);color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:500}
.pvx .cnd-body{padding:0 22px 16px;display:flex;flex-direction:column;gap:12px}
.pvx .cnd-card{border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(16,20,24,.04);padding:4px 0}
.pvx .cnd-card-h{display:flex;align-items:center;gap:8px;padding:10px 14px 6px}
.pvx .cnd-dot{width:11px;height:11px;border-radius:3px;flex-shrink:0}
.pvx .cnd-key{font-size:.66rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .cnd-field{display:flex;align-items:center;gap:10px;padding:6px 14px}
.pvx .cnd-lbl{flex:0 0 120px;font-size:.72rem;font-weight:600;color:var(--dv-meta,#787D84)}
.pvx .cnd-lbl em{font-style:normal;font-weight:500;opacity:.8}
.pvx .cnd-in{flex:1;height:32px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:var(--dv-raise,#FBFBFA);padding:0 10px;font-size:.82rem;font-weight:500;color:var(--dv-ink,#101418);font-family:inherit;outline:none;min-width:0}
.pvx .cnd-in:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .cnd-tones{display:flex;gap:6px}
.pvx .cnd-tone{width:24px;height:24px;border-radius:6px;border:2px solid transparent;cursor:pointer;padding:0}
.pvx .cnd-tone.on{border-color:var(--dv-ink,#101418);box-shadow:0 0 0 2px var(--dv-raise,#FBFBFA) inset}
.pvx .cnd-ack{padding:8px 14px 12px}
.pvx .cnd-ack-txt{margin:5px 0 0;font-size:.76rem;line-height:1.5;color:var(--dv-ink-soft,#3A4048);background:var(--dv-paper,#F4F4F2);border-radius:8px;padding:9px 11px}
.pvx .cnd-acts{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-top:1px solid var(--dv-line,#E4E4DF)}
.pvx .cnd-reset{background:none;border:none;color:var(--dv-meta,#787D84);font-size:.8rem;font-weight:500;cursor:pointer;font-family:inherit}
.pvx .cnd-reset:hover{color:var(--dv-ink,#101418)}
.pvx .cnd-save{height:38px;padding:0 22px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.86rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .cnd-save:hover{filter:brightness(1.12)}
.pvx .cnd-save:disabled{opacity:.6;cursor:default}
`;
