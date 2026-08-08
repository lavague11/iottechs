"use client";

import { useState } from "react";
import AdminShell from "../components/admin-shell";
import IdCapture from "./id-capture";

// Wraps the drop-in IdCapture widget in the staff shell. IdCapture emits the full
// customer record on every change; we hold the latest here for the "use it" step
// (fill a form / create an account — wired later).
export default function IdScanClient({ user, alerts }) {
  const [record, setRecord] = useState(null);
  const [copied, setCopied] = useState(false);

  const done = record?.checksPassed !== undefined; // a record has arrived

  function copyRecord() {
    try {
      navigator.clipboard?.writeText(JSON.stringify(record, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  }

  return (
    <AdminShell user={user} alerts={alerts} active="id-scan">
      <style>{CSS}</style>
      <div className="apx-wrap">
        <div className="welcome">
          <h1>ID <em>Scanner</em></h1>
          <p className="ids-sub">Photograph a driver&rsquo;s licence — it&rsquo;s read, validated, and turned into a customer record. Verify every field against the document before it lands on a contract.</p>
        </div>

        <IdCapture onChange={setRecord} title="Customer ID" />

        {done && (
          <div className="ids-out">
            <div className="ids-out-head">
              <span className="ids-out-t">Captured record</span>
              <div className="ids-out-meta">
                <span className={`ids-pill ${record.checksPassed ? "ok" : "bad"}`}>{record.checksPassed ? "Checks passed" : "Review flags"}</span>
                {typeof record.captureScore === "number" && <span className="ids-pill score">{record.captureScore}%</span>}
                <button className="ids-copy" onClick={copyRecord}>{copied ? "Copied" : "Copy JSON"}</button>
              </div>
            </div>
            <dl className="ids-dl">
              <dt>Name</dt><dd>{[record.firstName, record.middleName, record.lastName].filter(Boolean).join(" ") || "—"}</dd>
              <dt>DOB</dt><dd>{record.dob || "—"}{record.age != null ? ` · ${record.age}` : ""}</dd>
              <dt>Licence</dt><dd className="mono">{record.dlNumber || "—"} {record.jurisdiction ? `(${record.jurisdiction})` : ""}</dd>
              <dt>Expires</dt><dd>{record.expirationDate || "—"}{record.licenceValid === false ? " · EXPIRED" : ""}</dd>
              <dt>Address</dt><dd>{[record.street, record.unit, record.city, record.state, record.zip].filter(Boolean).join(", ") || "—"}</dd>
            </dl>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

const CSS = `
.apx .ids-sub{color:var(--muted);font-size:.9rem;margin-top:4px;max-width:70ch}
.apx .ids-out{background:#fff;border:1px solid var(--line);border-radius:14px;margin-top:18px;overflow:hidden}
.apx .ids-out-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);background:var(--bg-soft,#faf9f7);flex-wrap:wrap}
.apx .ids-out-t{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem}
.apx .ids-out-meta{display:flex;align-items:center;gap:8px}
.apx .ids-pill{font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:100px}
.apx .ids-pill.ok{background:rgba(28,138,69,.1);color:#1c8a45}
.apx .ids-pill.bad{background:rgba(224,154,58,.14);color:#8a5f00}
.apx .ids-pill.score{background:rgba(99,117,155,.12);color:#5a6d8a}
.apx .ids-copy{background:var(--ink);color:#fff;border:none;border-radius:8px;padding:6px 13px;font-size:.78rem;font-weight:600;font-family:inherit;cursor:pointer}
.apx .ids-dl{display:grid;grid-template-columns:110px 1fr;gap:9px 14px;margin:0;padding:16px 18px;font-size:.9rem}
.apx .ids-dl dt{color:var(--muted);font-weight:600}
.apx .ids-dl dd{margin:0}
.apx .ids-dl .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
@media(max-width:560px){.apx .ids-dl{grid-template-columns:1fr;gap:2px 0}.apx .ids-dl dd{margin-bottom:8px}}
`;
