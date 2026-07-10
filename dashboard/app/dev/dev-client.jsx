"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import { toggleDevTaskAction, addDevTaskAction, deleteDevTaskAction } from "./actions";

const ROUTE_BADGE = {
  exists:  { label: "Live",            cls: "rs-live" },
  partial: { label: "Partial",         cls: "rs-partial" },
  missing: { label: "Must be created", cls: "rs-missing" },
  na:      { label: "Backend",         cls: "rs-na" },
};

const CAT_ORDER = [
  "Security", "Core Spine", "Stage Model", "Operational Centers",
  "Notifications", "Financial", "Customer Experience", "Cleanup & Polish",
  "Roles & Access", "Custom",
];

function resolveRoute(route, sampleId) {
  if (!route) return null;
  if (route.includes(":sample")) return sampleId ? route.replace(":sample", sampleId) : null;
  return route;
}

function TaskRow({ task, sampleId, onToggle, onDelete, onExecute, pending }) {
  const badge = ROUTE_BADGE[task.route_status] || ROUTE_BADGE.na;
  const href  = resolveRoute(task.route, sampleId);
  const linkable = href && (task.route_status === "exists" || task.route_status === "partial");

  return (
    <div className={`dv-row${task.done ? " dv-done" : ""}`}>
      <button
        className={`dv-check${task.done ? " on" : ""}`}
        disabled={pending}
        onClick={() => onToggle(task.id, !task.done)}
        aria-label={task.done ? "Mark incomplete" : "Mark complete"}
      >
        {task.done ? "✓" : ""}
      </button>
      <div className="dv-body">
        <div className="dv-title-line">
          <span className="dv-title">{task.title}</span>
          <span className={`dv-rs ${badge.cls}`}>{badge.label}</span>
        </div>
        {task.detail && <div className="dv-detail">{task.detail}</div>}
      </div>
      <div className="dv-actions">
        {!task.done && (
          <button className="dv-exec" onClick={() => onExecute(task)} title="Copy a build prompt for this item to paste into Claude">
            ⚡ Execute
          </button>
        )}
        {linkable
          ? <Link href={href} className="dv-open">Open →</Link>
          : <span className="dv-open-dim">{task.route_status === "missing" ? "—" : ""}</span>}
        {task.is_custom === 1 && (
          <button className="dv-del" disabled={pending} onClick={() => onDelete(task.id)} title="Delete custom task">✕</button>
        )}
      </div>
    </div>
  );
}

function legacyCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy");
    document.body.removeChild(ta); return true;
  } catch (_) { return false; }
}

function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      // writeText returns a promise that can reject (e.g. unfocused doc) — catch it
      // so it never surfaces as an unhandled rejection, and fall back to execCommand.
      navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
      return true;
    }
  } catch (_) {}
  return legacyCopy(text);
}

function buildPrompt(task, route) {
  const statusLine =
    task.route_status === "missing" ? "Status: this page/feature does not exist yet — it must be created."
    : task.route_status === "partial" ? "Status: partially built — extend the existing implementation, don't rewrite."
    : task.route_status === "exists" ? "Status: the page exists — modify in place."
    : "";
  return [
    "Work on this Dev Roadmap item for the IOT Techs platform (dashboard/, Next.js App Router, node:sqlite, port 3100):",
    "",
    `### ${task.title}   [${task.category}]`,
    task.detail || "",
    route ? `Page / route: ${route}` : "",
    statusLine,
    "",
    "Rules: additive / non-destructive only — never delete existing work; log a Removal Suggestion for approval instead. When finished, mark this item complete on the Dev Roadmap (/dev).",
  ].filter(Boolean).join("\n");
}

