"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import { archiveCustomerAction, wipeAllCustomersAction, addLegacyClientAction, importLegacyClientsAction } from "./actions";
import AddressAutocomplete from "../components/address-autocomplete";

const money = (n) => "$" + (n || 0).toLocaleString();
const SERVICES = ["Security Cameras / CCTV", "Commercial Audio", "Networking & Cat6", "Access Control / Door Entry", "NVR & Storage", "Other"];
function initials(name) { return (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }

function AddCustomerModal({ onClose, onAdded }) {
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", address: "", service: "Security Cameras / CCTV", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));


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
            <div className="cm-f"><label>Company <span className="opt">(optional)</span></label><AddressAutocomplete types={["establishment"]} className="apx-input" value={f.company} onChange={(v) => set("company", v)} onPlace={(p) => setF((f) => ({ ...f, company: p.name || f.company, address: p.address || f.address }))} placeholder="Start typing a business name…" /></div>
          </div>
          <div className="cm-row2">
            <div className="cm-f"><label>Email</label><input className="apx-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="cm-f"><label>Phone</label><input className="apx-input" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          </div>
          <div className="cm-f"><label>Service Address</label><AddressAutocomplete className="apx-input" value={f.address} onChange={(v) => set("address", v)} placeholder="123 Main St, City, NJ" /></div>
          <div className="cm-f"><label>Service</label><select className="apx-input" value={f.service} onChange={(e) => set("service", e.target.value)}>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="cm-f"><label>Notes <span className="opt">(optional)</span></label><textarea className="apx-input" rows={2} value={f.message} onChange={(e) => set("message", e.target.value)} /></div>
          {err && <div className="cm-err">{err}</div>}
          <button className="cm-submit" type="submit" disabled={busy}>{busy ? "Adding…" : "Add Customer"}</button>
        </form>
      </div>
    </div>
  );
}

// Columns the paste/CSV importer reads, in order.
const IMPORT_COLS = ["name", "phone", "email", "address", "system", "installDate", "value", "notes"];
const IMPORT_HEADS = ["Name", "Phone", "Email", "Address", "System", "Install date", "Value", "Notes"];

// Split one pasted block into rows of cells — tab-separated (Excel/Sheets paste) or CSV with quotes.
function parseDelimited(text) {
  const out = [];
  for (const line of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) continue;
    if (line.includes("\t")) { out.push(line.split("\t").map((c) => c.trim())); continue; }
    const cells = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    out.push(cells.map((c) => c.trim()));
  }
  return out;
}
// Parse the pasted text into client objects; drops a header row and any row with no name.
function rowsToClients(text) {
  const raw = parseDelimited(text);
  if (!raw.length) return [];
  const h = raw[0].map((c) => c.toLowerCase());
  const isHeader = h[0] === "name" || (h.join(" ").includes("name") && h.join(" ").includes("phone"));
  return raw.slice(isHeader ? 1 : 0)
    .map((cells) => { const o = {}; IMPORT_COLS.forEach((k, i) => (o[k] = (cells[i] || "").trim())); return o; })
    .filter((o) => o.name);
}

