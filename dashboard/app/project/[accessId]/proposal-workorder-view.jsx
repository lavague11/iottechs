"use client";
import { useState, useEffect, useRef } from "react";
import { techOptionTotal, titleCase, serviceColor, fmtSignStamp } from "../../../lib/proposal";
import { getProposalAction, acceptWorkOrderAction, requestAssignmentAction } from "./proposal-actions";
import ProposalSignModal from "./proposal-sign-modal";
import { TaglinePill } from "../../components/brand";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Outdoor items get their "(O)" suffix colored red — plain text here, so only the marker
// itself is highlighted (matches the customer view's convention).
function itemNameNode(name, outdoor) {
  const title = titleCase(name);
  if (!outdoor) return title;
  const m = title.match(/^(.*?)(\s*\(O\))$/);
  if (!m) return <span style={{ color: "#8c2f2f", fontWeight: 700 }}>{title}</span>;
  return <>{m[1]}<span style={{ color: "#8c2f2f", fontWeight: 700 }}>{m[2]}</span></>;
}

// Technician work order — same SYSTEM PROPOSAL brand look as the customer view, but it's the
// internal labor/equipment doc: every line is valued at its TECH price (set by admin at the
// install stage), never the customer price. Server strips customer price/cost before this ever
// reaches a tech (see sanitizeProposal role "tech"); this component only ever reads techPrice.
const firstName = (s) => String(s || "").trim().split(/\s+/)[0].replace(/[()]/g, "").toLowerCase();

