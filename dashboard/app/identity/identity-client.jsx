"use client";

import { useState, useMemo, useTransition } from "react";
import AdminShell from "../components/admin-shell";
import { setIdentityStatusAction, deleteIdentityAction, createEnrollInviteAction, claimUnauthorizedAction, dismissUnauthorizedAction } from "./actions";

// The Face ID / Driver's Licence library. One card per enrolled account with its
// two photos (face + ID), status, and admin controls. Photos load on demand from
// the gated /api/identity-image route — the list itself carries no biometrics.
const STATUS = {
  verified: ["ok", "Verified"],
  pending:  ["mid", "Pending"],
  rejected: ["bad", "Rejected"],
  unverified: ["dim", "Unverified"],
};
function initials(n) { return (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }
function fmt(t) { return t ? String(t).replace("T", " ").slice(0, 10) : "—"; }

export default function IdentityClient({ user, alerts, rows = [], stats, staff = [], unauthorized = [] }) {
  const isAdmin = user.role === "admin";
  const [assign, setAssign] = useState({});   // captureId → chosen user id (defaults to the closest-match guess)
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [pending, startTx] = useTransition();
  const [confirmDel, setConfirmDel] = useState(null);   // userId awaiting delete confirm
  const [zoom, setZoom] = useState(null);               // { userId, which, name }
  const [inviteUser, setInviteUser] = useState("");     // selected staff id for an invite
  const [inviteLink, setInviteLink] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function makeInvite() {
    if (!inviteUser) return;
    setInviteBusy(true); setInviteLink(""); setCopied(false);
    const r = await createEnrollInviteAction(Number(inviteUser));
    setInviteBusy(false);
    if (r?.ok) setInviteLink(`${window.location.origin}/enroll?token=${r.token}`);
    else alert(r?.error || "Couldn't create the link.");
  }
  function copyInvite() {
    navigator.clipboard?.writeText(inviteLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  }

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => rows.filter((r) => {
    if (filter === "verified" && r.status !== "verified") return false;
    if (filter === "pending" && r.status !== "pending") return false;
    if (!q) return true;
    return (r.name || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q) || (r.role || "").toLowerCase().includes(q);
  }), [rows, q, filter]);

  const run = (fn) => startTx(async () => { const r = await fn(); if (r?.error) alert(r.error); });

  const counts = {
    all: rows.length,
    verified: rows.filter((r) => r.status === "verified").length,
    pending: rows.filter((r) => r.status === "pending").length,
  };

  return (
    <AdminShell user={user} alerts={alerts} active="identity">
      <style>{CSS}</style>
      <div className="apx-wrap">
        <div className="page-head">
          <div>
            <h1>Identity Library</h1>
            <div className="ph-sub">{stats.verified} verified · {stats.pending} pending · {stats.enrolled} enrolled</div>
          </div>
          <a href="/enroll" className="idl-enroll">Enroll a face →</a>
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 380 }} placeholder="Search name, email, or role…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="idl-tabs">
            {[["all", "All", counts.all], ["verified", "Verified", counts.verified], ["pending", "Pending", counts.pending]].map(([k, l, n]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l} {n}</button>
            ))}
          </div>
        </div>

        <div className="panel idl-invite">
          <div className="idl-invite-h">
            <b>Invite someone to enroll</b>
            <span>Creates a one-time link — they scan their ID + face without signing in first.</span>
          </div>
          <div className="idl-invite-row">
            <select className="apx-input" value={inviteUser} onChange={(e) => { setInviteUser(e.target.value); setInviteLink(""); }}>
              <option value="">Choose a person…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </select>
            <button className="idl-btn ok" disabled={!inviteUser || inviteBusy} onClick={makeInvite}>{inviteBusy ? "Creating…" : "Create link"}</button>
          </div>
          {inviteLink && (
            <div className="idl-invite-link">
              <input className="apx-input mono" readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
              <button className="idl-btn" onClick={copyInvite}>{copied ? "Copied" : "Copy"}</button>
            </div>
          )}
        </div>

        {unauthorized.length > 0 && (
          <div className="panel idl-unauth">
            <div className="idl-unauth-h">
              <b>Unauthorized captures <span className="idl-unauth-n">{unauthorized.length}</span></b>
              <span>Faces that failed to match. Identify the person and attach the face to their account — it&rsquo;ll recognize them next time (glasses, hat, mask). Auto-deleted after 30 days.</span>
            </div>
            <div className="idl-unauth-grid">
              {unauthorized.map((c) => (
                <div key={c.id} className="idl-unauth-card">
                  <img className="idl-unauth-img" src={`/api/unauthorized-image?id=${c.id}`} alt="" loading="lazy" />
                  <div className="idl-unauth-meta">
                    <span className="mono">{fmt(c.captured_at)}</span>
                    {c.best_name && <span className="idl-unauth-guess">Nearest: {c.best_name}{c.best_score != null ? ` · ${Math.round(c.best_score * 100)}%` : ""}</span>}
                  </div>
                  <div className="idl-unauth-actions">
                    <select className="apx-input" value={assign[c.id] ?? (c.best_user_id || "")} onChange={(e) => setAssign((a) => ({ ...a, [c.id]: e.target.value }))}>
                      <option value="">Assign to…</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
                    </select>
                    <button className="idl-btn ok" disabled={pending} onClick={() => run(async () => {
                      const uid = assign[c.id] ?? c.best_user_id;
                      if (!uid) return { error: "Pick a person to attach this face to." };
                      return claimUnauthorizedAction(c.id, Number(uid));
                    })}>Attach</button>
                    <button className="idl-btn" disabled={pending} onClick={() => run(() => dismissUnauthorizedAction(c.id))}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q ? "No matches." : "No one has enrolled yet — invite someone above, or share the Face Enroll link."}</div></div>
        ) : (
          <div className="idl-grid">
            {visible.map((r) => {
              const [cls, label] = STATUS[r.status] || STATUS.unverified;
              return (
                <div key={r.user_id} className="idl-card">
                  <div className="idl-photos">
                    {["face", "id"].map((which) => (
                      (which === "face" ? r.has_face_image : r.has_id_image) ? (
                        <button key={which} className="idl-ph" onClick={() => setZoom({ userId: r.user_id, which, name: r.name })} title={which === "face" ? "Face photo" : "ID photo"}>
                          <img src={`/api/identity-image?user=${r.user_id}&which=${which}`} alt="" loading="lazy" />
                          <span>{which === "face" ? "Face" : "ID"}</span>
                        </button>
                      ) : (
                        <div key={which} className="idl-ph empty"><span>{which === "face" ? "No face" : "No ID"}</span></div>
                      )
                    ))}
                  </div>

                  <div className="idl-body">
                    <div className="idl-who">
                      <span className="idl-av">{initials(r.name)}</span>
                      <div>
                        <div className="idl-name">{r.name}</div>
                        <div className="idl-meta">{r.role}{r.id_type ? ` · ${r.id_type === "passport" ? "Passport" : "Licence"}` : ""}</div>
                      </div>
                      <span className={`idl-badge ${cls}`}>{label}</span>
                    </div>
                    <div className="idl-facts">
                      {r.id_fields?.first_name && <span>{[r.id_fields.first_name, r.id_fields.last_name].filter(Boolean).join(" ")}</span>}
                      {r.enroll_score != null && <span>match {Number(r.enroll_score).toFixed(2)}</span>}
                      <span>enrolled {fmt(r.enrolled_at)}</span>
                    </div>

                    <div className="idl-acts">
                      {r.status !== "verified" && <button className="idl-btn ok" disabled={pending} onClick={() => run(() => setIdentityStatusAction(r.user_id, "verified"))}>Verify</button>}
                      {r.status !== "pending" && <button className="idl-btn" disabled={pending} onClick={() => run(() => setIdentityStatusAction(r.user_id, "pending"))}>Set pending</button>}
                      {r.status !== "rejected" && <button className="idl-btn warn" disabled={pending} onClick={() => run(() => setIdentityStatusAction(r.user_id, "rejected"))}>Reject</button>}
                      {isAdmin && (
                        confirmDel === r.user_id ? (
                          <>
                            <button className="idl-btn bad" disabled={pending} onClick={() => { setConfirmDel(null); run(() => deleteIdentityAction(r.user_id)); }}>Confirm delete</button>
                            <button className="idl-btn" onClick={() => setConfirmDel(null)}>Cancel</button>
                          </>
                        ) : (
                          <button className="idl-btn bad" onClick={() => setConfirmDel(r.user_id)}>Delete</button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {zoom && (
        <div className="idl-overlay" onClick={(e) => { if (e.target === e.currentTarget) setZoom(null); }}>
          <div className="idl-modal">
            <div className="idl-mhd"><span>{zoom.name} · {zoom.which === "face" ? "Face" : "ID"}</span><button onClick={() => setZoom(null)}>✕</button></div>
            <img src={`/api/identity-image?user=${zoom.userId}&which=${zoom.which}`} alt="" />
          </div>
        </div>
      )}
    </AdminShell>
  );
}

const CSS = `
.apx .idl-enroll{font-size:.85rem;font-weight:700;color:var(--gold-deep,#b08f4f);text-decoration:none;white-space:nowrap}
.apx .idl-enroll:hover{text-decoration:underline}
.apx .idl-tabs{display:flex;gap:6px}
.apx .idl-tabs button{height:34px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .idl-tabs button.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f);color:#fff}
.apx .idl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.apx .idl-card{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.apx .idl-photos{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:var(--line)}
.apx .idl-ph{position:relative;aspect-ratio:4/3;border:none;padding:0;cursor:pointer;background:#0B0F1A;overflow:hidden}
.apx .idl-ph img{width:100%;height:100%;object-fit:cover;display:block}
.apx .idl-ph span{position:absolute;left:6px;bottom:6px;font-size:.62rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.5);padding:2px 7px;border-radius:100px}
.apx .idl-ph.empty{display:grid;place-items:center;background:var(--bg-soft,#faf9f7);cursor:default}
.apx .idl-ph.empty span{position:static;color:var(--muted);background:none;font-weight:700}
.apx .idl-body{padding:13px 14px 14px;display:flex;flex-direction:column;gap:10px}
.apx .idl-who{display:flex;align-items:center;gap:9px}
.apx .idl-av{width:30px;height:30px;flex-shrink:0;border-radius:50%;background:#f8f0e0;color:var(--gold-deep,#b08f4f);display:grid;place-items:center;font-size:.7rem;font-weight:800}
.apx .idl-name{font-weight:700;font-size:.92rem}
.apx .idl-meta{font-size:.74rem;color:var(--muted);text-transform:capitalize}
.apx .idl-badge{margin-left:auto;font-size:.68rem;font-weight:800;text-transform:uppercase;padding:3px 10px;border-radius:100px}
.apx .idl-badge.ok{color:#1c8a45;background:#e7f6ec}.apx .idl-badge.mid{color:#8a5f00;background:#fdf3df}
.apx .idl-badge.bad{color:#c9382b;background:#fdecec}.apx .idl-badge.dim{color:var(--muted);background:#eef1f6}
.apx .idl-facts{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.76rem;color:var(--muted)}
.apx .idl-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.apx .idl-btn{height:32px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .idl-btn:hover:not(:disabled){border-color:var(--ink)}
.apx .idl-btn.ok{background:#1c8a45;border-color:#1c8a45;color:#fff}
.apx .idl-btn.warn{color:#8a5f00;border-color:#e6cf9a}
.apx .idl-btn.bad{color:#c9382b;border-color:#f0c4c4}
.apx .idl-btn.bad:hover{background:#c9382b;border-color:#c9382b;color:#fff}
.apx .idl-btn:disabled{opacity:.5;cursor:default}
.apx .idl-overlay{position:fixed;inset:0;background:rgba(11,15,26,.72);display:grid;place-items:center;z-index:200;padding:20px}
.apx .idl-modal{background:#fff;border-radius:14px;overflow:hidden;max-width:560px;width:100%}
.apx .idl-mhd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line);font-weight:700;font-size:.9rem}
.apx .idl-mhd button{border:none;background:none;font-size:1rem;cursor:pointer;color:var(--muted)}
.apx .idl-modal img{width:100%;display:block;max-height:70vh;object-fit:contain;background:#0B0F1A}
.apx .idl-unauth{padding:14px 16px;margin-bottom:14px;border-color:#e6cf9a;background:linear-gradient(0deg,rgba(230,207,154,.06),rgba(230,207,154,.06)),#fff}
.apx .idl-unauth-h{display:flex;flex-direction:column;gap:2px;margin-bottom:12px}
.apx .idl-unauth-h b{font-weight:800;font-size:.92rem;display:flex;align-items:center;gap:8px}
.apx .idl-unauth-h span{font-size:.78rem;color:var(--muted);max-width:70ch}
.apx .idl-unauth-n{font-size:.7rem;font-weight:800;color:#8a5f00;background:#f5e6c3;border-radius:100px;padding:1px 8px}
.apx .idl-unauth-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.apx .idl-unauth-card{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff;display:flex;flex-direction:column}
.apx .idl-unauth-img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#0B0F1A}
.apx .idl-unauth-meta{display:flex;flex-direction:column;gap:1px;padding:8px 10px 4px}
.apx .idl-unauth-meta .mono{font-size:.72rem;color:var(--muted)}
.apx .idl-unauth-guess{font-size:.74rem;font-weight:700;color:var(--ink)}
.apx .idl-unauth-actions{display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px 10px}
.apx .idl-unauth-actions select{flex:1 1 100%;height:32px;font-size:.76rem}
.apx .idl-invite{padding:14px 16px;margin-bottom:14px}
.apx .idl-invite-h{display:flex;flex-direction:column;gap:1px;margin-bottom:10px}
.apx .idl-invite-h b{font-weight:800;font-size:.92rem}
.apx .idl-invite-h span{font-size:.78rem;color:var(--muted)}
.apx .idl-invite-row{display:flex;gap:8px;flex-wrap:wrap}
.apx .idl-invite-row select{max-width:280px;height:36px}
.apx .idl-invite-link{display:flex;gap:8px;margin-top:9px}
.apx .idl-invite-link .apx-input{flex:1;font-size:.8rem}
.apx .idl-invite .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
`;
