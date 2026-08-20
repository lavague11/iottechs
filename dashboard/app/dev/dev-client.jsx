"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import { toggleDevTaskAction, addDevTaskAction, deleteDevTaskAction, saveSecretAction, clearSecretAction } from "./actions";
import { setLoginTwoFactorAction } from "../login/actions";

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

const SRC_BADGE = {
  stored: { label: "Stored",   cls: "kv-stored" },
  env:    { label: "From env", cls: "kv-env" },
  none:   { label: "Missing",  cls: "kv-none" },
};

function KeyRow({ row, onFlash }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, startTx] = useTransition();
  const [rows, setRows] = useState(row);
  const badge = SRC_BADGE[rows.source] || SRC_BADGE.none;

  function save() {
    const v = val.trim();
    if (!v) return;
    startTx(async () => {
      const r = await saveSecretAction(rows.key, v);
      if (r?.error) { onFlash(r.error); return; }
      setRows(p => ({ ...p, source: "stored", masked: "••••••••" + v.slice(-4), updated_at: "just now" }));
      setVal(""); setOpen(false); setReveal(false);
      onFlash(`${rows.key} saved`);
    });
  }
  function clear() {
    startTx(async () => {
      const r = await clearSecretAction(rows.key);
      if (r?.error) { onFlash(r.error); return; }
      setRows(p => ({ ...p, source: "none", masked: "", updated_at: null }));
      onFlash(`${rows.key} cleared`);
    });
  }

  return (
    <div className="kv-row">
      <div className="kv-main">
        <div className="kv-line">
          <span className="kv-name">{rows.name}</span>
          <span className={`kv-badge ${badge.cls}`}>{badge.label}</span>
          {rows.clientExposed && <span className="kv-badge kv-pub" title="Served to the browser (inherent to client-side Maps)">Browser key</span>}
          {!rows.known && <span className="kv-badge kv-custom">Custom</span>}
        </div>
        <code className="kv-key">{rows.key}</code>
        {rows.powers && <div className="kv-powers">{rows.powers}</div>}
        {rows.masked && <div className="kv-masked">{rows.masked}{rows.updated_at ? <span className="kv-when"> · updated {rows.updated_at}</span> : null}</div>}
      </div>
      <div className="kv-actions">
        {rows.docs && <a className="kv-doc" href={rows.docs} target="_blank" rel="noreferrer">Get key ↗</a>}
        <button className="kv-edit" onClick={() => setOpen(v => !v)}>{open ? "Cancel" : rows.source === "none" ? "+ Add" : "Replace"}</button>
        {rows.source === "stored" && <button className="kv-clear" disabled={busy} onClick={clear} title="Remove stored value (falls back to env)">Clear</button>}
      </div>
      {open && (
        <div className="kv-edit-row">
          <input
            className="kv-input"
            type={reveal ? "text" : "password"}
            value={val}
            placeholder={`Paste ${rows.key}…`}
            autoComplete="off" spellCheck={false}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); }}
          />
          <button className="kv-eye" type="button" onClick={() => setReveal(v => !v)}>{reveal ? "Hide" : "Show"}</button>
          <button className="kv-save" disabled={busy || !val.trim()} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      )}
    </div>
  );
}

