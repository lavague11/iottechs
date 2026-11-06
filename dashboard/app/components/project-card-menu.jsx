"use client";
import { cloneElement, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useContextMenu, ContextMenu } from "./context-menu";
import { duplicateProjectAction, deleteProjectAction, setProjectArchivedAction, mergeProjectsAction, listMergeCandidatesAction } from "../projects/actions";
import { setStage } from "../project/[accessId]/actions";
import { sendInvoiceAction, scheduleInvoiceEmailAction } from "../project/[accessId]/proposal-actions";
import SendScheduler from "../project/[accessId]/send-scheduler";

// Wraps a project card/row (a single element — usually a <Link>) with a right-click / long-press context
// menu. Clones the trigger props onto the child so layout is untouched. Role-aware; destructive actions
// confirm. Reuses the shared context-menu primitive. `project` needs at least { access_id }; contact +
// stage fields enable the Call/Text/Email + Change-stage items when present.
const STAGE_TARGETS = [["Consulting", "site_survey"], ["Install", "install"], ["Completion", "completion"]];

export default function ProjectCardMenu({ project, role = "", children, onChanged }) {
  const router = useRouter();
  const menu = useContextMenu();
  const [overlay, setOverlay] = useState(null);   // { type:"merge"|"delete", ... }
  const [busy, setBusy] = useState(false);

  const id = project?.access_id;
  const isAdmin = role === "admin";
  const isMgr = role === "admin" || role === "manager";
  const canSell = isMgr || role === "sales";
  if (!id || !children) return children || null;

  const go = (href, newTab) => { if (newTab) window.open(href, "_blank", "noopener"); else router.push(href); };
  const refresh = () => { router.refresh(); onChanged?.(); };
  const phone = String(project.contact_phone || "").trim();
  const email = String(project.contact_email || "").trim();
  const tel = phone.replace(/[^\d+]/g, "");

  async function changeStage(label, master) {
    const backward = STAGE_TARGETS.findIndex((t) => t[1] === master) < STAGE_TARGETS.findIndex((t) => project.stageGroup === t[1]);
    if (backward && !window.confirm(`Move ${id} back to ${label}?`)) return;
    setBusy(true); await setStage(id, role, master).catch(() => {}); setBusy(false); refresh();
  }
  async function doDuplicate() { setBusy(true); const r = await duplicateProjectAction(id).catch(() => null); setBusy(false); if (r?.ok && r.access_id) go(`/project/${r.access_id}`); else refresh(); }
  async function doArchive(on) { setBusy(true); await setProjectArchivedAction(id, on).catch(() => {}); setBusy(false); refresh(); }
  async function copyLink() { try { await navigator.clipboard.writeText(`${window.location.origin}/project/${id}`); } catch { /* ignore */ } }
  async function openMerge() {
    setOverlay({ type: "merge", loading: true, candidates: [] });
    const r = await listMergeCandidatesAction(id).catch(() => null);
    setOverlay({ type: "merge", loading: false, candidates: r?.ok ? r.candidates : [] });
  }
  async function doMerge(other) {
    setBusy(true);
    const r = await mergeProjectsAction(id, other).catch(() => null);
    setBusy(false); setOverlay(null);
    if (r?.ok) go(`/project/${r.survivor}`); else refresh();
  }
  async function doDelete() { setBusy(true); const r = await deleteProjectAction(id).catch(() => null); setBusy(false); setOverlay(null); refresh(); }
  async function doSendInvoice() { setBusy(true); await sendInvoiceAction(id).catch(() => null); setBusy(false); setOverlay(null); refresh(); }
  async function doScheduleInvoice(iso) { setBusy(true); await scheduleInvoiceEmailAction(id, iso).catch(() => null); setBusy(false); setOverlay(null); refresh(); }

  const items = [
    { label: "Open", icon: <Ic d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />, onClick: () => go(`/project/${id}`) },
    { label: "Open in new tab", icon: <Ic d="M15 3h6v6M21 3l-9 9M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />, onClick: () => go(`/project/${id}`, true) },
    (tel || email) && { type: "divider" },
    tel && { label: "Call", icon: <Ic d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />, onClick: () => go(`tel:${tel}`) },
    tel && { label: "Text", icon: <Ic d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />, onClick: () => go(`sms:${tel}`) },
    email && { label: "Email", icon: <Ic d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6" />, onClick: () => go(`mailto:${email}`) },
    canSell && { type: "divider" },
    canSell && { label: "Send proposal", icon: <Ic d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />, onClick: () => go(`/project/${id}?open=proposal&reqsign=1`) },
    isMgr && { label: "Send invoice", icon: <Ic d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6M9 9h1" />, onClick: () => setOverlay({ type: "invoice" }) },
    isMgr && { type: "header", label: "Change stage" },
    ...(isMgr ? STAGE_TARGETS.map(([label, master]) => ({ label: `→ ${label}`, checked: project.stageGroup === master, onClick: () => changeStage(label, master) })) : []),
    canSell && { type: "divider" },
    isMgr && { label: "Merge with…", icon: <Ic d="M7 3v6a5 5 0 0 0 5 5 5 5 0 0 0 5-5V3M12 14v7" />, onClick: openMerge },
    canSell && { label: "Duplicate", icon: <Ic d="M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" />, onClick: doDuplicate },
    { label: "Copy link", icon: <Ic d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />, onClick: copyLink },
    isMgr && { type: "divider" },
    isMgr && (project.archived
      ? { label: "Restore", icon: <Ic d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />, onClick: () => doArchive(false) }
      : { label: "Archive", icon: <Ic d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />, onClick: () => doArchive(true) }),
    isAdmin && { label: "Delete", danger: true, icon: <Ic d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />, onClick: () => setOverlay({ type: "delete" }) },
  ];

  return (
    <>
      {cloneElement(children, { ...menu.triggerProps, style: { ...(children.props.style || {}), ...menu.triggerProps.style } })}
      <ContextMenu open={menu.open} point={menu.point} onClose={menu.close} title={project.customer || id} items={items} />
      {overlay?.type === "invoice" && (
        <SendScheduler open title="Send invoice" subtitle={`${project.customer || id} — invoice with a Pay button`}
          busy={busy} onSendNow={doSendInvoice} onSchedule={doScheduleInvoice} onClose={() => setOverlay(null)} />
      )}
      {overlay && overlay.type !== "invoice" && createPortal(
        <div className="pcm-bg" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOverlay(null); }}>
          <div className="pcm-modal" role="dialog" aria-modal="true">
            {overlay.type === "delete" ? (
              <>
                <div className="pcm-h">Delete {id}?</div>
                <div className="pcm-sub">It moves to Archives — recoverable, not erased.</div>
                <div className="pcm-acts"><button className="pcm-danger" disabled={busy} onClick={doDelete}>Delete</button><button className="pcm-ghost" disabled={busy} onClick={() => setOverlay(null)}>Cancel</button></div>
              </>
            ) : (
              <>
                <div className="pcm-h">Merge {id} with…</div>
                <div className="pcm-sub">The older project ID is kept; both proposals are preserved.</div>
                {overlay.loading ? <div className="pcm-empty">Loading…</div>
                  : overlay.candidates.length === 0 ? <div className="pcm-empty">No other projects for this customer.</div>
                  : <div className="pcm-list">{overlay.candidates.map((c) => (
                      <button key={c.access_id} className="pcm-row" disabled={busy} onClick={() => { if (window.confirm(`Merge ${id} and ${c.access_id}? The older ID survives; both proposals are kept.`)) doMerge(c.access_id); }}>
                        <span className="pcm-row-id">{c.access_id}</span>
                        <span className="pcm-row-meta">{c.address || c.stageLabel || c.stage}</span>
                      </button>))}</div>}
                <div className="pcm-acts"><button className="pcm-ghost" disabled={busy} onClick={() => setOverlay(null)}>Close</button></div>
              </>
            )}
          </div>
          <style>{PCM_CSS}</style>
        </div>, document.body)}
    </>
  );
}

function Ic({ d }) { return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}</svg>; }

