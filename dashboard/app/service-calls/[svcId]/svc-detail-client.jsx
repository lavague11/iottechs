"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../../components/admin-shell";
import { setSvcStageAction, addSvcNoteAction, assignSvcTechAction, runStaffDiagnosticAction, saveSvcInvoiceAction, sendSvcInvoiceAction, voidSvcInvoiceAction, recordSvcPaymentAction } from "../actions";
import { SVC_TECH_ENTRIES, SVC_TECH_TREES, SVC_ROUTE_LABEL } from "../../../lib/svc-diagnostic";

// Three steps, same as the customer tracker — the 8 internal stage keys stay in the DB, rolled
// up here. Clicking a step sets its representative stage.
const STEPS = [
  { key: "submitted", label: "Submitted", stages: ["submitted"], set: "submitted" },
  { key: "diagnosed", label: "Diagnosed", stages: ["diagnosing", "quoted", "scheduled", "onsite", "billed"], set: "diagnosing" },
  { key: "solved", label: "Solved", stages: ["resolved", "closed"], set: "resolved" },
];
const CATEGORY = { camera: "Camera", dropout: "Cutting out", nvr: "Recorder", other: "Other" };
const ROUTE = {
  solved: ["Resolved", "#1c8a45"], service: ["Book a service call", "#b3541e"],
  field: ["Field fix", "#2f5fbf"], replace: ["Replace hardware", "#b3541e"], escalate: ["Escalate", "#c9382b"],
};
const EVENT_ICON = { submitted: "📋", diagnostic: "🔎", note: "✎", stage: "→", assign: "👤", quote: "$", payment: "$", resolved: "✓", closed: "✓" };
function fmt(t) { return t ? String(t).replace("T", " ").slice(0, 16) : "—"; }
function initials(name) { return (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }

export default function SvcDetailClient({ user, alerts, call, events = [], diagnostics = [], techs = [], invoice = null, payments = [], rates = [] }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [note, setNote] = useState("");
  const canManage = ["admin", "manager"].includes(user.role);
  const stageIdx = Math.max(0, STEPS.findIndex((s) => s.stages.includes(call.stage)));
  const priHot = ["urgent", "high"].includes(call.priority);

  function setStage(stage) { startTx(async () => { const r = await setSvcStageAction(call.svc_id, stage); if (r?.ok) router.refresh(); }); }
  function assign(id, name) { startTx(async () => { const r = await assignSvcTechAction(call.svc_id, id, name); if (r?.ok) router.refresh(); }); }
  function saveNote() { if (!note.trim()) return; startTx(async () => { const r = await addSvcNoteAction(call.svc_id, note); if (r?.ok) { setNote(""); router.refresh(); } }); }

  // ---- Staff TRACE diagnostic runner (tech trees; same concept as the customer's 60-second check) ----
  const [runOpen, setRunOpen] = useState(false);
  const [trail, setTrail] = useState([]);       // [{tree, node, question, answer|null}] — last is current
  const [dTitle, setDTitle] = useState("");
  const [dStarted, setDStarted] = useState(null);
  const [dSaved, setDSaved] = useState(false);
  const [dSaving, setDSaving] = useState(false);

  const cur = trail.length ? trail[trail.length - 1] : null;
  const curNode = cur ? SVC_TECH_TREES[cur.tree].nodes[cur.node] : null;
  const curIsFix = curNode && curNode.type === "fix";

  function openRun() { setRunOpen(true); setTrail([]); setDTitle(""); setDSaved(false); }
  function pickTree(entry) {
    const tree = SVC_TECH_TREES[entry.key];
    const nodeId = entry.start || tree.root;
    const n = tree.nodes[nodeId];
    setDTitle(entry.title); setDStarted(new Date().toISOString());
    setTrail([{ tree: entry.key, node: nodeId, question: n.q || n.title, answer: null }]);
  }
  function answer(opt) {
    const t = trail.slice(); t[t.length - 1] = { ...t[t.length - 1], answer: opt.label };
    const n = SVC_TECH_TREES[cur.tree].nodes[opt.next];
    t.push({ tree: cur.tree, node: opt.next, question: n.q || n.title, answer: null });
    setTrail(t);
  }
  function jump(g) {
    const t = trail.slice(); t[t.length - 1] = { ...t[t.length - 1], answer: `Continue → ${g.tree} check` };
    const n = SVC_TECH_TREES[g.tree].nodes[g.node];
    t.push({ tree: g.tree, node: g.node, question: n.q || n.title, answer: null });
    setTrail(t);
  }
  function runBack() { if (trail.length > 1) { const t = trail.slice(0, -1); t[t.length - 1] = { ...t[t.length - 1], answer: null }; setTrail(t); } }
  function saveRun() {
    if (!curIsFix) return;
    setDSaving(true);
    const steps = trail.filter((s) => s.answer !== null).map((s) => ({ question: s.question, answer: s.answer }));
    const rec = { issue: dTitle, steps, outcome: { route: curNode.route, title: curNode.title, action: curNode.detail }, started: dStarted, completed: new Date().toISOString() };
    startTx(async () => {
      const r = await runStaffDiagnosticAction(call.svc_id, rec);
      setDSaving(false);
      if (r?.ok) { setDSaved(true); router.refresh(); }
    });
  }

  // ---- Billing (admin/manager only — the server never ships the invoice to a tech) ----
  // Smart default: every service call starts at Diagnostic + Roll out (the owner's rate card).
  const DEFAULT_ROWS = [{ desc: "Diagnostic", qty: 1, price: 150 }, { desc: "Roll out", qty: 1, price: 50 }];
  const [rows, setRows] = useState(() => (invoice?.items?.length ? invoice.items : DEFAULT_ROWS));
  const [invNotes, setInvNotes] = useState(invoice?.notes || "");
  const [voidArm, setVoidArm] = useState(false);
  const invLocked = !!invoice?.signed_name;
  const total = rows.reduce((s, r) => s + Math.max(0, +r.qty || 0) * Math.max(0, +r.price || 0), 0);
  const paidTotal = payments.reduce((s, p) => s + (+p.amount || 0), 0);
  const balance = Math.round(((invoice?.total ?? total) - paidTotal) * 100) / 100;
  const [payAmt, setPayAmt] = useState("");
  const [payMethod, setPayMethod] = useState("Card");

  function setRow(i, k, v) { const r = rows.slice(); r[i] = { ...r[i], [k]: v }; setRows(r); }
  function addRow() { setRows([...rows, { desc: "", qty: 1, price: 0 }]); }
  // Rate-card chip: bump qty if the line is already on the invoice, otherwise add it.
  function addRate(rate) {
    const i = rows.findIndex((r) => r.desc === rate.desc && +r.price === +rate.price);
    if (i >= 0) { setRow(i, "qty", (+rows[i].qty || 0) + 1); return; }
    setRows([...rows, { desc: rate.desc, qty: 1, price: rate.price }]);
  }
  function delRow(i) { setRows(rows.filter((_, n) => n !== i)); }
  function saveInv() { startTx(async () => { const r = await saveSvcInvoiceAction(call.svc_id, rows, invNotes); if (r?.ok) { setRows(r.invoice.items); router.refresh(); } }); }
  function sendInv() {
    startTx(async () => {
      const s = await saveSvcInvoiceAction(call.svc_id, rows, invNotes);
      if (!s?.ok) return;
      const r = await sendSvcInvoiceAction(call.svc_id);
      if (r?.ok) router.refresh();
    });
  }
  function voidInv() {
    if (!voidArm) { setVoidArm(true); setTimeout(() => setVoidArm(false), 4000); return; }
    setVoidArm(false);
    startTx(async () => { const r = await voidSvcInvoiceAction(call.svc_id); if (r?.ok) { setRows(DEFAULT_ROWS); setInvNotes(""); router.refresh(); } });
  }
  function recPay() {
    const amt = +payAmt || 0;
    if (amt <= 0) return;
    startTx(async () => { const r = await recordSvcPaymentAction(call.svc_id, amt, payMethod); if (r?.ok) { setPayAmt(""); router.refresh(); } });
  }

  return (
    <AdminShell user={user} alerts={alerts} active="service-calls">
      <div className="apx-wrap svc-detail">
        <Link href="/service-calls" className="svc-back">← Service Calls</Link>

        {/* Hero */}
        <div className="svc-hero">
          <div>
            <div className="svc-hero-id mono">{call.svc_id}</div>
            <h1>{call.customer || "—"}</h1>
            <p className="svc-hero-issue">{call.issue || "No issue described."}</p>
          </div>
          <div className="svc-hero-chips">
            <span className={`svc-pri ${priHot ? call.priority : "low"}`}>{call.priority}</span>
            <span className="svc-cat">{CATEGORY[call.category] || call.category}</span>
            {call.outcome_route && ROUTE[call.outcome_route] && (
              <span className="svc-route" style={{ color: ROUTE[call.outcome_route][1], borderColor: ROUTE[call.outcome_route][1] + "55" }}>{ROUTE[call.outcome_route][0]}</span>
            )}
            {call.svc_project_id && <Link href={`/project/${call.svc_project_id}`} className="svc-proj-btn">Open project</Link>}
          </div>
        </div>

        {/* Stage strip */}
        <div className="panel svc-stagebar">
          {STEPS.map((s, n) => (
            <button key={s.key} className={`svc-stage${n < stageIdx ? " done" : ""}${n === stageIdx ? " on" : ""}`}
              disabled={!canManage || pending} onClick={() => canManage && setStage(s.set)} title={canManage ? `Set ${s.label}` : s.label}>
              <span className="svc-stage-dot" />
              <span className="svc-stage-lbl">{s.label}</span>
            </button>
          ))}
        </div>

        <div className="svc-grid">
          {/* Details */}
          <div className="panel svc-card">
            <div className="svc-card-h">Details</div>
            <dl className="svc-dl">
              <dt>Contact</dt><dd>{call.contact_name || "—"}</dd>
              <dt>Phone</dt><dd>{call.contact_phone ? <a href={`tel:${call.contact_phone}`}>{call.contact_phone}</a> : "—"}</dd>
              <dt>Email</dt><dd>{call.contact_email ? <a href={`mailto:${call.contact_email}`}>{call.contact_email}</a> : "—"}</dd>
              <dt>Address</dt><dd>{call.address ? <a href={`https://maps.google.com/?q=${encodeURIComponent(call.address)}`} target="_blank" rel="noopener noreferrer">{call.address}</a> : "—"}</dd>
              <dt>System</dt><dd>{call.project_access_id ? <Link href={`/project/${call.project_access_id}`} className="mono">{call.project_access_id}</Link> : "—"}</dd>
              <dt>Opened</dt><dd>{fmt(call.created_at)}</dd>
              <dt>Tech</dt>
              <dd>
                {canManage ? (
                  <select className="apx-input svc-assign" value={call.assignee_id || ""} disabled={pending}
                    onChange={(e) => { const t = techs.find((x) => String(x.id) === e.target.value); assign(t?.id || null, t?.name || null); }}>
                    <option value="">Unassigned</option>
                    {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (call.assignee_name || "Unassigned")}
              </dd>
            </dl>
          </div>

          {/* Diagnostics */}
          <div className="panel svc-card">
            <div className="svc-card-h">Diagnostic reports <span className="svc-count">{diagnostics.length}</span>
              <button className="svc-run-btn" onClick={openRun}>Run a check</button>
            </div>
            {diagnostics.length === 0 ? (
              <div className="svc-empty">No diagnostic run yet.</div>
            ) : diagnostics.map((d) => (
              <details className="svc-diag" key={d.id}>
                <summary>
                  <span className={`svc-mode svc-mode-${d.mode}`}>{d.mode === "tech" ? "Tech" : "Customer"}</span>
                  <span className="svc-diag-title">{d.outcome?.title || d.outcome?.route || "Diagnostic"}</span>
                  <span className="svc-diag-when">{fmt(d.completed || d.created_at)}</span>
                </summary>
                <div className="svc-diag-body">
                  {d.outcome?.action && <p className="svc-diag-action">{d.outcome.action}</p>}
                  <ol className="svc-steps">
                    {(d.steps || []).map((s, i) => (
                      <li key={i}><span className="svc-q">{s.question}</span><span className="svc-a">{s.answer}</span></li>
                    ))}
                  </ol>
                  {d.speed_test && <div className="svc-speed">Speed: {d.speed_test.down}↓ / {d.speed_test.up}↑ Mbps · {d.speed_test.ping}ms</div>}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Billing — admin/manager only. Invoice lifecycle: draft → sent → signed; void to re-bill. */}
        {canManage && (
          <div className="panel svc-card svc-bill">
            <div className="svc-card-h">Billing
              {invoice && (
                <span className={`svc-inv-st svc-inv-${invLocked ? "signed" : invoice.status}`}>
                  {balance <= 0 && paidTotal > 0 ? "Paid" : invLocked ? "Signed" : invoice.status === "sent" ? "Sent" : "Draft"}
                </span>
              )}
              {invoice && <button className="svc-void-btn" onClick={voidInv} disabled={pending}>{voidArm ? "Confirm?" : "Void"}</button>}
            </div>

            {/* Rate card — one tap adds the line (tap again to bump qty) */}
            {!invLocked && rates.length > 0 && (
              <div className="svc-rate-row">
                {rates.map((r) => (
                  <button className="svc-rate" key={r.desc} onClick={() => addRate(r)} title={`$${r.price}`}>
                    {r.desc} <span>${r.price}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Line items */}
            <div className="svc-inv-rows">
              {(invLocked ? invoice.items : rows).map((r, i) => (
                <div className="svc-inv-row" key={i}>
                  {invLocked ? (
                    <>
                      <span className="svc-inv-desc">{r.desc}</span>
                      <span className="svc-inv-qty">×{r.qty}</span>
                      <span className="svc-inv-price">${(r.qty * r.price).toFixed(2)}</span>
                    </>
                  ) : (
                    <>
                      <input className="apx-input svc-inv-in-desc" placeholder="Description" value={r.desc} onChange={(e) => setRow(i, "desc", e.target.value)} />
                      <input className="apx-input svc-inv-in-qty" type="number" min="0" value={r.qty} onChange={(e) => setRow(i, "qty", e.target.value)} />
                      <input className="apx-input svc-inv-in-price" type="number" min="0" step="0.01" value={r.price} onChange={(e) => setRow(i, "price", e.target.value)} />
                      <button className="svc-inv-del" onClick={() => delRow(i)} aria-label="Remove">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
              {!invLocked && <button className="svc-inv-add" onClick={addRow}>+ Add</button>}
            </div>

            <div className="svc-inv-total"><span>Total</span><b>${(invLocked ? invoice.total : total).toFixed(2)}</b></div>
            {invLocked && <div className="svc-inv-signedby">Signed by <b>{invoice.signed_name}</b> · {fmt(invoice.signed_at)}</div>}

            {!invLocked && (
              <div className="svc-inv-actions">
                <button className="svc-inv-btn ghost" onClick={saveInv} disabled={pending}>Save</button>
                <button className="svc-inv-btn gold" onClick={sendInv} disabled={pending || !rows.some((r) => String(r.desc).trim())}>{invoice?.status === "sent" ? "Resend" : "Send"}</button>
              </div>
            )}

            {/* Payments — render only once the invoice exists */}
            {invoice && (
              <div className="svc-pay">
                {payments.map((p) => (
                  <div className="svc-pay-row" key={p.id}>
                    <span className="svc-pay-amt">${(+p.amount).toFixed(2)}</span>
                    <span className="svc-pay-meta">{p.method || "—"} · {p.paid_at}{p.recorded_by ? ` · ${p.recorded_by}` : ""}</span>
                  </div>
                ))}
                <div className="svc-pay-bal"><span>Balance</span><b className={balance <= 0 ? "ok" : ""}>${Math.max(0, balance).toFixed(2)}</b></div>
                {balance > 0 && (
                  <div className="svc-pay-form">
                    <input className="apx-input svc-pay-in" type="number" min="0" step="0.01" placeholder={balance.toFixed(2)} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
                    <select className="apx-input svc-pay-sel" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                      {["Card", "Cash", "Check", "Zelle", "Other"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                    <button className="svc-inv-btn gold" onClick={recPay} disabled={pending || !(+payAmt > 0)}>Record</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Timeline — the append-only log */}
        <div className="panel svc-card">
          <div className="svc-card-h">Timeline</div>
          <ul className="svc-timeline">
            {events.map((e) => (
              <li key={e.id}>
                <span className="svc-tl-dot">{EVENT_ICON[e.kind] || "•"}</span>
                <div className="svc-tl-body">
                  <div className="svc-tl-detail">{e.detail || e.kind}</div>
                  <div className="svc-tl-meta">{fmt(e.at)}{e.actor_name ? ` · ${e.actor_name}` : ""}{e.actor_role ? ` (${e.actor_role})` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="svc-note-row">
            <input className="apx-input" placeholder="Add a note to the timeline…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveNote()} />
            <button className="svc-note-btn" onClick={saveNote} disabled={pending || !note.trim()}>Add</button>
          </div>
        </div>
      </div>

      {/* Staff TRACE diagnostic runner */}
      {runOpen && (
        <div className="svc-ov" onClick={(e) => { if (e.target === e.currentTarget) setRunOpen(false); }}>
          <div className="svc-run">
            <button className="svc-run-x" onClick={() => setRunOpen(false)} aria-label="Close">✕</button>
            {!cur ? (
              <div className="svc-run-pick">
                <div className="svc-run-tag">Technician check · TRACE</div>
                <h2>What's the fault?</h2>
                <p className="svc-run-sub">Full diagnostic — channel status, playback, cable tester, resets. Every step is logged to this call.</p>
                {SVC_TECH_ENTRIES.map((en, i) => (
                  <button className="svc-run-entry" key={i} onClick={() => pickTree(en)}>
                    <span className="svc-run-entry-t">{en.title}</span>
                    <span className="svc-run-entry-h">{en.hint}</span>
                  </button>
                ))}
              </div>
            ) : curIsFix ? (
              <div className="svc-run-out">
                <span className="svc-run-badge" style={{ color: (ROUTE[curNode.route] || [])[1], borderColor: ((ROUTE[curNode.route] || [])[1] || "#999") + "55" }}>{SVC_ROUTE_LABEL[curNode.route] || "Result"}</span>
                <h2>{curNode.title}</h2>
                <p className="svc-run-detail">{curNode.detail}</p>
                {dSaved ? (
                  <div className="svc-run-saved">✓ Logged to this call. <button className="svc-run-ghost" onClick={() => setRunOpen(false)}>Done</button></div>
                ) : (
                  <div className="svc-run-acts">
                    {curNode.goto && <button className="svc-run-cont" onClick={() => jump(curNode.goto)}>Continue → {curNode.goto.tree} check</button>}
                    <button className="svc-run-save" onClick={saveRun} disabled={dSaving}>{dSaving ? "Logging…" : "Log this check"}</button>
                    <button className="svc-run-ghost" onClick={openRun}>Start over</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="svc-run-q">
                <div className="svc-run-step">{dTitle} · step {trail.length}</div>
                <h2>{curNode.q}</h2>
                {curNode.widget === "speed" && <div className="svc-run-hint">Run a speed test on the site network (not cell data) before answering.</div>}
                <div className="svc-run-opts">
                  {curNode.options.map((o, i) => (
                    <button key={i} className="svc-run-opt" onClick={() => answer(o)}>{o.label}</button>
                  ))}
                </div>
                {trail.length > 1 && <button className="svc-run-back" onClick={runBack}>← Back</button>}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.apx .svc-back{font-size:.85rem;font-weight:600;color:var(--gold-deep,#b08f4f);text-decoration:none}
.apx .svc-back:hover{text-decoration:underline}
.apx .svc-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin:14px 0 18px;flex-wrap:wrap}
.apx .svc-hero-id{font-size:.78rem;font-weight:700;color:var(--gold-deep,#b08f4f);letter-spacing:.5px}
.apx .svc-hero h1{margin:4px 0 6px;font-family:'Bricolage Grotesque',sans-serif;font-size:1.7rem;font-weight:800}
.apx .svc-hero-issue{margin:0;color:var(--muted);max-width:60ch}
.apx .svc-hero-chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.apx .svc-pri{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:4px 12px;border-radius:20px}
.apx .svc-pri.urgent{color:#c9382b;background:#fdecec;border:1px solid #f2c4c4}
.apx .svc-pri.high{color:#b3541e;background:#fdf0e5;border:1px solid #f3d3b6}
.apx .svc-pri.low{color:var(--muted);background:var(--bg-soft,#f4f4f2);border:1px solid var(--line);text-transform:capitalize}
.apx .svc-cat{font-size:.74rem;font-weight:700;color:var(--gold-deep,#b08f4f);background:#f8f0e0;border-radius:20px;padding:4px 12px}
.apx .svc-route{font-size:.74rem;font-weight:800;background:#fff;border:1px solid;border-radius:20px;padding:4px 12px}
.apx .svc-proj-btn{font-size:.78rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#C9A96E,#b08f4f);border-radius:20px;padding:6px 16px;text-decoration:none}
.apx .svc-proj-btn:hover{filter:brightness(1.05)}
.apx .svc-stagebar{display:flex;gap:2px;padding:14px 10px;overflow-x:auto;margin-bottom:16px}
.apx .svc-stage{flex:1;min-width:74px;display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:none;cursor:pointer;font-family:inherit;padding:4px 2px;position:relative}
.apx .svc-stage:not(:last-child)::after{content:"";position:absolute;top:9px;left:calc(50% + 12px);right:calc(-50% + 12px);height:2px;background:var(--line)}
.apx .svc-stage.done:not(:last-child)::after{background:#C9A96E}
.apx .svc-stage-dot{width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid var(--line);z-index:1}
.apx .svc-stage.done .svc-stage-dot{background:#C9A96E;border-color:#C9A96E}
.apx .svc-stage.on .svc-stage-dot{border-color:#C9A96E;box-shadow:0 0 0 4px rgba(201,169,110,.22)}
.apx .svc-stage-lbl{font-size:.7rem;font-weight:700;color:var(--muted);white-space:nowrap}
.apx .svc-stage.on .svc-stage-lbl{color:var(--ink)}
.apx .svc-stage:disabled{cursor:default}
.apx .svc-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:820px){.apx .svc-grid{grid-template-columns:1fr}}
.apx .svc-card{padding:16px 18px}
.apx .svc-card-h{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1rem;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.apx .svc-count{font-size:.72rem;font-weight:800;color:var(--gold-deep,#b08f4f);background:#f8f0e0;border-radius:20px;padding:1px 8px}
.apx .svc-dl{display:grid;grid-template-columns:88px 1fr;gap:9px 12px;margin:0;font-size:.88rem}
.apx .svc-dl dt{color:var(--muted);font-weight:600}
.apx .svc-dl dd{margin:0;color:var(--ink)}
.apx .svc-dl a{color:var(--gold-deep,#b08f4f);text-decoration:none}
.apx .svc-dl a:hover{text-decoration:underline}
.apx .svc-assign{height:32px;padding:0 8px;font-size:.84rem;max-width:180px}
.apx .svc-empty{color:var(--muted);font-size:.86rem;padding:8px 0}
.apx .svc-diag{border:1px solid var(--line);border-radius:10px;margin-bottom:8px;overflow:hidden}
.apx .svc-diag summary{display:flex;align-items:center;gap:10px;padding:11px 13px;cursor:pointer;list-style:none;font-size:.86rem}
.apx .svc-diag summary::-webkit-details-marker{display:none}
.apx .svc-mode{font-size:.68rem;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:20px}
.apx .svc-mode-customer{color:#2f5fbf;background:#e6eefc}
.apx .svc-mode-tech{color:#1c8a45;background:#e7f6ec}
.apx .svc-diag-title{font-weight:700;flex:1}
.apx .svc-diag-when{color:var(--muted);font-size:.76rem}
.apx .svc-diag-body{padding:0 13px 13px;border-top:1px solid var(--line)}
.apx .svc-diag-action{font-size:.85rem;color:var(--ink);margin:10px 0}
.apx .svc-steps{margin:6px 0 0;padding-left:18px;font-size:.83rem}
.apx .svc-steps li{margin-bottom:6px}
.apx .svc-q{color:var(--muted);display:block}
.apx .svc-a{color:var(--ink);font-weight:600}
.apx .svc-speed{margin-top:10px;font-size:.78rem;color:var(--muted);font-family:Menlo,Consolas,monospace}
.apx .svc-timeline{list-style:none;margin:0 0 14px;padding:0}
.apx .svc-timeline li{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
.apx .svc-timeline li:last-child{border-bottom:none}
.apx .svc-tl-dot{width:26px;height:26px;flex-shrink:0;border-radius:50%;background:#f8f0e0;display:grid;place-items:center;font-size:.8rem}
.apx .svc-tl-detail{font-size:.86rem;color:var(--ink);font-weight:600}
.apx .svc-tl-meta{font-size:.74rem;color:var(--muted);margin-top:1px}
.apx .svc-note-row{display:flex;gap:8px}
.apx .svc-note-row .apx-input{flex:1}
.apx .svc-note-btn{height:40px;padding:0 18px;border:none;border-radius:9px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-weight:700;font-size:.85rem;cursor:pointer;font-family:inherit}
.apx .svc-note-btn:disabled{opacity:.5;cursor:default}
.apx .svc-run-btn{margin-left:auto;font-size:.78rem;font-weight:700;color:var(--gold-deep,#b08f4f);background:#f8f0e0;border:none;border-radius:8px;padding:5px 12px;cursor:pointer;font-family:inherit}
.apx .svc-run-btn:hover{background:#f2e6cf}
/* runner modal */
.apx-ov,.svc-ov{position:fixed;inset:0;background:rgba(14,19,32,.5);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:60}
.svc-ov *{box-sizing:border-box}
.svc-run{width:100%;max-width:470px;background:#fff;border-radius:18px;padding:26px 24px;position:relative;box-shadow:0 30px 80px -30px rgba(14,19,32,.5);max-height:90vh;overflow-y:auto;color:var(--ink)}
.svc-run-x{position:absolute;top:13px;right:15px;background:none;border:none;font-size:1.05rem;color:var(--muted);cursor:pointer;width:30px;height:30px;border-radius:8px}
.svc-run-x:hover{background:var(--bg-soft,#f4f4f2)}
.svc-run-tag,.svc-run-step{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-deep,#b08f4f);background:#f8f0e0;padding:4px 11px;border-radius:20px;margin-bottom:10px}
.svc-run h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.3rem;margin:0 0 8px;line-height:1.2}
.svc-run-sub{color:var(--muted);font-size:.9rem;margin:0 0 16px}
.svc-run-entry{width:100%;display:flex;flex-direction:column;gap:2px;text-align:left;padding:14px 15px;border:1.5px solid var(--line);border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;margin-bottom:9px;transition:border-color .15s,background .15s}
.svc-run-entry:hover{border-color:#C9A96E;background:#fdfaf2}
.svc-run-entry-t{font-weight:800;font-size:.98rem}
.svc-run-entry-h{font-size:.8rem;color:var(--muted)}
.svc-run-hint{background:#eef1ff;color:#2540c0;border-radius:10px;padding:9px 13px;font-size:.82rem;margin:0 0 14px;font-weight:600}
.svc-run-opts{display:flex;flex-direction:column;gap:9px;margin-top:14px}
.svc-run-opt{width:100%;text-align:left;padding:14px 15px;border:1.5px solid var(--line);border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;font-size:.94rem;font-weight:600;transition:border-color .15s,background .15s}
.svc-run-opt:hover{border-color:#C9A96E;background:#fdfaf2}
.svc-run-back{margin-top:14px;background:none;border:none;color:var(--muted);font-size:.84rem;cursor:pointer;font-family:inherit;font-weight:600;padding:0}
.svc-run-back:hover{color:var(--ink)}
.svc-run-badge{display:inline-block;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:4px 12px;border:1px solid;border-radius:20px;margin-bottom:11px;background:#fff}
.svc-run-detail{color:var(--muted);font-size:.92rem;margin:0 0 20px;line-height:1.5}
.svc-run-acts{display:flex;flex-direction:column;gap:9px}
.svc-run-cont{padding:13px;border:1.5px solid var(--line);border-radius:11px;background:#fff;font-weight:700;font-family:inherit;font-size:.9rem;cursor:pointer;text-transform:capitalize}
.svc-run-cont:hover{border-color:#C9A96E}
.svc-run-save{padding:14px;border:none;border-radius:11px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-weight:700;font-family:inherit;font-size:.94rem;cursor:pointer}
.svc-run-save:disabled{opacity:.6;cursor:default}
.svc-run-ghost{padding:12px;border:1.5px solid var(--line);border-radius:11px;background:#fff;font-weight:700;font-family:inherit;font-size:.9rem;cursor:pointer}
.svc-run-saved{display:flex;align-items:center;gap:12px;color:#1c8a45;font-weight:700;font-size:.92rem;flex-wrap:wrap}
/* billing */
.apx .svc-inv-st{font-size:.7rem;font-weight:800;text-transform:uppercase;padding:3px 10px;border-radius:20px}
.apx .svc-inv-draft{color:var(--muted);background:var(--bg-soft,#f4f4f2);border:1px solid var(--line)}
.apx .svc-inv-sent{color:#2f5fbf;background:#e6eefc}
.apx .svc-inv-signed{color:#1c8a45;background:#e7f6ec}
.apx .svc-void-btn{margin-left:auto;font-size:.76rem;font-weight:700;color:#c9382b;background:#fdecec;border:none;border-radius:8px;padding:5px 12px;cursor:pointer;font-family:inherit}
.apx .svc-void-btn:hover{background:#f8d7d7}
.apx .svc-rate-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.apx .svc-rate{font-size:.76rem;font-weight:700;color:var(--ink);background:var(--bg-soft,#f4f4f2);border:1px solid var(--line);border-radius:20px;padding:5px 11px;cursor:pointer;font-family:inherit;transition:border-color .12s,background .12s}
.apx .svc-rate span{color:var(--gold-deep,#b08f4f);font-weight:800}
.apx .svc-rate:hover{border-color:#C9A96E;background:#fdfaf2}
.apx .svc-inv-rows{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.apx .svc-inv-row{display:flex;align-items:center;gap:8px}
.apx .svc-inv-in-desc{flex:1;height:36px;padding:0 10px;font-size:.86rem}
.apx .svc-inv-in-qty{width:64px;height:36px;padding:0 8px;font-size:.86rem;text-align:center}
.apx .svc-inv-in-price{width:100px;height:36px;padding:0 8px;font-size:.86rem;text-align:right}
.apx .svc-inv-del{width:28px;height:28px;flex-shrink:0;border:none;border-radius:7px;background:none;color:var(--muted);cursor:pointer;display:grid;place-items:center}
.apx .svc-inv-del:hover{background:#fdecec;color:#c9382b}
.apx .svc-inv-add{align-self:flex-start;font-size:.8rem;font-weight:700;color:var(--gold-deep,#b08f4f);background:none;border:1.5px dashed var(--line);border-radius:9px;padding:7px 14px;cursor:pointer;font-family:inherit}
.apx .svc-inv-add:hover{border-color:#C9A96E}
.apx .svc-inv-desc{flex:1;font-size:.88rem;font-weight:600}
.apx .svc-inv-qty{color:var(--muted);font-size:.82rem}
.apx .svc-inv-price{font-weight:700;font-size:.88rem;font-variant-numeric:tabular-nums}
.apx .svc-inv-total{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1.5px solid var(--line);font-size:.92rem;color:var(--muted)}
.apx .svc-inv-total b{font-size:1.25rem;color:var(--ink);font-variant-numeric:tabular-nums}
.apx .svc-inv-signedby{font-size:.82rem;color:#1c8a45;font-weight:600;margin-bottom:10px}
.apx .svc-inv-actions{display:flex;gap:8px;margin-top:4px}
.apx .svc-inv-btn{height:38px;padding:0 20px;border-radius:9px;font-weight:700;font-size:.85rem;cursor:pointer;font-family:inherit}
.apx .svc-inv-btn.gold{border:none;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff}
.apx .svc-inv-btn.ghost{background:#fff;border:1.5px solid var(--line);color:var(--ink)}
.apx .svc-inv-btn:disabled{opacity:.5;cursor:default}
.apx .svc-pay{margin-top:16px;border-top:1px dashed var(--line);padding-top:12px}
.apx .svc-pay-row{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:.86rem}
.apx .svc-pay-amt{font-weight:700;font-variant-numeric:tabular-nums}
.apx .svc-pay-meta{color:var(--muted);font-size:.8rem}
.apx .svc-pay-bal{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:.9rem;color:var(--muted)}
.apx .svc-pay-bal b{font-size:1.05rem;color:var(--ink);font-variant-numeric:tabular-nums}
.apx .svc-pay-bal b.ok{color:#1c8a45}
.apx .svc-pay-form{display:flex;gap:8px;margin-top:6px}
.apx .svc-pay-in{flex:1;height:38px;padding:0 10px;font-size:.88rem}
.apx .svc-pay-sel{width:110px;height:38px;padding:0 8px;font-size:.86rem}
`;