function ApiKeysCard({ secrets, onFlash }) {
  const [showAdd, setShowAdd] = useState(false);
  const [nk, setNk] = useState(""); const [nv, setNv] = useState("");
  const [busy, startTx] = useTransition();
  const [extra, setExtra] = useState([]);   // custom keys added this session
  const rows = [...secrets, ...extra];

  function addCustom() {
    const key = nk.trim().toUpperCase().replace(/\s+/g, "_");
    const v = nv.trim();
    if (!key || !v) return;
    startTx(async () => {
      const r = await saveSecretAction(key, v);
      if (r?.error) { onFlash(r.error); return; }
      if (!rows.some(x => x.key === key)) {
        setExtra(e => [...e, { key, name: key, powers: "", docs: "", clientExposed: false, known: false, source: "stored", masked: "••••••••" + v.slice(-4), updated_at: "just now" }]);
      }
      setNk(""); setNv(""); setShowAdd(false);
      onFlash(`${key} saved`);
    });
  }

  return (
    <div className="kv-card">
      <div className="kv-head">
        <div>
          <div className="kv-title">API Keys</div>
          <div className="kv-sub">Central vault for every integration key. Stored on the server disk (never in git); the app reads here first, then falls back to environment variables.</div>
        </div>
        <button className="kv-addbtn" onClick={() => setShowAdd(v => !v)}>{showAdd ? "Cancel" : "+ Add key"}</button>
      </div>
      {showAdd && (
        <div className="kv-addform">
          <input className="kv-input kv-addkey" value={nk} placeholder="KEY_NAME" onChange={e => setNk(e.target.value)} spellCheck={false} autoComplete="off" />
          <input className="kv-input" value={nv} placeholder="Value" onChange={e => setNv(e.target.value)} spellCheck={false} autoComplete="off" onKeyDown={e => { if (e.key === "Enter") addCustom(); }} />
          <button className="kv-save" disabled={busy || !nk.trim() || !nv.trim()} onClick={addCustom}>{busy ? "Saving…" : "Save"}</button>
        </div>
      )}
      <div className="kv-list">
        {rows.map(r => <KeyRow key={r.key} row={r} onFlash={onFlash} />)}
      </div>
    </div>
  );
}

// The SMS-2FA kill-switch. Admin flips it off when Twilio is misbehaving so logins fall back to password.
function TwoFactorCard({ twoFactor, onFlash }) {
  const [on, setOn] = useState(!!twoFactor.enabled);
  const [busy, startTx] = useTransition();
  const ready = !!twoFactor.ready;
  const provider = twoFactor.provider ? (twoFactor.provider === "telnyx" ? "Telnyx" : "Twilio") : null;
  function flip() {
    const next = !on;
    startTx(async () => {
      const r = await setLoginTwoFactorAction(next);
      if (r?.error) { onFlash(r.error); return; }
      setOn(next);
      onFlash(next ? "SMS 2FA turned on" : "SMS 2FA turned off — password login only");
    });
  }
  return (
    <div className="kv-card">
      <div className="kv-head">
        <div>
          <div className="kv-title">SMS 2-Factor Login</div>
          <div className="kv-sub">Phone-number login texts a one-time code. Turn this off if your SMS provider is down — everyone falls back to password / Face ID / PIN. {ready ? `Active provider: ${provider}.` : "Add Twilio or Telnyx keys above to enable it."}</div>
        </div>
        <button type="button" role="switch" aria-checked={on} className={`tf-switch${on ? " on" : ""}`} disabled={busy} onClick={flip}><span className="tf-knob" /></button>
      </div>
      <div className="kv-sub" style={{ marginTop: 8 }}>Status: <b style={{ color: on ? (ready ? "#1c8a45" : "#b87300") : "#b87300" }}>{on ? (ready ? `On — codes texted via ${provider}` : "On, but no SMS provider connected") : "Off — password login only"}</b></div>
      <style>{`.tf-switch{position:relative;width:46px;height:26px;border-radius:99px;border:none;background:#c9ccd4;cursor:pointer;transition:background .18s;flex:none}.tf-switch.on{background:#1c8a45}.tf-switch:disabled{opacity:.6;cursor:default}.tf-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.3)}.tf-switch.on .tf-knob{transform:translateX(20px)}`}</style>
    </div>
  );
}

