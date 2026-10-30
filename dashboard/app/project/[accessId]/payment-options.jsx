"use client";
// Unified customer PAY flow (per owner): one "Pay Balance · $X" button that opens a pop-up modal (like the
// + Add Service modal) with three ways to pay. Tapping an option goes STRAIGHT to the action — no "pay this
// again" step. Amount is editable (pay the deposit, the full balance, or any amount). Zelle and "I already
// paid" accept several proof photos/screenshots. NOT gated by signature — a customer can pay before signing.
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ZELLE } from "./pay-zelle";
import { recordPaymentAction } from "./proposal-actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaymentOptions({ accessId, balanceDue = 0, kind = "deposit", preview = false, showToast, onRecorded }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("options");    // "options" | "zelle" | "manual"
  const [amount, setAmount] = useState(balanceDue > 0 ? Number(balanceDue).toFixed(2) : "");
  const [method, setMethod] = useState("Zelle");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState([]);        // /api/media URLs
  const [upBusy, setUpBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const [sqOn, setSqOn] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Is Square online payment configured? (controls whether the Card · Apple Pay · Google Pay tile shows.)
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/pay/create?project=${encodeURIComponent(accessId)}`, { credentials: "same-origin" })
      .then((r) => r.json()).then((d) => { if (live) setSqOn(!!d?.configured); }).catch(() => {});
    return () => { live = false; };
  }, [open, accessId]);

  function reset() { setView("options"); setAmount(balanceDue > 0 ? Number(balanceDue).toFixed(2) : ""); setMethod("Zelle"); setNote(""); setPhotos([]); setErr(null); }
  function close() { setOpen(false); }
  function openModal() { reset(); setDone(false); setOpen(true); }

  async function addPhotos(files) {
    if (preview) return;
    for (const file of files) {
      if (photos.length >= 8) break;
      setUpBusy(true); setErr(null);
      try {
        const fd = new FormData();
        fd.append("file", file); fd.append("project", accessId); fd.append("kind", "check-photo");
        const r = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" }).then((x) => x.json()).catch(() => null);
        if (r?.ok && r.url) setPhotos((p) => [...p, r.url].slice(0, 8));
        else { setErr(r?.error ? `Upload failed: ${r.error}` : "Upload failed."); break; }
      } finally { setUpBusy(false); }
    }
  }

  // Record a manual payment (Zelle / check / cash / wire) → pending for staff to confirm.
  async function record(payMethod) {
    if (preview || busy || !(+amount > 0)) return;
    setBusy(true); setErr(null);
    const r = await recordPaymentAction(accessId, { amount: +amount, method: payMethod, kind, note, photos }).catch(() => null);
    setBusy(false);
    if (!r || r.error) { setErr(r?.error || "Couldn't record that. Try again."); return; }
    onRecorded?.(r);
    setDone(true); setOpen(false);
    showToast?.("Payment submitted — we'll confirm receipt");
  }

  // Card / Apple Pay / Google Pay → Square hosted checkout, straight away (open the tab on the gesture, then
  // point it at the checkout once the link is created).
  async function payCard() {
    if (cardBusy || preview) return;
    const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setCardBusy(true); setErr(null);
    const r = await fetch("/api/pay/create", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ accessId, kind: kind === "final" ? "balance" : "deposit" }),
    }).then((x) => x.json()).catch(() => null);
    setCardBusy(false);
    if (r?.url) { if (w) w.location.href = r.url; else window.location.href = r.url; setOpen(false); }
    else { if (w) w.close(); setErr(r?.error || "Couldn't start checkout. Try again."); }
  }

  function openZelle() { if (typeof window !== "undefined") window.open(ZELLE.url, "_blank", "noopener,noreferrer"); }

  const headline = `Balance Due · ${money(balanceDue)}`;

  const PhotoUploader = (
    <div className="po-photos">
      <div className="po-photos-lbl">Add a screenshot or photo <em>(optional)</em></div>
      <div className="po-photos-row">
        {photos.map((u, i) => (
          <span key={i} className="po-photo">
            <img src={u} alt={`Proof ${i + 1}`} />
            <button type="button" className="po-photo-x" aria-label="Remove" onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))}>×</button>
          </span>
        ))}
        {photos.length < 8 && (
          <label className="po-photo add">
            <span>{upBusy ? "…" : "+"}</span>
            <input type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} disabled={upBusy}
                   onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (fs.length) addPhotos(fs); }} />
          </label>
        )}
      </div>
    </div>
  );

  const AmountField = (
    <label className="po-fld"><span>How much are you paying?</span>
      <div className="po-amtwrap"><span className="po-cur">$</span>
        <input className="po-input po-amt" type="number" min="0" step="0.01" placeholder="0.00"
               value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
    </label>
  );

  const modal = open && mounted ? createPortal(
    <div className="po-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <style>{PO_CSS}</style>
      <div className="po-modal" role="dialog" aria-modal="true" aria-label="Make a payment">
        <div className="po-mhd">
          {view !== "options"
            ? <button type="button" className="po-back" aria-label="Back" onClick={() => { setView("options"); setErr(null); }}>‹</button>
            : <span className="po-mhd-ic">$</span>}
          <span className="po-mhd-t">{view === "zelle" ? "Pay by Zelle" : view === "manual" ? "Record your payment" : headline}</span>
          <button type="button" className="po-mhd-x" aria-label="Close" onClick={close}>×</button>
        </div>

        {err && <div className="po-err">{err}</div>}

        {view === "options" && (
          <div className="po-opts">
            <button type="button" className="po-opt" onClick={() => { openZelle(); setView("zelle"); }}>
              <span className="po-opt-ic zelle">Z</span>
              <span className="po-opt-main"><span className="po-opt-t">Zelle</span><span className="po-opt-s">Opens the Zelle app/link — no fee</span></span>
              <span className="po-opt-badge free">No fee</span>
            </button>
            {sqOn && (
              <button type="button" className="po-opt" disabled={cardBusy} onClick={payCard}>
                <span className="po-opt-ic card">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                </span>
                <span className="po-opt-main"><span className="po-opt-t">Card · Apple&nbsp;Pay · Google&nbsp;Pay</span><span className="po-opt-s">{cardBusy ? "Opening secure checkout…" : "Instant, secure — 5% convenience fee"}</span></span>
                <span className="po-opt-badge">+5%</span>
              </button>
            )}
            <button type="button" className="po-opt" onClick={() => { setMethod("Zelle"); setView("manual"); }}>
              <span className="po-opt-ic check">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </span>
              <span className="po-opt-main"><span className="po-opt-t">I already paid</span><span className="po-opt-s">Zelle, check, cash or wire — tell us how</span></span>
            </button>
          </div>
        )}

        {view === "zelle" && (
          <div className="po-body">
            <div className="po-zelle">
              <a className="po-zelle-qrwrap" href={ZELLE.url} target="_blank" rel="noreferrer" title="Open Zelle">
                <img className="po-zelle-qr" src={ZELLE.qr} alt="Zelle QR code" width="120" height="120" />
              </a>
              <div className="po-zelle-info">
                <div className="po-zelle-to">{ZELLE.name}</div>
                <button type="button" className="po-zelle-phone" onClick={() => { try { navigator.clipboard.writeText(ZELLE.phone); showToast?.("Copied"); } catch { /* blocked */ } }} title="Copy">{ZELLE.phone} <span className="po-copy">Copy</span></button>
                <div className="po-zelle-hint">Scan or tap to open Zelle, then confirm below so we can match your payment.</div>
              </div>
            </div>
            <button type="button" className="po-ghost" onClick={openZelle}>Open Zelle</button>
            <div className="po-form">
              {AmountField}
              {PhotoUploader}
              <label className="po-fld"><span>Reference <em>(optional)</em></span>
                <input className="po-input" placeholder="Confirmation #…" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
            <button type="button" className="po-submit" disabled={busy || !(+amount > 0)} onClick={() => record("Zelle")}>
              {busy ? "Submitting…" : "I sent it"}
            </button>
            <div className="po-fine">Pending until we confirm receipt.</div>
          </div>
        )}

        {view === "manual" && (
          <div className="po-body">
            <div className="po-form">
              {AmountField}
              <label className="po-fld"><span>How did you pay?</span>
                <select className="po-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option>Zelle</option><option>Check</option><option>Certified Check</option><option>Cash</option><option>Wire</option><option>Other</option>
                </select></label>
              <label className="po-fld po-fld-wide"><span>Reference <em>(optional)</em></span>
                <input className="po-input" placeholder="Reference / confirmation #…" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
            {PhotoUploader}
            <button type="button" className="po-submit" disabled={busy || !(+amount > 0)} onClick={() => record(method)}>
              {busy ? "Submitting…" : "I Paid This"}
            </button>
            <div className="po-fine">Pending until we confirm receipt.</div>
          </div>
        )}
      </div>
    </div>, document.body) : null;

  return (
    <div className="po-wrap">
      <style>{PO_CSS}</style>
      {done ? (
        <div className="po-done">✓ Thanks — we’ll confirm your payment and keep you posted.</div>
      ) : (
        <button type="button" className="po-pay" onClick={openModal}>Pay Balance · {money(balanceDue)}</button>
      )}
      {modal}
    </div>
  );
}

const PO_CSS = `
.po-wrap{margin:16px 22px 4px}
.po-pay{width:100%;min-height:52px;border:0;border-radius:13px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#1a1205;font-size:1.02rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 8px 22px -10px rgba(201,169,110,.7);font-variant-numeric:tabular-nums}
.po-pay:hover{filter:brightness(1.04)}
.po-done{text-align:center;padding:16px;border:1px solid #cfe6d8;background:#eef6f0;border-radius:12px;color:#2E7D5B;font-weight:700;font-size:.9rem}
.po-overlay{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;background:rgba(16,20,24,.46);padding:20px;font-family:var(--font-sans),system-ui,sans-serif}
.po-modal{width:100%;max-width:440px;max-height:92vh;overflow:auto;background:var(--dv-paper,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:18px;box-shadow:0 24px 60px rgba(16,20,24,.3)}
.po-mhd{display:flex;align-items:center;gap:10px;padding:15px 16px;border-bottom:1px solid var(--dv-line,#E4E4DF);position:sticky;top:0;background:inherit;z-index:1}
.po-mhd-ic{width:30px;height:30px;border-radius:9px;background:#101418;color:#fff;display:grid;place-items:center;font-weight:800}
.po-mhd-t{font-weight:800;font-size:1rem;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.po-back,.po-mhd-x{border:0;background:none;color:var(--dv-meta,#787D84);cursor:pointer;border-radius:8px}
.po-back{width:30px;height:30px;font-size:1.6rem;line-height:1}
.po-mhd-x{margin-left:auto;width:30px;height:30px;font-size:1.5rem;line-height:1}
.po-back:hover,.po-mhd-x:hover{background:rgba(16,20,24,.06);color:var(--dv-ink,#101418)}
.po-opts{display:flex;flex-direction:column}
.po-opt{width:100%;display:flex;align-items:center;gap:12px;padding:15px 16px;border:0;border-top:1px solid var(--dv-line-soft,#EDEDE9);background:none;cursor:pointer;font-family:inherit;text-align:left}
.po-opt:first-child{border-top:0}
.po-opt:hover:not(:disabled){background:var(--dv-raise,#FBFBFA)}
.po-opt:disabled{opacity:.7;cursor:default}
.po-opt-ic{flex:0 0 auto;width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-weight:800;color:#fff}
.po-opt-ic.zelle{background:#6D1ED4;font-size:1.1rem}
.po-opt-ic.card{background:#101418}
.po-opt-ic.check{background:#2E7D5B}
.po-opt-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.po-opt-t{font-weight:700;font-size:.94rem;color:var(--dv-ink,#101418)}
.po-opt-s{font-size:.77rem;color:var(--dv-meta,#787D84);line-height:1.35}
.po-opt-badge{flex:0 0 auto;font-size:.66rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--dv-meta,#787D84);background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:3px 9px}
.po-opt-badge.free{color:#2E7D5B;background:#e6f3ec;border-color:#cfe6d8}
.po-body{padding:16px}
.po-zelle{display:flex;gap:14px;align-items:center;padding:12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-raise,#FBFBFA)}
.po-zelle-qrwrap{flex:0 0 auto;line-height:0;border-radius:10px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;padding:6px}
.po-zelle-qr{width:120px;height:120px;display:block}
.po-zelle-info{display:flex;flex-direction:column;gap:3px;min-width:0}
.po-zelle-to{font-weight:800;font-size:.9rem;color:var(--dv-ink,#101418)}
.po-zelle-phone{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;border:0;background:none;padding:0;font-weight:700;font-size:.9rem;color:#6D1ED4;cursor:pointer;font-variant-numeric:tabular-nums;font-family:inherit}
.po-copy{font-size:.6rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84);background:var(--dv-paper,#F4F4F2);border-radius:100px;padding:2px 7px}
.po-zelle-hint{font-size:.72rem;color:var(--dv-meta,#787D84);line-height:1.4;margin-top:3px}
.po-ghost{width:100%;height:44px;margin-top:12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;background:#fff;color:var(--dv-ink,#101418);font-size:.9rem;font-weight:700;cursor:pointer;font-family:inherit}
.po-ghost:hover{border-color:var(--dv-gold-text,#8A6A1F)}
.po-form{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:14px}
.po-fld{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--dv-meta,#787D84)}
.po-fld-wide{grid-column:1 / -1}
.po-fld em{font-style:normal;font-weight:500;text-transform:none;letter-spacing:0;color:var(--dv-faint,#A1A6AC)}
.po-input{width:100%;min-width:0;box-sizing:border-box;height:44px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:#fff;padding:0 12px;font-size:.95rem;font-weight:500;color:var(--dv-ink,#101418);font-family:inherit;outline:none;text-transform:none;letter-spacing:0}
.po-input:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.po-amtwrap{position:relative}
.po-cur{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-weight:700;color:var(--dv-meta,#787D84)}
.po-amt{padding-left:26px;text-align:right;font-variant-numeric:tabular-nums;font-weight:800;font-size:1.05rem}
.po-photos{grid-column:1 / -1;margin-top:13px;display:flex;flex-direction:column;gap:7px}
.po-photos-lbl{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--dv-meta,#787D84)}
.po-photos-lbl em{font-style:normal;font-weight:500;text-transform:none;letter-spacing:0;color:var(--dv-faint,#A1A6AC)}
.po-photos-row{display:flex;gap:8px;flex-wrap:wrap}
.po-photo{position:relative;width:62px;height:62px;border-radius:10px;overflow:hidden;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);display:flex;align-items:center;justify-content:center}
.po-photo img{width:100%;height:100%;object-fit:cover}
.po-photo.add{border-style:dashed;cursor:pointer;font-size:1.5rem;font-weight:700;color:var(--dv-meta,#787D84)}
.po-photo-x{position:absolute;top:2px;right:2px;width:20px;height:20px;border:0;border-radius:50%;background:rgba(16,20,24,.64);color:#fff;font-size:.95rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.po-submit{width:100%;height:48px;margin-top:14px;border:0;border-radius:12px;background:#101418;color:#fff;font-size:.95rem;font-weight:800;cursor:pointer;font-family:inherit}
.po-submit:hover:not(:disabled){filter:brightness(1.14)}
.po-submit:disabled{opacity:.5;cursor:default}
.po-fine{margin-top:8px;font-size:.72rem;color:var(--dv-faint,#A1A6AC);font-style:italic;text-align:center}
.po-err{margin:12px 16px 0;font-size:.8rem;font-weight:600;color:#C0392B;background:#fbe9e6;border:1px solid #e3b4ab;border-radius:9px;padding:8px 11px}
@media(max-width:460px){.po-form{grid-template-columns:1fr}.po-overlay{padding:0;align-items:flex-end}.po-modal{max-width:100%;border-radius:18px 18px 0 0;max-height:94vh}}
@media (prefers-color-scheme:dark){
  .po-modal{background:#12161c;border-color:#2a2f37}
  .po-mhd,.po-opt,.po-zelle{border-color:#2a2f37}
  .po-mhd-t,.po-opt-t,.po-zelle-to{color:#e9edf2}
  .po-opt:hover:not(:disabled){background:#171c23}
  .po-zelle{background:#0e1217}
  .po-input,.po-ghost{background:#12161c;border-color:#2a2f37;color:#e9edf2}
  .po-done{background:#13241b;border-color:#1f4030;color:#86c7a3}
  .po-zelle-qrwrap{background:#fff}
}
`;