export default function DevClient({ user, alerts, tasks: initTasks, sampleProjectId }) {
  const [tasks, setTasks] = useState(initTasks);
  const [pending, startTx] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState({ category: "Custom", title: "", detail: "", route: "" });
  const [undoStack, setUndoStack] = useState([]);
  const [toast, setToast] = useState("");
  const [delTask, setDelTask] = useState(null);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(""), 2600); }

  const total = tasks.length;
  const done  = tasks.filter(t => t.done).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  const incomplete = tasks.filter(t => !t.done);
  const completed  = tasks.filter(t => t.done)
    .sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""));

  // Group incomplete by category, in canonical order
  const groups = {};
  for (const t of incomplete) (groups[t.category] ||= []).push(t);
  const orderedCats = Object.keys(groups).sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  for (const c of orderedCats) groups[c].sort((a, b) => a.priority - b.priority);

  function toggle(id, next, record = true) {
    if (record) {
      const cur = tasks.find(t => t.id === id);
      setUndoStack(s => [...s, { id, prevDone: cur ? !!cur.done : !next }]);
    }
    setTasks(prev => prev.map(t => t.id === id
      ? { ...t, done: next ? 1 : 0, done_at: next ? new Date().toISOString().slice(0, 19).replace("T", " ") : null }
      : t));
    startTx(() => { toggleDevTaskAction(id, next); });
  }

  function undo() {
    if (!undoStack.length) return;
    const last = undoStack[undoStack.length - 1];
    toggle(last.id, !!last.prevDone, false);
    setUndoStack(s => s.slice(0, -1));
    flash("Reverted last change");
  }

  function execute(task) {
    const prompt = buildPrompt(task, resolveRoute(task.route, sampleProjectId));
    flash(copyText(prompt) ? "Prompt copied — paste it into Claude" : "Copy failed — select & copy manually");
  }

  function askRemove(id) { setDelTask(tasks.find(t => t.id === id) || { id }); }
  function confirmRemove() {
    const id = delTask?.id;
    setDelTask(null);
    if (!id) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    startTx(async () => { await deleteDevTaskAction(id); flash("Moved to Archives"); });
  }

  function add() {
    if (!form.title.trim()) return;
    startTx(async () => {
      const r = await addDevTaskAction(form);
      if (r?.ok) {
        setTasks(prev => [...prev, {
          id: r.id, category: form.category || "Custom", title: form.title.trim(),
          detail: form.detail.trim() || null, route: form.route.trim() || null,
          route_status: form.route.trim() ? "exists" : "missing",
          priority: 50, done: 0, done_at: null, is_custom: 1,
        }]);
        setForm({ category: "Custom", title: "", detail: "", route: "" });
        setShowAdd(false);
      }
    });
  }

  return (
    <AdminShell user={user} alerts={alerts} active="dev">
      <style>{DV_CSS}</style>
      <div className="apx-wrap">

        <div className="welcome">
          <h1>Development <em>Roadmap</em></h1>
          <p className="dv-sub">Your build tracker for the platform. Check items off as they ship — completed work sinks to the bottom.</p>
        </div>

        {/* Progress */}
        <div className="dv-progress-card">
          <div className="dv-prog-top">
            <div className="dv-prog-stat"><b>{done}</b> of <b>{total}</b> complete</div>
            <div className="dv-prog-pct">{pct}%</div>
          </div>
          <div className="dv-prog-bar"><div className="dv-prog-fill" style={{ width: `${pct}%` }} /></div>
          <div className="dv-prog-foot">
            <span className="dv-mini rs-missing">{incomplete.length} remaining</span>
            <div className="dv-foot-btns">
              <button className="dv-undo-btn" disabled={!undoStack.length} onClick={undo} title="Undo last check / uncheck">
                ↶ Undo{undoStack.length > 1 ? ` (${undoStack.length})` : ""}
              </button>
              <button className="dv-add-btn" onClick={() => setShowAdd(v => !v)}>{showAdd ? "Cancel" : "+ Add Task"}</button>
            </div>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="dv-add-form">
            <div className="dv-add-grid">
              <label>Category
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CAT_ORDER.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>Title
                <input value={form.title} placeholder="What needs to be done?" onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              </label>
            </div>
            <label className="dv-add-full">Detail <span className="dv-opt">(optional)</span>
              <input value={form.detail} placeholder="More context…" onChange={e => setForm(p => ({ ...p, detail: e.target.value }))} />
            </label>
            <label className="dv-add-full">Link / route <span className="dv-opt">(optional, e.g. /tickets)</span>
              <input value={form.route} placeholder="/some-page" onChange={e => setForm(p => ({ ...p, route: e.target.value }))} />
            </label>
            <button className="dv-add-submit" disabled={pending || !form.title.trim()} onClick={add}>
              {pending ? "Adding…" : "Add to Roadmap"}
            </button>
          </div>
        )}

        {/* Incomplete, grouped by category */}
        {orderedCats.length === 0 && (
          <div className="dv-allclear">Everything's checked off. Add a task or take a victory lap.</div>
        )}
        {orderedCats.map(cat => (
          <div className="dv-group" key={cat}>
            <div className="dv-group-head">
              <span className="dv-group-name">{cat}</span>
              <span className="dv-group-count">{groups[cat].length}</span>
            </div>
            {groups[cat].map(t => (
              <TaskRow key={t.id} task={t} sampleId={sampleProjectId} onToggle={toggle} onDelete={askRemove} onExecute={execute} pending={pending} />
            ))}
          </div>
        ))}

        {/* Completed — sunk to bottom */}
        {completed.length > 0 && (
          <div className="dv-group dv-completed">
            <button className="dv-group-head dv-done-head" onClick={() => setShowDone(v => !v)}>
              <span className="dv-group-name">✓ Completed</span>
              <span className="dv-group-count green">{completed.length}</span>
              <span className="dv-chev">{showDone ? "▾" : "▸"}</span>
            </button>
            {showDone && completed.map(t => (
              <TaskRow key={t.id} task={t} sampleId={sampleProjectId} onToggle={toggle} onDelete={askRemove} onExecute={execute} pending={pending} />
            ))}
          </div>
        )}

      </div>
      <ConfirmDialog
        open={!!delTask}
        title="Delete this task?"
        message={<>“{delTask?.title}” will be moved to <strong>Archives</strong>. You can restore it from there anytime.</>}
        confirmLabel="Delete task"
        busy={pending}
        onConfirm={confirmRemove}
        onCancel={() => setDelTask(null)}
      />
      {toast && <div className="dv-toast">{toast}</div>}
    </AdminShell>
  );
}

