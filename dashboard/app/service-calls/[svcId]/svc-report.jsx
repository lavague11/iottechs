"use client";

import Link from "next/link";
import { documentModel, timeOnSite, DEVICE_STATUS_META, CAUSE_CATEGORY_LABEL, SVC_CAUSE_CATEGORY, svcMoney as money } from "../../../lib/svc-model";

// The Service Call document — report / diagnostic / proposal — rendered from ONE record through
// documentModel (lib/svc-model.js). Regions with nothing to say are not rendered; page 2 exists only
// when there is something to decide or accept. Web view and print/PDF are the same markup.
const day = (d) => (d ? new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—");
const shortDay = (d) => (d ? new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const CAUSE_TONE = Object.fromEntries(SVC_CAUSE_CATEGORY.map((c) => [c.key, c.tone]));

function Region({ r, rows }) {
  switch (r.key) {
    case "EQUIPMENT_FINDINGS": return (
      <table className="sr-cam">
        <thead><tr><th className="no">#</th><th>Device</th><th className="st">Status</th>{r.columns.map(([k, l]) => <th key={k}>{l}</th>)}<th>Finding / Cause</th><th>Type</th></tr></thead>
        <tbody>
          {r.rows.map((d) => { const m = DEVICE_STATUS_META[d.status] || DEVICE_STATUS_META.NOT_TESTED; return (
            <tr key={d.id}>
              <td className="no">{d.n}</td>
              <td>{d.label}</td>
              <td className={`st tone-${m.tone}`}>{m.short}</td>
              {r.columns.map(([k]) => <td key={k}>{d.fields[k] || "—"}</td>)}
              <td>{d.finding || "—"}</td>
              <td>{d.cause ? <span className={`sr-badge b-${CAUSE_TONE[d.cause] || "slate"}`}>{CAUSE_CATEGORY_LABEL[d.cause]}</span> : null}</td>
            </tr>); })}
        </tbody>
      </table>);
    case "SUMMARY": return <div className="sr-summary"><strong>Summary:</strong> {r.text}</div>;
    case "REPAIR_OPTIONS": return (
      <div className={`sr-compare n${Math.min(r.options.length, 3)}`}>
        {r.options.map((o) => (
          <div key={o.id} className={`sr-box ${o.recommended ? "rec" : ""}`}>
            <h4>{o.title}{o.recommended ? " — Recommended" : ""}</h4>
            {o.description && <p>{o.description}</p>}
            {o.bullets.length > 0 && <ul>{o.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
            {(o.cost.text !== "—" || o.warranty || o.reliability) && <div className="sr-box-meta">{[o.cost.text !== "—" && o.cost.text, o.warranty && `Warranty: ${o.warranty}`, o.reliability && `Reliability: ${o.reliability}`].filter(Boolean).join(" · ")}</div>}
          </div>
        ))}
      </div>);
    case "COST_COMPARISON": return (
      <table className="sr-cost">
        <thead><tr><th>Approach</th><th className="num">Cost</th><th className="num">Warranty</th><th className="num">Reliability</th></tr></thead>
        <tbody>{r.rows.map((o, i) => <tr key={i} className={o.recommended ? "rec" : ""}><td>{o.title}{o.description ? ` — ${o.description}` : ""}</td><td className="num">{o.cost}</td><td className="num">{o.warranty}</td><td className="num">{o.reliability}</td></tr>)}</tbody>
      </table>);
    case "RECOMMENDATION": return (
      <div className="sr-rec"><div className="lbl">Formal Recommendation</div>
        <div className="txt"><strong>{r.text}</strong>{r.proposal ? <> Scope and pricing are itemized in proposal <strong>{r.proposal.number}</strong>{r.proposal.total != null ? <>, total <strong>{money(r.proposal.total)}</strong></> : null}.</> : r.estimateTotal != null ? <> Estimate total <strong>{money(r.estimateTotal)}</strong>.</> : null}</div>
      </div>);
    case "SCOPE": return <p className="sr-p"><strong>Scope{r.number ? ` (per ${r.number})` : ""}:</strong> {r.lines.join(" · ")}</p>;
    case "CHARGES": return r.items ? (
      <>
        <table className="sr-cost">
          <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
          <tbody>{r.items.map((it, i) => <tr key={i}><td>{it.desc}</td><td className="num">{it.qty}</td><td className="num">{money(it.price)}</td><td className="num">{money((+it.qty || 0) * (+it.price || 0))}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td className="num">{money(r.total)}</td></tr>{r.paid > 0 && <tr className="paid"><td colSpan={3}>Paid · balance due</td><td className="num">{money(r.paid)} · {money(r.due)}</td></tr>}</tfoot>
        </table>
      </>) : <p className="sr-p">{r.text}</p>;
    case "ACCEPTANCE": return (
      <>
        <p className="sr-p">{r.text}</p>
        <div className="sr-sig">
          <div><div className="sr-sigline">{r.customer.name ? <b>{r.customer.name}</b> : " "}</div><div className="sr-siglab">Client Signature / Date{r.customer.at ? ` · ${shortDay(r.customer.at)}` : ""}</div></div>
          <div><div className="sr-sigline">{r.tech.name ? <b>{r.tech.name}</b> : " "}</div><div className="sr-siglab">IOT TECHS Authorized Representative / Date{r.tech.at ? ` · ${shortDay(r.tech.at)}` : ""}</div></div>
        </div>
      </>);
    default: return r.lines ? <ul className="sr-lines">{r.lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="sr-p">{r.text}</p>;
  }
}

export default function SvcReport({ call, doc, invoice = null, payments = [], warranty = null, proposal = null, backHref = null, showCharges = true, signaturesCurrent = true }) {
  const m = documentModel({ call, doc, invoice, payments, warranty, proposal, showCharges });
  const onSite = timeOnSite(doc?.visit?.arrival, doc?.visit?.departure);
  const tech = (doc?.visit?.techs || []).join(", ") || call.assignee_name || "";
  return (
    <div className="sr">
      <div className="sr-tools no-print">
        {backHref && <Link href={backHref} className="sr-back">← Back</Link>}
        <span className="sr-tools-r">{m.draft && <span className="sr-draft-chip">Draft</span>}<button type="button" className="sr-print" onClick={() => window.print()}>Print / PDF</button></span>
      </div>
      {!signaturesCurrent && (call.tech_signed_at || call.customer_signed_at) && <div className="sr-stale no-print">Record changed after signing — signatures are no longer current.</div>}

      {m.pages.map((regions, pi) => (
        <div className={`sr-page${m.draft ? " draft" : ""}`} key={pi}>
          <div className="sr-side"><div className="sr-side-gold" /><div className="sr-side-t">IOT TECHS · LA VAGUE INC</div></div>
          {pi === 0 ? (
            <header className="sr-hdr">
              <div>
                <div className="sr-brand">IOT TECHS</div>
                <div className="sr-tag">Make Tomorrow Safer Today</div>
                <div className="sr-contact">(646) 396-0775 · support@iot-techs.com · www.iot-techs.com<br />Assigned Contractor: LA VAGUE INC</div>
              </div>
              <div className="sr-meta">
                <div className="sr-type">{m.type}</div>
                <div className="sr-type-under" />
                {m.badge && <span className="sr-pill">{m.badge}</span>}
                <div className="sr-date">{day(call.created_at)}<br />Ticket #: {call.svc_id}{m.refProposal ? <><br />Ref Proposal: {m.refProposal}</> : null}<br />{m.statusLabel}</div>
              </div>
              <div className="sr-hdr-rule" />
            </header>
          ) : (
            <header className="sr-hdr-slim"><div className="l">IOT TECHS <span>{m.type} · {call.customer}</span></div><div className="r">{shortDay(call.created_at)} · Ticket {call.svc_id}</div></header>
          )}
          <div className="sr-body">
            {pi === 0 && (
              <div className="sr-prep">
                <div><div className="k">Prepared For</div><div className="v">{call.contact_name || call.customer}</div>{call.contact_name && call.customer && call.contact_name !== call.customer && <div className="vs">{call.customer}</div>}</div>
                <div><div className="k">Property</div><div className="v">{call.address || "—"}</div>{call.project_access_id && <div className="vs">System {call.project_access_id}</div>}</div>
                <div><div className="k">{call.contact_phone || call.contact_email ? "Contact" : "Visit"}</div>
                  {call.contact_phone || call.contact_email ? <><div className="v">{call.contact_phone || call.contact_email}</div>{call.contact_phone && call.contact_email && <div className="vs">{call.contact_email}</div>}</> : null}
                  {(tech || onSite.label) && <div className="vs">{[tech, onSite.label && `On site ${onSite.label}`].filter(Boolean).join(" · ")}</div>}
                </div>
              </div>
            )}
            {regions.map((r) => <section key={r.key}><div className="sr-sec-t">{r.title}</div><Region r={r} /></section>)}
          </div>
          <footer className="sr-foot"><div>IOT TECHS · (646) 396-0775 · support@iot-techs.com · www.iot-techs.com · Confidential</div><div className="pg">PAGE {String(pi + 1).padStart(2, "0")}</div></footer>
        </div>
      ))}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.sr{max-width:8.5in;margin:0 auto;color:#0B0F1A;font-family:Helvetica,Arial,sans-serif}
.sr *{box-sizing:border-box}
.sr-tools{display:flex;justify-content:space-between;align-items:center;margin:12px 0}
.sr-tools-r{display:flex;gap:10px;align-items:center}
.sr-back{font-size:.85rem;font-weight:600;color:#b08f4f;text-decoration:none}
.sr-print{height:36px;padding:0 16px;border:none;border-radius:9px;background:#0B0F1A;color:#C9A96E;font-weight:700;font-size:.84rem;cursor:pointer;font-family:inherit}
.sr-draft-chip{font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#b3541e;background:#fdf0e5;border-radius:20px;padding:4px 10px}
.sr-stale{margin:0 0 12px;font-size:.8rem;color:#b3541e;background:#fdf0e5;border-radius:8px;padding:8px 12px}
.sr-page{position:relative;width:100%;max-width:8.5in;min-height:11in;margin:0 auto 24px;background:#FAF8F4;padding:0 0 .7in .65in;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.sr-page.draft::after{content:"DRAFT";position:absolute;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);font-size:120px;font-weight:800;letter-spacing:.2em;color:rgba(44,51,71,.07);pointer-events:none}
.sr-side{position:absolute;left:0;top:0;bottom:0;width:.55in;background:#2C3347;display:flex;align-items:center;justify-content:center}
.sr-side-gold{position:absolute;right:0;top:0;bottom:0;width:.1in;background:#C9A96E}
.sr-side-t{color:#C9A96E;font-size:8.5px;letter-spacing:.5em;font-weight:700;text-transform:uppercase;transform:rotate(-90deg);white-space:nowrap}
.sr-hdr{background:#0B0F1A;color:#FAF8F4;padding:.4in .5in .3in;display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start;position:relative}
.sr-hdr-rule{position:absolute;left:.5in;right:.5in;bottom:.22in;height:1px;background:#C9A96E}
.sr-brand{font-weight:700;font-size:22pt;letter-spacing:.02em}
.sr-tag{color:#C9A96E;font-size:9px;letter-spacing:.4em;text-transform:uppercase;font-weight:700;margin-top:6px;border-top:1px solid #C9A96E;padding-top:5px;display:inline-block}
.sr-contact{font-size:9px;color:#b8bcc8;margin-top:10px;line-height:1.7}
.sr-meta{text-align:right}
.sr-type{font-size:14px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.sr-type-under{height:1px;background:#C9A96E;width:150px;margin:5px 0 8px auto}
.sr-pill{display:inline-block;background:#C9A96E;color:#0B0F1A;padding:4px 11px;font-size:8.5px;letter-spacing:.22em;font-weight:700;text-transform:uppercase}
.sr-date{color:#9a9eac;font-size:9px;margin-top:8px;letter-spacing:.05em;line-height:1.6}
.sr-hdr-slim{background:#0B0F1A;color:#FAF8F4;padding:.18in .5in;display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;font-size:9px}
.sr-hdr-slim .l{font-weight:700;letter-spacing:.14em}.sr-hdr-slim .l span{color:#C9A96E;margin-left:8px;letter-spacing:.06em;font-weight:400}.sr-hdr-slim .r{color:#9a9eac}
.sr-body{padding:.28in .5in .3in}
.sr-prep{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;background:#F0EDE8;padding:12px 14px;border-left:3px solid #C9A96E;margin-bottom:16px;font-size:9.5px}
.sr-prep .k{color:#7a7a78;font-size:8px;letter-spacing:.22em;font-weight:700;text-transform:uppercase;margin-bottom:3px}
.sr-prep .v{font-weight:600;font-size:10px}.sr-prep .vs{font-size:9px;color:#7a7a78;margin-top:2px}
.sr-sec-t{background:#2C3347;color:#FAF8F4;padding:7px 12px;font-size:10px;letter-spacing:.24em;font-weight:700;text-transform:uppercase;border-left:3px solid #C9A96E;margin:14px 0 8px}
.sr-p{font-size:10px;line-height:1.6;color:#3a3a37;margin:0 0 6px}.sr-p strong{color:#0B0F1A}
.sr-lines{margin:0;padding-left:16px;font-size:10px;line-height:1.6;color:#3a3a37}
.sr-cam{width:100%;border-collapse:collapse;font-size:8.5px;margin-top:4px}
.sr-cam thead th{background:#2C3347;color:#FAF8F4;padding:8px 6px;text-align:left;font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;border-right:1px solid #3a4258}
.sr-cam thead th:last-child{border-right:none}
.sr-cam tbody td{padding:7px 6px;border-bottom:1px solid #dcd6cc;vertical-align:top;line-height:1.4;background:#FAF8F4}
.sr-cam tbody tr:nth-child(even) td{background:#F0EDE8}
.sr-cam .no{font-weight:700;font-size:10px;width:26px}.sr-cam .st{text-align:center;font-weight:700;font-size:9px;width:64px}
.tone-ok{color:#1f5d3a}.tone-fail{color:#a8392c}.tone-warn{color:#c89227}.tone-muted{color:#7a7a78}
.sr-badge{display:inline-block;padding:2px 5px;font-size:7.5px;letter-spacing:.06em;font-weight:700;text-transform:uppercase;white-space:nowrap}
.b-fail{background:#a8392c;color:#fff}.b-warn{background:#c89227;color:#0B0F1A}.b-ink{background:#2C3347;color:#FAF8F4}.b-slate{background:#5a6378;color:#FAF8F4}.b-ok{background:#1f5d3a;color:#fff}
.sr-summary{margin-top:10px;font-size:8.5px;color:#7a7a78;line-height:1.6}.sr-summary strong{color:#0B0F1A}
.sr-compare{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px}.sr-compare.n1{grid-template-columns:1fr}.sr-compare.n3{grid-template-columns:1fr 1fr 1fr}
.sr-box{padding:14px 16px;font-size:9.5px;line-height:1.55;background:#F0EDE8;border-left:3px solid #5a6378;color:#3a3a37}
.sr-box.rec{background:#0B0F1A;border-left-color:#C9A96E;color:#FAF8F4}
.sr-box h4{font-size:10px;letter-spacing:.18em;font-weight:700;text-transform:uppercase;margin:0 0 8px;color:#a8392c}.sr-box.rec h4{color:#C9A96E}
.sr-box p{margin:0 0 6px;font-size:9px}.sr-box ul{list-style:none;padding:0;margin:0}.sr-box li{padding:3px 0 3px 14px;position:relative;font-size:9px}
.sr-box li::before{content:"›";position:absolute;left:0;font-weight:700;color:#a8392c}.sr-box.rec li::before{color:#C9A96E}
.sr-box-meta{margin-top:8px;font-size:8.5px;font-weight:700;letter-spacing:.04em}
.sr-cost{width:100%;border-collapse:collapse;font-size:9.5px;margin-top:6px}
.sr-cost th,.sr-cost td{padding:7px 10px;border-bottom:1px solid #dcd6cc}
.sr-cost thead th{background:#2C3347;color:#FAF8F4;text-align:left;font-size:8px;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
.sr-cost tbody td{background:#FAF8F4;color:#3a3a37}.sr-cost tbody tr:nth-child(even) td{background:#F0EDE8}.sr-cost tbody tr.rec td{font-weight:700;color:#0B0F1A}
.sr-cost .num{text-align:right;font-variant-numeric:tabular-nums}
.sr-cost tfoot td{background:#0B0F1A;color:#C9A96E;font-weight:700;border-bottom:none;padding:11px 10px;font-size:10px;border-top:1.5px solid #C9A96E;text-transform:uppercase;letter-spacing:.14em}
.sr-cost tfoot tr.paid td{background:#1f5d3a;color:#fff;text-transform:none;letter-spacing:0;font-size:9.5px}
.sr-rec{background:#0B0F1A;color:#FAF8F4;padding:16px 20px;margin-top:12px;border-left:4px solid #C9A96E}
.sr-rec .lbl{color:#C9A96E;font-size:9px;letter-spacing:.28em;text-transform:uppercase;font-weight:700;margin-bottom:6px}
.sr-rec .txt{font-size:11px;line-height:1.6}.sr-rec .txt strong{color:#C9A96E}
.sr-sig{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:24px}
.sr-sigline{border-bottom:1px solid #0B0F1A;padding:6px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;min-height:40px}
.sr-siglab{color:#7a7a78;letter-spacing:.1em;font-weight:600;font-size:8px;text-transform:uppercase;margin-top:6px}
.sr-foot{position:absolute;left:.55in;right:0;bottom:0;background:#0B0F1A;color:#9a9eac;padding:10px .5in;font-size:8px;letter-spacing:.06em;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #C9A96E}
.sr-foot .pg{color:#C9A96E;font-weight:700;letter-spacing:.14em;font-size:8.5px}
@media(max-width:700px){.sr-page{min-height:0;padding-left:.45in}.sr-side{width:.4in}.sr-hdr{grid-template-columns:1fr;padding:.3in .35in .3in}.sr-meta{text-align:left}.sr-type-under{margin-left:0}.sr-hdr-rule{display:none}.sr-body{padding:.2in .3in .3in}.sr-prep,.sr-compare,.sr-compare.n3,.sr-sig{grid-template-columns:1fr}.sr-cam{display:block;overflow-x:auto}.sr-foot{position:static;margin-left:-.45in}}
@media print{.no-print{display:none!important}.sr{max-width:none}.sr-page{box-shadow:none;margin:0;width:8.5in;min-height:11in;page-break-after:always}.sr-page:last-child{page-break-after:auto}.sr-page.draft::after{color:rgba(44,51,71,.08)}@page{margin:0;size:letter}body{background:#fff}}
`;
