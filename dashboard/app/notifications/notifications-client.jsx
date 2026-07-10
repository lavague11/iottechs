"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import { markAllReadAction, markReadAction, dismissNotificationAction, clearAllNotificationsAction } from "./actions";

function relTime(ts) {
  if (!ts) return "";
  const then = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z").getTime();
  if (isNaN(then)) return ts;
  const m = Math.round((Date.now() - then) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d}d ago`;
}
const TYPE_ICON = { ticket: "red", signature: "gold", payment: "green", system: "blue" };

export default function NotificationsClient({ user, alerts, items }) {
  const [filter, setFilter] = useState("all");
  const [pending, startTx]  = useTransition();
  const router = useRouter();

  const unread = items.filter((n) => !n.read).length;
  const visible = items.filter((n) => filter === "all" ? true : filter === "unread" ? !n.read : n.read);

  const [confirmClear, setConfirmClear] = useState(false);
  function markAll() { startTx(async () => { await markAllReadAction(); router.refresh(); }); }
  function open(n) {
    startTx(async () => {
      if (!n.read) await markReadAction(n.id);
      if (n.link) router.push(n.link); else router.refresh();
    });
  }
  function dismiss(e, id) { e.stopPropagation(); startTx(async () => { await dismissNotificationAction(id); router.refresh(); }); }
  function clearAll() { setConfirmClear(false); startTx(async () => { await clearAllNotificationsAction(); router.refresh(); }); }

  return (
    <AdminShell user={user} alerts={alerts} active={null}>
      <div className="apx-wrap">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div><h1>Notifications</h1><div className="ph-sub">{unread} unread · {items.length} total</div></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={markAll} disabled={pending || unread === 0}>Mark read</button>
            <button className="btn btn-ghost" onClick={() => setConfirmClear(true)} disabled={pending || items.length === 0} style={{ color: "var(--red)", borderColor: "var(--red)" }}>Clear all</button>
          </div>
        </div>

        <div className="sec-head">
          <div className="filters">
            {[["all", `All (${items.length})`], ["unread", `Unread (${unread})`], ["read", "Read"]].map(([k, lbl]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{lbl}</button>
            ))}
          </div>
        </div>

        <div className="panel mb">
          {visible.length === 0 ? <div className="empty">Nothing here. You're all caught up.</div> : visible.map((n) => (
            <div key={n.id} className="nf-row" onClick={() => open(n)} style={n.read ? {} : { background: "rgba(50,87,255,.03)" }}>
              <span className={`act-ic ${TYPE_ICON[n.type] || "blue"}`}><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: n.read ? 500 : 700, fontSize: ".92rem" }}>{n.title}</div>
                {n.body && <div style={{ fontSize: ".82rem", color: "var(--muted)" }}>{n.body}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: ".76rem", color: "var(--muted)" }}>{relTime(n.created_at)}</span>
                {!n.read && <span className="nf-dot" />}
                <button className="nf-x" title="Dismiss" onClick={(e) => dismiss(e, n.id)} disabled={pending}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog open={confirmClear} title="Clear all notifications?" confirmLabel="Clear all"
        message="This removes every notification from your list. It can't be undone." busy={pending}
        onCancel={() => setConfirmClear(false)} onConfirm={clearAll} />

      <style>{`
        .apx .nf-row{display:flex;align-items:center;gap:13px;padding:14px 18px;border-bottom:1px solid var(--line);cursor:pointer;transition:.12s}
        .apx .nf-row:last-child{border-bottom:none}
        .apx .nf-row:hover{background:var(--bg-soft)!important}
        .apx .nf-dot{width:9px;height:9px;border-radius:50%;background:var(--accent)}
        .apx .nf-x{width:26px;height:26px;display:grid;place-items:center;border:none;background:none;color:var(--muted);cursor:pointer;border-radius:6px;flex-shrink:0}
        .apx .nf-x:hover{background:var(--bg-tint);color:var(--red)}
      `}</style>
    </AdminShell>
  );
}
