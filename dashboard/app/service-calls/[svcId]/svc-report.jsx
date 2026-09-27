"use client";

import Link from "next/link";
import { reportSections, timeOnSite, SVC_BILLING } from "../../../lib/svc-model";

// The Service Call Report — web view and print/PDF view of the SAME record (call + diagnosis +
// invoice). Nothing here is typed separately; internal notes are excluded by reportSections.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d) => (d ? new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—");

export default function SvcReport({ call, doc, invoice = null, payments = [], warranty = null, backHref = null, showCharges = true, signaturesCurrent = true }) {
  const sections = reportSections(call, doc);
  const onSite = timeOnSite(doc?.visit?.arrival, doc?.visit?.departure);
  const billing = SVC_BILLING.find((b) => b.key === doc?.billing)?.label;
  const items = invoice?.items || [];
  const total = items.reduce((s, r) => s + (+r.qty || 0) * (+r.price || 0), 0);
  const paid = payments.reduce((s, p) => s + (+p.amount || 0), 0);
  const charges = showCharges && doc?.billing !== "warranty" && items.length > 0;

  return (
    <div className="sr">
      <div className="sr-tools no-print">
        {backHref && <Link href={backHref} className="sr-back">← Back</Link>}
        <button type="button" className="sr-print" onClick={() => window.print()}>Print / PDF</button>
      </div>
      <article className="sr-doc">
        <header className="sr-head">
          <div>
            <div className="sr-brand">IOT TECHS</div>
            <div className="sr-tag">La Vague Inc · Security · Audio · Low Voltage</div>
            <div className="sr-contact">646.396.0775 · support@iot-techs.com · iot-techs.com</div>
          </div>
          <div className="sr-meta">
            <div className="sr-type">Service Call Report</div>
            <div className="sr-id">{call.svc_id}</div>
            <div className="sr-status">{call.stage_label || call.stage}{doc?.callType ? ` · ${doc.callType}` : ""}</div>
            <div className="sr-date">{day(call.created_at)}</div>
          </div>
        </header>

        <div className="sr-two">
          <section>
            <h3>Client</h3>
            <dl>
              <dt>Name</dt><dd>{call.customer || "—"}</dd>
              {call.contact_name && call.contact_name !== call.customer && <><dt>Contact</dt><dd>{call.contact_name}</dd></>}
              {call.contact_phone && <><dt>Phone</dt><dd>{call.contact_phone}</dd></>}
              {call.contact_email && <><dt>Email</dt><dd>{call.contact_email}</dd></>}
              {call.address && <><dt>Address</dt><dd>{call.address}</dd></>}
              {call.project_access_id && <><dt>System</dt><dd>{call.project_access_id}</dd></>}
            </dl>
          </section>
          <section>
            <h3>Visit</h3>
            <dl>
              <dt>Technician</dt><dd>{(doc?.visit?.techs || []).join(", ") || call.assignee_name || "—"}</dd>
              {doc?.visit?.arrival && <><dt>Arrived</dt><dd>{doc.visit.arrival}</dd></>}
              {doc?.visit?.departure && <><dt>Departed</dt><dd>{doc.visit.departure}</dd></>}
              {onSite.label && <><dt>On site</dt><dd>{onSite.label}</dd></>}
              {warranty && warranty.status !== "unknown" && <><dt>Warranty</dt><dd>{warranty.status === "in" ? `In warranty · until ${warranty.until}` : `Out of warranty · ended ${warranty.until}`}</dd></>}
              {billing && <><dt>Billing</dt><dd>{billing}</dd></>}
            </dl>
          </section>
        </div>

        {sections.map((s) => (
          <section key={s.title} className="sr-sec">
            <h3>{s.title}</h3>
            {s.lines.length === 1 ? <p>{s.lines[0]}</p> : <ul>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          </section>
        ))}

        {charges && (
          <section className="sr-sec">
            <h3>{doc?.billing === "estimate" ? "Estimate" : "Charges"}</h3>
            <table className="sr-items">
              <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
              <tbody>{items.map((r, i) => <tr key={i}><td>{r.desc}</td><td className="num">{r.qty}</td><td className="num">{money(r.price)}</td><td className="num">{money((+r.qty || 0) * (+r.price || 0))}</td></tr>)}</tbody>
            </table>
            <div className="sr-totals">
              <div className="grand"><span>Total</span><b>{money(total)}</b></div>
              {paid > 0 && <div><span>Paid</span><b>{money(paid)}</b></div>}
              {paid > 0 && total - paid > 0 && <div className="due"><span>Balance due</span><b>{money(total - paid)}</b></div>}
            </div>
          </section>
        )}
        {doc?.billing === "warranty" && <section className="sr-sec"><h3>Charges</h3><p>Warranty visit — no charge.</p></section>}

        <div className="sr-sign">
          <div>
            <div className="sr-sigline">{call.customer_signed_name ? <b>{call.customer_signed_name}</b> : <span>&nbsp;</span>}</div>
            <div className="sr-siglab">Customer{call.customer_signed_at ? ` · ${day(call.customer_signed_at)}` : ""}</div>
          </div>
          <div>
            <div className="sr-sigline">{call.tech_signed_name ? <b>{call.tech_signed_name}</b> : <span>&nbsp;</span>}</div>
            <div className="sr-siglab">Technician{call.tech_signed_at ? ` · ${day(call.tech_signed_at)}` : ""}</div>
          </div>
        </div>
        {!signaturesCurrent && (call.tech_signed_at || call.customer_signed_at) && <div className="sr-stale no-print">Record changed after signing — signatures are no longer current.</div>}

        <footer className="sr-foot"><span>IOT TECHS · La Vague Inc · 646.396.0775 · support@iot-techs.com</span><span>{call.svc_id}</span></footer>
      </article>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.sr{max-width:820px;margin:0 auto;color:#0B0F1A;font-family:'Inter',system-ui,sans-serif}
.sr-tools{display:flex;justify-content:space-between;align-items:center;margin:12px 0}
.sr-back{font-size:.85rem;font-weight:600;color:#b08f4f;text-decoration:none}
.sr-print{height:36px;padding:0 16px;border:none;border-radius:9px;background:#0B0F1A;color:#C9A96E;font-weight:700;font-size:.84rem;cursor:pointer;font-family:inherit}
.sr-doc{background:#fff;border:1px solid #e4e4df;border-radius:4px;overflow:hidden}
.sr-head{background:#0B0F1A;color:#FAF8F4;padding:28px 36px 22px;display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #C9A96E}
.sr-brand{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:28px;letter-spacing:.02em}
.sr-tag{color:#C9A96E;font-size:9px;letter-spacing:.35em;text-transform:uppercase;font-weight:600;margin-top:4px}
.sr-contact{font-size:9.5px;color:#b8bcc8;margin-top:10px}
.sr-meta{text-align:right}
.sr-type{color:#C9A96E;font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;font-weight:600;letter-spacing:.05em}
.sr-id{font-family:Menlo,Consolas,monospace;font-size:13px;margin-top:6px}
.sr-status{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:#C9A96E;margin-top:6px;font-weight:700}
.sr-date{font-size:10px;color:#9a9eac;margin-top:4px}
.sr-two{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:22px 36px 0}
.sr h3{background:#2C3347;color:#FAF8F4;padding:6px 12px;font-size:10px;letter-spacing:.25em;text-transform:uppercase;font-weight:600;border-left:3px solid #C9A96E;margin:0 0 10px}
.sr dl{display:grid;grid-template-columns:100px 1fr;gap:5px 12px;font-size:11.5px;margin:0}
.sr dt{color:#7a7a78;font-weight:500}.sr dd{margin:0;font-weight:500}
.sr-sec{padding:16px 36px 0}
.sr-sec p,.sr-sec ul{background:#F0EDE8;border-left:3px solid #C9A96E;padding:10px 14px;font-size:11.5px;line-height:1.55;margin:0}
.sr-sec ul{list-style:none}.sr-sec li{padding:2px 0}
.sr-items{width:100%;border-collapse:collapse;font-size:11px}
.sr-items th{background:#2C3347;color:#FAF8F4;text-align:left;padding:7px 10px;font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;font-weight:600}
.sr-items td{padding:7px 10px;border-bottom:1px solid #dcd6cc}
.sr-items .num{text-align:right;font-variant-numeric:tabular-nums}
.sr-totals{display:flex;flex-direction:column;align-items:flex-end;margin-top:10px;font-size:11.5px}
.sr-totals>div{display:flex;justify-content:space-between;width:280px;padding:6px 12px}
.sr-totals .grand{background:#0B0F1A;color:#FAF8F4;border-top:1.5px solid #C9A96E}
.sr-totals .grand b{color:#C9A96E;font-size:14px}
.sr-totals .due{background:#1f5d3a;color:#fff}
.sr-sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:30px 36px 0}
.sr-sigline{border-bottom:1px solid #0B0F1A;padding:6px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;min-height:36px}
.sr-siglab{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#7a7a78;margin-top:5px}
.sr-stale{margin:12px 36px 0;font-size:.8rem;color:#b3541e;background:#fdf0e5;border-radius:8px;padding:8px 12px}
.sr-foot{background:#0B0F1A;color:#9a9eac;padding:12px 36px;display:flex;justify-content:space-between;font-size:9.5px;margin-top:26px;border-top:2px solid #C9A96E}
@media(max-width:640px){.sr-two,.sr-sign{grid-template-columns:1fr}.sr-head{flex-direction:column}.sr-meta{text-align:left}}
@media print{.no-print{display:none!important}.sr{max-width:none}.sr-doc{border:none;border-radius:0}@page{margin:0;size:letter}body{background:#fff}}
`;
