"use client";
// Unified customer PAY flow on the proposal (per owner): one clear "Pay Deposit · $X" button that opens
// three ways to pay — Zelle (no fee, opens the Zelle link + shows the details), Card / Apple Pay / Google
// Pay (Square hosted checkout, +5% fee), or "I already paid" (record it manually → pending for staff to
// confirm). It is NOT gated by signature — a customer can pay before signing; the money is recorded and
// credited on confirmation regardless of the lifecycle stage.
import { useState } from "react";
import PayButtons from "./pay-buttons";
import ZellePay from "./pay-zelle";
import { recordPaymentAction } from "./proposal-actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaymentOptions({ accessId, amountDue, label = "", preview = false, showToast }) {
  const [open, setOpen] = useState(false);     // tapped Pay → options revealed
  const [pick, setPick] = useState(null);      // which option is expanded: "zelle" | "card" | "manual"
  const [pay, setPay] = useState({ amount: amountDue > 0 ? Number(amountDue).toFixed(2) : "", method: "Zelle", note: "" });
  const [checkPhotos, setCheckPhotos] = useState({ front: null, back: null });
  const [upBusy, setUpBusy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  const payLabel = label ? `Pay ${label}` : "Pay";
  const toggle = (k) => setPick((p) => (p === k ? null : k));

  async function uploadCheckPhoto(side, file) {
    if (!file || upBusy || preview) return;
    setUpBusy(side); setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("project", accessId); fd.append("kind", "check-photo");
      const r = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" }).then((x) => x.json()).catch(() => null);
      if (r?.ok && r.url) setCheckPhotos((p) => ({ ...p, [side]: r.url }));
      else setErr(r?.error ? `Photo upload failed: ${r.error}` : "Photo upload failed.");
    } finally { setUpBusy(null); }
  }

  async function submitManual() {
    if (preview || busy || !(+pay.amount > 0)) return;
    setBusy(true); setErr(null);
    const photos = [checkPhotos.front, checkPhotos.back].filter(Boolean);
    const r = await recordPaymentAction(accessId, { amount: +pay.amount, method: pay.method, kind: "deposit", note: pay.note, photos }).catch(() => null);
    setBusy(false);
    if (!r || r.error) { setErr(r?.error || "Couldn't record that. Try again."); return; }
    setDone(true);
    showToast?.("Payment submitted — we'll confirm receipt");
  }

  if (done) {
    return (
      <div className="po-wrap">
        <style>{PO_CSS}</style>
        <div className="po-done">✓ Thanks — we’ll confirm your payment and keep you posted.</div>
      </div>
    );
  }

  const isCheck = /check/i.test(pay.method);

  return (
    <div className="po-wrap">
      <style>{PO_CSS}</style>
      {!open ? (
        <button type="button" className="po-pay" onClick={() => setOpen(true)}>
          {payLabel}{amountDue > 0 ? ` · ${money(amountDue)}` : ""}
        </button>
      ) : (
        <div className="po-panel">
          <div className="po-hd">
            <span className="po-hd-t">{payLabel}{amountDue > 0 ? ` · ${money(amountDue)}` : ""}</span>
            <button type="button" className="po-hd-x" aria-label="Close" onClick={() => { setOpen(false); setPick(null); }}>×</button>
          </div>

          {/* 1 · Zelle — no fee. Tapping opens the Zelle link AND reveals the details (QR / phone / copy). */}
          <button type="button" className={`po-opt${pick === "zelle" ? " on" : ""}`} onClick={() => toggle("zelle")}>
            <span className="po-opt-ic zelle">Z</span>
            <span className="po-opt-main"><span className="po-opt-t">Zelle</span><span className="po-opt-s">Open the Zelle link or scan — no fee</span></span>
            <span className="po-opt-badge free">No fee</span>
          </button>
          {pick === "zelle" && <div className="po-body"><ZellePay /></div>}

          {/* 2 · Card / Apple Pay / Google Pay — Square hosted checkout, 5% fee. */}
          <button type="button" className={`po-opt${pick === "card" ? " on" : ""}`} onClick={() => toggle("card")}>
            <span className="po-opt-ic card">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            </span>
            <span className="po-opt-main"><span className="po-opt-t">Card · Apple&nbsp;Pay · Google&nbsp;Pay</span><span className="po-opt-s">Instant, secure — 5% convenience fee</span></span>
            <span className="po-opt-badge">+5%</span>
          </button>
          {pick === "card" && <div className="po-body"><PayButtons accessId={accessId} /></div>}

          {/* 3 · I already paid — record it manually (Zelle/check/cash/wire) → pending for staff to confirm. */}
          <button type="button" className={`po-opt${pick === "manual" ? " on" : ""}`} onClick={() => toggle("manual")}>
            <span className="po-opt-ic check">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </span>
            <span className="po-opt-main"><span className="po-opt-t">I already paid</span><span className="po-opt-s">Zelle, check, cash or wire — tell us how</span></span>
          </button>
          {pick === "manual" && (
            <div className="po-body">
              <div className="po-form">
                <label className="po-fld"><span>Amount</span>
                  <input className="po-input num" type="number" min="0" step="0.01" placeholder="0.00"
                         value={pay.amount} onChange={(e) => setPay((v) => ({ ...v, amount: e.target.value }))} /></label>
                <label className="po-fld"><span>How did you pay?</span>
                  <select className="po-input" value={pay.method} onChange={(e) => setPay((v) => ({ ...v, method: e.target.value }))}>
                    <option>Zelle</option><option>Check</option><option>Certified Check</option><option>Cash</option><option>Wire</option><option>Other</option>
                  </select></label>
                <label className="po-fld po-fld-wide"><span>Reference <em>(optional)</em></span>
                  <input className="po-input" placeholder="Reference #…" value={pay.note} onChange={(e) => setPay((v) => ({ ...v, note: e.target.value }))} /></label>
              </div>
              {isCheck && (
                <div className="po-checkphotos">
                  <div className="po-checkphotos-lbl">Photo of the check <em>(optional — front &amp; back)</em></div>
                  <div className="po-checkphotos-row">
                    {["front", "back"].map((side) => (
                      <label key={side} className={`po-checkphoto${checkPhotos[side] ? " has" : ""}`}>
                        {checkPhotos[side] ? <img src={checkPhotos[side]} alt={`Check ${side}`} /> : <span>{upBusy === side ? "Uploading…" : `+ ${side}`}</span>}
                        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} disabled={!!upBusy}
                               onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCheckPhoto(side, f); e.target.value = ""; }} />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {err && <div className="po-err">{err}</div>}
              <button type="button" className="po-submit" disabled={busy || !(+pay.amount > 0)} onClick={submitManual}>
                {busy ? "Submitting…" : "I Paid This"}
              </button>
              <div className="po-fine">Pending until we confirm receipt.</div>
            </div>
          )}
          {err && pick !== "manual" && <div className="po-err">{err}</div>}
        </div>
      )}
    </div>
  );
}

const PO_CSS = `
.po-wrap{margin:16px 22px 4px}
.po-pay{width:100%;min-height:52px;border:0;border-radius:13px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#1a1205;font-size:1.02rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 8px 22px -10px rgba(201,169,110,.7)}
.po-pay:hover{filter:brightness(1.04)}
.po-done{text-align:center;padding:16px;border:1px solid #cfe6d8;background:#eef6f0;border-radius:12px;color:#2E7D5B;font-weight:700;font-size:.9rem}
.po-panel{border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;background:var(--dv-raise,#FBFBFA);overflow:hidden}
.po-hd{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.po-hd-t{font-weight:800;font-size:.98rem;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.po-hd-x{margin-left:auto;width:30px;height:30px;border:0;background:none;color:var(--dv-meta,#787D84);font-size:1.5rem;line-height:1;cursor:pointer;border-radius:8px}
.po-hd-x:hover{background:rgba(16,20,24,.06);color:var(--dv-ink,#101418)}
.po-opt{width:100%;display:flex;align-items:center;gap:12px;padding:13px 15px;border:0;border-top:1px solid var(--dv-line-soft,#EDEDE9);background:none;cursor:pointer;font-family:inherit;text-align:left}
.po-opt:first-of-type{border-top:0}
.po-opt:hover{background:var(--dv-paper,#F4F4F2)}
.po-opt.on{background:var(--dv-paper,#F4F4F2)}
.po-opt-ic{flex:0 0 auto;width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-weight:800;color:#fff}
.po-opt-ic.zelle{background:#6D1ED4;font-size:1.05rem}
.po-opt-ic.card{background:#101418}
.po-opt-ic.check{background:#2E7D5B}
.po-opt-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.po-opt-t{font-weight:700;font-size:.92rem;color:var(--dv-ink,#101418)}
.po-opt-s{font-size:.76rem;color:var(--dv-meta,#787D84);line-height:1.35}
.po-opt-badge{flex:0 0 auto;font-size:.66rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--dv-meta,#787D84);background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:3px 9px}
.po-opt-badge.free{color:#2E7D5B;background:#e6f3ec;border-color:#cfe6d8}
.po-body{padding:4px 15px 16px;border-top:1px solid var(--dv-line-soft,#EDEDE9);background:#fff}
.po-form{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:12px}
.po-fld{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--dv-meta,#787D84)}
.po-fld-wide{grid-column:1 / -1}
.po-fld em{font-style:normal;font-weight:500;text-transform:none;letter-spacing:0;color:var(--dv-faint,#A1A6AC)}
.po-input{width:100%;min-width:0;box-sizing:border-box;height:42px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;padding:0 11px;font-size:.92rem;font-weight:500;color:var(--dv-ink,#101418);font-family:inherit;outline:none;text-transform:none;letter-spacing:0}
.po-input.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
.po-input:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.po-checkphotos{margin-top:11px;display:flex;flex-direction:column;gap:7px}
.po-checkphotos-lbl{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--dv-meta,#787D84)}
.po-checkphotos-lbl em{font-style:normal;font-weight:500;text-transform:none;letter-spacing:0;color:var(--dv-faint,#A1A6AC)}
.po-checkphotos-row{display:flex;gap:10px}
.po-checkphoto{position:relative;flex:1 1 0;min-width:0;height:84px;border:1px dashed var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;font-size:.8rem;font-weight:600;color:var(--dv-meta,#787D84);text-transform:capitalize}
.po-checkphoto.has{border-style:solid}
.po-checkphoto img{width:100%;height:100%;object-fit:cover}
.po-submit{width:100%;height:48px;margin-top:13px;border:0;border-radius:11px;background:#101418;color:#fff;font-size:.94rem;font-weight:800;cursor:pointer;font-family:inherit}
.po-submit:hover:not(:disabled){filter:brightness(1.12)}
.po-submit:disabled{opacity:.5;cursor:default}
.po-fine{margin-top:7px;font-size:.72rem;color:var(--dv-faint,#A1A6AC);font-style:italic;text-align:center}
.po-err{margin-top:10px;font-size:.8rem;font-weight:600;color:#C0392B;background:#fbe9e6;border:1px solid #e3b4ab;border-radius:9px;padding:8px 11px}
@media(max-width:480px){.po-form{grid-template-columns:1fr}}
@media (prefers-color-scheme:dark){
  .po-panel{background:#12161c;border-color:#2a2f37}
  .po-hd,.po-opt,.po-body{border-color:#2a2f37}
  .po-hd-t,.po-opt-t{color:#e9edf2}
  .po-opt:hover,.po-opt.on{background:#171c23}
  .po-body{background:#0e1217}
  .po-input{background:#12161c;border-color:#2a2f37;color:#e9edf2}
  .po-done{background:#13241b;border-color:#1f4030;color:#86c7a3}
}
`;