const PCM_CSS = `
.pcm-bg{position:fixed;inset:0;z-index:2147483601;background:rgba(14,18,30,.5);display:flex;align-items:center;justify-content:center;padding:16px}
.pcm-modal{width:100%;max-width:380px;background:var(--dv-bg,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;box-shadow:0 20px 60px rgba(14,18,30,.34);padding:18px;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.pcm-h{font-size:1rem;font-weight:700;color:var(--dv-ink,#101418)}
.pcm-sub{margin-top:4px;font-size:.82rem;color:var(--dv-meta,#787D84)}
.pcm-empty{margin-top:14px;font-size:.86rem;color:var(--dv-meta,#787D84)}
.pcm-list{margin-top:12px;display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto}
.pcm-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);cursor:pointer;font:inherit;text-align:left}
.pcm-row:hover:not(:disabled){border-color:#C9A96E}
.pcm-row-id{font-weight:700;font-size:.86rem;color:var(--dv-ink,#101418)}
.pcm-row-meta{font-size:.76rem;color:var(--dv-meta,#787D84);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%}
.pcm-acts{display:flex;gap:8px;margin-top:16px;justify-content:flex-end}
.pcm-danger{padding:9px 16px;border:0;border-radius:9px;background:#c0392b;color:#fff;font:700 .85rem/1 inherit;cursor:pointer}
.pcm-ghost{padding:9px 16px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:700 .85rem/1 inherit;cursor:pointer}
.pcm-danger:disabled,.pcm-ghost:disabled,.pcm-row:disabled{opacity:.5;cursor:default}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .pcm-modal{background:#14171f}}
`;