export default function DevClient({ user, alerts, tasks: initTasks, sampleProjectId, secrets = [], twoFactor = {} }) {
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
          <Link href="/dev/role-map" className="dv-map-link">🗺 Role &amp; Flow Map — who sees what, per step</Link>
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

        {/* API key vault */}
        <ApiKeysCard secrets={secrets} onFlash={flash} />
        <TwoFactorCard twoFactor={twoFactor} onFlash={flash} />

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
.apx .dv-map-link{display:inline-block;margin-top:10px;font-size:.84rem;font-weight:800;color:#b08f4f;text-decoration:none;border:1px solid #e5d3a1;background:#fdf9ef;border-radius:9px;padding:8px 14px}
.apx .dv-map-link:hover{background:#C9A96E;border-color:#C9A96E;color:#fff}
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

/* API key vault */
.apx .kv-card{background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:18px;overflow:hidden}
.apx .kv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px 18px;border-bottom:1px solid var(--line);background:var(--bg-soft,#faf9f7)}
.apx .kv-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem}
.apx .kv-sub{color:var(--muted);font-size:.79rem;margin-top:4px;line-height:1.45;max-width:62ch}
.apx .kv-addbtn{flex-shrink:0;background:var(--ink);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer}
.apx .kv-addform{display:flex;gap:8px;padding:12px 18px;border-bottom:1px solid var(--line);background:#fbfaf8}
.apx .kv-addkey{max-width:220px}
.apx .kv-list{display:flex;flex-direction:column}
.apx .kv-row{padding:14px 18px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:1fr auto;gap:10px 14px;align-items:start}
.apx .kv-row:last-child{border-bottom:none}
.apx .kv-main{min-width:0}
.apx .kv-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.apx .kv-name{font-weight:700;font-size:.9rem}
.apx .kv-badge{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:100px;white-space:nowrap}
.apx .kv-stored{background:rgba(28,138,69,.1);color:#1c8a45}
.apx .kv-env{background:rgba(99,117,155,.12);color:#5a6d8a}
.apx .kv-none{background:rgba(224,154,58,.14);color:#8a5f00}
.apx .kv-pub{background:rgba(46,120,210,.1);color:#2668b8}
.apx .kv-custom{background:rgba(120,90,180,.1);color:#6b4fa0}
.apx .kv-key{display:inline-block;margin-top:5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.74rem;color:var(--muted);background:var(--bg-soft,#f4f2ee);border:1px solid var(--line);border-radius:6px;padding:1px 7px}
.apx .kv-powers{font-size:.78rem;color:var(--muted);margin-top:6px;line-height:1.4}
.apx .kv-masked{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.78rem;color:var(--ink);margin-top:6px;letter-spacing:.04em}
.apx .kv-when{font-family:inherit;color:var(--muted);letter-spacing:normal}
.apx .kv-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.apx .kv-doc{font-size:.76rem;font-weight:600;color:var(--accent-primary,#C9A96E);text-decoration:none;white-space:nowrap}
.apx .kv-doc:hover{text-decoration:underline}
.apx .kv-edit{background:#fff;color:var(--ink);border:1.5px solid var(--line);border-radius:8px;padding:5px 12px;font-size:.78rem;font-weight:600;font-family:inherit;cursor:pointer;transition:.12s}
.apx .kv-edit:hover{border-color:var(--accent-primary,#C9A96E)}
.apx .kv-clear{background:none;border:1.5px solid transparent;color:var(--muted);border-radius:8px;padding:5px 8px;font-size:.78rem;font-weight:600;font-family:inherit;cursor:pointer}
.apx .kv-clear:hover{color:#e74c3c;background:rgba(231,76,60,.08)}
.apx .kv-edit-row{grid-column:1 / -1;display:flex;gap:8px;margin-top:4px}
.apx .kv-input{flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:.84rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);background:#fff}
.apx .kv-input:focus{outline:none;border-color:var(--accent-primary,#C9A96E)}
.apx .kv-eye{background:#fff;border:1.5px solid var(--line);border-radius:8px;padding:0 12px;font-size:.76rem;font-weight:600;font-family:inherit;cursor:pointer;color:var(--muted)}
.apx .kv-save{background:var(--accent-primary,#C9A96E);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:.82rem;font-weight:700;font-family:inherit;cursor:pointer;white-space:nowrap}
.apx .kv-save:disabled{opacity:.5;cursor:default}
@media(max-width:640px){.apx .kv-row{grid-template-columns:1fr}.apx .kv-actions{justify-content:flex-start}}
`;
