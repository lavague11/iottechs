"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import { archiveCustomerAction, wipeAllCustomersAction } from "./actions";
import { attachAutocomplete } from "../../lib/places";

const money = (n) => "$" + (n || 0).toLocaleString();
const SERVICES = ["Security Cameras / CCTV", "Commercial Audio", "Networking & Cat6", "Access Control / Door Entry", "NVR & Storage", "Other"];
function initials(name) { return (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }

function AddCustomerModal({ onClose, onAdded }) {
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", address: "", service: "Security Cameras / CCTV", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Google Places autofill (business → name + address; address field → street addresses).
  const companyRef = useRef(null);
  const addressRef = useRef(null);
  useEffect(() => {
    const c1 = attachAutocomplete(companyRef.current, { types: ["establishment"], onPlace: (p) => setF((f) => ({ ...f, company: p.name || f.company, address: p.address || f.address })) });
    const c2 = attachAutocomplete(addressRef.current, { types: ["address"], onPlace: (p) => setF((f) => ({ ...f, address: p.address || f.address })) });
    return () => { c1?.(); c2?.(); };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json();
      if (j.ok) onAdded(j);
      else setErr(j.error || "Could not add customer.");
    } catch { setErr("Connection error."); }
    setBusy(false);
  }

  return (
    <div className="cm-overlay" onClick={(e) => { if (e.target.classList.contains("cm-overlay")) onClose(); }}>
      <div className="cm-box">
        <button className="cm-x" onClick={onClose}>×</button>
        <div className="cm-head"><h2>Add Customer</h2><p>Creates the customer with an opening inquiry project.</p></div>
        <form className="cm-form" onSubmit={submit}>
          <div className="cm-row2">
            <div className="cm-f"><label>Contact Name</label><input className="apx-input" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
            <div className="cm-f"><label>Company <span className="opt">(optional)</span></label><input ref={companyRef} className="apx-input" value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="Start typing a business name…" /></div>
          </div>
          <div className="cm-row2">
            <div className="cm-f"><label>Email</label><input className="apx-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="cm-f"><label>Phone</label><input className="apx-input" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          </div>
          <div className="cm-f"><label>Service Address</label><input ref={addressRef} className="apx-input" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St, City, NJ" /></div>
          <div className="cm-f"><label>Service</label><select className="apx-input" value={f.service} onChange={(e) => set("service", e.target.value)}>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="cm-f"><label>Notes <span className="opt">(optional)</span></label><textarea className="apx-input" rows={2} value={f.message} onChange={(e) => set("message", e.target.value)} /></div>
          {err && <div className="cm-err">{err}</div>}
          <button className="cm-submit" type="submit" disabled={busy}>{busy ? "Adding…" : "Add Customer"}</button>
        </form>
      </div>
    </div>
  );
}

export default function CustomersClient({ user, alerts, customers }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(null);   // customer name awaiting archive confirm
  const [wipeArm, setWipeArm] = useState(false);   // wipe-all awaiting confirm
  const [busy, startBusy] = useTransition();
  const router = useRouter();
  const q = query.trim().toLowerCase();

  const canArchive = ["admin", "manager"].includes(user.role);
  const canWipe    = user.role === "admin";

  function archive(name) {
    startBusy(async () => {
      const r = await archiveCustomerAction(name);
      setPending(null);
      if (r?.ok) router.refresh();
    });
  }
  function wipeAll() {
    startBusy(async () => {
      const r = await wipeAllCustomersAction();
      setWipeArm(false);
      if (r?.ok) router.refresh();
    });
  }

  const filtered = q
    ? customers.filter((c) =>
        c.customer.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q) ||
        c.contact_name?.toLowerCase().includes(q) ||
        c.contact_email?.toLowerCase().includes(q))
    : customers;

  return (
    <AdminShell user={user} alerts={alerts} active="customers">
      <div className="apx-wrap">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div><h1>Customers</h1><div className="ph-sub">{customers.length} on file · click a customer to open their profile</div></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canWipe && customers.length > 0 && (
              wipeArm ? (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <button className="btn" style={{ background: "var(--red)", color: "#fff" }} disabled={busy} onClick={wipeAll}>{busy ? "Wiping…" : "Confirm wipe"}</button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setWipeArm(false)}>Cancel</button>
                </span>
              ) : (
                <button className="btn btn-ghost" onClick={() => setWipeArm(true)}>Wipe all</button>
              )
            )}
            <button className="btn btn-gold" onClick={() => setAdding(true)}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> Add Customer</button>
          </div>
        </div>
        {canWipe && wipeArm && <div className="wipe-note">This archives <b>all {customers.length} customers</b> (recoverable from Archives). A ticket will log it.</div>}

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 420 }} placeholder="Search by name, address, email, or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="panel mb">
          {filtered.length === 0 ? (
            <div className="empty">No customers match &ldquo;{query}&rdquo;.</div>
          ) : filtered.map((c) => (
            <div key={c.customer} className="crow" onClick={() => router.push(`/customers/${encodeURIComponent(c.customer)}`)}>
              <span className="cav">{initials(c.customer)}</span>
              <div className="c-main">
                <div className="c-name">{c.customer}</div>
                {(c.contact_name || c.contact_email || c.contact_phone) && (
                  <div className="c-contact">{[c.contact_name, c.contact_email, c.contact_phone].filter(Boolean).join(" · ")}</div>
                )}
                <div className="c-addr">{c.address || "—"}</div>
              </div>
              <div className="c-chips">
                <span className="chip">{c.total_projects} project{c.total_projects !== 1 ? "s" : ""}</span>
                {c.active_count > 0 && <span className="chip active">{c.active_count} active</span>}
                {c.completed_count > 0 && <span className="chip done">{c.completed_count} done</span>}
                <span className="chip value">{money(c.total_value)}</span>
              </div>
              {canArchive && (
                <span className="c-arch" onClick={(e) => e.stopPropagation()}>
                  {pending === c.customer ? (
                    <>
                      <button className="arch-btn confirm" disabled={busy} onClick={() => archive(c.customer)}>{busy ? "…" : "Confirm"}</button>
                      <button className="arch-btn cancel" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="arch-btn" title="Archive this customer" onClick={() => setPending(c.customer)}>Archive</button>
                  )}
                </span>
              )}
              <span className="c-arr">→</span>
            </div>
          ))}
        </div>
      </div>

      {adding && <AddCustomerModal onClose={() => setAdding(false)} onAdded={() => { setAdding(false); router.refresh(); }} />}

      <style>{`
        .apx .cm-overlay{position:fixed;inset:0;background:rgba(14,19,32,.55);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
        .apx .cm-box{position:relative;background:#fff;border-radius:22px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:26px 28px 28px;box-shadow:0 32px 80px -24px rgba(14,19,32,.5)}
        .apx .cm-x{position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#9ca3af;line-height:1;padding:4px 8px;border-radius:8px}
        .apx .cm-x:hover{background:var(--bg-soft);color:var(--ink)}
        .apx .cm-head{margin-bottom:18px}
        .apx .cm-head h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:700;margin-bottom:6px}
        .apx .cm-head p{color:var(--muted);font-size:.9rem}
        .apx .cm-form{display:grid;gap:13px}
        .apx .cm-row2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
        .apx .cm-f{display:flex;flex-direction:column;gap:5px}
        .apx .cm-f label{font-size:.82rem;font-weight:600}
        .apx .cm-f .opt{font-weight:400;color:var(--muted)}
        .apx .cm-err{font-size:.85rem;color:var(--red);background:var(--red-soft);padding:8px 12px;border-radius:8px}
        .apx .cm-submit{width:100%;padding:12px;background:var(--gold);color:var(--ink);border:none;border-radius:12px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;transition:.18s}
        .apx .cm-submit:hover:not(:disabled){background:var(--ink);color:var(--gold)}
        .apx .cm-submit:disabled{opacity:.6;cursor:not-allowed}
        @media(max-width:620px){.apx .cm-row2{grid-template-columns:1fr}}
        .apx .wipe-note{background:var(--red-soft);color:var(--red);font-size:.82rem;font-weight:600;padding:9px 14px;border-radius:9px;margin:0 0 12px}
        .apx .c-arch{display:inline-flex;gap:6px;margin-left:6px;flex-shrink:0}
        .apx .arch-btn{font-family:inherit;font-size:.74rem;font-weight:700;padding:5px 11px;border-radius:7px;border:1px solid var(--line);background:#fff;color:var(--muted);cursor:pointer;transition:.15s;white-space:nowrap}
        .apx .arch-btn:hover{border-color:var(--red);color:var(--red);background:var(--red-soft)}
        .apx .arch-btn.confirm{background:var(--red);border-color:var(--red);color:#fff}
        .apx .arch-btn.confirm:hover{filter:brightness(1.05);color:#fff}
        .apx .arch-btn.cancel{color:var(--muted)}
        .apx .arch-btn:disabled{opacity:.55;cursor:default}
      `}</style>
    </AdminShell>
  );
}
