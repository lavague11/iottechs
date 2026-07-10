"use client";

import { useState, useTransition } from "react";
import AdminShell from "../components/admin-shell";
import { restoreArchiveAction, purgeArchiveAction, purgeAllArchivesAction } from "./actions";

const TYPE_META = {
  expense:   { label: "Expense",   icon: "$",  cls: "ar-red" },
  user:      { label: "User",      icon: "@",  cls: "ar-blue" },
  inventory: { label: "Inventory", icon: "I",  cls: "ar-amber" },
  dev_task:  { label: "Dev Task",  icon: "D",  cls: "ar-purple" },
  ticket:    { label: "Ticket",    icon: "T",  cls: "ar-blue" },
  payment:   { label: "Payment",   icon: "$",  cls: "ar-red" },
};

function timeAgo(s) {
  if (!s) return "";
  const then = new Date(s.includes("T") ? s : s.replace(" ", "T")).getTime();
  if (isNaN(then)) return s;
  const m = Math.round((Date.now() - then) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel, busy }) {
  return (
    <div className="ar-modal-bg" onClick={(e) => { if (e.target.classList.contains("ar-modal-bg")) onCancel(); }}>
      <div className="ar-modal">
        <div className="ar-modal-title">{title}</div>
        <div className="ar-modal-msg">{message}</div>
        <div className="ar-modal-actions">
          <button className="ar-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="ar-btn-danger" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function ArchivesClient({ user, alerts, archives: initArchives }) {
  const [archives, setArchives] = useState(initArchives);
  const [pending, startTx] = useTransition();
  const [confirm, setConfirm] = useState(null); // {kind:'purge'|'purgeAll', id?, label?}
  const [toast, setToast] = useState("");

  function flash(msg) { setToast(msg); setTimeout(() => setToast(""), 2600); }

  function restore(a) {
    setArchives(prev => prev.filter(x => x.id !== a.id));
    startTx(async () => {
      const r = await restoreArchiveAction(a.id);
      flash(r?.ok ? `Restored "${a.label}"` : (r?.error || "Could not restore"));
    });
  }

  function doPurge() {
    const a = confirm;
    setConfirm(null);
    setArchives(prev => prev.filter(x => x.id !== a.id));
    startTx(async () => {
      const r = await purgeArchiveAction(a.id);
      flash(r?.ok ? "Permanently deleted" : (r?.error || "Could not delete"));
    });
  }

  function doPurgeAll() {
    setConfirm(null);
    setArchives([]);
    startTx(async () => {
      const r = await purgeAllArchivesAction();
      flash(r?.ok ? `Cleared ${r.count} archived item${r.count === 1 ? "" : "s"}` : "Could not clear archives");
    });
  }

  return (
    <AdminShell user={user} alerts={alerts} active="archives">
      <style>{AR_CSS}</style>
      <div className="apx-wrap">

        <div className="welcome">
          <h1>The <em>Archives</em></h1>
          <p className="ar-sub">Deleted records land here. Restore them to their original place, or permanently remove them. Nothing is ever hard-deleted without passing through here.</p>
        </div>

        <div className="ar-bar">
          <span className="ar-count">{archives.length} archived item{archives.length === 1 ? "" : "s"}</span>
          {archives.length > 0 && (
            <button className="ar-clear-btn" onClick={() => setConfirm({ kind: "purgeAll" })}>
              Clear All Archives
            </button>
          )}
        </div>

        {archives.length === 0 ? (
          <div className="ar-empty">
            <div className="ar-empty-icon">🗄️</div>
            <div>The archive is empty.</div>
            <div className="ar-empty-sub">Anything you delete across the platform will appear here first.</div>
          </div>
        ) : (
          <div className="ar-list">
            {archives.map((a) => {
              const meta = TYPE_META[a.entity_type] || { label: a.entity_type, icon: "•", cls: "ar-gray" };
              return (
                <div className="ar-row" key={a.id}>
                  <div className={`ar-icon ${meta.cls}`}>{meta.icon}</div>
                  <div className="ar-body">
                    <div className="ar-row-top">
                      <span className="ar-label">{a.label}</span>
                      <span className={`ar-type ${meta.cls}`}>{meta.label}</span>
                    </div>
                    {a.detail && <div className="ar-detail">{a.detail}</div>}
                    <div className="ar-meta">
                      Deleted {a.archived_by_name ? `by ${a.archived_by_name} ` : ""}{timeAgo(a.archived_at)}
                    </div>
                  </div>
                  <div className="ar-actions">
                    <button className="ar-restore" disabled={pending} onClick={() => restore(a)}>↩ Restore</button>
                    <button className="ar-del" disabled={pending} onClick={() => setConfirm({ kind: "purge", id: a.id, label: a.label })} title="Delete permanently">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirm?.kind === "purge" && (
        <ConfirmModal
          title="Delete permanently?"
          message={<>This will permanently remove <strong>“{confirm.label}”</strong> from the archive. This cannot be undone.</>}
          confirmLabel="Delete forever"
          busy={pending}
          onConfirm={doPurge}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "purgeAll" && (
        <ConfirmModal
          title="Clear all archives?"
          message={<>This will permanently delete <strong>all {archives.length} archived item{archives.length === 1 ? "" : "s"}</strong>. They cannot be restored afterward. Are you sure?</>}
          confirmLabel="Clear everything"
          busy={pending}
          onConfirm={doPurgeAll}
          onCancel={() => setConfirm(null)}
        />
      )}

      {toast && <div className="ar-toast">{toast}</div>}
    </AdminShell>
  );
}

const AR_CSS = `
.apx .ar-sub{color:var(--muted);font-size:.9rem;margin-top:4px;max-width:680px}
.apx .ar-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.apx .ar-count{font-size:.85rem;font-weight:600;color:var(--muted)}
.apx .ar-clear-btn{background:#fff;color:#c0392b;border:1.5px solid #f0c4c0;border-radius:9px;padding:8px 15px;font-size:.82rem;font-weight:700;font-family:inherit;cursor:pointer;transition:.12s}
.apx .ar-clear-btn:hover{background:rgba(231,76,60,.07);border-color:#e74c3c}

.apx .ar-list{display:flex;flex-direction:column;gap:9px}
.apx .ar-row{display:flex;align-items:center;gap:13px;background:#fff;border:1px solid var(--line);border-radius:13px;padding:13px 16px;transition:.12s}
.apx .ar-row:hover{box-shadow:0 2px 10px rgba(14,19,32,.05)}
.apx .ar-icon{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-size:1.05rem;font-weight:800;flex-shrink:0;font-family:'Bricolage Grotesque',sans-serif}
.apx .ar-body{flex:1;min-width:0}
.apx .ar-row-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.apx .ar-label{font-weight:600;font-size:.9rem}
.apx .ar-detail{font-size:.79rem;color:var(--muted);margin-top:2px}
.apx .ar-meta{font-size:.73rem;color:var(--muted);margin-top:3px;opacity:.85}
.apx .ar-type{font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:100px}
.apx .ar-red{background:rgba(231,76,60,.1);color:#c0392b}
.apx .ar-blue{background:rgba(41,128,185,.1);color:#2471a3}
.apx .ar-amber{background:rgba(224,154,58,.13);color:#8a5f00}
.apx .ar-purple{background:rgba(124,58,237,.1);color:#6d28d9}
.apx .ar-gray{background:rgba(99,117,155,.1);color:#5a6d8a}
.apx .ar-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.apx .ar-restore{background:#fff;border:1.5px solid var(--line);border-radius:8px;padding:7px 13px;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer;color:var(--ink);transition:.12s}
.apx .ar-restore:hover{border-color:#1c8a45;color:#1c8a45}
.apx .ar-del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:.95rem;padding:5px 8px;border-radius:7px;transition:.12s}
.apx .ar-del:hover{color:#e74c3c;background:rgba(231,76,60,.08)}

.apx .ar-empty{text-align:center;padding:54px 20px;background:#fff;border:1px dashed var(--line);border-radius:16px;color:var(--muted)}
.apx .ar-empty-icon{font-size:2.4rem;margin-bottom:10px}
.apx .ar-empty-sub{font-size:.82rem;margin-top:5px;opacity:.8}

.apx .ar-modal-bg{position:fixed;inset:0;background:rgba(14,19,32,.45);backdrop-filter:blur(3px);display:grid;place-items:center;z-index:2000;padding:20px}
.apx .ar-modal{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.28);animation:arIn .16s ease}
@keyframes arIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
.apx .ar-modal-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.2rem;margin-bottom:8px}
.apx .ar-modal-msg{font-size:.9rem;color:var(--slate);line-height:1.5;margin-bottom:20px}
.apx .ar-modal-actions{display:flex;justify-content:flex-end;gap:10px}
.apx .ar-btn-ghost{background:#fff;border:1.5px solid var(--line);border-radius:9px;padding:9px 16px;font-size:.85rem;font-weight:600;font-family:inherit;cursor:pointer;color:var(--ink)}
.apx .ar-btn-danger{background:#e74c3c;border:none;border-radius:9px;padding:9px 18px;font-size:.85rem;font-weight:700;font-family:inherit;cursor:pointer;color:#fff}
.apx .ar-btn-danger:disabled,.apx .ar-btn-ghost:disabled{opacity:.55;cursor:default}

.apx .ar-toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:11px 20px;border-radius:11px;font-size:.85rem;font-weight:600;z-index:2100;box-shadow:0 8px 28px rgba(0,0,0,.22)}
`;