const DV_CSS = `
.apx .dv-sub{color:var(--muted);font-size:.9rem;margin-top:4px}
.apx .dv-progress-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:18px}
.apx .dv-prog-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
.apx .dv-prog-stat{font-size:.95rem;color:var(--ink)}
.apx .dv-prog-stat b{font-family:'Bricolage Grotesque',sans-serif}
.apx .dv-prog-pct{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.6rem;color:var(--accent-primary,#C9A96E)}
.apx .dv-prog-bar{height:9px;border-radius:100px;background:var(--bg-soft,#f1f0ec);overflow:hidden}
.apx .dv-prog-fill{height:100%;border-radius:100px;background:linear-gradient(90deg,#C9A96E,#1c8a45);transition:width .4s ease}
.apx .dv-prog-foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px}
.apx .dv-mini{font-size:.74rem;font-weight:700;padding:3px 9px;border-radius:100px}
.apx .dv-foot-btns{display:flex;align-items:center;gap:8px}
.apx .dv-add-btn{background:var(--ink);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer}
.apx .dv-undo-btn{background:#fff;color:var(--ink);border:1.5px solid var(--line);border-radius:8px;padding:6px 13px;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer;transition:.12s}
.apx .dv-undo-btn:hover:not(:disabled){border-color:var(--accent-primary,#C9A96E)}
.apx .dv-undo-btn:disabled{opacity:.4;cursor:default}

.apx .dv-add-form{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:18px}
.apx .dv-add-grid{display:grid;grid-template-columns:200px 1fr;gap:12px;margin-bottom:10px}
.apx .dv-add-form label{display:flex;flex-direction:column;gap:5px;font-size:.76rem;color:var(--muted);font-weight:600}
.apx .dv-add-full{margin-bottom:10px}
.apx .dv-opt{font-weight:400;color:var(--muted)}
.apx .dv-add-form input,.apx .dv-add-form select{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:.86rem;font-family:inherit;color:var(--ink);background:#fff}
.apx .dv-add-submit{background:var(--accent-primary,#C9A96E);color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:.85rem;font-weight:700;font-family:inherit;cursor:pointer}
.apx .dv-add-submit:disabled{opacity:.5;cursor:default}

.apx .dv-group{background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:14px;overflow:hidden}
.apx .dv-group-head{display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid var(--line);background:var(--bg-soft,#faf9f7);width:100%;text-align:left;border-left:none;border-right:none;border-top:none;cursor:default;font-family:inherit}
.apx .dv-group-name{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.9rem;flex:1}
.apx .dv-group-count{font-size:.72rem;font-weight:700;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:100px;padding:2px 9px}
.apx .dv-group-count.green{color:#1c8a45;border-color:#bfe6cd}

.apx .dv-row{display:flex;align-items:flex-start;gap:13px;padding:13px 18px;border-bottom:1px solid var(--line);transition:.12s}
.apx .dv-row:last-child{border-bottom:none}
.apx .dv-row:hover{background:var(--bg-soft,#faf9f7)}
.apx .dv-check{flex-shrink:0;width:22px;height:22px;border-radius:7px;border:2px solid var(--line);background:#fff;cursor:pointer;font-size:.8rem;font-weight:800;color:#fff;display:grid;place-items:center;margin-top:1px;transition:.12s}
.apx .dv-check:hover{border-color:var(--accent-primary,#C9A96E)}
.apx .dv-check.on{background:#1c8a45;border-color:#1c8a45}
.apx .dv-body{flex:1;min-width:0}
.apx .dv-title-line{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.apx .dv-title{font-weight:600;font-size:.9rem}
.apx .dv-detail{font-size:.79rem;color:var(--muted);margin-top:3px;line-height:1.4}
.apx .dv-done .dv-title{text-decoration:line-through;color:var(--muted)}
.apx .dv-done .dv-detail{opacity:.7}

.apx .dv-rs{font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:100px;white-space:nowrap}
.apx .rs-live{background:rgba(28,138,69,.1);color:#1c8a45}
.apx .rs-partial{background:rgba(224,154,58,.12);color:#8a5f00}
.apx .rs-missing{background:rgba(231,76,60,.1);color:#c0392b}
.apx .rs-na{background:rgba(99,117,155,.1);color:#5a6d8a}

.apx .dv-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.apx .dv-exec{background:var(--accent-primary,#C9A96E);color:#fff;border:none;border-radius:7px;padding:5px 11px;font-size:.76rem;font-weight:700;font-family:inherit;cursor:pointer;white-space:nowrap;transition:.12s}
.apx .dv-exec:hover{filter:brightness(1.06)}
.apx .dv-open{font-size:.8rem;font-weight:600;color:var(--accent-primary,#C9A96E);text-decoration:none;white-space:nowrap}
.apx .dv-open:hover{text-decoration:underline}
.apx .dv-open-dim{font-size:.8rem;color:var(--muted)}
.apx .dv-del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:2px 4px;border-radius:5px}
.apx .dv-del:hover{color:#e74c3c;background:rgba(231,76,60,.08)}

.apx .dv-done-head{cursor:pointer}
.apx .dv-chev{font-size:.7rem;color:var(--muted);margin-left:6px}
.apx .dv-completed{opacity:.96}
.apx .dv-allclear{text-align:center;padding:30px;color:var(--muted);font-size:.9rem;background:#fff;border:1px dashed var(--line);border-radius:14px;margin-bottom:14px}
.apx .dv-toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:11px 20px;border-radius:11px;font-size:.85rem;font-weight:600;z-index:2000;box-shadow:0 8px 28px rgba(0,0,0,.22);animation:dvToastIn .2s ease}
@keyframes dvToastIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
`;
