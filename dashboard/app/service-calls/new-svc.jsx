"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchCustomersAction, customerProjectsAction } from "../components/crm-actions";
import { createServiceCallAction } from "./actions";
import { formatPhone, customerMeta } from "../../lib/crm";
import { SVC_CALL_TYPES } from "../../lib/svc-model";
import { serviceCodeLabel } from "../../lib/spec";

// Staff "+ Service Call": pick the client (CRM search), then one of their systems (projects) so the
// call inherits customer, contact, address and equipment. Nothing is re-typed; no customer is created.
export default function NewServiceCall({ onClose, initialCustomer = null, initialProject = null }) {
  const r = useRouter();
  const [pending, startTx] = useTransition();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [client, setClient] = useState(initialCustomer);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(initialProject || "");
  const [issue, setIssue] = useState("");
  const [callType, setCallType] = useState("Service Call");
  const [priority, setPriority] = useState("medium");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (client || q.trim().length < 2) { setRows([]); return; }
    const t = setTimeout(() => searchCustomersAction(q).then((res) => setRows(res?.rows || [])).catch(() => setRows([])), 250);
    return () => clearTimeout(t);
  }, [q, client]);
  useEffect(() => {
    if (!client) { setProjects([]); return; }
    customerProjectsAction(client.id).then((res) => { const list = res?.rows || []; setProjects(list); if (!project && list.length === 1) setProject(list[0].access_id); }).catch(() => setProjects([]));
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e) {
    e.preventDefault();
    if (!client) { setErr("Pick the client."); return; }
    setErr("");
    startTx(async () => {
      const res = await createServiceCallAction({ customerId: client.id, projectAccessId: project || null, issue, callType, priority });
      if (!res?.ok) { setErr(res?.error || "Could not create the call."); return; }
      onClose?.(); r.push(`/service-calls/${res.svcId}`);
    });
  }

  return (
    <div className="np-overlay" onClick={(e) => { if (e.target.classList.contains("np-overlay")) onClose?.(); }}>
      <div className="np-box">
        <button className="np-x" onClick={onClose} aria-label="Close">×</button>
        <div className="np-head"><h2 className="np-h">New Service Call</h2></div>
        <form className="np-form" onSubmit={submit}>
          {!client ? (
            <div className="np-f"><label>Client</label>
              <input className="apx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, company…" aria-label="Search client" autoFocus />
              {rows.length > 0 && (
                <div className="np-cres" role="listbox">
                  {rows.map((c) => (
                    <button type="button" key={c.id} className="np-crow" role="option" onClick={() => { setClient(c); setRows([]); }}>
                      <div><b>{c.name}</b><span>{[c.phone && formatPhone(c.phone), c.email].filter(Boolean).join(" · ")}{c.company ? ` · ${c.company}` : ""}</span></div>
                      <span>{customerMeta(c, serviceCodeLabel)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="np-csel" data-client-id={client.id}>
              <div><b>{client.name}</b><span>{[client.phone && formatPhone(client.phone), client.email].filter(Boolean).join(" · ")}</span>{client.company && <span>{client.company}</span>}</div>
              <div className="np-cact"><button type="button" onClick={() => { setClient(null); setProject(""); }}>Change</button></div>
            </div>
          )}
          {client && (
            <div className="np-f"><label>System</label>
              <select className="apx-input" value={project} onChange={(e) => setProject(e.target.value)} aria-label="System">
                <option value="">None on file</option>
                {projects.map((p) => <option key={p.access_id} value={p.access_id}>{p.access_id} · {p.service_label || p.service_code}{p.address ? ` · ${p.address}` : ""}</option>)}
              </select>
            </div>
          )}
          <div className="np-row2">
            <div className="np-f"><label>Type</label>
              <select className="apx-input" value={callType} onChange={(e) => setCallType(e.target.value)} aria-label="Call type">{SVC_CALL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="np-f"><label>Priority</label>
              <select className="apx-input" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">{["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></div>
          </div>
          <div className="np-f"><label>Issue</label><textarea className="apx-input" rows={2} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="What's wrong?" required /></div>
          {err && <div className="np-err">{err}</div>}
          <button className="np-submit" type="submit" disabled={pending}>{pending ? "Creating…" : "Create Call"}</button>
        </form>
      </div>
    </div>
  );
}
