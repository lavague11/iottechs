"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adtSummary, adtStatusMeta } from "../../lib/adt";
import { acceptAdtQuoteAction } from "./actions";
import DeckView from "../project/[accessId]/deck-view";
import AdtIntake from "./adt-intake";

// Customer support line shown on the Complete stage. TODO: replace with the real ADT/IOT TECHS number.
const SUPPORT_PHONE = "(800) 555-0100";

// Capitalize each word (names); format a phone as (xxx) xxx-xxxx as it's typed.
const titleCase = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtPhone = (s) => { const d = String(s || "").replace(/\D/g, "").slice(0, 10); if (d.length <= 3) return d; if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`; return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };

export default function AdtPortalClient({ app, prefill = null, quote = null, dashboardHref = null }) {
  // Everything runs on the Deck now — a fresh visitor gets the Apply stage with the intake open;
  // an existing application advances through Apply → Quote → Complete.
  if (app) return <CustomerDeck app={app} quote={quote} dashboardHref={dashboardHref} />;
  return <FreshDeck prefill={prefill} dashboardHref={dashboardHref} />;
}

// A brand-new visitor: the Deck itself, with the intake living inside the Apply stage (auto-open).
function FreshDeck({ prefill, dashboardHref }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const soon = (msg) => <div className="adtc-pad"><div className="adtc-muted">{msg}</div></div>;
  const stages = [
    { name: "Apply", pill: "In progress", pct: 0, tint: "gold", turn: "mine", need: "Complete your application",
      tools: [{ name: "Your application", label: "Fill it out", state: "active", node: <AdtIntake prefill={prefill} /> }] },
    { name: "Quote", pill: "Pending", pct: 0, tint: "purple",
      tools: [{ name: "Your quote", label: "After you apply", state: "active", node: soon("Submit your application and your installer will build your quote here.") }] },
    { name: "Complete", pill: "Pending", pct: 0, tint: "green",
      tools: [{ name: "Installation", label: "After install", state: "active", node: soon("Your records and next steps appear here once you're set up.") }] },
  ];
  const menu = dashboardHref ? [{ label: "My dashboard", onClick: () => router.push(dashboardHref) }] : [];
  return (
    <>
      <DeckView stages={stages} idx={idx} onIdx={setIdx} canAdvance={false} customer={null}
        statusChip={{ label: "New application", color: "#8a8578" }} roleLabel="ADT Monitoring"
        logoHref={dashboardHref || "/"} initialOpenTool={{ 0: 0 }} menu={menu} />
      <style>{CUSTCSS}</style>
    </>
  );
}

const DAY_FMT = (d) => { try { return new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
// Drawer action icons — same set the staff project Deck uses, so the customer drawer matches 1:1.
const DVI = {
  call: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  mail: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>,
  dir: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>,
};

// Customer accepts ("picks up") the quote staff shared with them.
function AcceptQuote({ app, accepted }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [pending, startTx] = useTransition();
  const accept = () => startTx(async () => { setErr(""); const r = await acceptAdtQuoteAction(app.adt_id); if (r?.error) setErr(r.error); else router.refresh(); });
  if (accepted) return <div className="adtc-pad"><div className="adtc-ok">✓ Quote accepted — thank you! We'll take it from here and reach out to install.</div></div>;
  return (
    <div className="adtc-pad">
      <div className="adtc-muted" style={{ marginBottom: 12 }}>Happy with your quote? Accept it and we'll schedule your install. Questions first? Call <a href={`tel:${SUPPORT_PHONE.replace(/\D/g, "")}`}>{SUPPORT_PHONE}</a>.</div>
      {err && <div className="adt-err" style={{ marginBottom: 10 }}>{err}</div>}
      <button className="adtc-btn" disabled={pending} onClick={accept}>{pending ? "Accepting…" : "Accept quote"}</button>
    </div>
  );
}

// The customer's ADT account on the SAME Deck as a project: Apply → Quote → Complete.
function CustomerDeck({ app, quote, dashboardHref = null }) {
  const router = useRouter();
  const summary = adtSummary(app.equipment || {});
  const scheduled = !!app.schedule_date;
  const done = app.stage === "completed";
  const accepted = !!app.deal_accepted;
  const prefDays = app.pref_days || [], prefWins = app.pref_windows || [];
  const hasPrefs = prefDays.length > 0 || prefWins.length > 0;
  const [idx, setIdx] = useState(done ? 2 : quote ? 1 : 0);
  const telHref = `tel:${SUPPORT_PHONE.replace(/\D/g, "")}`;

  const equipmentNode = (
    <div className="adtc-pad">
      {summary.lines.length
        ? <PointsRecap app={app} />
        : <div className="adtc-muted">No equipment on file yet.</div>}
      {hasPrefs && (
        <div className="adtc-pref">
          <span>Preferred install times</span>
          <b>{prefDays.join(", ") || "Any day"}</b>{prefWins.length ? <> · <b>{prefWins.join(", ")}</b></> : null}
        </div>
      )}
    </div>
  );
  const quoteNode = quote
    ? <QuotePanel adtId={app.adt_id} quote={quote} bare />
    : <div className="adtc-pad"><div className="adtc-muted">Your installer will build your quote here. We'll email you when it's ready to review.</div></div>;
  const acceptNode = <AcceptQuote app={app} accepted={accepted} />;
  const completeNode = (
    <div className="adtc-pad">
      {done
        ? <div className="adtc-ok">✓ Your ADT system is live — you're all set.</div>
        : scheduled
          ? <div className="adtc-ok">Install set for <b>{DAY_FMT(app.schedule_date)}</b>{app.schedule_window ? ` · ${app.schedule_window}` : ""}</div>
          : <div className="adtc-muted">Your records are on file. Once your quote is accepted we'll install and finalize your account — a confirmation shows up here.</div>}
      {done && (
        <div className="adtc-steps">
          <div className="adtc-sec-t">Next steps</div>
          <ul className="adtc-ul">
            <li>Test each device from the ADT app to confirm it's reporting.</li>
            <li>Remember your verbal password — monitoring uses it to verify you.</li>
            <li>Keep your access PIN <b>{app.access_pin || "—"}</b> for quick check-ins.</li>
          </ul>
        </div>
      )}
      <div className="adtc-support">Questions or issues? Call <a href={telHref}>{SUPPORT_PHONE}</a> — we're here 24/7.</div>
      <div className="adtc-note">Keep your ID <b>{app.adt_id}</b> to check back anytime.</div>
    </div>
  );

  const stages = [
    { name: "Apply", pill: "Applied", pct: 100, tint: "gold", turn: "idle",
      tools: [{ name: "Your application", label: `${app.points || 0} pts · ${summary.count} item${summary.count === 1 ? "" : "s"}`, state: "done", node: equipmentNode }] },
    { name: "Quote", pill: accepted ? "Accepted" : quote ? "Ready" : "Pending", pct: accepted ? 100 : quote ? 100 : 0, tint: "purple",
      turn: quote && !accepted ? "mine" : "idle", need: "Review & accept your quote",
      tools: [
        { name: "Your quote", label: quote ? "View pricing" : "Awaiting quote", state: quote ? "done" : "active", heavy: !!quote, node: quoteNode },
        ...(quote ? [{ name: accepted ? "Accepted" : "Accept quote", label: accepted ? "✓ Accepted" : "Tap to accept", state: accepted ? "done" : "active", node: acceptNode }] : []),
      ] },
    { name: "Complete", pill: done ? "Complete" : scheduled ? "Scheduled" : "Pending", pct: done ? 100 : scheduled ? 60 : 0, tint: "green", turn: "idle",
      tools: [{ name: "Installation", label: done ? "Live" : scheduled ? DAY_FMT(app.schedule_date) : "Awaiting install", state: done ? "done" : "active", node: completeNode }] },
  ];

  const customer = {
    code: app.adt_id,
    name: app.name || "Your ADT project",
    statusText: done ? "Live" : scheduled ? "Scheduled" : "In progress",
    fields: [
      app.name && { k: "Contact", v: app.name, sub: app.phone ? fmtPhone(app.phone) : "" },
      app.address && { k: "Job site", v: app.address },
      app.email && { k: "Email", v: app.email },
      app.access_pin && { k: "Access PIN", v: app.access_pin },
    ].filter(Boolean),
    actions: [
      app.phone && { label: "Call", icon: DVI.call, href: `tel:${app.phone}` },
      app.email && { label: "Message", icon: DVI.mail, href: `mailto:${app.email}` },
      app.address && { label: "Directions", icon: DVI.dir, href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(app.address)}` },
    ].filter(Boolean),
  };

  return (
    <>
      <DeckView
        stages={stages}
        idx={idx}
        onIdx={setIdx}
        canAdvance={false}
        customer={customer}
        statusChip={adtStatusMeta(app.status)}
        roleLabel="ADT Monitoring"
        logoHref={dashboardHref || "/"}
        menu={[
          ...(dashboardHref ? [{ label: "My dashboard", onClick: () => router.push(dashboardHref) }] : []),
          { label: "Start another application", onClick: () => router.push("/adt") },
        ]}
      />
      <style>{CSS}</style>
      <style>{CUSTCSS}</style>
    </>
  );
}

