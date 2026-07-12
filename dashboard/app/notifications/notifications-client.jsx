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

// icon color families (bg, fg)
const ICON_C = {
  blue: ["#e8f0fe", "#3257ff"], gold: ["#faf4e8", "#b08f4f"], green: ["#e7f6ec", "#1c8a45"],
  red: ["#fdeaea", "#d23c3c"], amber: ["#fef3c7", "#b45309"], purple: ["#f3eeff", "#7c3aed"],
};
// one glyph per group
const GROUP_SVG = {
  action:  <><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
  tickets: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/></>,
  projects: <path d="M20 7h-8l-2-2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>,
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
};
const GROUPS = [
  ["all", "All"],
  ["action", "Needs Action"],
  ["tickets", "Tickets"],
  ["projects", "Projects"],
  ["activity", "Activity"],
];

export default function NotificationsClient({ user, alerts, items }) {
  const [filter, setFilter] = useState("all");
  const [pending, startTx]  = useTransition();
  const router = useRouter();

  const unread = items.filter((n) => n.source === "notif" && !n.read).length;
  const notifCount = items.filter((n) => n.source === "notif").length;
  const counts = Object.fromEntries(GROUPS.map(([k]) => [k, k === "all" ? items.length : items.filter((n) => n.group === k).length]));
  const visible = items.filter((n) => filter === "all" ? true : n.group === filter);

  const [confirmClear, setConfirmClear] = useState(false);
  function markAll() { startTx(async () => { await markAllReadAction(); router.refresh(); }); }
  function open(n) {
    startTx(async () => {
      if (n.source === "notif" && !n.read) await markReadAction(n.id);
      if (n.link) router.push(n.link); else router.refresh();
    });
  }
  function dismiss(e, n) { e.stopPropagation(); startTx(async () => { await dismissNotificationAction(n.id); router.refresh(); }); }
  function clearAll() { setConfirmClear(false); startTx(async () => { await clearAllNotificationsAction(); router.refresh(); }); }

  return (
    <AdminShell user={user} alerts={alerts} active={null}>
      <div className="apx-wrap">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div><h1>Notifications</h1><div className="ph-sub">{unread} unread · {items.length} total across every channel</div></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={markAll} disabled={pending || unread === 0}>Mark read</button>
            <button className="btn btn-ghost" onClick={() => setConfirmClear(true)} disabled={pending || notifCount === 0} style={{ color: "var(--red)", borderColor: "var(--red)" }}>Clear alerts</button>
          </div>
        </div>

        <div className="sec-head">
          <div className="filters">
            {GROUPS.map(([k, lbl]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{lbl}{counts[k] ? ` (${counts[k]})` : ""}</button>
            ))}
          </div>
        </div>

        <div className="panel mb">
          {visible.length === 0 ? <div className="empty">Nothing here. You're all caught up.</div> : visible.map((n) => {
            const [bg, fg] = ICON_C[n.icon] || ICON_C.blue;
            const unreadRow = n.source === "notif" && !n.read;
            return (
              <div key={n.key} className="nf-row" onClick={() => open(n)} style={unreadRow ? { background: "rgba(50,87,255,.03)" } : {}}>
                <span className="nf-ic" style={{ background: bg, color: fg }}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{GROUP_SVG[n.group] || GROUP_SVG.activity}</svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nf-title" style={{ fontWeight: unreadRow ? 700 : 600 }}>{n.title}</div>
                  {n.body && <div className="nf-body">{n.body}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: ".76rem", color: "var(--muted)", whiteSpace: "nowrap" }}>{relTime(n.at)}</span>
                  {unreadRow && <span className="nf-dot" />}
                  {n.source === "notif" && (
                    <button className="nf-x" title="Dismiss" onClick={(e) => dismiss(e, n)} disabled={pending}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="ph-sub" style={{ marginTop: -6 }}>Live items (approvals, tickets, activity) link straight to the source — only saved alerts are dismissible.</div>
      </div>

      <ConfirmDialog open={confirmClear} title="Clear saved alerts?" confirmLabel="Clear"
        message="This removes your dismissible notifications. Live items (tickets, approvals, activity) stay." busy={pending}
        onCancel={() => setConfirmClear(false)} onConfirm={clearAll} />

      <style>{`
        .apx .nf-row{display:flex;align-items:center;gap:13px;padding:13px 18px;border-bottom:1px solid var(--line);cursor:pointer;transition:.12s}
        .apx .nf-row:last-child{border-bottom:none}
        .apx .nf-row:hover{background:var(--bg-soft)!important}
        .apx .nf-ic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex-shrink:0}
        .apx .nf-title{font-size:.9rem;line-height:1.3}
        .apx .nf-body{font-size:.8rem;color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .apx .nf-dot{width:9px;height:9px;border-radius:50%;background:var(--accent)}
        .apx .nf-x{width:26px;height:26px;display:grid;place-items:center;border:none;background:none;color:var(--muted);cursor:pointer;border-radius:6px;flex-shrink:0}
        .apx .nf-x:hover{background:var(--bg-tint);color:var(--red)}
      `}</style>
    </AdminShell>
  );
}
