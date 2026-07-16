"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import { USER_ROLE_COLOR } from "../components/admin-shell";
import { updateRoleAction, updateUserInfoAction, toggleDisabledAction, createUserAction, deleteUserAction, resetPasswordAction, setUserPinAction, bulkUserAction } from "./actions";

// A staff member's project login PIN: their custom PIN if set, else the last 4 of their phone.
const phoneLast4 = (phone) => { const d = String(phone || "").replace(/\D/g, ""); return d.length >= 4 ? d.slice(-4) : ""; };
const effectivePin = (u) => (u.pin_custom ? String(u.pin_custom) : phoneLast4(u.phone));

const ALL_ROLES  = ["admin", "manager", "sales", "tech", "customer"];
const ROLE_LABEL = { admin: "Admin", manager: "Manager", sales: "Sales", tech: "Tech", customer: "Customer" };
const ROLE_COLOR = USER_ROLE_COLOR;

function capitalize(s) { return String(s || "").trim().split(/\s+/).map(w => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" "); }
function initials(name) { return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
function timeAgo(iso) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso + "Z")) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
function sessionDur(mins) {
  if (mins == null || mins < 0) return null;
  if (mins < 1) return "< 1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Readable temp password: word-ish + 3 digits, no ambiguous chars. The user hands this to the
// new hire, who resets it on first login.
function genTempPassword() {
  const words = ["Falcon", "Cedar", "Harbor", "Summit", "Cobalt", "Vector", "Maple", "Orbit", "Ranger", "Delta"];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return `${w}${n}`;
}

function EnrollModal({ actorRole, onClose, onCreated }) {
  const [f, setF] = useState({ name: "", username: "", email: "", phone: "", role: "tech", password: genTempPassword() });
  const [err, setErr] = useState("");
  const [pending, startTx] = useTransition();
  const set = (k, v) => setF((p) => ({ ...p, [k]: k === "name" ? capitalize(v) : v }));
  const roles = actorRole === "admin" ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "admin");

  function submit(e) {
    e.preventDefault();
    setErr("");
    startTx(async () => {
      const res = await createUserAction(f);
      if (res.error) setErr(res.error);
      else onCreated();
    });
  }

  return (
    <div className="um-overlay" onClick={(e) => { if (e.target.classList.contains("um-overlay")) onClose(); }}>
      <div className="um-box">
        <button className="um-x" onClick={onClose}>×</button>
        <div className="um-mhead"><h2>Enroll New User</h2><p>Create a staff or customer account.</p></div>
        <form className="um-form" onSubmit={submit}>
          <div className="um-row2">
            <div className="um-f"><label>Full Name</label><input className="apx-input" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
            <div className="um-f"><label>Username <span className="opt">(optional)</span></label><input className="apx-input" value={f.username} onChange={(e) => set("username", e.target.value)} /></div>
          </div>
          <div className="um-row2">
            <div className="um-f"><label>Email</label><input className="apx-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="um-f"><label>Phone</label><input className="apx-input" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          </div>
          <div className="um-row2">
            <div className="um-f"><label>Role</label><select className="apx-input" value={f.role} onChange={(e) => set("role", e.target.value)}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
            <div className="um-f"><label>Temp Password</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="apx-input" type="text" value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="min 6 chars" required style={{ flex: 1 }} />
                <button type="button" className="btn btn-ghost btn-sm" title="Generate a new one" onClick={() => set("password", genTempPassword())}>New</button>
              </div>
            </div>
          </div>
          {err && <div className="um-err">{err}</div>}
          <button className="um-submit" type="submit" disabled={pending}>{pending ? "Creating…" : "Create User"}</button>
        </form>
      </div>
    </div>
  );
}

