"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "../../components/brand";
import AddressAutocomplete from "../../components/address-autocomplete";
import DlScanner from "../../components/dl-scanner";
import { saveOnboardingProfileAction, signOnboardingDocAction } from "./actions";

// New-hire onboarding — the part THEY fill in after applying. Two tasks: their details, and
// signing the three agreements. Progress shows at the top so they know what's left.
const DOCS = [
  { key: "safety", title: "Safety policy",
    body: "I will follow IOT TECHS safety procedures on every job: proper ladder and lift use, PPE where required, lockout on energized work, and no work I'm not trained or equipped for. I'll report any unsafe condition or incident to my supervisor the same day." },
  { key: "handbook", title: "Employee handbook",
    body: "I've read the handbook covering conduct, timekeeping, customer privacy, and vehicle use. Customer footage and site information are confidential — I will not copy, share, or discuss them outside the job." },
  { key: "equipment", title: "Tool & equipment agreement",
    body: "Company tools, testers, ladders, and vehicles are issued for company work. I'll keep them secure and in working order, report loss or damage immediately, and return everything on request or when my employment ends." },
];

export default function WelcomeClient({ app, staff }) {
  const router = useRouter();
  const locked = !["offer", "hired"].includes(app.stage);
  const p = app.profile || {};
  const first = (app.name || "").trim().split(/\s+/)[0];

  const [f, setF] = useState({
    legal_name: p.legal_name || app.name || "",
    dob: p.dob || "",
    address: p.address || app.address || "",
    emergency_name: p.emergency_name || "",
    emergency_phone: p.emergency_phone || "",
    emergency_rel: p.emergency_rel || "",
    license_no: p.license_no || "",
    license_state: p.license_state || "",
    license_exp: p.license_exp || "",
    shirt: p.shirt || "",
    jacket: p.jacket || "",
    boot: p.boot || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [openDoc, setOpenDoc] = useState(null);
  const [sigName, setSigName] = useState("");
  const [sigBusy, setSigBusy] = useState(false);

  const set = (k) => (e) => { setF((v) => ({ ...v, [k]: e.target.value })); setSaved(false); };
  const signedCount = DOCS.filter((d) => app.signed?.[d.key]).length;
  const detailsDone = !!p.submitted_at;
  const allDone = detailsDone && signedCount === DOCS.length;

  async function saveDetails(e) {
    e.preventDefault();
    setErr("");
    if (!f.legal_name.trim()) { setErr("We need your legal name as it appears on your ID."); return; }
    if (!f.emergency_name.trim() || !f.emergency_phone.trim()) { setErr("Please give us an emergency contact and their phone."); return; }
    setBusy(true);
    const r = await saveOnboardingProfileAction(app.app_id, f);
    setBusy(false);
    if (r?.ok) { setSaved(true); router.refresh(); }
    else setErr(r?.error || "Could not save. Try again.");
  }

  async function sign(docKey) {
    if (sigName.trim().length < 2 || sigBusy) return;
    setSigBusy(true);
    const r = await signOnboardingDocAction(app.app_id, docKey, sigName.trim());
    setSigBusy(false);
    if (r?.ok) { setOpenDoc(null); setSigName(""); router.refresh(); }
    else alert(r?.error || "Could not sign.");
  }

  return (
    <div className="wl-root">
      <header className="wl-top">
        <a href="/" className="wl-brand" aria-label="IOT TECHS home"><Wordmark height={24} /></a>
        <div className="wl-top-right">
          <span className="wl-id mono">{app.app_id}</span>
          <a href={`/application/${app.app_id}`} className="wl-exit">My application</a>
        </div>
      </header>

      <main className="wl-main">
        <div className="wl-hero">
          <div className="wl-hero-tag">{app.position_label}</div>
          <h1>{locked ? `Almost there${first ? `, ${first}` : ""}.` : `Welcome to the team${first ? `, ${first}` : ""}.`}</h1>
          <p className="wl-sub">
            {locked
              ? "Your onboarding opens as soon as we've made you an offer. Nothing to do yet — we'll be in touch."
              : "Two things to finish before your first day. It takes about five minutes and saves as you go."}
          </p>
          {staff && <p className="wl-staffnote">Staff preview of the new-hire onboarding. Manage this in the <a href={`/onboarding/${app.app_id}`}>hiring portal</a>.</p>}
        </div>

        {!locked && (
          <div className="wl-prog">
            <div className={`wl-prog-step${detailsDone ? " done" : " on"}`}>
              <span className="wl-prog-dot">{detailsDone ? "✓" : "1"}</span>Your details
            </div>
            <div className={`wl-prog-step${signedCount === DOCS.length ? " done" : detailsDone ? " on" : ""}`}>
              <span className="wl-prog-dot">{signedCount === DOCS.length ? "✓" : "2"}</span>Agreements <span className="wl-prog-n">{signedCount}/{DOCS.length}</span>
            </div>
          </div>
        )}

        {allDone && (
          <div className="wl-done">
            <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
            <div>
              <b>You&rsquo;re all set.</b> Everything&rsquo;s in — we&rsquo;ll see you{app.start_date ? ` on ${app.start_date}` : " on your first day"}.
              Bring your ID and anything the office asked for.
            </div>
          </div>
        )}

        {/* 1 — Their details */}
        <section className={`wl-card${locked ? " wl-locked" : ""}`}>
          <div className="wl-card-h">
            <span className="wl-num">1</span>
            <h2>Your details</h2>
            {detailsDone && <span className="wl-chip done">Saved</span>}
          </div>

          <form onSubmit={saveDetails}>
            <fieldset disabled={locked || busy} className="wl-fs">
              {/* Scan first — it fills name, DOB, address and licence in one shot */}
              <DlScanner onScan={(d) => {
                setF((s) => ({
                  ...s,
                  legal_name:    d.legal_name    || s.legal_name,
                  dob:           d.dob           || s.dob,
                  address:       d.address       || s.address,
                  license_no:    d.license_no    || s.license_no,
                  license_state: d.license_state || s.license_state,
                  license_exp:   d.license_exp   || s.license_exp,
                }));
                setSaved(false);
              }} />

              <label className="wl-l" htmlFor="w-legal">Legal name (as on your ID)</label>
              <input id="w-legal" className="wl-in" value={f.legal_name} onChange={set("legal_name")} placeholder="Maria Santos" />

              <div className="wl-two">
                <div><label className="wl-l" htmlFor="w-dob">Date of birth</label>
                  <input id="w-dob" className="wl-in" type="date" value={f.dob} onChange={set("dob")} /></div>
                <div><label className="wl-l" htmlFor="w-addr">Home address</label>
                  <AddressAutocomplete id="w-addr" className="wl-in" value={f.address} placeholder="Start typing your address…"
                    onChange={(v) => { setF((s) => ({ ...s, address: v })); setSaved(false); }} /></div>
              </div>

              <div className="wl-sec">
                Emergency contact
                {app.emergency_verified
                  ? <span className="wl-vchip ok">✓ Verified by our office</span>
                  : <span className="wl-vchip">We&rsquo;ll call to confirm</span>}
              </div>
              <div className="wl-three">
                <div><label className="wl-l" htmlFor="w-en">Name</label>
                  <input id="w-en" className="wl-in" value={f.emergency_name} onChange={set("emergency_name")} placeholder="Full name" /></div>
                <div><label className="wl-l" htmlFor="w-ep">Phone</label>
                  <input id="w-ep" className="wl-in" value={f.emergency_phone} onChange={set("emergency_phone")} placeholder="(000) 000-0000" /></div>
                <div><label className="wl-l" htmlFor="w-er">Relationship</label>
                  <input id="w-er" className="wl-in" value={f.emergency_rel} onChange={set("emergency_rel")} placeholder="Spouse, parent…" /></div>
              </div>

              <div className="wl-sec">Driver&rsquo;s licence</div>
              <div className="wl-three">
                <div><label className="wl-l" htmlFor="w-ln">Licence number</label>
                  <input id="w-ln" className="wl-in" value={f.license_no} onChange={set("license_no")} /></div>
                <div><label className="wl-l" htmlFor="w-ls">State</label>
                  <input id="w-ls" className="wl-in" value={f.license_state} onChange={set("license_state")} placeholder="NJ" /></div>
                <div><label className="wl-l" htmlFor="w-le">Expires</label>
                  <input id="w-le" className="wl-in" type="date" value={f.license_exp} onChange={set("license_exp")} /></div>
              </div>

              <div className="wl-sec">Uniform &amp; gear sizes</div>
              <div className="wl-three">
                <div><label className="wl-l" htmlFor="w-sh">Shirt</label>
                  <input id="w-sh" className="wl-in" value={f.shirt} onChange={set("shirt")} placeholder="M / L / XL" /></div>
                <div><label className="wl-l" htmlFor="w-jk">Jacket</label>
                  <input id="w-jk" className="wl-in" value={f.jacket} onChange={set("jacket")} placeholder="M / L / XL" /></div>
                <div><label className="wl-l" htmlFor="w-bt">Boots</label>
                  <input id="w-bt" className="wl-in" value={f.boot} onChange={set("boot")} placeholder="10.5" /></div>
              </div>

              {err && <div className="wl-err">{err}</div>}
              <button className="wl-btn gold wl-save" type="submit">{busy ? "Saving…" : saved ? "Saved ✓" : detailsDone ? "Update my details" : "Save my details"}</button>
              <p className="wl-note">Payroll and direct deposit are handled on paper with the office — we never ask for bank details here.</p>
            </fieldset>
          </form>
        </section>

        {/* 2 — Agreements */}
        <section className={`wl-card${locked ? " wl-locked" : ""}`}>
          <div className="wl-card-h">
            <span className="wl-num">2</span>
            <h2>Agreements to sign</h2>
            <span className={`wl-chip${signedCount === DOCS.length ? " done" : ""}`}>{signedCount} of {DOCS.length}</span>
          </div>

          <div className="wl-docs">
            {DOCS.map((d) => {
              const sig = app.signed?.[d.key];
              const open = openDoc === d.key;
              return (
                <div className={`wl-doc${sig ? " signed" : ""}`} key={d.key}>
                  <button className="wl-doc-h" onClick={() => { if (locked) return; setOpenDoc(open ? null : d.key); setSigName(""); }} disabled={locked}>
                    <span className="wl-doc-box">{sig ? "✓" : ""}</span>
                    <span className="wl-doc-t">{d.title}</span>
                    {sig
                      ? <span className="wl-doc-by">Signed by {sig.name}</span>
                      : <span className="wl-doc-go">{open ? "Close" : "Read & sign"}</span>}
                  </button>
                  {open && !sig && (
                    <div className="wl-doc-b">
                      <p className="wl-doc-body">{d.body}</p>
                      <p className="wl-doc-lbl">Type your full name to sign — your typed name is your signature.</p>
                      <div className="wl-sign-row">
                        <input className="wl-in" placeholder="Full name" value={sigName} onChange={(e) => setSigName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && sign(d.key)} />
                        <button className="wl-btn gold" onClick={() => sign(d.key)} disabled={sigBusy || sigName.trim().length < 2}>{sigBusy ? "Signing…" : "Sign"}</button>
                      </div>
                      {sigName.trim().length >= 2 && <div className="wl-sig">{sigName}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <p className="wl-help">Questions? Call the office and mention <span className="mono">{app.app_id}</span>.</p>
      </main>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
.wl-root{--ink:#0e1320;--muted:#5b6275;--line:#e6e8ee;--gold:#C9A96E;--gold-deep:#b08f4f;--bg-soft:#f6f7f9;--green:#1c8a45;
  min-height:100vh;background:radial-gradient(1100px 480px at 50% -10%,#f0f2f7 0%,#fff 55%);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;line-height:1.55}
.wl-top{display:flex;align-items:center;justify-content:space-between;max-width:720px;margin:0 auto;padding:20px 20px 0}
.wl-brand{display:inline-flex}
.wl-top-right{display:flex;align-items:center;gap:14px}
.wl-id{font-size:.8rem;font-weight:800;color:var(--gold-deep);letter-spacing:.5px}
.wl-exit{color:var(--ink);text-decoration:none;font-size:.84rem;font-weight:700;border:1.5px solid var(--line);border-radius:10px;padding:8px 16px;background:#fff}
.wl-exit:hover{border-color:var(--gold);background:#fdfaf2}
.wl-main{max-width:720px;margin:0 auto;padding:18px 20px 60px}
.wl-hero{margin:8px 0 18px}
.wl-hero-tag{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--gold-deep)}
.wl-hero h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:1.85rem;margin:5px 0 6px}
.wl-sub{color:var(--muted);margin:0;max-width:60ch}
.wl-staffnote{margin:10px 0 0;font-size:.82rem;color:var(--muted);background:var(--bg-soft);border:1px solid var(--line);border-radius:9px;padding:8px 12px}
.wl-staffnote a{color:var(--gold-deep);font-weight:700}
.wl-prog{display:flex;gap:10px;margin:18px 0 14px;flex-wrap:wrap}
.wl-prog-step{display:flex;align-items:center;gap:8px;font-size:.84rem;font-weight:700;color:var(--muted);background:#fff;border:1.5px solid var(--line);border-radius:100px;padding:8px 16px}
.wl-prog-step.on{border-color:var(--gold);color:var(--ink)}
.wl-prog-step.done{border-color:var(--green);color:var(--green)}
.wl-prog-dot{width:20px;height:20px;border-radius:50%;background:var(--bg-soft);color:var(--muted);display:grid;place-items:center;font-size:.7rem;font-weight:800}
.wl-prog-step.on .wl-prog-dot{background:var(--gold);color:#fff}
.wl-prog-step.done .wl-prog-dot{background:var(--green);color:#fff}
.wl-prog-n{color:var(--muted);font-weight:600}
.wl-done{display:flex;align-items:center;gap:12px;background:#e7f6ec;border:1px solid #b9e3c8;color:#14652f;border-radius:14px;padding:14px 18px;margin-bottom:16px;font-size:.92rem}
.wl-done svg{width:24px;height:24px;flex-shrink:0;fill:none;stroke:var(--green);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.wl-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px 24px;margin-bottom:16px;box-shadow:0 18px 44px -34px rgba(14,19,32,.3)}
.wl-card.wl-locked{opacity:.55}
.wl-card-h{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.wl-card-h h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.15rem;margin:0}
.wl-num{width:26px;height:26px;border-radius:50%;background:#f8f0e0;color:var(--gold-deep);display:grid;place-items:center;font-size:.8rem;font-weight:800}
.wl-chip{margin-left:auto;font-size:.72rem;font-weight:800;color:var(--muted);background:var(--bg-soft);border-radius:20px;padding:3px 11px}
.wl-chip.done{color:var(--green);background:#e7f6ec}
.wl-fs{border:none;padding:0;margin:0}
.wl-l{display:block;font-size:.78rem;font-weight:700;color:var(--muted);margin:14px 0 6px}
.wl-in{width:100%;padding:11px 13px;border:1.5px solid var(--line);border-radius:11px;font-family:inherit;font-size:.94rem;background:var(--bg-soft);color:var(--ink)}
.wl-in:focus{outline:none;border-color:var(--gold);background:#fff}
.wl-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.wl-three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.wl-sec{margin:20px 0 0;padding-top:16px;border-top:1px solid var(--line);font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--gold-deep);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.wl-vchip{font-size:.68rem;font-weight:700;text-transform:none;letter-spacing:0;color:var(--muted);background:var(--bg-soft);border-radius:20px;padding:3px 10px}
.wl-vchip.ok{color:var(--green);background:#e7f6ec}
.wl-err{margin-top:14px;color:#c9382b;background:#fdecec;border:1px solid #f2c4c4;border-radius:10px;padding:10px 13px;font-size:.86rem;font-weight:600}
.wl-btn{display:inline-flex;align-items:center;justify-content:center;font-weight:700;border-radius:11px;cursor:pointer;border:none;font-size:.94rem;font-family:inherit;transition:transform .15s,background .2s}
.wl-btn.gold{background:var(--gold);color:var(--ink);padding:13px 24px}
.wl-btn.gold:hover:not(:disabled){transform:translateY(-1px);background:var(--gold-deep);color:#fff}
.wl-btn:disabled{opacity:.55;cursor:default;transform:none}
.wl-save{width:100%;margin-top:20px}
.wl-note{text-align:center;color:var(--muted);font-size:.78rem;margin:10px 0 0}
.wl-docs{display:flex;flex-direction:column;gap:10px}
.wl-doc{border:1.5px solid var(--line);border-radius:13px;overflow:hidden}
.wl-doc.signed{border-color:#b9e3c8;background:#f7fcf9}
.wl-doc-h{width:100%;display:flex;align-items:center;gap:11px;padding:14px 16px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;color:var(--ink)}
.wl-doc-h:disabled{cursor:default}
.wl-doc-box{width:22px;height:22px;flex-shrink:0;border-radius:6px;border:1.5px solid var(--line);display:grid;place-items:center;font-size:.74rem;font-weight:800;color:#fff}
.wl-doc.signed .wl-doc-box{background:var(--green);border-color:var(--green)}
.wl-doc-t{font-weight:700;font-size:.95rem}
.wl-doc-by{margin-left:auto;font-size:.78rem;color:var(--green);font-weight:600}
.wl-doc-go{margin-left:auto;font-size:.8rem;color:var(--gold-deep);font-weight:800}
.wl-doc-b{padding:0 16px 16px;border-top:1px solid var(--line)}
.wl-doc-body{font-size:.9rem;color:var(--muted);margin:14px 0}
.wl-doc-lbl{font-size:.82rem;color:var(--muted);margin:0 0 10px}
.wl-sign-row{display:flex;gap:8px}
.wl-sign-row .wl-in{flex:1}
.wl-sig{margin-top:10px;font-family:'Brush Script MT','Segoe Script',cursive;font-size:1.6rem;border-bottom:1px solid var(--line);padding:2px 6px 6px;display:inline-block;min-width:180px}
.wl-help{text-align:center;color:var(--muted);font-size:.84rem;margin:8px 0 0}
.mono{font-family:Menlo,Consolas,monospace;letter-spacing:.5px;font-weight:700}
@media(max-width:600px){.wl-two,.wl-three{grid-template-columns:1fr}.wl-hero h1{font-size:1.5rem}}
`;