// "Import past clients" — backfill your book of business from before the software. Two ways in:
// paste a spreadsheet (bulk) or add one. Both create COMPLETED legacy records, not active leads.
function ImportPastClientsModal({ onClose, onDone }) {
  const [tab, setTab] = useState("bulk");            // "bulk" | "one"
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);         // { created, skipped } after a bulk import
  const [one, setOne] = useState({ name: "", phone: "", email: "", address: "", system: "", installDate: "", value: "", notes: "" });
  const [oneMsg, setOneMsg] = useState("");
  const fileRef = useRef(null);
  const setO = (k, v) => setOne((p) => ({ ...p, [k]: v }));

  const clients = tab === "bulk" ? rowsToClients(text) : [];

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ""));
    r.readAsText(f);
  }

  async function runImport() {
    setErr(""); setResult(null);
    if (!clients.length) { setErr("Nothing to import — paste rows or upload a CSV first."); return; }
    setBusy(true);
    try {
      const r = await importLegacyClientsAction(clients);
      if (r?.ok) setResult({ created: r.created, skipped: r.skipped });
      else setErr(r?.error || "Import failed.");
    } catch { setErr("Connection error."); }
    setBusy(false);
  }

  async function addOne(e) {
    e.preventDefault();
    setErr(""); setOneMsg("");
    if (!one.name.trim()) { setErr("Name is required."); return; }
    setBusy(true);
    try {
      const r = await addLegacyClientAction(one);
      if (r?.ok) { setOneMsg(`Added — customer PIN ${r.customerPin}.`); setOne({ name: "", phone: "", email: "", address: "", system: "", installDate: "", value: "", notes: "" }); }
      else setErr(r?.error || "Could not add the client.");
    } catch { setErr("Connection error."); }
    setBusy(false);
  }

  return (
    <div className="cm-overlay" onClick={(e) => { if (e.target.classList.contains("cm-overlay")) onClose(); }}>
      <div className="cm-box imp-box">
        <button className="cm-x" onClick={onClose}>×</button>
        <div className="cm-head">
          <h2>Import past clients</h2>
          <p>Backfill customers from before the software. Each becomes a <b>completed</b> record — searchable, service &amp; warranty ready — not an active lead.</p>
        </div>

        {result ? (
          <div className="imp-done">
            <div className="imp-done-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
            <div className="imp-done-n">{result.created} client{result.created === 1 ? "" : "s"} imported</div>
            {result.skipped > 0 && <div className="imp-done-sk">{result.skipped} row{result.skipped === 1 ? "" : "s"} skipped (no name)</div>}
            <button className="cm-submit" onClick={onDone}>Done</button>
          </div>
        ) : (<>
          <div className="imp-tabs">
            <button className={`imp-tab${tab === "bulk" ? " on" : ""}`} onClick={() => { setTab("bulk"); setErr(""); }}>Paste / CSV</button>
            <button className={`imp-tab${tab === "one" ? " on" : ""}`} onClick={() => { setTab("one"); setErr(""); }}>Add one</button>
          </div>

          {tab === "bulk" ? (
            <div className="cm-form">
              <div className="imp-hint">
                Paste rows from Excel/Sheets (or upload a CSV). Column order:
                <div className="imp-order">{IMPORT_HEADS.map((h, i) => <span key={h}>{h}{i === 0 ? " *" : ""}</span>)}</div>
                Only <b>Name</b> is required; leave the rest blank if you don't have them.
              </div>
              <textarea className="apx-input imp-ta" rows={6} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={"John Smith\t(646) 555-0102\tjohn@email.com\t12 Oak St, Newark NJ\tCCTV\t2024-05-10\t3200\t8 cameras + NVR"} />
              <div className="imp-filerow">
                <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Upload CSV</button>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" hidden onChange={onFile} />
                <span className="imp-count">{clients.length} row{clients.length === 1 ? "" : "s"} ready</span>
              </div>

              {clients.length > 0 && (
                <div className="imp-preview">
                  <table><thead><tr>{IMPORT_HEADS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {clients.slice(0, 25).map((c, i) => (
                        <tr key={i}>{IMPORT_COLS.map((k) => <td key={k}>{c[k] || <span className="imp-dash">—</span>}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  {clients.length > 25 && <div className="imp-more">+ {clients.length - 25} more…</div>}
                </div>
              )}

              {err && <div className="cm-err">{err}</div>}
              <button className="cm-submit" disabled={busy || !clients.length} onClick={runImport}>
                {busy ? "Importing…" : `Import ${clients.length || ""} client${clients.length === 1 ? "" : "s"}`}
              </button>
            </div>
          ) : (
            <form className="cm-form" onSubmit={addOne}>
              <div className="cm-row2">
                <div className="cm-f"><label>Name</label><input className="apx-input" value={one.name} onChange={(e) => setO("name", e.target.value)} required /></div>
                <div className="cm-f"><label>Phone</label><input className="apx-input" type="tel" value={one.phone} onChange={(e) => setO("phone", e.target.value)} /></div>
              </div>
              <div className="cm-row2">
                <div className="cm-f"><label>Email</label><input className="apx-input" type="email" value={one.email} onChange={(e) => setO("email", e.target.value)} /></div>
                <div className="cm-f"><label>System</label><input className="apx-input" value={one.system} onChange={(e) => setO("system", e.target.value)} placeholder="CCTV, ADT, Access, Audio, Network…" /></div>
              </div>
              <div className="cm-f"><label>Service Address</label><AddressAutocomplete className="apx-input" value={one.address} onChange={(v) => setO("address", v)} placeholder="123 Main St, City, NJ" /></div>
              <div className="cm-row2">
                <div className="cm-f"><label>Install date</label><input className="apx-input" type="date" value={one.installDate} onChange={(e) => setO("installDate", e.target.value)} /></div>
                <div className="cm-f"><label>System value</label><input className="apx-input" inputMode="numeric" value={one.value} onChange={(e) => setO("value", e.target.value)} placeholder="$" /></div>
              </div>
              <div className="cm-f"><label>Notes <span className="opt">(optional)</span></label><textarea className="apx-input" rows={2} value={one.notes} onChange={(e) => setO("notes", e.target.value)} /></div>
              {err && <div className="cm-err">{err}</div>}
              {oneMsg && <div className="imp-okmsg">{oneMsg}</div>}
              <button className="cm-submit" type="submit" disabled={busy}>{busy ? "Adding…" : "Add client"}</button>
            </form>
          )}
        </>)}
      </div>
    </div>
  );
}

export default function CustomersClient({ user, alerts, customers }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);   // "Import past clients" modal
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
            <button className="btn btn-ghost" onClick={() => setImporting(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Import past clients</button>
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
      {importing && <ImportPastClientsModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); router.refresh(); }} />}

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
        /* Import past clients */
        .apx .imp-box{max-width:680px}
        .apx .imp-tabs{display:inline-flex;gap:4px;background:var(--bg-soft);border:1px solid var(--line);border-radius:11px;padding:4px;margin:2px 0 16px}
        .apx .imp-tab{font-family:inherit;font-size:.86rem;font-weight:700;padding:7px 16px;border:none;background:none;border-radius:8px;color:var(--muted);cursor:pointer;transition:.15s}
        .apx .imp-tab.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(14,19,32,.12)}
        .apx .imp-hint{font-size:.82rem;color:var(--muted);line-height:1.5;margin-bottom:4px}
        .apx .imp-order{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0}
        .apx .imp-order span{font-size:.72rem;font-weight:700;color:var(--ink);background:var(--bg-tint);border:1px solid var(--line);border-radius:6px;padding:3px 8px}
        .apx .imp-ta{font-family:Menlo,Consolas,monospace;font-size:.8rem;white-space:pre;overflow-x:auto}
        .apx .imp-filerow{display:flex;align-items:center;gap:12px}
        .apx .imp-count{font-size:.82rem;font-weight:700;color:var(--gold-deep,#b08f4f)}
        .apx .imp-preview{border:1px solid var(--line);border-radius:11px;overflow:auto;max-height:230px}
        .apx .imp-preview table{width:100%;border-collapse:collapse;font-size:.78rem}
        .apx .imp-preview th{position:sticky;top:0;background:var(--bg-soft);text-align:left;font-weight:700;color:var(--muted);padding:7px 9px;white-space:nowrap;border-bottom:1px solid var(--line)}
        .apx .imp-preview td{padding:6px 9px;border-bottom:1px solid var(--line-soft,#eef0f4);color:var(--ink);white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis}
        .apx .imp-dash{color:var(--faint,#a6abb1)}
        .apx .imp-more{padding:7px 10px;font-size:.76rem;color:var(--muted);background:var(--bg-soft)}
        .apx .imp-okmsg{background:var(--green-soft,#e7f6ec);color:var(--green,#2f7d5a);font-size:.84rem;font-weight:600;padding:9px 13px;border-radius:9px}
        .apx .imp-done{text-align:center;padding:18px 6px 6px}
        .apx .imp-done-ic{width:52px;height:52px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;background:var(--green-soft,#e7f6ec);color:var(--green,#2f7d5a)}
        .apx .imp-done-ic svg{width:26px;height:26px}
        .apx .imp-done-n{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.2rem;color:var(--ink);margin-bottom:4px}
        .apx .imp-done-sk{font-size:.84rem;color:var(--muted);margin-bottom:16px}
      `}</style>
    </AdminShell>
  );
}
