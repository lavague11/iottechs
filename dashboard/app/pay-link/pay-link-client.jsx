"use client";
import { useState } from "react";
import { Wordmark, BrandLink } from "../components/brand";

// Standalone pay-any-amount link generator (staff). Enter an amount + what it's for (and optionally a
// project to credit), generate a Square checkout link, copy/share it. 5% convenience fee added on top.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayLinkClient({ configured }) {
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [link, setLink] = useState(null);     // { url, base, fee, total }
  const [copied, setCopied] = useState(false);

  const amt = +amount || 0;
  const fee = Math.round(amt * 0.05 * 100) / 100;

  async function generate() {
    if (busy || !(amt > 0)) return;
    setBusy(true); setErr(null);
    const r = await fetch("/api/pay/link", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ amount: amt, label: label.trim() || "Payment", accessId: project.trim() || undefined }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.url) { setLink(r); setCopied(false); } else setErr(r?.error || "Couldn't create the link.");
  }
  async function copy() { try { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ } }
  async function share() { try { if (navigator.share) await navigator.share({ title: "Payment", url: link.url }); else copy(); } catch { /* cancelled */ } }
  function reset() { setLink(null); setAmount(""); setLabel(""); setProject(""); setErr(null); }

  return (
    <div className="pl">
      <style>{CSS}</style>
      <header className="pl-head">
        <BrandLink className="pl-logo"><Wordmark height={18} /></BrandLink>
        <h1 className="pl-h1">Payment Link</h1>
      </header>

      {!configured ? (
        <div className="pl-card pl-off">
          <b>Online payments aren’t set up yet.</b>
          <span>Add your Square keys in <a href="/dev">Development ▸ API Keys</a> (SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID), then this page goes live.</span>
        </div>
      ) : !link ? (
        <div className="pl-card">
          <label className="pl-fld"><span>Amount</span>
            <div className="pl-amtwrap"><span className="pl-cur">$</span>
              <input className="pl-input pl-amt" inputMode="decimal" type="number" min="0" step="0.01" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          </label>
          <label className="pl-fld"><span>For <em>(appears on the receipt)</em></span>
            <input className="pl-input" placeholder="e.g. Service call · deposit · materials" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
          <label className="pl-fld"><span>Credit a project <em>(optional)</em></span>
            <input className="pl-input" placeholder="Project ID — e.g. ASC0057" value={project} onChange={(e) => setProject(e.target.value.toUpperCase())} /></label>

          {amt > 0 && <div className="pl-quote">Customer pays <b>{money(amt + fee)}</b> <span>({money(amt)} + {money(fee)} convenience fee)</span></div>}
          {err && <div className="pl-err">{err}</div>}
          <button type="button" className="pl-go" disabled={busy || !(amt > 0)} onClick={generate}>{busy ? "Creating…" : "Create payment link"}</button>
          <p className="pl-note">Card · Apple&nbsp;Pay · Google&nbsp;Pay · Cash&nbsp;App on Square’s secure page. A project ID credits that balance when paid.</p>
        </div>
      ) : (
        <div className="pl-card">
          <div className="pl-done">✓ Link ready</div>
          <div className="pl-total">Customer pays <b>{money(link.total)}</b> <span>({money(link.base)} + {money(link.fee)} fee)</span></div>
          <div className="pl-row">
            <input className="pl-input pl-url" readOnly value={link.url} onFocus={(e) => e.target.select()} />
            <button type="button" className="pl-copy" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <div className="pl-actions">
            <a className="pl-open" href={link.url} target="_blank" rel="noreferrer">Open</a>
            <button type="button" className="pl-share" onClick={share}>Share</button>
            <button type="button" className="pl-new" onClick={reset}>New link</button>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.pl{max-width:520px;margin:0 auto;padding:22px 20px 80px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#12151b}
.pl-head{display:flex;align-items:center;gap:12px;padding-bottom:14px;margin-bottom:18px;border-bottom:1px solid #e8e8e3}
.pl-logo{color:#12151b}
.pl-h1{margin:0;font-size:1.12rem;font-weight:800;letter-spacing:-.02em}
.pl-card{display:flex;flex-direction:column;gap:14px;border:1px solid #e8e8e3;border-radius:14px;background:#fff;padding:18px}
.pl-off{gap:6px;color:#2b3038;font-size:.9rem;line-height:1.5}
.pl-off a{color:#3a6ea5}
.pl-fld{display:flex;flex-direction:column;gap:6px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#8a8f99}
.pl-fld em{font-style:normal;font-weight:500;text-transform:none;letter-spacing:0;color:#aab0b8}
.pl-input{width:100%;box-sizing:border-box;height:46px;border:1px solid #e4e4df;border-radius:10px;background:#fff;padding:0 12px;font-size:1rem;font-weight:500;color:#12151b;font-family:inherit;outline:none}
.pl-input:focus{border-color:#8A6A1F}
.pl-amtwrap{position:relative}
.pl-cur{position:absolute;left:13px;top:50%;transform:translateY(-50%);font-size:1.1rem;font-weight:700;color:#8a8f99}
.pl-amt{padding-left:28px;font-size:1.25rem;font-weight:800;font-variant-numeric:tabular-nums}
.pl-quote{font-size:.9rem;color:#2b3038;background:#faf9f6;border:1px solid #eceae4;border-radius:10px;padding:10px 13px}
.pl-quote b{font-variant-numeric:tabular-nums}
.pl-quote span{color:#8a8f99}
.pl-err{font-size:.82rem;font-weight:600;color:#C0392B;background:#fbe9e6;border:1px solid #e3b4ab;border-radius:9px;padding:9px 12px}
.pl-go{height:50px;border:0;border-radius:12px;background:#C9A96E;color:#1a1205;font-size:1rem;font-weight:800;cursor:pointer;box-shadow:0 6px 18px -8px rgba(201,169,110,.65)}
.pl-go:hover:not(:disabled){filter:brightness(1.05)}
.pl-go:disabled{opacity:.55;cursor:default}
.pl-note{margin:0;font-size:.72rem;color:#8a8f99;line-height:1.45;text-align:center}
.pl-done{font-size:.9rem;font-weight:800;color:#2E7D5B}
.pl-total{font-size:1rem;color:#12151b}
.pl-total b{font-variant-numeric:tabular-nums}
.pl-total span{color:#8a8f99;font-size:.85rem}
.pl-row{display:flex;gap:8px}
.pl-url{flex:1;min-width:0;font-size:.78rem;font-family:var(--font-mono),ui-monospace,Menlo,monospace}
.pl-copy{flex:0 0 auto;height:46px;padding:0 18px;border:0;border-radius:10px;background:#12151b;color:#fff;font-size:.86rem;font-weight:700;cursor:pointer}
.pl-actions{display:flex;gap:8px}
.pl-open,.pl-share,.pl-new{flex:1;height:42px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #e4e4df;border-radius:10px;background:#fff;color:#2b3038;font-size:.86rem;font-weight:700;cursor:pointer;text-decoration:none;font-family:inherit}
.pl-open:hover,.pl-share:hover,.pl-new:hover{border-color:#12151b}
@media (prefers-color-scheme:dark){
  .pl{color:#e9edf2}
  .pl-head{border-color:#2a2f37}.pl-logo,.pl-h1{color:#fff}
  .pl-card{background:#161a20;border-color:#2a2f37}
  .pl-off{color:#cdd2d8}.pl-off a{color:#7fb0e8}
  .pl-input{background:#12161c;border-color:#2a2f37;color:#e9edf2}
  .pl-input:focus{border-color:#C9A96E}
  .pl-quote{background:#12161c;border-color:#2a2f37;color:#cdd2d8}
  .pl-url{color:#e9edf2}
  .pl-copy{background:#e9edf2;color:#12151b}
  .pl-open,.pl-share,.pl-new{background:#12161c;border-color:#2a2f37;color:#cdd2d8}
  .pl-open:hover,.pl-share:hover,.pl-new:hover{border-color:#5a6068;color:#fff}
}
`;
