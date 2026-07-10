"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../../components/admin-shell";
import ConfirmDialog from "../../components/confirm-dialog";
import { postMessageAction, updateTicketAction, deleteTicketAction } from "../actions";

const STATUSES   = [["open", "Open"], ["in_progress", "In Progress"], ["resolved", "Resolved"], ["closed", "Closed"]];
const PRIORITIES = [["urgent", "Urgent"], ["medium", "Medium"], ["low", "Low"]];
const AUDIENCE   = [["admin", "Admin"], ["manager", "Manager"], ["sales", "Sales"], ["tech", "Tech"], ["customer", "Customer"]];

function fmt(ts) {
  if (!ts) return "";
  return new Date((ts.includes("T") ? ts : ts.replace(" ", "T")) + "Z").toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
const initials = (n) => (n || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const ROLE_BG = { admin: "#faf4e8", manager: "#eef1ff", sales: "#f3eeff", tech: "#e7f6ec", customer: "#f0f2f7" };

export default function TicketDetailClient({ user, alerts, ticket, staff }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [msg, setMsg]       = useState("");
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const [assignee, setAssignee] = useState(ticket.assignee_id ? String(ticket.assignee_id) : "");
  const [audience, setAudience] = useState(new Set(ticket.audienceList));
  const [err, setErr] = useState("");
  const [savedFlash, setSavedFlash] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canManage = ["admin", "manager", "sales", "tech"].includes(user.role);
  const canAudience = ["admin", "manager"].includes(user.role);
  const canDelete = ["admin", "manager"].includes(user.role);

  function doDelete() {
    setErr("");
    startTx(async () => {
      const res = await deleteTicketAction(ticket.id);
      if (res.error) { setErr(res.error); setConfirmDelete(false); }
      else router.push("/tickets");
    });
  }

  function flash(t) { setSavedFlash(t); setTimeout(() => setSavedFlash(""), 1800); }

  function send(e) {
    e.preventDefault();
    if (!msg.trim()) return;
    setErr("");
    startTx(async () => {
      const res = await postMessageAction(ticket.id, msg);
      if (res.error) setErr(res.error);
      else { setMsg(""); router.refresh(); }
    });
  }
  function saveField(fields, label) {
    setErr("");
    startTx(async () => {
      const res = await updateTicketAction(ticket.id, fields);
      if (res.error) setErr(res.error);
      else { flash(label); router.refresh(); }
    });
  }
  function onStatus(v) { setStatus(v); saveField({ status: v }, "Status updated"); }
  function onPriority(v) { setPriority(v); saveField({ priority: v }, "Priority updated"); }
  function onAssignee(v) {
    setAssignee(v);
    const s = staff.find((x) => String(x.id) === v);
    saveField({ assignee_id: v ? Number(v) : null, assignee_name: s ? s.name : null }, "Assignee updated");
  }
  function toggleAud(role) {
    const next = new Set(audience);
    if (next.has(role)) next.delete(role); else next.add(role);
    setAudience(next);
    saveField({ audience: [...next].join(",") }, "Visibility updated");
  }

  const closed = status === "closed" || status === "resolved";

  return (
    <AdminShell user={user} alerts={alerts} active="tickets">
      <div className="apx-wrap">
        <Link href="/tickets" className="more" style={{ display: "inline-block", margin: "18px 0 6px" }}>← All tickets</Link>

        <div className="page-head" style={{ paddingTop: 4 }}>
          <h1>{ticket.subject}</h1>
          <div className="ph-sub">
            {ticket.project_customer || ticket.opened_by_name}
            {ticket.access_id && <> · <Link href={`/project/${ticket.access_id}`} className="idlink">{ticket.access_id} →</Link></>}
            {" · "}opened by <b style={{ textTransform: "capitalize" }}>{ticket.opened_by_name} ({ticket.opened_by_role})</b>
          </div>
        </div>

        <div className="tk-grid">
          {/* Conversation */}
          <div className="panel">
            <div className="panel-head"><h3>Conversation</h3><span className="chip">{ticket.messages.length} message{ticket.messages.length === 1 ? "" : "s"}</span></div>
            <div className="tk-thread">
              {ticket.messages.length === 0 && <div className="empty">No messages yet.</div>}
              {ticket.messages.map((m) => {
                const mine = m.author_id === user.id;
                return (
                  <div key={m.id} className={`tk-msg${mine ? " mine" : ""}`}>
                    <div className="tk-av" style={{ background: ROLE_BG[m.author_role] || "var(--bg-tint)" }}>{initials(m.author_name)}</div>
                    <div className="tk-bubble">
                      <div className="tk-meta"><b>{m.author_name || "—"}</b> <span className="tk-role">{m.author_role}</span> · {fmt(m.created_at)}</div>
                      <div className="tk-body">{m.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <form className="tk-compose" onSubmit={send}>
              <textarea className="apx-input" rows={2} placeholder={closed ? "Reopen to reply, or just add a note…" : "Write a reply…"} value={msg} onChange={(e) => setMsg(e.target.value)} />
              <button className="btn btn-gold" type="submit" disabled={pending || !msg.trim()}>{pending ? "Sending…" : "Send"}</button>
            </form>
            {err && <div style={{ padding: "0 18px 14px", color: "var(--red)", fontSize: ".85rem" }}>{err}</div>}
          </div>

          {/* Management sidebar */}
          <div className="panel" style={{ alignSelf: "start" }}>
            <div className="panel-head"><h3>Manage</h3>{savedFlash && <span className="save-flash">{savedFlash}</span>}</div>
            <div className="tk-manage">
              <label className="tk-f"><span>Status</span>
                <select className="usel" value={status} onChange={(e) => onStatus(e.target.value)} disabled={!canManage || pending}>
                  {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="tk-f"><span>Priority</span>
                <select className="usel" value={priority} onChange={(e) => onPriority(e.target.value)} disabled={!canManage || pending}>
                  {PRIORITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="tk-f"><span>Assignee</span>
                <select className="usel" value={assignee} onChange={(e) => onAssignee(e.target.value)} disabled={!canManage || pending}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                </select>
              </label>

              <div className="tk-f" style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
                <span style={{ marginBottom: 4 }}>Who can see this ticket</span>
                {!canAudience && <div style={{ fontSize: ".74rem", color: "var(--muted)", marginBottom: 6 }}>Only an admin or manager can change visibility.</div>}
                <div className="tk-aud">
                  {AUDIENCE.map(([role, lbl]) => (
                    <label key={role} className={`tk-chk${audience.has(role) ? " on" : ""}`}>
                      <input type="checkbox" checked={audience.has(role)} disabled={!canAudience || pending || role === "admin"} onChange={() => toggleAud(role)} />
                      {lbl}
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: ".74rem", color: "var(--muted)", marginTop: 6 }}>
                  {audience.has("customer") ? "Customer-visible — the customer can see and reply." : "Internal — hidden from the customer."}
                </div>
              </div>

              {canManage && (
                <button className={`btn btn-sm ${closed ? "btn-gold" : "btn-ghost"}`} style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
                  onClick={() => (closed ? onStatus("open") : setConfirmClose(true))} disabled={pending}>
                  {closed ? "Reopen Ticket" : "Close Ticket"}
                </button>
              )}
              {canDelete && (
                <button className="btn btn-sm btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8, color: "var(--red)", borderColor: "var(--red)" }}
                  onClick={() => setConfirmDelete(true)} disabled={pending}>
                  Delete Ticket
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirmClose} title="Close this ticket?" confirmLabel="Close"
        message="It moves to Closed. You can reopen it anytime." busy={pending}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => { setConfirmClose(false); onStatus("closed"); }} />
      <ConfirmDialog open={confirmDelete} title="Delete this ticket?" confirmLabel="Delete"
        message="The ticket and its messages are archived — you can restore them from Archives." busy={pending}
        onCancel={() => setConfirmDelete(false)} onConfirm={doDelete} />

      <style>{`
        .apx .tk-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;margin-bottom:40px}
        .apx .tk-thread{padding:14px 18px;display:flex;flex-direction:column;gap:14px;max-height:520px;overflow-y:auto}
        .apx .tk-msg{display:flex;gap:11px;align-items:flex-start}
        .apx .tk-msg.mine{flex-direction:row-reverse}
        .apx .tk-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:.78rem;font-family:'Bricolage Grotesque',sans-serif;flex-shrink:0;border:1px solid var(--line)}
        .apx .tk-bubble{background:var(--bg-soft);border:1px solid var(--line);border-radius:12px;padding:9px 13px;max-width:80%}
        .apx .tk-msg.mine .tk-bubble{background:#faf4e8;border-color:rgba(201,169,110,.4)}
        .apx .tk-meta{font-size:.74rem;color:var(--muted);margin-bottom:3px}
        .apx .tk-role{text-transform:capitalize}
        .apx .tk-body{font-size:.9rem;line-height:1.5;white-space:pre-wrap}
        .apx .tk-compose{display:flex;gap:10px;align-items:flex-end;padding:14px 18px;border-top:1px solid var(--line)}
        .apx .tk-compose textarea{resize:vertical;min-height:42px}
        .apx .tk-manage{padding:16px 18px;display:flex;flex-direction:column;gap:13px}
        .apx .tk-f{display:flex;flex-direction:column;gap:5px;font-size:.8rem;font-weight:600;color:var(--ink)}
        .apx .tk-f .usel{width:100%}
        .apx .tk-aud{display:flex;flex-wrap:wrap;gap:6px}
        .apx .tk-chk{display:inline-flex;align-items:center;gap:6px;font-size:.8rem;font-weight:600;border:1px solid var(--line);border-radius:8px;padding:5px 10px;cursor:pointer;background:#fff}
        .apx .tk-chk.on{border-color:var(--gold);background:#faf4e8;color:var(--gold-deep)}
        .apx .tk-chk input{accent-color:var(--gold-deep)}
        @media(max-width:900px){.apx .tk-grid{grid-template-columns:1fr}}
      `}</style>
    </AdminShell>
  );
}