function EditPanel({ user, onClose, onSaved }) {
  const [name, setName]         = useState(user.name || "");
  const [username, setUsername] = useState(user.username || "");
  const [email, setEmail]       = useState(user.email || "");
  const [phone, setPhone]       = useState(user.phone || "");
  const [password, setPassword] = useState("");
  const [err, setErr]           = useState(null);
  const [pending, startTx]      = useTransition();
  // Project-login PIN (last 4 of phone by default; a 4-digit value overrides it).
  const [pin, setPin]           = useState(user.pin_custom || "");
  const [pinMsg, setPinMsg]     = useState(null);
  const [pinPending, startPin]  = useTransition();

  function handleSave(e) {
    e.preventDefault();
    setErr(null);
    const capName = capitalize(name);
    startTx(async () => {
      const res = await updateUserInfoAction(user.id, { name: capName, username, email, phone, password: password || undefined });
      if (res.error) setErr(res.error);
      else { onSaved({ ...user, name: capName, username, email, phone }); onClose(); }
    });
  }
  function savePin(value) {
    setPinMsg(null);
    startPin(async () => {
      const res = await setUserPinAction(user.id, value);
      if (res.error) { setPinMsg({ err: res.error }); return; }
      setPin(res.custom ? res.pin : "");
      onSaved({ ...user, pin_custom: res.custom ? res.pin : null });
      setPinMsg(res.conflict
        ? { warn: `PIN ${res.pin} conflicts with ${res.conflict.count} other login — service ticket #${res.conflict.ticketId} opened.` }
        : { ok: res.pin ? `PIN set to ${res.pin}.` : "Reset — PIN now follows the phone." });
    });
  }

  return (
    <tr className="edit-row">
      <td colSpan={6}>
        <form className="edit-form" onSubmit={handleSave}>
          <div className="edit-title">Edit — {user.name}</div>
          <div className="edit-grid">
            <label>Full Name<input className="apx-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Username<input className="apx-input" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
            <label>Email<input className="apx-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Phone<input className="apx-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label>New Password <span className="opt">(leave blank to keep)</span><input className="apx-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
            <label>Project PIN <span className="opt">(4 digits — blank = last 4 of phone: {phoneLast4(phone) || "—"})</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className="apx-input" inputMode="numeric" maxLength={4} placeholder={phoneLast4(phone) || "----"} value={pin}
                       onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} style={{ width: 90, letterSpacing: 2 }} />
                <button type="button" className="btn btn-ghost btn-sm" disabled={pinPending} onClick={() => savePin(pin)}>Set</button>
                {user.pin_custom && <button type="button" className="btn btn-ghost btn-sm" disabled={pinPending} onClick={() => { setPin(""); savePin(""); }}>Reset</button>}
              </span>
            </label>
          </div>
          {pinMsg && <div className="edit-err" style={{ color: pinMsg.err ? undefined : (pinMsg.warn ? "var(--red)" : "var(--green)") }}>{pinMsg.err || pinMsg.warn || pinMsg.ok}</div>}
          {err && <div className="edit-err">{err}</div>}
          <div className="edit-actions">
            <button type="submit" className="btn btn-gold btn-sm" disabled={pending}>{pending ? "Saving…" : "Save Changes"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function UserRow({ user: initUser, actorRole, selfId, selected, onToggleSelect }) {
  const [user, setUser]       = useState(initUser);
  const [role, setRole]       = useState(initUser.role);
  const [disabled, setDisabled] = useState(!!initUser.disabled);
  const [saved, setSaved]     = useState(false);
  const [err, setErr]         = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removed, setRemoved]       = useState(false);
  const [tempPw, setTempPw]         = useState(null);
  const [pending, startTx]          = useTransition();

  const allowedRoles = actorRole === "admin" ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "admin");
  const isLocked     = actorRole === "manager" && user.role === "admin";

  function handleRoleSave() {
    startTx(async () => {
      const res = await updateRoleAction(user.id, role);
      if (res.error) { setErr(res.error); setRole(user.role); }
      else { setSaved(true); setTimeout(() => setSaved(false), 2200); }
    });
  }
  function handleSetDisabled(next) {
    setErr(null);
    startTx(async () => {
      const res = await toggleDisabledAction(user.id, next);
      if (res.error) setErr(res.error);
      else { setDisabled(!!res.disabled); setConfirming(false); }
    });
  }
  function handleDelete() {
    setErr(null);
    startTx(async () => {
      const res = await deleteUserAction(user.id);
      if (res.error) setErr(res.error);
      else setRemoved(true);
    });
  }

  if (removed) return null;

  const ago = timeAgo(user.last_login);
  const dur = sessionDur(user.session_mins);

  return (
    <>
      <tr style={disabled ? { opacity: 0.55 } : undefined} className={selected ? "urow-sel" : undefined}>
        <td className="ucb">
          {isLocked || user.id === selfId
            ? null
            : <input type="checkbox" checked={!!selected} onChange={() => onToggleSelect?.(user.id)} aria-label={`Select ${user.name}`} />}
        </td>
        <td>
          <div className={`uname-cell${isLocked ? " locked" : ""}`} onClick={isLocked ? undefined : () => setEditing((v) => !v)} title={isLocked ? undefined : "Click to edit"}>
            <div className="uav">{initials(user.name)}</div>
            <div>
              <div className="un">{user.name}{disabled && <span className="chip" style={{ marginLeft: 8, background: "var(--red-soft)", color: "var(--red)" }}>Disabled</span>}{!isLocked && <span style={{ color: "var(--muted)", marginLeft: 6, fontSize: ".8rem" }}>✎</span>}</div>
              <div className="uh">{user.username || "—"}</div>
            </div>
          </div>
        </td>
        <td style={{ color: "var(--muted)" }}><div>{user.email || "—"}</div>{user.phone && <div style={{ fontSize: ".8rem" }}>{user.phone}</div>}</td>
        <td>
          {isLocked ? <span className={`role-chip role-${user.role}`}>{ROLE_LABEL[user.role]}</span> : (
            <select className="usel" value={role} onChange={(e) => { setRole(e.target.value); setSaved(false); setErr(null); }} disabled={pending}>
              {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          )}
        </td>
        <td style={{ color: "var(--muted)", fontSize: ".82rem" }}>
          {ago ? <><div style={{ color: "var(--ink)", fontWeight: 600 }}>{ago}</div>{dur && <div>Session: {dur}</div>}</> : <span>Never</span>}
        </td>
        <td className="num">
          {isLocked ? <span className="chip">Protected</span> : (
            <div style={{ display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
              {err && <span style={{ color: "var(--red)", fontSize: ".78rem" }}>{err}</span>}
              {saved && <span className="save-flash">Saved ✓</span>}
              {role !== user.role && !saved && <button className="btn btn-gold btn-sm" onClick={handleRoleSave} disabled={pending}>{pending ? "…" : "Save Role"}</button>}
              {disabled && <button className="btn btn-gold btn-sm" onClick={() => handleSetDisabled(false)} disabled={pending}>Enable</button>}
              <button className="btn-icon-reset" title="Reset password" disabled={pending} onClick={() => {
                startTx(async () => {
                  const res = await resetPasswordAction(user.id);
                  if (res.error) setErr(res.error);
                  else setTempPw(res.tempPassword);
                });
              }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
              </button>
              <button className="btn-icon-del" title="Delete user" onClick={() => setConfirming(true)} disabled={pending}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
              {confirming && (
                <div className="um-overlay" onClick={(e) => { if (e.target.classList.contains("um-overlay")) setConfirming(false); }}>
                  <div className="um-box um-confirm">
                    <div className="umc-icon"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg></div>
                    <h2 className="umc-title">Delete {user.name}&apos;s profile?</h2>
                    <p className="umc-body">
                      The account will be moved to <b>Archives</b>, where an admin can restore it later.
                      {!disabled && <> If you only want to pause access, <b>disable</b> it instead — disabled accounts keep their data and can be re-enabled instantly.</>}
                    </p>
                    {err && <div className="umc-err">{err}</div>}
                    <div className="umc-actions">
                      <button className="btn btn-danger" onClick={handleDelete} disabled={pending}>{pending ? "…" : "Delete & archive"}</button>
                      {!disabled && <button className="btn btn-gold" onClick={() => handleSetDisabled(true)} disabled={pending}>Just disable</button>}
                      <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={pending}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </td>
      </tr>
      {editing && <EditPanel user={user} onClose={() => setEditing(false)} onSaved={(u) => setUser(u)} />}
      {tempPw && (
        <tr>
          <td colSpan={6}>
            <div className="um-overlay" onClick={(e) => { if (e.target.classList.contains("um-overlay")) setTempPw(null); }}>
              <div className="um-box" style={{ maxWidth: 400, textAlign: "center" }}>
                <div className="umc-icon" style={{ color: "#C9A96E" }}>
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <h2 className="umc-title">Password Reset</h2>
                <p className="umc-body">Share this temporary password with <strong>{user.name}</strong>. They can log in and change it from their profile.</p>
                <div className="pw-reveal">
                  <span className="pw-val">{tempPw}</span>
                  <button className="pw-copy" onClick={() => navigator.clipboard.writeText(tempPw)} title="Copy">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copy
                  </button>
                </div>
                <div className="umc-actions" style={{ justifyContent: "center", marginTop: 16 }}>
                  <button className="btn btn-gold" onClick={() => setTempPw(null)}>Done</button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function UsersClient({ user, alerts, users, actorRole }) {
  const [search, setSearch]       = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [enrolling, setEnrolling] = useState(false);
  const [pending, startTx]        = useTransition();
  const router = useRouter();
  const needle = search.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (!needle) return true;
    return [u.name, u.username, u.email, u.phone, u.role].filter(Boolean).some((v) => v.toLowerCase().includes(needle));
  });
  const countByRole = ALL_ROLES.reduce((acc, r) => { acc[r] = users.filter(u => u.role === r).length; return acc; }, {});

  // ---- Bulk selection ---- (never select yourself, or an admin row when you're a manager)
  const [sel, setSel] = useState(() => new Set());
  const [bulkDel, setBulkDel] = useState(false);
  const selectableIds = filtered
    .filter((u) => u.id !== user.id && !(actorRole === "manager" && u.role === "admin"))
    .map((u) => u.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => sel.has(id));
  const toggleOne = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel((s) => (selectableIds.every((id) => s.has(id)) ? new Set() : new Set(selectableIds)));
  const clearSel = () => setSel(new Set());
  function runBulk(op) {
    const ids = [...sel];
    if (op === "delete") { setBulkDel(false); }
    startTx(async () => { await bulkUserAction(ids, op); clearSel(); router.refresh(); });
  }

  return (
    <AdminShell user={user} alerts={alerts} active="users">
      <div className="apx-wrap">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div><h1>Users &amp; Roles</h1><div className="ph-sub">{filtered.length} of {users.length} accounts{actorRole === "manager" ? " · Manager view — admin role restricted" : ""}</div></div>
          <button className="btn btn-enroll" onClick={() => setEnrolling(true)}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> Enroll User</button>
        </div>

        <div className="sec-head" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="role-filters">
            <button className={`rf-chip${roleFilter === "all" ? " active" : ""}`} onClick={() => setRoleFilter("all")}>
              All <span className="rf-count">{users.length}</span>
            </button>
            {ALL_ROLES.map((r) => (
              <button
                key={r}
                className={`rf-chip${roleFilter === r ? " active" : ""}`}
                style={roleFilter === r ? { background: ROLE_COLOR[r], color: r === "admin" ? "#0a1020" : "#fff", borderColor: ROLE_COLOR[r] } : { borderColor: ROLE_COLOR[r] + "55", color: ROLE_COLOR[r] }}
                onClick={() => setRoleFilter(r)}
              >
                {ROLE_LABEL[r]} <span className="rf-count">{countByRole[r] || 0}</span>
              </button>
            ))}
          </div>
          <input className="apx-input" style={{ maxWidth: 260 }} placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {sel.size > 0 && (
          <div className="usr-bulkbar">
            <span className="usr-bulk-count">{sel.size} selected</span>
            <div className="usr-bulk-acts">
              <button className="btn btn-sm" onClick={() => runBulk("enable")} disabled={pending}>Enable</button>
              <button className="btn btn-sm" onClick={() => runBulk("disable")} disabled={pending}>Disable</button>
              <button className="btn btn-sm" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => setBulkDel(true)} disabled={pending}>Delete</button>
              <button className="btn btn-sm btn-ghost" onClick={clearSel}>Clear</button>
            </div>
          </div>
        )}

        <div className="panel mb">
          <table className="dtable">
            <thead><tr><th className="ucb"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" disabled={selectableIds.length === 0} /></th><th>User</th><th>Contact</th><th>Role</th><th>Last Login</th><th></th></tr></thead>
            <tbody>{filtered.map((u) => <UserRow key={u.id} user={u} actorRole={actorRole} selfId={user.id} selected={sel.has(u.id)} onToggleSelect={toggleOne} />)}</tbody>
          </table>
          {filtered.length === 0 && <div className="empty">No users match this filter.</div>}
        </div>

        <ConfirmDialog
          open={bulkDel}
          title={`Delete ${sel.size} user${sel.size === 1 ? "" : "s"}?`}
          message={<>The selected accounts move to <strong>Archives</strong> — an admin can restore them later. Your own account and protected admins are skipped.</>}
          confirmLabel="Delete & archive"
          busy={pending}
          onConfirm={() => runBulk("delete")}
          onCancel={() => setBulkDel(false)}
        />
      </div>

      {enrolling && <EnrollModal actorRole={actorRole} onClose={() => setEnrolling(false)} onCreated={() => { setEnrolling(false); router.refresh(); }} />}

      <style>{`
        .apx .ucb{width:38px;text-align:center}
        .apx .ucb input{cursor:pointer;width:15px;height:15px}
        .apx .urow-sel{background:rgba(201,169,110,.08)}
        .apx .usr-bulkbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--ink);color:#fff;border-radius:12px;padding:10px 16px;margin-bottom:12px}
        .apx .usr-bulk-count{font-weight:700;font-size:.88rem}
        .apx .usr-bulk-acts{display:flex;gap:8px;flex-wrap:wrap}
        .apx .usr-bulkbar .btn{background:#fff;border:1px solid transparent}
        .apx .usr-bulkbar .btn-ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.3)}
        .apx .role-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .apx .rf-chip{border:1.5px solid var(--line);background:transparent;border-radius:100px;padding:4px 11px;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit;display:inline-flex;align-items:center;gap:5px;color:var(--ink)}
        .apx .rf-chip.active{box-shadow:0 2px 8px rgba(0,0,0,.12)}
        .apx .rf-chip:not(.active):hover{background:var(--bg-soft)}
        .apx .rf-chip .rf-count{opacity:.7;font-weight:500}
        .apx .btn-enroll{background:#1a2340;color:#C9A96E;border:1.5px solid rgba(201,169,110,.3);border-radius:10px;padding:8px 16px;font-size:.86rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:inherit;transition:background .15s,border-color .15s}
        .apx .btn-enroll:hover{background:#222d50;border-color:rgba(201,169,110,.5)}
        .apx .btn-enroll svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .apx .um-overlay{position:fixed;inset:0;background:rgba(14,19,32,.55);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
        .apx .um-box{position:relative;background:#fff;border-radius:22px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:26px 28px 28px;box-shadow:0 32px 80px -24px rgba(14,19,32,.5)}
        .apx .um-x{position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#9ca3af;line-height:1;padding:4px 8px;border-radius:8px}
        .apx .um-x:hover{background:var(--bg-soft);color:var(--ink)}
        .apx .um-mhead{margin-bottom:18px}
        .apx .um-mhead h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:700;margin-bottom:6px}
        .apx .um-mhead p{color:var(--muted);font-size:.9rem}
        .apx .um-form{display:grid;gap:13px}
        .apx .um-row2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
        .apx .um-f{display:flex;flex-direction:column;gap:5px}
        .apx .um-f label{font-size:.82rem;font-weight:600}
        .apx .um-f .opt{font-weight:400;color:var(--muted)}
        .apx .um-err{font-size:.85rem;color:var(--red);background:var(--red-soft);padding:8px 12px;border-radius:8px}
        .apx .um-submit{width:100%;padding:12px;background:var(--gold);color:var(--ink);border:none;border-radius:12px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;transition:.18s}
        .apx .um-submit:hover:not(:disabled){background:var(--ink);color:var(--gold)}
        .apx .um-submit:disabled{opacity:.6;cursor:not-allowed}
        @media(max-width:620px){.apx .um-row2{grid-template-columns:1fr}}

        .apx .btn-danger{background:var(--red);color:#fff}
        .apx .btn-danger:hover{background:#b32d2d}
        .apx .btn-icon-del,.btn-icon-del{width:30px;height:30px;border-radius:7px;background:transparent;border:1.5px solid rgba(231,76,60,.3);color:#e74c3c;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,border-color .12s;padding:0;flex-shrink:0}
        .apx .btn-icon-del:hover,.btn-icon-del:hover{background:rgba(231,76,60,.08);border-color:#e74c3c}
        .apx .btn-icon-del:disabled,.btn-icon-del:disabled{opacity:.4;cursor:not-allowed}
        .apx .btn-icon-reset{width:30px;height:30px;border-radius:7px;background:transparent;border:1.5px solid rgba(201,169,110,.3);color:#C9A96E;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,border-color .12s;padding:0;flex-shrink:0}
        .apx .btn-icon-reset:hover{background:rgba(201,169,110,.1);border-color:#C9A96E}
        .apx .btn-icon-reset:disabled{opacity:.4;cursor:not-allowed}
        .apx .pw-reveal{display:flex;align-items:center;gap:8px;background:#f0f4ff;border:2px solid #C9A96E;border-radius:10px;padding:10px 14px;margin:10px auto;width:fit-content}
        .apx .pw-val{font-family:monospace;font-size:1.18rem;font-weight:700;letter-spacing:.08em;color:var(--ink)}
        .apx .pw-copy{display:inline-flex;align-items:center;gap:5px;background:#C9A96E;color:#0a1020;border:none;border-radius:7px;padding:5px 10px;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background .12s}
        .apx .pw-copy:hover{background:#b8914a}
        .apx .um-confirm{max-width:430px;text-align:center;padding:30px 28px 26px}
        .apx .umc-icon{width:52px;height:52px;border-radius:14px;background:var(--red-soft);display:grid;place-items:center;margin:0 auto 16px}
        .apx .umc-icon svg{width:24px;height:24px;fill:none;stroke:var(--red);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .apx .umc-title{font-family:'Bricolage Grotesque',sans-serif;font-size:1.2rem;font-weight:700;margin-bottom:8px}
        .apx .umc-body{color:var(--muted);font-size:.9rem;line-height:1.5;margin-bottom:18px}
        .apx .umc-body b{color:var(--ink)}
        .apx .umc-err{font-size:.85rem;color:var(--red);background:var(--red-soft);padding:8px 12px;border-radius:8px;margin-bottom:14px}
        .apx .umc-actions{display:flex;flex-direction:column;gap:9px}
        .apx .umc-actions .btn{width:100%;justify-content:center;padding:11px;font-size:.92rem}
      `}</style>
    </AdminShell>
  );
}
