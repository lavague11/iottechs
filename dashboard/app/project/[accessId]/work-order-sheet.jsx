"use client";
import { useState, useEffect, useMemo } from "react";
import { titleCase, serviceLabel, serviceColor, defaultTechPayout, fmtSignStamp } from "../../../lib/proposal";
import { saveTechPricingAction, finalizeWorkOrderAction, acceptWorkOrderAction, voidTechSignatureAction, getProposalAction, getRatesAction } from "./proposal-actions";
import ProposalSignModal from "./proposal-sign-modal";

// The Work Order — a mirror of the proposal page, re-priced at TECHNICIAN payout. It is the single
// work-order surface, built exactly like the proposal:
//   1. Admin/manager EDIT the per-line tech payout inline while creating it (auto-seeded from the
//      standard rates; override any line). Saved via saveTechPricingAction — no new customer version.
//   2. "Submit Work Order" finalizes it (finalizeWorkOrderAction), locking the prices for signature.
//   3. The TECHNICIAN signs it to accept (acceptWorkOrderAction) — signing IS the assignment, same as
//      the customer signing the proposal. Admin/manager can re-open (before signing) or void a signature.
// Purely a view over existing primitives — no payout math or signature binding is duplicated or changed.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WorkOrderSheet({ accessId, proposal, role, onProposalChange, preview = false, signerName = "", assignedTech = null }) {
  const [fetched, setFetched] = useState(null);
  const p = fetched || proposal;
  const opts = p?.payload?.options || [];
  const [optId, setOptId] = useState(p?.selected_option || opts[0]?.id);
  const opt = opts.find((o) => o.id === optId) || opts[0];

  const signed = !!p?.tech_signed_name;
  const finalized = !!p?.wo_finalized_at;
  const isOffice = ["admin", "manager"].includes(role);
  const isTech = role === "tech";
  const editable = isOffice && !signed && !finalized;        // "creating" — before it's submitted
  const canSign = isTech && !signed && finalized && !preview; // the tech signs once the office submits

  // Editable per-line tech payout (seeded from the proposal's techPrice; read-only views still read it here).
  const initial = useMemo(() => {
    const m = {};
    (opt?.services || []).forEach((s) => (s.items || []).forEach((it) => {
      m[it.id] = it.techPrice != null ? String(it.techPrice) : "";
      (it.sub || []).forEach((x) => { m[x.id] = x.techPrice != null ? String(x.techPrice) : ""; });
    }));
    return m;
  }, [opt]);
  const [tech, setTech] = useState(initial);
  useEffect(() => { setTech(initial); }, [initial]);

  const [rates, setRates] = useState(null);
  useEffect(() => {
    if (!editable) return;
    getRatesAction(accessId).then((r) => { if (r?.ok) setRates({ ...(r.defaults || {}), ...(r.book?.default || {}) }); }).catch(() => {});
  }, [accessId, editable]);

  // Pull current server state once so finalize/signature changes elsewhere show immediately.
  useEffect(() => {
    let live = true;
    if (accessId) getProposalAction(accessId).then((r) => { if (live && r?.proposal) setFetched(r.proposal); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [signOpen, setSignOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  if (!opts.length) return null;

  const num = (v) => +v || 0;
  const lineTotal = (id, qty) => num(qty) * num(tech[id]);
  const itemTotal = (it) => (it.sub?.length ? it.sub.reduce((s, x) => s + lineTotal(x.id, x.qty), 0) : lineTotal(it.id, it.qty));
  const blocks = (opt.services || []).map((s) => ({
    key: s.key, label: s.label || serviceLabel(s.key), color: serviceColor(s.key),
    items: (s.items || []).filter((it) => !it.waived),
  })).filter((b) => b.items.length);
  const blockTotal = (b) => b.items.reduce((s, it) => s + itemTotal(it), 0);
  const total = blocks.reduce((s, b) => s + blockTotal(b), 0);
  const pending = total === 0 && !editable;         // read-only with nothing set → TBD, not a wall of $0
  const rate = (n) => (pending ? "TBD" : money(n));
  const dirty = Object.keys({ ...initial, ...tech }).some((k) => (tech[k] || "") !== (initial[k] || ""));
  const stdRate = (name, svc) => (rates ? defaultTechPayout(name, svc, rates) : 0);
  const svcNames = blocks.map((b) => b.label).join(" · ");
  const woNum = "WO-" + String(p.id || "0").padStart(4, "0") + "-v" + (p.version || 1);

  const techMap = () => { const m = {}; Object.entries(tech).forEach(([id, v]) => { if (v !== "" && v != null) m[id] = +v || 0; }); return m; };

  async function save() {
    setBusy(true); setErr(null);
    const r = await saveTechPricingAction(accessId, techMap());
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setFetched(r.proposal); onProposalChange?.(r.proposal); setSavedAt(Date.now());
  }
  async function submit() {
    if (!window.confirm("Submit this work order? Pricing locks and the technician can sign to accept.")) return;
    setBusy(true); setErr(null);
    const sv = await saveTechPricingAction(accessId, techMap());        // persist the latest prices first
    if (sv?.error) { setBusy(false); setErr(sv.error); return; }
    const r = await finalizeWorkOrderAction(accessId, true);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setFetched(r.proposal); onProposalChange?.(r.proposal);
  }
  async function reopen() {
    setBusy(true); setErr(null);
    const r = await finalizeWorkOrderAction(accessId, false);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setFetched(r.proposal); onProposalChange?.(r.proposal);
  }
  async function doSign(s) {
    setBusy(true); setErr(null);
    const r = await acceptWorkOrderAction(accessId, s.name, s.data);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setFetched(r.proposal); onProposalChange?.(r.proposal); setSignOpen(false);
  }
  async function voidSig() {
    setBusy(true); setErr(null);
    const r = await voidTechSignatureAction(accessId);
    setBusy(false); setVoidOpen(false);
    if (r?.error) { setErr(r.error); return; }
    setFetched(r.proposal); onProposalChange?.(r.proposal);
  }

  const amtCell = (it) => {
    const grouped = it.sub?.length > 0;
    if (grouped) return <span className="wos-amt">{rate(itemTotal(it))}</span>;
    if (!editable) return <span className="wos-amt">{rate(itemTotal(it))}</span>;
    return (
      <span className="wos-edit">
        <span className="wos-inp"><span>$</span>
          <input type="number" min="0" step="0.01" value={tech[it.id] ?? ""} placeholder={rates ? String(stdRate(it.name, it.svc ?? it._svc)) : "0"}
                 onChange={(e) => setTech((m) => ({ ...m, [it.id]: e.target.value }))} /></span>
        {num(it.qty) > 1 && <span className="wos-eq">= {money(lineTotal(it.id, it.qty))}</span>}
      </span>
    );
  };
  const subAmtCell = (x, svcKey) => {
    if (!editable) return <span className="wos-amt">{rate(lineTotal(x.id, x.qty))}</span>;
    return (
      <span className="wos-edit">
        <span className="wos-inp"><span>$</span>
          <input type="number" min="0" step="0.01" value={tech[x.id] ?? ""} placeholder={rates ? String(stdRate(x.name, svcKey)) : "0"}
                 onChange={(e) => setTech((m) => ({ ...m, [x.id]: e.target.value }))} /></span>
        {num(x.qty) > 1 && <span className="wos-eq">= {money(lineTotal(x.id, x.qty))}</span>}
      </span>
    );
  };

  return (
    <div className="wos">
      <style>{WOS_CSS}</style>

      <div className="wos-top">
        <div className="wos-ttl">Work Order{signed ? <span className="wos-badge done">Signed</span> : finalized ? <span className="wos-badge sub">Submitted</span> : null}</div>
        {svcNames && <div className="wos-svc">{svcNames}</div>}
      </div>

      {opts.length > 1 && (
        <div className="wos-tabs">
          {opts.map((o) => (
            <button key={o.id} type="button" className={`wos-tab${o.id === opt.id ? " on" : ""}`} disabled={editable && dirty} onClick={() => setOptId(o.id)}>
              {o.id} · {o.name}{proposal.selected_option === o.id ? <span className="wos-tab-dot" /> : null}
            </button>
          ))}
        </div>
      )}

      {editable && <div className="wos-hint">Set each line’s technician payout — auto-filled from your standard rates, override any line. Submit to send it for signature.</div>}
      {err && <div className="wos-err">{err}</div>}

      {blocks.map((b) => (
        <div key={b.key} className="wos-block" style={{ "--wc": b.color }}>
          <div className="wos-block-hd">
            <span className="wos-block-dot" />
            <span className="wos-block-name">{b.label}</span>
            <span className="wos-col">Payout</span>
          </div>
          <div className="wos-rows">
            {b.items.map((it, i) => {
              const grouped = it.sub?.length > 0;
              return (
                <div key={it.id} className="wos-item">
                  <div className={`wos-row${grouped ? " head" : ""}`}>
                    <span className="wos-num">{i + 1}</span>
                    <span className="wos-name">{titleCase(it.name)}{!grouped && num(it.qty) > 1 && !editable ? <span className="wos-qty"> ×{it.qty}</span> : null}</span>
                    {amtCell({ ...it, svc: b.key })}
                  </div>
                  {grouped && it.sub.map((x) => (
                    <div key={x.id} className="wos-row sub">
                      <span className="wos-num" />
                      <span className="wos-name">{titleCase(x.name)}{num(x.qty) > 1 && !editable ? <span className="wos-qty"> ×{x.qty}</span> : null}</span>
                      {subAmtCell(x, b.key)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {blocks.length > 1 && <div className="wos-sub"><span>{b.label} subtotal</span><span>{rate(blockTotal(b))}</span></div>}
        </div>
      ))}

      <div className="wos-total">
        <span>Work Order Total</span>
        <span>{pending ? "TBD" : money(total)}</span>
      </div>

      {/* Footer — build (edit + submit), or sign (tech), or the signed record. Mirrors the proposal. */}
      {editable ? (
        <div className="wos-foot">
          <button type="button" className="wos-reset" disabled={busy || !dirty} onClick={() => setTech(initial)}>Reset</button>
          {savedAt && !dirty && <span className="wos-saved">Saved</span>}
          <button type="button" className="wos-save" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="wos-submit" disabled={busy} onClick={submit}>Submit Work Order →</button>
        </div>
      ) : signed ? (
        <div className="wos-signed">
          <div className="wos-signed-row">
            <span className="wos-signed-check">✓</span>
            <span>Accepted &amp; assigned to <b>{p.tech_signed_name}</b>{p.tech_signed_at ? ` · ${fmtSignStamp(p.tech_signed_at)}` : ""}</span>
          </div>
          <div className="wos-sign-mark">
            {isOffice ? (
              <button type="button" className="wos-sign-target" title="Click to void this signature" onClick={() => setVoidOpen(true)}>
                {p.tech_signature_data ? <img src={p.tech_signature_data} alt="Technician signature" className="wos-sign-img" /> : <span className="wos-sign-typed">{p.tech_signed_name}</span>}
              </button>
            ) : (p.tech_signature_data ? <img src={p.tech_signature_data} alt="Technician signature" className="wos-sign-img" /> : <span className="wos-sign-typed">{p.tech_signed_name}</span>)}
            <span className="wos-sign-cap">Technician Signature</span>
            {isOffice && voidOpen && (
              <span className="wos-void">Void this signature?
                <button className="wos-void-yes" disabled={busy} onClick={voidSig}>Void</button>
                <button className="wos-void-no" onClick={() => setVoidOpen(false)}>Keep</button>
              </span>
            )}
          </div>
        </div>
      ) : canSign ? (
        <div className="wos-accept">
          <p>Review the scope and payout, then sign to accept and be assigned this job.</p>
          <button type="button" className="wos-sign-btn" disabled={busy} onClick={() => setSignOpen(true)}>✍ Sign Work Order</button>
        </div>
      ) : finalized ? (
        <div className="wos-accept wait">
          <p>Submitted — awaiting the technician’s signature.</p>
          {isOffice && <button type="button" className="wos-reopen" disabled={busy} onClick={reopen}>Re-open to edit</button>}
        </div>
      ) : (
        <div className="wos-accept wait"><p>{isTech ? "Being finalized — you can sign once the office submits it." : "Set the payout, then submit it for the technician to sign."}</p></div>
      )}

      <ProposalSignModal
        open={signOpen}
        heading="Accept Work Order"
        subheading={`${woNum}${pending ? "" : ` · ${money(total)}`}`}
        defaultName={p.tech_signed_name || signerName || ""}
        agreeText="I accept this work order, confirm I can perform the scope described, and agree to be assigned this job."
        accent="var(--dv-green,#2E7D5B)"
        busy={busy}
        onConfirm={doSign}
        onCancel={() => setSignOpen(false)}
      />
    </div>
  );
}

const WOS_CSS = `
.wos{background:var(--dv-paper,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;overflow:hidden;font-family:inherit;margin-bottom:16px}
.wos-top{padding:16px 18px 12px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.wos-ttl{display:flex;align-items:center;gap:10px;font-size:1.02rem;font-weight:800;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.wos-badge{font-size:.6rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:100px}
.wos-badge.done{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.wos-badge.sub{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.wos-svc{margin-top:2px;font-size:.78rem;font-weight:600;color:var(--dv-meta,#787D84)}
.wos-hint{margin:12px 18px 0;font-size:.76rem;color:var(--dv-meta,#787D84);line-height:1.45}
.wos-err{margin:12px 18px 0;padding:8px 11px;border-radius:8px;background:#fbe9e6;border:1px solid #e3b4ab;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600}
.wos-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px 2px}
.wos-tab{position:relative;height:30px;padding:0 13px;border-radius:8px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:600 .76rem/1 inherit;cursor:pointer}
.wos-tab.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.wos-tab:disabled{opacity:.5;cursor:default}
.wos-tab-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--dv-gold,#C9A96E);margin-left:6px;vertical-align:middle}
.wos-block{margin:14px 18px 0;border:1px solid var(--dv-line,#E4E4DF);border-left:3px solid var(--wc,var(--dv-gold,#C9A96E));border-radius:10px;overflow:hidden}
.wos-block-hd{display:flex;align-items:center;gap:8px;padding:9px 13px;background:var(--dv-paper,#F4F4F2);border-bottom:1px solid var(--dv-line-soft,#EDEDE9)}
.wos-block-dot{width:9px;height:9px;border-radius:3px;background:var(--wc,var(--dv-gold,#C9A96E));flex-shrink:0}
.wos-block-name{font-size:.84rem;font-weight:700;color:var(--dv-ink,#101418)}
.wos-col{margin-left:auto;font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.wos-rows{background:#fff}
.wos-row{display:grid;grid-template-columns:30px 1fr auto;gap:8px;align-items:center;padding:9px 13px;border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.wos-item:first-child>.wos-row{border-top:none}
.wos-row.head .wos-name{font-weight:700}
.wos-row.sub{padding-top:5px;padding-bottom:5px;background:var(--dv-raise,#FBFBFA)}
.wos-row.sub .wos-name{font-size:.78rem;color:var(--dv-meta,#787D84);padding-left:4px}
.wos-num{width:22px;height:22px;border-radius:6px;background:var(--wc,var(--dv-gold,#C9A96E));color:#fff;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700}
.wos-row.sub .wos-num{background:none}
.wos-name{font-size:.86rem;font-weight:600;color:var(--dv-ink,#101418);min-width:0}
.wos-qty{color:var(--dv-meta,#787D84);font-weight:600}
.wos-amt{font-size:.86rem;font-weight:700;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums;white-space:nowrap}
.wos-row.sub .wos-amt{font-size:.78rem;font-weight:600;color:var(--dv-meta,#787D84)}
.wos-edit{display:inline-flex;align-items:center;gap:8px;justify-content:flex-end}
.wos-inp{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;padding:0 8px;background:#fff}
.wos-inp:focus-within{border-color:var(--dv-gold-text,#8A6A1F)}
.wos-inp span{font-size:.76rem;font-weight:600;color:var(--dv-meta,#787D84)}
.wos-inp input{width:58px;height:28px;border:none;outline:none;text-align:right;font-size:.82rem;font-weight:700;color:var(--dv-ink,#101418);font-family:inherit;background:transparent}
.wos-inp input::-webkit-outer-spin-button,.wos-inp input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.wos-inp input{-moz-appearance:textfield;appearance:textfield}
.wos-eq{font-size:.72rem;color:var(--dv-meta,#787D84);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.wos-sub{display:flex;justify-content:space-between;padding:8px 13px;background:var(--dv-raise,#FBFBFA);border-top:1px solid var(--dv-line-soft,#EDEDE9);font-size:.78rem;font-weight:600;color:var(--dv-ink-soft,#3A4048)}
.wos-sub span:last-child{font-variant-numeric:tabular-nums}
.wos-total{margin:16px 18px 0;display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:var(--dv-ink,#101418);border-radius:10px;color:#fff;font-size:.92rem;font-weight:700}
.wos-total span:last-child{color:var(--dv-gold,#C9A96E);font-size:1.08rem;font-variant-numeric:tabular-nums}
.wos-foot{display:flex;align-items:center;gap:10px;margin:14px 18px 18px;flex-wrap:wrap}
.wos-reset{height:36px;padding:0 13px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:600 .78rem/1 inherit;cursor:pointer}
.wos-reset:disabled{opacity:.45;cursor:default}
.wos-saved{font-size:.78rem;font-weight:600;color:var(--dv-green,#2E7D5B)}
.wos-save{margin-left:auto;height:38px;padding:0 18px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:600 .82rem/1 inherit;cursor:pointer}
.wos-save:disabled{opacity:.45;cursor:default}
.wos-submit{height:38px;padding:0 20px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font:600 .82rem/1 inherit;cursor:pointer}
.wos-submit:hover{filter:brightness(1.12)}
.wos-submit:disabled{opacity:.5;cursor:default}
.wos-accept{margin:14px 18px 18px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-top:2px solid var(--dv-gold,#C9A96E);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.wos-accept.wait{border-top-color:var(--dv-line,#E4E4DF);flex-direction:row;align-items:center;justify-content:space-between}
.wos-accept p{margin:0;font-size:.82rem;color:var(--dv-meta,#787D84)}
.wos-sign-btn{height:44px;padding:0 22px;border:none;border-radius:9px;background:var(--dv-green,#2E7D5B);color:#fff;font:600 .86rem/1 inherit;cursor:pointer}
.wos-sign-btn:hover{filter:brightness(1.08)}
.wos-sign-btn:disabled{opacity:.5;cursor:default}
.wos-reopen{height:34px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:600 .76rem/1 inherit;cursor:pointer;white-space:nowrap}
.wos-reopen:hover{border-color:var(--dv-ink,#101418);color:var(--dv-ink,#101418)}
.wos-signed{margin:14px 18px 18px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-top:2px solid var(--dv-green,#2E7D5B);border-radius:10px;padding:16px 18px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
.wos-signed-row{display:flex;align-items:center;gap:10px;font-size:.86rem;color:var(--dv-green,#2E7D5B);font-weight:600}
.wos-signed-row b{color:var(--dv-ink,#101418)}
.wos-signed-check{width:26px;height:26px;flex-shrink:0;border-radius:50%;background:var(--dv-green,#2E7D5B);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:600}
.wos-sign-mark{display:flex;flex-direction:column;gap:2px;min-width:180px}
.wos-sign-img{max-height:60px;max-width:240px;object-fit:contain;align-self:flex-start}
.wos-sign-typed{font-size:1.5rem;color:var(--dv-ink,#101418);font-family:"Brush Script MT","Segoe Script",cursive;padding-left:4px}
.wos-sign-target{align-self:flex-start;background:none;border:1px dashed transparent;border-radius:8px;padding:3px 6px;margin:-3px -6px;cursor:pointer;font-family:inherit}
.wos-sign-target:hover{background:rgba(196,85,61,.08);border-color:rgba(196,85,61,.28)}
.wos-sign-cap{font-size:.6rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-top:4px;border-top:1px solid var(--dv-line,#E4E4DF);padding-top:4px}
.wos-void{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;font-size:.72rem;color:var(--dv-meta,#787D84)}
.wos-void-yes{height:24px;padding:0 10px;border-radius:100px;border:none;background:var(--dv-red,#C4553D);color:#fff;font:600 .68rem/1 inherit;cursor:pointer}
.wos-void-no{height:24px;padding:0 10px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:600 .68rem/1 inherit;cursor:pointer}
`;