const CUSTCSS = `
.adtc-pad{padding:16px 20px;font-family:var(--font-sans),inherit}
.adtc-muted{color:var(--dv-meta,#787D84);font-size:.9rem;line-height:1.5}
.adtc-ok{font-size:.95rem;font-weight:700;color:var(--dv-green,#2E7D5B)}
.adtc-ok b{color:var(--dv-ink,#101418)}
.adtc-note{margin-top:14px;font-size:.8rem;color:var(--dv-meta,#787D84)}
.adtc-note b{color:var(--dv-ink,#101418)}
.adtc-pref{margin-top:14px;font-size:.86rem;color:var(--dv-ink,#101418);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:10px 12px}
.adtc-pref span{display:block;font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-bottom:3px}
.adtc-pref b{color:var(--dv-gold-deep,#A8842F)}
.adtc-sec-t{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-bottom:11px}
.adtc-btn{height:44px;padding:0 22px;border:none;border-radius:11px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.9rem;font-weight:800;cursor:pointer;font-family:inherit}
.adtc-btn:disabled{opacity:.55;cursor:default}
.adtc-steps{margin-top:14px}
.adtc-ul{margin:6px 0 0;padding-left:18px;color:var(--dv-ink,#101418);font-size:.88rem;line-height:1.7}
.adtc-ul b{color:var(--dv-gold-deep,#A8842F)}
.adtc-support{margin-top:16px;font-size:.88rem;color:var(--dv-ink,#101418);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:11px 13px}
.adtc-support a{color:var(--dv-gold-deep,#A8842F);font-weight:800;text-decoration:none}
.adtc-muted a{color:var(--dv-gold-deep,#A8842F);font-weight:700;text-decoration:none}
`;

