"use client";
// Self-contained project contact card — the full contact header (Contact · Job site · Property · Email)
// with all the action buttons (Call, Message, Directions, Schedule, Add to contact, Share, Edit) and the
// inline edit form. It takes the SAME `customer` object the deck builds (deckCustomer), so every button's
// behavior (call logging, scheduling, share, vCard, save, service change, property toggle) is the real one
// — nothing is duplicated except the markup. Own `pcc-` classes + scoped CSS (reusing the surrounding
// tokens), so it renders anywhere, including inside the staff Project Hub's `.cpv` shell.
import { useState } from "react";
import AddressAutocomplete from "../../components/address-autocomplete";
import PropertyToggle from "../../components/property-type";

export default function ProjectContactCard({ customer, open = true, flush = false }) {
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cf, setCf] = useState({ contact_name: "", contact_phone: "", contact_email: "", address: "", service_code: "" });
  if (!customer || !open) return null;

  const startEdit = () => {
    setCf({
      contact_name: customer.contact?.contact_name || "", contact_phone: customer.contact?.contact_phone || "",
      contact_email: customer.contact?.contact_email || "", address: customer.contact?.address || "",
      service_code: customer.service_code || "",
    });
    setEdit(true);
  };
  const save = async () => {
    setSaving(true);
    let svcOk = true;
    if (customer.serviceOptions && cf.service_code && cf.service_code !== (customer.service_code || "")) {
      const rs = await customer.onServiceChange?.(cf.service_code); svcOk = !rs || rs.ok;
      if (!svcOk) alert(rs?.error || "Couldn't change the service.");
    }
    const { service_code, ...contact } = cf;
    const r = await customer.onSave?.(contact);
    setSaving(false);
    if ((!r || r.ok) && svcOk) setEdit(false); else if (r && !r.ok) alert(r.error || "Save failed.");
  };

  const propEl = customer.propertyType ? (
    <div className="pcc-field" key="prop"><dt>Property</dt><dd>
      <PropertyToggle value={customer.propertyType} editable={!!customer.canEditProperty} onChange={customer.onPropertyChange} />
    </dd></div>
  ) : null;
  const fieldEl = (f, i) => (
    <div className="pcc-field" key={i}><dt>{f.k}</dt><dd>
      {f.href ? <a className="pcc-flink" href={f.href} target={f.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{f.v}</a> : f.v}
      {f.sub && (f.subHref ? <small><a className="pcc-flink" href={f.subHref}>{f.sub}</a></small> : <small>{f.sub}</small>)}
    </dd></div>
  );
  const fields = customer.fields || [];
  const rows = [];
  let placed = false;
  fields.forEach((f, i) => { if (propEl && !placed && /email/i.test(f.k)) { rows.push(propEl); placed = true; } rows.push(fieldEl(f, i)); });
  if (propEl && !placed) rows.push(propEl);

  return (
    <section className={`pcc${flush ? " pcc-flush" : ""}`}>
      <style>{CSS}</style>
      {edit ? (
        <div className="pcc-edit">
          <label className="pcc-l">Name</label>
          <input className="pcc-i" value={cf.contact_name} onChange={(e) => setCf((v) => ({ ...v, contact_name: e.target.value }))} />
          <div className="pcc-row2">
            <div><label className="pcc-l">Phone</label><input className="pcc-i" value={cf.contact_phone} onChange={(e) => setCf((v) => ({ ...v, contact_phone: e.target.value }))} /></div>
            <div><label className="pcc-l">Email</label><input className="pcc-i" value={cf.contact_email} onChange={(e) => setCf((v) => ({ ...v, contact_email: e.target.value }))} /></div>
          </div>
          <label className="pcc-l">Job site</label>
          <AddressAutocomplete className="pcc-i" value={cf.address} onChange={(v) => setCf((s) => ({ ...s, address: v }))} onPlace={(p) => setCf((s) => ({ ...s, address: p.address }))} placeholder="Start typing, then choose the address" />
          {customer.serviceOptions && (<>
            <label className="pcc-l">Service</label>
            <select className="pcc-i" value={cf.service_code || ""} onChange={(e) => setCf((s) => ({ ...s, service_code: e.target.value }))}>
              {customer.serviceOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </>)}
          <div className="pcc-acts">
            <button className="pcc-mini primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
            <button className="pcc-mini" onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="pcc-fields">{rows}</div>
          {(customer.actions?.length > 0 || customer.canEdit) && (
            <div className="pcc-acts">
              {(customer.actions || []).map((a, i) => a.href
                ? <a className="pcc-mini pcc-ico" key={i} href={a.href} onClick={a.onClick} title={a.label} aria-label={a.label}>{a.icon || a.label}</a>
                : <button type="button" className="pcc-mini pcc-ico" key={i} onClick={a.onClick} title={a.label} aria-label={a.label}>{a.icon || a.label}</button>)}
              {customer.canEdit && (
                <button className="pcc-mini pcc-ico" title="Edit" aria-label="Edit" onClick={startEdit}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const CSS = `
.pcc{background:var(--raise,#FBFBFA);border:1px solid var(--line,#E4E4DF);border-radius:16px;padding:16px 18px}
.pcc-flush{background:none;border:0;border-radius:0;padding:16px 20px 18px}
.pcc-fields{display:flex;flex-wrap:wrap;gap:14px 34px}
.pcc-field{min-width:0}
.pcc-field dt{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--meta,#787D84);margin-bottom:3px}
.pcc-field dd{margin:0;font-size:14px;color:var(--ink,#101418);font-weight:600}
.pcc-field dd small{display:block;font-size:12.5px;font-weight:500;color:var(--meta,#787D84);margin-top:1px}
.pcc-flink{color:var(--ink,#101418);text-decoration:none}
.pcc-flink:hover{color:var(--gold-text,#8A6A1F);text-decoration:underline}
.pcc-field dd small .pcc-flink{color:var(--meta,#787D84)}
.pcc-acts{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}
.pcc-mini{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;min-width:34px;padding:0 9px;border:1px solid var(--line,#E4E4DF);border-radius:9px;background:#fff;color:var(--ink-soft,#3A4048);font:600 13px/1 inherit;cursor:pointer;text-decoration:none}
.pcc-mini:hover{border-color:var(--ink,#101418);color:var(--ink,#101418)}
.pcc-mini.primary{background:var(--gold,#C9A96E);border-color:var(--gold,#C9A96E);color:#1a1205;padding:0 16px}
.pcc-mini.primary:hover{filter:brightness(1.05)}
.pcc-ico svg{width:16px;height:16px;display:block}
.pcc-edit{display:flex;flex-direction:column;gap:7px}
.pcc-l{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--meta,#787D84)}
.pcc-i{width:100%;box-sizing:border-box;height:38px;border:1px solid var(--line,#E4E4DF);border-radius:9px;background:#fff;padding:0 11px;font-size:14px;color:var(--ink,#101418);font-family:inherit;outline:none}
.pcc-i:focus{border-color:var(--gold-text,#8A6A1F)}
.pcc-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:560px){.pcc-row2{grid-template-columns:1fr}}
`;
