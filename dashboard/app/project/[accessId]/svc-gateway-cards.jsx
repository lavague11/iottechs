"use client";

// Service-call tool cards for the project gateway (companion type-C projects). Interiors only —
// gateway-client wraps them in <FlowStep> so they inherit the canonical tool-card language.
// Diagnostic: the customer's 60-second TRACE check runs right here and logs to the call.
// Invoice: customer views + approves & signs; staff see a summary and manage in the SVC builder.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SVC_DIAG_ENTRIES, SVC_DIAG_NODES, SVC_ROUTE_LABEL } from "../../../lib/svc-diagnostic";
import { saveCustomerDiagnosticAction, signSvcInvoiceAction } from "../../service-call/[svcId]/actions";
import SvcCamMap from "../../components/svc-cam-map";

function fmt(t) { return t ? String(t).replace("T", " ").slice(0, 16) : ""; }

/* ================= Diagnostic ================= */
export function SvcDiagnosticPanel({ svcCall, view, preview = false }) {
  const router = useRouter();
  const isCust = view === "customer";
  const [open, setOpen] = useState(false);
  const [node, setNode] = useState(null);
  const [entryTitle, setEntryTitle] = useState("");
  const [path, setPath] = useState([]);
  const [started, setStarted] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const cur = node ? SVC_DIAG_NODES[node] : null;
  const isFix = cur && cur.type === "fix";

  // Camera identify — when the project's survey names the cameras, the customer points at the
  // one that's down FIRST. Their pick is logged as the opening step of the diagnostic record.
  const cameras = svcCall.cameras || [];
  const [camPick, setCamPick] = useState(null);   // null = not asked/answered yet
  const askCam = cameras.length > 0 && camPick === null;

  function start() { setOpen(true); setNode(null); setPath([]); setEntryTitle(""); setSaved(false); setCamPick(null); }
  function pickCam(label) {
    setCamPick(label);
    setPath([{ question: "Which camera is the problem?", answer: label }]);
  }
  function pickEntry(en) {
    setEntryTitle(en.title); setNode(en.start); setStarted(new Date().toISOString());
    setPath((p) => p.filter((s) => s.question === "Which camera is the problem?"));
  }
  function answer(q, opt) { setPath((p) => [...p, { question: q, answer: opt.label }]); setNode(opt.next); }
  function restart() { setNode(null); setPath([]); setEntryTitle(""); setSaved(false); setCamPick(null); }

  async function send() {
    if (!isFix || preview) return;
    setSaving(true);
    const rec = { issue: entryTitle, steps: path, outcome: { route: cur.route, title: cur.title, action: cur.detail }, started, completed: new Date().toISOString() };
    const r = await saveCustomerDiagnosticAction(svcCall.svc_id, rec);
    setSaving(false);
    if (r?.ok) { setSaved(true); router.refresh(); }
  }

  return (
    <div className="svg-diag">
      {/* Past checks */}
      {svcCall.diagnostics.length > 0 && (
        <div className="svg-runs">
          {svcCall.diagnostics.map((d) => (
            <div className="svg-run" key={d.id}>
              <span className={`svg-mode svg-mode-${d.mode}`}>{d.mode === "tech" ? "Tech" : "Customer"}</span>
              <span className="svg-run-t">{d.outcome?.title || d.issue || "Diagnostic"}</span>
              <span className="svg-run-when">{fmt(d.completed || d.created_at)}</span>
            </div>
          ))}
        </div>
      )}
      {svcCall.diagnostics.length === 0 && <p className="svg-empty">No checks run yet.</p>}

      <div className="svg-acts">
        {isCust && <button className="svg-btn gold" onClick={start}>Start check</button>}
        {!isCust && ["admin", "manager", "tech"].includes(view) && (
          <a className="svg-btn ghost" href={`/service-calls/${svcCall.svc_id}`}>Run tech check</a>
        )}
      </div>

      {/* 60-second check modal */}
      {open && (
        <div className="svg-ov" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="svg-modal">
            <button className="svg-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            {!node && askCam ? (
              <>
                <div className="svg-tag">Quick check</div>
                <h3>Which camera is the problem?</h3>
                <p className="svg-sub">This is your floor plan from our install — tap the camera acting up.</p>
                <SvcCamMap cameras={cameras} floors={svcCall.camFloors || []} onPick={pickCam} />
                <div className="svg-cams">
                  {cameras.map((c) => (
                    <button className="svg-cam" key={c.label} onClick={() => pickCam(c.label)}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      {c.label}
                    </button>
                  ))}
                </div>
                <button className="svg-pick" onClick={() => pickCam("Not sure / more than one")}>
                  <span className="svg-pick-t">Not sure / more than one</span>
                  <span className="svg-pick-h">That&rsquo;s fine — we&rsquo;ll figure it out together</span>
                </button>
              </>
            ) : !node ? (
              <>
                <div className="svg-tag">Quick check</div>
                <h3>Where are you not seeing the cameras?</h3>
                <p className="svg-sub">Pick what matches — one step at a time.</p>
                {SVC_DIAG_ENTRIES.map((en) => (
                  <button className="svg-pick" key={en.start} onClick={() => pickEntry(en)}>
                    <span className="svg-pick-t">{en.title}</span>
                    <span className="svg-pick-h">{en.hint}</span>
                  </button>
                ))}
              </>
            ) : isFix ? (
              <>
                <div className={`svg-route svg-route-${cur.route}`}>{SVC_ROUTE_LABEL[cur.route] || "Done"}</div>
                <h3>{cur.title}</h3>
                <p className="svg-sub">{cur.detail}</p>
                {saved ? (
                  <div className="svg-saved">
                    <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
                    Sent to our team — it&rsquo;s on your service call.
                    <button className="svg-btn ghost" onClick={() => setOpen(false)}>Done</button>
                  </div>
                ) : (
                  <div className="svg-outacts">
                    <button className="svg-btn gold" onClick={send} disabled={saving || preview} title={preview ? "Preview — the customer sends this" : undefined}>
                      {saving ? "Sending…" : cur.route === "service" ? "Send to our team" : "Save this check"}
                    </button>
                    <button className="svg-btn ghost" onClick={restart}>Start over</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="svg-step">{entryTitle} · step {path.length + 1}</div>
                <h3>{cur.q}</h3>
                {cur.widget === "speed" && <div className="svg-hint">Tip: try loading a website on your phone over the same Wi-Fi to check.</div>}
                <div className="svg-opts">
                  {cur.options.map((o, i) => (
                    <button key={i} className={`svg-opt${i === cur.options.length - 1 ? " last" : ""}`} onClick={() => answer(cur.q, o)}>{o.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <style>{CSS}</style>
    </div>
  );
}

/* ================= Invoice ================= */
export function SvcInvoicePanel({ svcCall, view, preview = false }) {
  const router = useRouter();
  const isCust = view === "customer";
  const inv = svcCall.invoice;
  const payments = svcCall.payments || [];
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!inv) {
    // Staff with no invoice yet — one clear next action.
    return (
      <div className="svg-inv">
        <p className="svg-empty">No invoice yet.</p>
        {["admin", "manager"].includes(view) && <a className="svg-btn gold" href={`/service-calls/${svcCall.svc_id}`}>Build invoice</a>}
        <style>{CSS}</style>
      </div>
    );
  }

  const paid = payments.reduce((s, p) => s + (+p.amount || 0), 0);
  const balance = Math.max(0, Math.round((inv.total - paid) * 100) / 100);
  const isPaid = paid > 0 && balance <= 0;

  async function sign() {
    if (name.trim().length < 2 || busy || preview) return;
    setBusy(true); setErr("");
    const r = await signSvcInvoiceAction(svcCall.svc_id, name.trim());
    setBusy(false);
    if (r?.ok) router.refresh();
    else setErr(r?.error || "Could not sign.");
  }

  return (
    <div className="svg-inv">
      {inv.items.map((it, i) => (
        <div className="svg-line" key={i}>
          <span>{it.desc}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
          <span className="svg-amt">${(it.qty * it.price).toFixed(2)}</span>
        </div>
      ))}
      <div className="svg-total"><span>Total</span><b>${inv.total.toFixed(2)}</b></div>
      {payments.map((p) => (
        <div className="svg-pay" key={p.id}><span>Payment · {p.method || "received"} · {p.paid_at}</span><span>−${(+p.amount).toFixed(2)}</span></div>
      ))}
      {payments.length > 0 && <div className="svg-bal"><span>Balance</span><b className={balance <= 0 ? "ok" : ""}>${balance.toFixed(2)}</b></div>}

      {inv.signed_name ? (
        <div className="svg-signed">
          <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
          Approved by <b>{inv.signed_name}</b> · {fmt(inv.signed_at)}{isPaid ? " · Paid" : ""}
        </div>
      ) : isCust ? (
        <div className="svg-sign">
          <p className="svg-sub">Type your full name to approve this invoice — your typed name is your signature.</p>
          <div className="svg-sign-row">
            <input className="svg-in" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sign()} />
            <button className="svg-btn gold" onClick={sign} disabled={busy || name.trim().length < 2 || preview} title={preview ? "Preview — the customer signs" : undefined}>{busy ? "Signing…" : "Approve"}</button>
          </div>
          {name.trim().length >= 2 && <div className="svg-sig">{name}</div>}
          {err && <div className="svg-err">{err}</div>}
        </div>
      ) : (
        <p className="svg-empty">Awaiting the customer&rsquo;s approval.</p>
      )}
      {["admin", "manager"].includes(view) && <a className="svg-manage" href={`/service-calls/${svcCall.svc_id}`}>Manage billing →</a>}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.pvx .svg-diag,.pvx .svg-inv{display:flex;flex-direction:column;gap:10px}
.pvx .svg-empty{color:var(--muted);font-size:var(--fs-md);margin:0}
.pvx .svg-runs{display:flex;flex-direction:column}
.pvx .svg-run{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:var(--fs-md)}
.pvx .svg-run:last-child{border-bottom:none}
.pvx .svg-mode{font-size:var(--fs-xs);font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:var(--r-pill)}
.pvx .svg-mode-customer{color:var(--accent);background:var(--accent-soft)}
.pvx .svg-mode-tech{color:var(--green);background:var(--green-soft)}
.pvx .svg-run-t{flex:1;font-weight:700}
.pvx .svg-run-when{color:var(--muted);font-size:var(--fs-sm)}
.pvx .svg-acts{display:flex;gap:8px}
.pvx .svg-btn{display:inline-flex;align-items:center;justify-content:center;font-weight:700;border-radius:10px;cursor:pointer;font-family:inherit;font-size:var(--fs-md);text-decoration:none;transition:transform .12s,background .15s}
.pvx .svg-btn.gold{background:var(--gold);color:var(--ink);border:none;padding:10px 20px}
.pvx .svg-btn.gold:hover{background:var(--gold-deep);color:#fff}
.pvx .svg-btn.gold:disabled{opacity:.55;cursor:default}
.pvx .svg-btn.ghost{background:var(--bg);color:var(--ink);border:1.5px solid var(--line);padding:9px 18px}
.pvx .svg-btn.ghost:hover{border-color:var(--gold)}
/* modal */
.pvx .svg-ov{position:fixed;inset:0;background:rgba(11,15,26,.5);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:80}
.pvx .svg-modal{width:100%;max-width:440px;background:var(--bg);border-radius:18px;padding:26px 24px;position:relative;box-shadow:var(--shadow-modal);max-height:88vh;overflow-y:auto}
.pvx .svg-x{position:absolute;top:12px;right:14px;background:none;border:none;font-size:1rem;color:var(--muted);cursor:pointer;width:30px;height:30px;border-radius:8px}
.pvx .svg-x:hover{background:var(--bg-soft);color:var(--ink)}
.pvx .svg-tag{display:inline-block;font-size:var(--fs-xs);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep);background:#f8f0e0;padding:4px 11px;border-radius:var(--r-pill);margin-bottom:10px}
.pvx .svg-modal h3{font-family:var(--font-title);font-weight:800;font-size:1.2rem;margin:0 0 8px;line-height:1.25}
.pvx .svg-sub{color:var(--muted);font-size:var(--fs-lg);margin:0 0 14px}
.pvx .svg-pick{width:100%;display:flex;flex-direction:column;gap:2px;text-align:left;padding:13px 15px;border:1.5px solid var(--line);border-radius:12px;background:var(--bg);cursor:pointer;font-family:inherit;margin-bottom:9px;transition:border-color .12s,background .12s}
.pvx .svg-pick:hover{border-color:var(--gold);background:#fdfaf2}
.pvx .svg-pick-t{font-weight:800;font-size:.95rem}
.pvx .svg-pick-h{font-size:var(--fs-sm);color:var(--muted)}
.pvx .svg-cams{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.pvx .svg-cam{display:inline-flex;align-items:center;gap:7px;padding:10px 15px;border:1.5px solid var(--line);border-radius:var(--r-pill);background:var(--bg);cursor:pointer;font-family:inherit;font-size:var(--fs-md);font-weight:700;color:var(--ink);transition:border-color .12s,background .12s}
.pvx .svg-cam:hover{border-color:var(--gold);background:#fdfaf2}
.pvx .svg-cam svg{color:var(--gold-deep)}
.pvx .svg-step{font-size:var(--fs-xs);font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px}
.pvx .svg-hint{background:var(--accent-soft);color:#2540c0;border-radius:10px;padding:8px 12px;font-size:var(--fs-sm);margin:0 0 12px;font-weight:600}
.pvx .svg-opts{display:flex;flex-direction:column;gap:9px;margin-top:12px}
.pvx .svg-opt{width:100%;text-align:left;padding:13px 15px;border:1.5px solid var(--line);border-radius:12px;background:var(--bg);cursor:pointer;font-family:inherit;font-size:.94rem;font-weight:600;transition:border-color .12s,background .12s}
.pvx .svg-opt:hover{border-color:var(--gold);background:#fdfaf2}
.pvx .svg-opt.last{border-style:dashed}
.pvx .svg-route{display:inline-block;font-size:var(--fs-xs);font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:4px 12px;border-radius:var(--r-pill);margin-bottom:10px}
.pvx .svg-route-solved{color:var(--green);background:var(--green-soft)}
.pvx .svg-route-service{color:var(--amber);background:var(--amber-soft)}
.pvx .svg-outacts{display:flex;flex-direction:column;gap:9px}
.pvx .svg-saved{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;color:var(--green);font-weight:700;font-size:var(--fs-lg)}
.pvx .svg-saved svg{width:30px;height:30px;fill:none;stroke:var(--green);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;background:var(--green-soft);border-radius:50%;padding:5px;box-sizing:content-box}
/* invoice */
.pvx .svg-line{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font-size:var(--fs-lg);font-weight:600}
.pvx .svg-amt{font-variant-numeric:tabular-nums}
.pvx .svg-total{display:flex;justify-content:space-between;align-items:center;padding:8px 0 2px;color:var(--muted);font-size:var(--fs-lg)}
.pvx .svg-total b{font-size:1.25rem;color:var(--ink);font-variant-numeric:tabular-nums}
.pvx .svg-pay{display:flex;justify-content:space-between;font-size:var(--fs-sm);color:var(--muted);padding:3px 0}
.pvx .svg-bal{display:flex;justify-content:space-between;align-items:center;padding:7px 0 0;border-top:1px dashed var(--line);color:var(--muted);font-size:var(--fs-lg)}
.pvx .svg-bal b{color:var(--ink);font-variant-numeric:tabular-nums}
.pvx .svg-bal b.ok{color:var(--green)}
.pvx .svg-signed{display:flex;align-items:center;gap:8px;color:var(--green);font-weight:600;font-size:var(--fs-lg)}
.pvx .svg-signed svg{width:18px;height:18px;fill:none;stroke:var(--green);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.pvx .svg-sign-row{display:flex;gap:8px}
.pvx .svg-in{flex:1;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px;font-family:inherit;font-size:.94rem;background:var(--bg-soft)}
.pvx .svg-in:focus{outline:none;border-color:var(--gold);background:var(--bg)}
.pvx .svg-sig{margin-top:8px;font-family:'Brush Script MT','Segoe Script',cursive;font-size:1.5rem;border-bottom:1px solid var(--line);padding:2px 6px 5px;display:inline-block;min-width:170px}
.pvx .svg-err{color:var(--red);background:var(--red-soft);border-radius:9px;padding:8px 12px;font-size:var(--fs-sm);font-weight:600}
.pvx .svg-manage{color:var(--gold-deep);font-weight:700;font-size:var(--fs-md);text-decoration:none}
.pvx .svg-manage:hover{text-decoration:underline}
`;