// The customer's shared quote — the ADT Tool in locked, read-only Cust view. Sanitized upstream so
// no cost/commission is ever in this payload; it only ever shows retail, credit, and due-at-install.
function QuotePanel({ adtId, quote, bare }) {
  const ref = useRef(null);
  useEffect(() => {
    function onMsg(e) {
      const m = e.data || {};
      if (!m || m.adt !== adtId) return;
      if (m.type === "adt-ready") { try { ref.current?.contentWindow?.postMessage({ type: "adt-deal-load", deal: quote }, "*"); } catch {} }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [adtId, quote]);
  const push = () => { try { ref.current?.contentWindow?.postMessage({ type: "adt-deal-load", deal: quote }, "*"); } catch {} };
  const qs = new URLSearchParams({ embed: "1", view: "cust", lock: "1", ro: "1", adt: adtId });
  const src = `/widgets/adt-calculator.html?${qs.toString()}`;
  if (bare) return <iframe ref={ref} title="Your quote" src={src} onLoad={push} style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#FAF8F4" }} />;
  return (
    <div className="adt-quote">
      <div className="adt-quote-h"><span>Your quote</span></div>
      <iframe ref={ref} title="Your quote" src={src} className="adt-quote-frame" onLoad={push} />
    </div>
  );
}

/* ---------------- shared: equipment recap ---------------- */
function PointsRecap({ app }) {
  const summary = adtSummary(app.equipment || {});
  if (!summary.lines.length) return null;
  return (
    <div className="adt-recap">
      <div className="adt-recap-hd"><span>Your equipment</span><span className="adt-recap-pts">${summary.price.toLocaleString()} · {summary.points} pts</span></div>
      <div className="adt-recap-list">
        {summary.lines.map((l) => (
          <div key={l.id} className="adt-recap-row">
            <span className="adt-recap-q">{l.qty}×</span>
            <span className="adt-recap-n">{l.name}</span>
            <span className="adt-recap-p">{l.linePrice ? `$${l.linePrice.toLocaleString()}` : ""}{l.linePrice && l.linePoints ? " · " : ""}{l.linePoints ? `${l.linePoints} pts` : (l.linePrice ? "" : "0 pts")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.adt-err{margin-top:16px;font-size:.85rem;color:#c0392b;background:#fdecec;border:1px solid #f0c9c9;border-radius:9px;padding:9px 12px}
.adt-recap{border:1px solid #e4e0d8;border-radius:12px;margin-top:20px;overflow:hidden}
.adt-recap-hd{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:#faf6ee;font-size:.78rem;font-weight:800;color:#0B0F1A}
.adt-recap-pts{color:#a3812f}
.adt-recap-list{padding:4px 0}
.adt-recap-row{display:flex;align-items:center;gap:10px;padding:6px 14px;font-size:.86rem}
.adt-recap-q{font-weight:800;color:#a3812f;min-width:28px}
.adt-recap-n{flex:1;color:#0B0F1A}
.adt-recap-p{color:#8a8578;font-weight:600}
.adt-quote{margin-top:18px;border:1px solid #e4e0d8;border-radius:16px;overflow:hidden;background:#fff}
.adt-quote-h{padding:13px 16px;background:#0B0F1A;color:#fff;font-size:.8rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-bottom:3px solid #C9A96E}
.adt-quote-h span{color:#C9A96E}
.adt-quote-frame{width:100%;height:640px;border:none;display:block;background:#FAF8F4}
`