export default function ProposalWorkOrderView({ accessId, proposal, preview, customerName, customerAddress, onProposalChange, signerName, assignedTech = null }) {
  const [fetched, setFetched] = useState(null);
  const p = fetched || proposal;
  const [viewingOpt, setViewingOpt] = useState(() => p?.selected_option || p?.payload?.options?.[0]?.id);
  const [signOpen, setSignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [reqSent, setReqSent] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (m) => { setToast(m); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600); };

  // This job is claimable by the viewing tech only when it's unassigned or already theirs. If the
  // office assigned it to a DIFFERENT technician, they can't accept — they request assignment.
  const isAnotherTechsJob = !!assignedTech && !!signerName && firstName(assignedTech) !== firstName(signerName);

  async function acceptWO(sign) {
    setBusy(true); setErr(null);
    const r = await acceptWorkOrderAction(accessId, sign.name, sign.data);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setFetched(r.proposal);
    onProposalChange?.(r.proposal);   // propagate to the gateway so Install unlocks without reload
    setSignOpen(false);
    showToast("Work order accepted — you're assigned");
  }

  async function requestAssign() {
    setBusy(true); setErr(null);
    const r = await requestAssignmentAction(accessId, signerName || "");
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setReqSent(true);
    showToast("Assignment request sent to the office");
  }

  // Pull current server state on mount so a work order that became available (proposal sent) or
  // had its tech pricing updated shows immediately instead of the stale page-load copy.
  useEffect(() => {
    let live = true;
    if (accessId) getProposalAction(accessId).then((r) => { if (live && r?.proposal) setFetched(r.proposal); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  if (!p || !p.payload || !p.payload.options?.length) {
    return (
      <div className="pwo-root">
        <style>{PWO_CSS}</style>
        <div className="pwo-header">
          <div className="pwo-hd-left"><span className="pwo-brand">IOT TECHS</span><TaglinePill tone="dark" className="pwo-brand-pill" /></div>
          <span className="pwo-doctag">Work Order</span>
        </div>
        <div className="pwo-empty">No active work order yet — it builds out here once the office sends the proposal to the customer.</div>
      </div>
    );
  }

  const opt = p.payload.options.find((o) => o.id === viewingOpt) || p.payload.options[0];
  const total = techOptionTotal(opt);
  const woNum = "WO-" + String(p.id || "0").padStart(4, "0") + "-v" + (p.version || 1);
  const woDate = p.sent_at ? String(p.sent_at).slice(0, 10) : "";
  // Until admin sets tech pay (Install stage), every techPrice is 0 — showing "$0.00" down the
  // whole sheet reads like a pricing bug, so show TBD until at least one rate is set.
  const ratesPending = total === 0;
  const rate = (n) => (ratesPending ? "TBD" : money(n));

  // ---- Scope derivation: the tech reads the job in three passes ----------------------------
  //   ① Equipment Locations — where everything goes (each placed block = one location)
  //   ② Equipment — what to load on the truck (aggregated device counts)
  //   ③ Labor — the work itself, with payout rates
  // Labor is matched by task name; note "mounting" ≠ "Monitor + Mount" (that's equipment).
  const LABOR_RX = /(cat6 drop|termination|mounting|programming|waterproof|cabling|tuning|wire run|setup|\blabor\b)/i;
  const locations = [];
  const equipMap = new Map();
  const laborMap = new Map();
  const bump = (map, name, qty, techPrice) => {
    const key = titleCase(String(name || "").replace(/\s*·\s*Slot \d+$/, ""));
    const cur = map.get(key) || { name: key, qty: 0, sum: 0, rate: +techPrice || 0 };
    cur.qty += qty;
    cur.sum += qty * (+techPrice || 0);
    if (+techPrice) cur.rate = +techPrice;
    map.set(key, cur);
  };
  (opt.services || []).forEach((s) => {
    (s.items || []).forEach((it) => {
      const subs = it.sub || [];
      if (subs.length) {
        locations.push({
          id: it.id, name: it.name, outdoor: it.outdoor, svc: s.label, color: serviceColor(s.key),
          gear: subs.filter((x) => !LABOR_RX.test(x.name)).map((x) => titleCase(x.name)).join(", "),
        });
        subs.forEach((x) => bump(LABOR_RX.test(x.name) ? laborMap : equipMap, x.name, +x.qty || 0, x.techPrice));
      } else {
        bump(LABOR_RX.test(it.name) ? laborMap : equipMap, it.name, +(it.qty ?? 1) || 0, it.techPrice);
      }
    });
  });
  const equipment = [...equipMap.values()];
  const labor = [...laborMap.values()];
  const equipHasPay = equipment.some((e) => e.sum > 0);
  const eqRate = (n) => (equipHasPay ? rate(n) : "—");
  const laborSum = labor.reduce((a, l) => a + l.sum, 0);
  const svcNotes = (opt.services || []).map((s) => s.note).filter(Boolean);

  return (
    <div className="pwo-root">
      <style>{PWO_CSS}</style>

      <div className="pwo-header">
        <div className="pwo-hd-left">
          <span className="pwo-brand">IOT TECHS</span>
          <TaglinePill tone="dark" className="pwo-brand-pill" />
          <span className="pwo-contact">(646) 396-0775 · support@iot-techs.com</span>
        </div>
        <div className="pwo-hd-right">
          <span className="pwo-doctag">Field Work Order</span>
          <span className="pwo-pill">Technician Copy</span>
          {woDate && <span className="pwo-hd-meta">{woDate}</span>}
          <span className="pwo-hd-meta">{woNum}</span>
        </div>
      </div>

      <div className="pwo-info-box">
        <div className="pwo-info-row">
          <div><span className="pwo-info-lbl">Job Site</span><b>{customerName || "—"}</b></div>
          <div><span className="pwo-info-lbl">Address</span><b>{customerAddress || "—"}</b></div>
          <div><span className="pwo-info-lbl">Work Order #</span><b>{woNum}</b></div>
        </div>
      </div>

      {p.payload.options.length > 1 && (
        <div className="pwo-opt-tabs">
          {p.payload.options.map((o) => (
            <button key={o.id} type="button" className={`pwo-opt-tab${o.id === opt.id ? " on" : ""}`} onClick={() => setViewingOpt(o.id)}>
              {o.id} · {o.name}
              {p.selected_option === o.id && <span className="pwo-opt-tab-dot" />}
            </button>
          ))}
        </div>
      )}

      {/* ① Where everything goes */}
      <div className="pwo-section-hd">Equipment Locations{p.payload.options.length > 1 ? ` (Option ${opt.id})` : ""}</div>
      {locations.length ? (
        <div className="pwo-loc-box">
          {locations.map((l, i) => (
            <div key={l.id} className="pwo-loc-row" style={{ "--lc": l.color }}>
              <span className="pwo-loc-num">{i + 1}</span>
              <span className="pwo-loc-name">{itemNameNode(l.name, l.outdoor)}</span>
              {l.gear && <span className="pwo-loc-gear">{l.gear}</span>}
            </div>
          ))}
          <div className="pwo-loc-total">Total locations: {locations.length}</div>
        </div>
      ) : (
        <div className="pwo-empty-sec">No placed locations on this job — see the equipment list below.</div>
      )}
      {svcNotes.length > 0 && <div className="pwo-svc-note" style={{ margin: "6px 22px 0" }}>{svcNotes.join("\n")}</div>}

      {/* ② What to load on the truck */}
      <div className="pwo-section-hd">Equipment</div>
      <div className="pwo-table">
        <div className="pwo-table-head">
          <span>#</span><span>Item</span><span className="r">Qty</span><span className="r">Rate</span><span className="r">Total</span>
        </div>
        {equipment.map((e, i) => (
          <div key={e.name} className={`pwo-row${i % 2 ? " alt" : ""}`}>
            <span className="pwo-rownum">{i + 1}</span>
            <span className="pwo-rowdesc">{e.name}</span>
            <span className="r">{e.qty}</span>
            <span className="r">{eqRate(e.rate)}</span>
            <span className="r b">{eqRate(e.sum)}</span>
          </div>
        ))}
        {!equipment.length && <div className="pwo-empty-sec">No equipment on this option.</div>}
      </div>

      {/* ③ The work itself, with payout rates */}
      <div className="pwo-section-hd">Labor</div>
      <div className="pwo-table">
        <div className="pwo-table-head">
          <span>#</span><span>Task</span><span className="r">Qty</span><span className="r">Rate</span><span className="r">Total</span>
        </div>
        {labor.map((l, i) => (
          <div key={l.name} className={`pwo-row${i % 2 ? " alt" : ""}`}>
            <span className="pwo-rownum">{i + 1}</span>
            <span className="pwo-rowdesc">{l.name}</span>
            <span className="r">{l.qty}</span>
            <span className="r">{rate(l.rate)}</span>
            <span className="r b">{rate(l.sum)}</span>
          </div>
        ))}
        {!labor.length && <div className="pwo-empty-sec">No labor lines on this option.</div>}
        {labor.length > 0 && <div className="pwo-subtotal-row"><span>Labor Subtotal</span><span>{rate(laborSum)}</span></div>}
      </div>

      <div className="pwo-grand"><span>Work Order Total</span><span>{ratesPending ? "TBD" : money(total)}</span></div>
      <div className="pwo-fineprint">
        {ratesPending
          ? "Payout rates pending — they're set by the office before install and will appear here."
          : "Technician payout figures. Confirm scope on site before starting. Report discrepancies to dispatch."}
      </div>

      {/* Acceptance / assignment — the tech signs to accept, which assigns them the job */}
      <div className="pwo-section-hd">Work Order Acceptance</div>
      {p.tech_signed_name ? (
        <div className="pwo-accepted-box">
          <div className="pwo-assigned">
            <span className="pwo-assigned-check">✓</span>
            <span>Accepted &amp; assigned to <b>{p.tech_signed_name}</b>{p.tech_signed_at ? ` · ${fmtSignStamp(p.tech_signed_at)}` : ""}</span>
          </div>
          <div className="pwo-sign-mark">
            {p.tech_signature_data
              ? <img src={p.tech_signature_data} alt="Technician signature" className="pwo-sign-img" />
              : <span className="pwo-sign-typed">{p.tech_signed_name}</span>}
            <span className="pwo-sign-rule" />
            <span className="pwo-sign-cap">Technician Signature</span>
          </div>
        </div>
      ) : isAnotherTechsJob ? (
        <div className="pwo-accept-box">
          <div className="pwo-assigned-other">
            <span>This job is assigned to <b>{assignedTech}</b>. You can request to be assigned instead — the office will review.</span>
          </div>
          {err && <div className="pwo-err">{err}</div>}
          {reqSent ? (
            <div className="pwo-req-sent">Assignment request sent — the office will get back to you.</div>
          ) : (
            <button type="button" className="pwo-request-btn" disabled={busy || preview} onClick={requestAssign}>
              Request Assignment
            </button>
          )}
          {preview && <span className="pwo-preview-note">Requesting is disabled in preview.</span>}
        </div>
      ) : (
        <div className="pwo-accept-box">
          <p>Review the scope above, then accept this work order to be assigned the job.</p>
          {err && <div className="pwo-err">{err}</div>}
          <button type="button" className="pwo-accept-btn" disabled={busy || preview} onClick={() => setSignOpen(true)}>
            ✍ Accept Work Order
          </button>
          {preview && <span className="pwo-preview-note">Accepting is disabled in preview.</span>}
        </div>
      )}

      <ProposalSignModal
        open={signOpen}
        heading="Accept Work Order"
        subheading={`${woNum}${ratesPending ? "" : ` · ${money(total)}`}`}
        defaultName={p.tech_signed_name || signerName || ""}
        agreeText="I accept this work order, confirm I can perform the scope described, and agree to be assigned this job."
        accent="#2f7d5a"
        busy={busy}
        onConfirm={acceptWO}
        onCancel={() => setSignOpen(false)}
      />

      {toast && (
        <div className="pwo-toast">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}

      <div className="pwo-footer">
        IOT TECHS · (646) 396-0775 · support@iot-techs.com · Internal Work Order — not for customer distribution
      </div>
    </div>
  );
}

const PWO_CSS = `
.pwo-root{background:#FAF8F4;border-radius:14px;border:1px solid #d9d4ca;overflow:hidden;
  box-shadow:0 10px 30px rgba(11,15,26,.08);
  font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif}
.pwo-header{background:#0B0F1A;padding:20px 22px;display:flex;justify-content:space-between;
  align-items:flex-start;flex-wrap:wrap;gap:14px;border-top:4px solid #2f7d5a}
.pwo-hd-left{display:flex;flex-direction:column;gap:3px}
.pwo-brand{font-size:1.3rem;font-weight:800;color:#fff;letter-spacing:.02em}
.pwo-brand-pill{margin:2px 0}
.pwo-contact{font-size:.7rem;color:#9aa1af}
.pwo-hd-right{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.pwo-doctag{font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
  color:#5FB88A;border-bottom:1px solid #2f7d5a;padding-bottom:2px}
.pwo-pill{background:#2f7d5a;color:#fff;font-size:.66rem;font-weight:800;letter-spacing:.03em;
  text-transform:uppercase;padding:4px 12px;border-radius:100px}
.pwo-hd-meta{font-size:.7rem;color:#9aa1af}
.pwo-empty{color:#6f7686;font-size:.86rem;padding:30px 22px;text-align:center}

.pwo-info-box{margin:20px 22px;border:1px solid #d9d4ca;border-top:2px solid #2f7d5a;border-radius:2px;background:#fff}
.pwo-info-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px 14px}
.pwo-info-row div{display:flex;flex-direction:column;gap:2px;min-width:0}
.pwo-info-row b{font-size:.82rem;color:#0B0F1A;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pwo-info-lbl{font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#4a5270}

.pwo-opt-tabs{margin:0 22px 6px;display:flex;gap:8px;flex-wrap:wrap}
.pwo-opt-tab{position:relative;height:32px;padding:0 15px;border-radius:8px;border:1px solid #d9d4ca;
  background:#fff;color:#6f7686;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
.pwo-opt-tab:hover{border-color:#2f7d5a;color:#0B0F1A}
.pwo-opt-tab.on{background:#2f7d5a;border-color:#2f7d5a;color:#fff}
.pwo-opt-tab-dot{position:absolute;top:5px;right:6px;width:6px;height:6px;border-radius:50%;background:#C9A96E}

.pwo-section-hd{margin:18px 22px 0;background:#2C3347;color:#FAF8F4;font-size:.76rem;font-weight:800;
  letter-spacing:.04em;text-transform:uppercase;padding:9px 12px;border-left:4px solid #2f7d5a}
.pwo-table{margin:0 22px}
.pwo-table-head{display:grid;grid-template-columns:26px 1fr 60px 80px 90px;gap:6px;background:#2C3347;
  color:#FAF8F4;font-size:.72rem;font-weight:700;padding:8px 10px;border-bottom:2px solid #2f7d5a}
.pwo-table-head .r{text-align:right}
.pwo-svc-head{font-size:.7rem;font-weight:800;letter-spacing:.04em;padding:6px 10px}
.pwo-row{display:grid;grid-template-columns:26px 1fr 60px 80px 90px;gap:6px;padding:7px 10px;
  font-size:.8rem;color:#0B0F1A;border-bottom:1px solid #ece8e0;align-items:center}
.pwo-row.alt{background:#F0ECE8}
.pwo-row.sub{background:#fff;color:#6f7686;font-size:.76rem;opacity:.85}
.pwo-row.expandable{cursor:pointer}
.pwo-row.expandable:hover{background:#e6f0ea}
.pwo-rownum{text-align:center;color:#6f7686;font-size:.74rem}
.pwo-rowdesc{display:flex;align-items:center;gap:5px;min-width:0}
.pwo-chev{font-size:.68rem;color:#2f7d5a;flex-shrink:0}
.pwo-row .r{text-align:right}
.pwo-row .b{font-weight:700}
.pwo-svc-note{padding:4px 10px;font-size:.72rem;color:#6f7686;white-space:pre-wrap}
.pwo-loc-box{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:none;padding:6px 0}
.pwo-loc-row{display:grid;grid-template-columns:34px auto 1fr;gap:8px;align-items:baseline;padding:7px 12px;border-bottom:1px solid #f0ece6;border-left:3px solid var(--lc,#2f7d5a)}
.pwo-loc-row:last-of-type{border-bottom:none}
.pwo-loc-num{width:22px;height:22px;border-radius:6px;background:var(--lc,#2f7d5a);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;align-self:center}
.pwo-loc-name{font-size:.82rem;font-weight:700;color:#0B0F1A;white-space:nowrap}
.pwo-loc-gear{font-size:.72rem;color:#6f7686;text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pwo-loc-total{padding:8px 12px 4px;font-size:.76rem;font-weight:800;color:#2C3347}
.pwo-empty-sec{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:none;padding:14px;font-size:.8rem;color:#6f7686}
.pwo-subtotal-row{display:flex;justify-content:space-between;background:#eaf1ec;
  border-top:1px solid #2f7d5a;padding:8px 10px;font-size:.8rem;font-weight:700;color:#2C3347}
.pwo-grand{margin:6px 22px 0;background:#0B0F1A;border-top:2px solid #2f7d5a;display:flex;justify-content:space-between;
  padding:12px 14px;font-size:.92rem;font-weight:800;color:#FAF8F4}
.pwo-grand span:last-child{color:#5FB88A;font-size:1.05rem}
.pwo-fineprint{margin:6px 22px 0;font-size:.7rem;color:#4a5270;font-style:italic}
.pwo-footer{margin-top:20px;background:#0B0F1A;border-top:2px solid #2f7d5a;color:#9aa1af;
  font-size:.7rem;text-align:center;padding:12px 22px}

.pwo-accept-box{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:2px solid #2f7d5a;
  padding:14px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.pwo-accept-box p{margin:0;font-size:.8rem;color:#4a5270}
.pwo-accept-btn{height:44px;padding:0 22px;border:none;border-radius:9px;background:#2f7d5a;color:#fff;
  font-size:.86rem;font-weight:800;cursor:pointer;font-family:inherit}
.pwo-accept-btn:hover{filter:brightness(1.08)}
.pwo-accept-btn:disabled{opacity:.5;cursor:default}
.pwo-preview-note{font-size:.72rem;color:#6f7686}
.pwo-assigned-other{font-size:.82rem;color:#4a5270;line-height:1.5}
.pwo-assigned-other b{color:#0B0F1A;font-weight:800}
.pwo-request-btn{height:44px;padding:0 22px;border:1px solid #C9A96E;border-radius:9px;background:#fff;color:#7a5f1f;font-size:.86rem;font-weight:800;cursor:pointer;font-family:inherit}
.pwo-request-btn:hover{background:#fbf7ee}
.pwo-request-btn:disabled{opacity:.5;cursor:default}
.pwo-req-sent{font-size:.82rem;font-weight:700;color:#1d7a3a;background:#f2f9f4;border:1px solid #bfe0c9;border-radius:8px;padding:9px 12px}
.pwo-err{font-size:.78rem;font-weight:600;color:#a8442f;background:#FBE6E4;border:1px solid #e0b0a8;border-radius:8px;padding:8px 10px}
.pwo-accepted-box{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:2px solid #2f7d5a;
  padding:16px 18px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
.pwo-assigned{display:flex;align-items:center;gap:10px;font-size:.86rem;color:#1d5a2e;font-weight:600}
.pwo-assigned b{font-weight:800;color:#0B0F1A}
.pwo-assigned-check{width:26px;height:26px;flex-shrink:0;border-radius:50%;background:#2f7d5a;color:#fff;
  display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:800}
.pwo-sign-mark{display:flex;flex-direction:column;gap:2px;min-width:200px}
.pwo-sign-img{max-height:64px;max-width:260px;object-fit:contain;align-self:flex-start}
.pwo-sign-typed{font-size:1.6rem;color:#10204a;font-family:"Brush Script MT","Segoe Script",cursive;padding-left:4px}
.pwo-sign-rule{border-bottom:1px solid #0B0F1A;height:1px;width:100%;margin-top:4px}
.pwo-sign-cap{font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#4a5270;margin-top:4px}
.pwo-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:11000;background:#0B0F1A;color:#fff;
  font-size:.82rem;font-weight:700;padding:11px 20px;border-radius:100px;box-shadow:0 12px 34px rgba(0,0,0,.32);
  display:flex;align-items:center;gap:8px}
.pwo-toast svg{color:#5FB88A}
`;
