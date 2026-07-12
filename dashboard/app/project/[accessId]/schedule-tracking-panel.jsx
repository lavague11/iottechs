"use client";
import { useState, useEffect, useRef } from "react";
import { getToolDataAction, saveToolDataAction, trackPackageAction } from "./proposal-actions";
import ReceivingChecklist from "./receiving-checklist";

// Fulfillment-stage panel. For the customer it's the "what happens next" page right after
// their deposit: the next appointment, the equipment timeline (1–2 days processing, 3–5 days
// shipping), and — once the office posts tracking — a cinematic night-drive tracker (ported
// from the owner's tracking-cinematic-preview.jsx): stars, drifting skyline, the IOT truck
// rolling toward the destination house, DELIVERED stamp + fireworks on arrival.
// Tracking record (tool "tracking"): { number, carrier, status, eta, note } — staff set it.

const GOLD = "#C9A96E";
const LINE = "rgba(201,169,110,0.16)";
const CARRIER_URL = {
  UPS: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  FedEx: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  USPS: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  Amazon: () => `https://www.amazon.com/gp/css/order-history`,
};
const SHIP_STAGES = ["Order Placed", "Picked Up", "In Transit", "Out for Delivery", "Delivered"];
const STAGE_PCT = [5, 27, 50, 72, 93];

// Carrier auto-detection from the tracking number's shape — paste and go.
function detectCarrier(raw) {
  const n = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^1Z[0-9A-Z]{10,16}$/.test(n)) return "UPS";
  if (/^TBA[0-9]+$/.test(n)) return "Amazon";
  if (/^\d{12}$/.test(n) || /^\d{15}$/.test(n)) return "FedEx";
  if (/^9\d{19,25}$/.test(n)) return "USPS";
  if (/^\d{20,22}$/.test(n)) return "USPS";
  return "Other";
}
const plus4days = () => { const d = new Date(); d.setDate(d.getDate() + 4); return d.toISOString().slice(0, 10); };
const last4 = (n) => String(n || "").slice(-4);
function deriveStage(status) {
  const s = (status || "").toLowerCase();
  if (/delivered/.test(s)) return 4;
  if (/out for delivery/.test(s)) return 3;
  if (/transit/.test(s)) return 2;
  if (/picked up/.test(s)) return 1;
  return 0;
}
// deterministic pseudo-random so the stars don't reshuffle every render
function seeded(i, salt) { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); }
const fmtEta = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); } catch { return d; } };
// Checkpoint timestamps come back as ISO strings — show a compact "Jul 3, 2:14 PM".
const fmtScan = (t) => { if (!t) return ""; try { return new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

// ---- The night-drive scene ---------------------------------------------------------------
function CinematicTracking({ tracking }) {
  const stage = deriveStage(tracking.status);
  const leftPct = STAGE_PCT[stage];
  const moving = stage < 4;
  const [arrived, setArrived] = useState(false);
  const [fireworks, setFireworks] = useState([]);
  const idRef = useRef(0);

  // Arrival sequence — no ref guard: the effect re-runs only when `stage` changes, and a
  // pre-timer guard breaks under StrictMode's double-mount (guard set, timer cleared, re-run skipped).
  useEffect(() => {
    if (stage !== 4) { setArrived(false); setFireworks([]); return; }
    const t = setTimeout(() => {
      setArrived(true);
      const bursts = [{ x: 78, y: 22, delay: 0 }, { x: 88, y: 34, delay: 350 }, { x: 70, y: 40, delay: 700 }];
      const colors = [GOLD, "#F5F3EF", "#E8D5AE", "#8FA3C7"];
      const all = [];
      bursts.forEach((b) => {
        for (let i = 0; i < 14; i++) {
          const angle = (i / 14) * Math.PI * 2;
          const dist = 26 + seeded(i, b.x) * 30;
          all.push({ id: idRef.current++, x: b.x, y: b.y, tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist, color: colors[i % colors.length], delay: b.delay + seeded(i, b.y) * 100 });
        }
      });
      setFireworks(all);
      setTimeout(() => setFireworks([]), 2400);
    }, 1600);
    return () => clearTimeout(t);
  }, [stage]);

  const stars = Array.from({ length: 30 }).map((_, i) => ({
    left: seeded(i, 1) * 100, top: seeded(i, 2) * 52, size: 1 + seeded(i, 3) * 1.6,
    dur: 2 + seeded(i, 4) * 3, delay: seeded(i, 5) * 4,
  }));
  const carrierLink = CARRIER_URL[tracking.carrier];

  return (
    <div className="cin-card">
      {/* header strip */}
      <div className="cin-head">
        <div className="cin-brandbox">IOT</div>
        <div className="cin-brandtxt"><b>IOT TECHS</b><span>Tracking Center</span></div>
        <span className="cin-live">LIVE</span>
      </div>

      {/* scene */}
      <div className="cin-scene">
        {stars.map((st, i) => (
          <div key={i} className="cin-star" style={{ left: `${st.left}%`, top: `${st.top}%`, width: st.size, height: st.size, animationDuration: `${st.dur}s`, animationDelay: `${st.delay}s` }} />
        ))}
        <div className="cin-shoot" />
        <div className="cin-moon" />

        {/* far skyline */}
        <div className="cin-sky far" style={{ animationPlayState: moving ? "running" : "paused" }}>
          {[0, 1].map((h) => (
            <svg key={h} width="50%" height="60" viewBox="0 0 520 60" preserveAspectRatio="none" style={{ flexShrink: 0 }}>
              <path d="M0 60 V38 H24 V22 H40 V38 H62 V12 H84 V38 H110 V28 H132 V38 H158 V8 H176 V38 H205 V25 H228 V38 H252 V16 H276 V38 H305 V30 H330 V38 H352 V10 H372 V38 H400 V24 H424 V38 H450 V18 H472 V38 H500 V29 H520 V60 Z" fill="#141B36" />
            </svg>
          ))}
        </div>
        {/* near skyline with lit windows */}
        <div className="cin-sky near" style={{ animationPlayState: moving ? "running" : "paused" }}>
          {[0, 1].map((h) => (
            <svg key={h} width="50%" height="74" viewBox="0 0 520 74" preserveAspectRatio="none" style={{ flexShrink: 0 }}>
              <path d="M0 74 V44 H30 V20 H52 V44 H80 V32 H104 V44 H136 V10 H160 V44 H196 V26 H224 V44 H258 V16 H284 V44 H318 V34 H344 V44 H380 V14 H406 V44 H440 V28 H468 V44 H520 V74 Z" fill="#1B2342" />
              {[[38,30],[60,32],[142,22],[150,34],[204,34],[268,28],[276,40],[388,26],[396,38],[448,36]].map(([x,y],i)=>(
                <rect key={i} x={x} y={y} width="4" height="5" fill={GOLD} opacity="0.85" style={{ animation: `cinWindow ${5 + i}s linear infinite` }} />
              ))}
            </svg>
          ))}
        </div>

        {/* road */}
        <div className="cin-road">
          <div className="cin-road-top" />
          <div className="cin-lane" style={{ animationPlayState: moving ? "running" : "paused" }} />
          <div className="cin-progress" style={{ width: `${leftPct}%` }} />
        </div>

        {/* destination house */}
        <div className="cin-house" style={arrived ? { animation: "cinHouseGlow 2.2s ease-in-out infinite" } : undefined}>
          <svg width="34" height="34" viewBox="0 0 34 34">
            <path d="M17 3 L31 14 V31 H3 V14 Z" fill="#0D1226" stroke={arrived ? GOLD : "#39415F"} strokeWidth="1.8" />
            <rect x="13.5" y="19" width="7" height="12" fill={arrived ? GOLD : "#39415F"} opacity={arrived ? 0.95 : 0.5} />
            <rect x="6" y="17" width="5" height="5" fill={arrived ? GOLD : "#2A3252"} opacity="0.8" />
            <rect x="23" y="17" width="5" height="5" fill={arrived ? GOLD : "#2A3252"} opacity="0.8" />
          </svg>
          {arrived && (
            <>
              <div className="cin-doorlight" />
              <div className="cin-package">📦</div>
            </>
          )}
        </div>

        {/* truck */}
        <div className="cin-truckwrap" style={{ left: `calc(${leftPct}% - 30px)` }}>
          <div className="cin-headlight" style={{ animationPlayState: moving ? "running" : "paused", opacity: moving ? 1 : 0.35 }} />
          <svg width="56" height="32" viewBox="0 0 56 32" className="cin-trucksvg" style={{ animationPlayState: moving ? "running" : "paused" }}>
            <rect x="1" y="5" width="30" height="17" rx="2.5" fill={GOLD} />
            <rect x="1" y="5" width="30" height="6" rx="2.5" fill="#E5C98F" opacity="0.5" />
            <text x="16" y="16.5" textAnchor="middle" fontSize="6.5" fontWeight="900" fill="#181206" fontFamily="Helvetica">IOT</text>
            <path d="M31 9 H44 L53 17 V22 H31 Z" fill="#8A6F42" />
            <rect x="45" y="12" width="5.5" height="5" rx="1" fill="#0B0F1A" opacity="0.4" />
            <circle cx="53.5" cy="19" r="1.6" fill="#F0E6D2" />
            <g className="cin-wheel" style={{ transformOrigin: "11px 25px", animationPlayState: moving ? "running" : "paused" }}>
              <circle cx="11" cy="25" r="4.5" fill="#0B0F1A" stroke="#3A4260" strokeWidth="1.6" />
              <line x1="11" y1="21.5" x2="11" y2="28.5" stroke="#5B6486" strokeWidth="1.1" />
              <line x1="7.5" y1="25" x2="14.5" y2="25" stroke="#5B6486" strokeWidth="1.1" />
            </g>
            <g className="cin-wheel" style={{ transformOrigin: "42px 25px", animationPlayState: moving ? "running" : "paused" }}>
              <circle cx="42" cy="25" r="4.5" fill="#0B0F1A" stroke="#3A4260" strokeWidth="1.6" />
              <line x1="42" y1="21.5" x2="42" y2="28.5" stroke="#5B6486" strokeWidth="1.1" />
              <line x1="38.5" y1="25" x2="45.5" y2="25" stroke="#5B6486" strokeWidth="1.1" />
            </g>
          </svg>
          {moving && [0, 1, 2].map((i) => <div key={i} className="cin-puff" style={{ animationDelay: `${i * 0.33}s` }} />)}
        </div>

        {/* fireworks */}
        {fireworks.map((f) => (
          <div key={f.id} className="cin-fw" style={{ left: `${f.x}%`, top: `${f.y}%`, background: f.color, boxShadow: `0 0 6px ${f.color}`, "--tx": `${f.tx}px`, "--ty": `${f.ty}px`, animationDelay: `${f.delay}ms` }} />
        ))}

        {arrived && <div className="cin-stamp">DELIVERED</div>}

        {[0,1,2,3,4].map((i) => <div key={i} className="cin-dust" style={{ left: `${12 + i * 19}%`, animationDuration: `${4 + i * 0.9}s`, animationDelay: `${i * 1.1}s` }} />)}
        <div className="cin-scan" />
        <div className="cin-vignette" />
      </div>

      {/* stage labels */}
      <div className="cin-stages">
        {SHIP_STAGES.map((label, i) => (
          <span key={label} className={`cin-stage${i <= stage ? " on" : ""}${i === stage ? " now" : ""}`}
                style={{ left: `${STAGE_PCT[i]}%`, transform: i === 0 ? "none" : i === SHIP_STAGES.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>
            {label}
          </span>
        ))}
      </div>

      {/* status row */}
      <div className="cin-statusrow">
        <span className="cin-carrier">{tracking.carrier || "Carrier"}</span>
        <div className="cin-status">
          <span className="cin-status-lbl">Status</span>
          <b>{tracking.status || "Order Placed"}</b>
        </div>
        <span className="cin-num">{tracking.number}</span>
        {carrierLink && (
          <a className="cin-link" href={carrierLink(tracking.number)} target="_blank" rel="noopener noreferrer">
            Open on {tracking.carrier}.com ↗
          </a>
        )}
      </div>

      {/* ETA / delivered banner */}
      {stage === 4 ? (
        <div className="cin-banner delivered"><span>Delivered — your equipment has arrived</span></div>
      ) : tracking.eta ? (
        <div className="cin-banner eta">
          <span className="cin-banner-lbl">Estimated Delivery</span>
          <span className="cin-banner-date">{fmtEta(tracking.eta)}</span>
        </div>
      ) : null}
      {tracking.note && <div className="cin-note">{tracking.note}</div>}
    </div>
  );
}

// ---- Panel --------------------------------------------------------------------------------
export default function ScheduleTrackingPanel({ accessId, role, project, preview, proposal, staffUsers = [] }) {
  const isStaff = ["admin", "manager"].includes(role);
  const [events, setEvents] = useState([]);
  // Shipments — a project's equipment usually arrives in several boxes. Record shape:
  // { shipments: [{number, carrier, status, eta, note}, …] } (legacy single-object records
  // are normalized into a one-element list on load).
  const [shipments, setShipments] = useState([]);
  const [active, setActive] = useState(0);          // which package the scene shows
  const [quick, setQuick] = useState("");           // paste-and-go input
  const [addOpen, setAddOpen] = useState(false);    // "add tracking number" popup
  const [editIdx, setEditIdx] = useState(null);     // shipment whose details are open
  const [editBuf, setEditBuf] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false); // shipment remove pending confirm
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState({});             // { number: liveRecord } from the carrier API
  const [liveState, setLiveState] = useState({});   // { number: "loading"|"ok"|"nokey"|"err" }
  const [techs, setTechs] = useState(null);         // assigned install crew (null = not loaded yet)
  const [techAdd, setTechAdd] = useState("");       // add-technician input

  useEffect(() => {
    let live = true;
    getToolDataAction(accessId, "schedule").then((r) => {
      if (!live || !r?.ok || !r.saved?.data) return;
      try { setEvents(JSON.parse(r.saved.data).events || []); } catch { /* bad blob */ }
    }).catch(() => {});
    getToolDataAction(accessId, "tracking").then((r) => {
      if (!live || !r?.ok || !r.saved?.data) return;
      try {
        const t = JSON.parse(r.saved.data);
        const list = Array.isArray(t.shipments) ? t.shipments : (t.number ? [t] : []);
        setShipments(list.filter((s) => s && s.number));
      } catch { /* bad blob */ }
    }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const parsed = events
    .map((e) => ({ ...e, when: new Date(`${e.date}T${e.time || "09:00"}`) }))
    .filter((e) => !isNaN(e.when))
    .sort((a, b) => a.when - b.when);
  const next = parsed.find((e) => e.when >= today) || parsed[parsed.length - 1] || null;
  const nextIsPast = next && next.when < today;
  const fallbackDate = project?.install_date || project?.date || null;

  const activeShip = shipments[Math.min(active, shipments.length - 1)] || null;
  const shipped = shipments.some((s) => deriveStage(s.status) >= 1);
  const deliveredNow = shipments.length > 0 && shipments.every((s) => deriveStage(s.status) === 4);
  // The tracker only appears once a real tracking number exists. Staff (not previewing) always see
  // it so they can paste one in; the customer sees nothing until a package is actually posted.
  const showTracking = shipments.length > 0 || (isStaff && !preview);

  async function saveShipments(list) {
    if (busy || preview) return false;
    setBusy(true);
    const clean = list.filter((s) => s && String(s.number || "").trim());
    const r = await saveToolDataAction(accessId, "tracking", JSON.stringify({ shipments: clean }));
    setBusy(false);
    if (r?.ok) { setShipments(clean); return true; }
    return false;
  }
  // Paste-and-go: carrier auto-detected from the number's shape, status/ETA sensible defaults.
  async function quickAdd() {
    const number = quick.trim().replace(/\s+/g, "");
    if (!number || busy) return;
    // Neutral defaults — the live carrier lookup (or staff) fills the real status/ETA, so we never
    // show a made-up "In Transit" for a package that may already be delivered.
    const ship = { number, carrier: detectCarrier(number), status: "Order Placed", eta: "", note: "" };
    if (await saveShipments([...shipments, ship])) { setQuick(""); setActive(shipments.length); setAddOpen(false); }
  }
  function openEdit(i) { setEditIdx(i); setEditBuf({ ...shipments[i] }); }
  async function saveEdit() {
    const list = shipments.map((s, i) => (i === editIdx ? { ...editBuf, number: String(editBuf.number || "").trim() } : s));
    if (await saveShipments(list)) { setEditIdx(null); setEditBuf(null); }
  }
  async function removeShipment(i) {
    const list = shipments.filter((_, x) => x !== i);
    if (await saveShipments(list)) { setEditIdx(null); setEditBuf(null); setActive(0); }
  }

  // ---- Assigned install crew (multiple techs, add/remove) ----
  useEffect(() => {
    let live = true;
    getToolDataAction(accessId, "techs").then((r) => {
      if (!live || !r?.ok || !r.saved?.data) return;
      try { setTechs(JSON.parse(r.saved.data).names || []); } catch { /* bad blob */ }
    }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);
  const canAssign = !preview && ["admin", "manager", "sales"].includes(role);
  const seedTechs = proposal?.tech_signed_name ? [proposal.tech_signed_name] : (project?.tech ? [project.tech] : []);
  const crew = techs != null ? techs : seedTechs;   // seed from the WO-accepting tech until edited
  const staffTechNames = [...new Set(staffUsers.filter((u) => u.role === "tech" && u.name).map((u) => u.name))];
  async function persistTechs(next) { setTechs(next); if (!preview) await saveToolDataAction(accessId, "techs", JSON.stringify({ names: next })); }
  function addTech(name) {
    const n = String(name || "").trim(); if (!n) return;
    if (crew.some((t) => t.toLowerCase() === n.toLowerCase())) { setTechAdd(""); return; }
    persistTechs([...crew, n]); setTechAdd("");
  }
  const removeTech = (name) => persistTechs(crew.filter((t) => t !== name));

  // Pull the REAL carrier status for a package. Updates the in-memory live record for display and,
  // for staff, persists status/ETA back so the equipment timeline + customer view reflect reality.
  async function refreshLive(ship, persist, retried) {
    if (!ship?.number) return;
    setLiveState((s) => ({ ...s, [ship.number]: "loading" }));
    const r = await trackPackageAction(accessId, ship.number, ship.carrier);
    if (r?.ok) {
      setLive((l) => ({ ...l, [ship.number]: r }));
      setLiveState((s) => ({ ...s, [ship.number]: "ok" }));
      if (persist && isStaff && !preview && r.status && (r.status !== ship.status || (r.eta && r.eta !== ship.eta))) {
        saveShipments(shipments.map((x) => (x.number === ship.number ? { ...x, status: r.status, eta: r.eta || x.eta } : x)));
      }
    } else if (r?.reason === "pending") {
      // Just registered with the carrier — data isn't ingested yet. Show "fetching" and retry once.
      setLiveState((s) => ({ ...s, [ship.number]: "pending" }));
      if (!retried) setTimeout(() => refreshLive(ship, persist, true), 6000);
    } else if (r?.reason === "rate_limit") {
      // Free-tier daily quota hit — stop hitting the API; show last known status.
      setLiveState((s) => ({ ...s, [ship.number]: "limit" }));
    } else {
      setLiveState((s) => ({ ...s, [ship.number]: r?.reason === "no_key" ? "nokey" : "err" }));
    }
  }
  // Auto-fetch live status for the package on screen (once per number).
  useEffect(() => {
    if (activeShip?.number && liveState[activeShip.number] === undefined) refreshLive(activeShip, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShip?.number]);

  const dt = (d) => { try { return new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }); } catch { return d.date; } };
  const tm = (e) => { try { const [h, m] = (e.time || "09:00").split(":").map(Number); const s = new Date(2000, 0, 1, h, m); const en = new Date(s.getTime() + (Number(e.duration) || 60) * 60000); const f = (x) => x.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); return `${f(s)} – ${f(en)}`; } catch { return e.time; } };

  return (
    <div className="stp-root">
      <style>{STP_CSS}</style>
      <div className="stp-header">
        <div className="stp-hd-left">
          <span className="stp-brand">IOT TECHS</span>
          <span className="stp-tagline">Secure Tomorrow. Today.</span>
        </div>
        <span className="stp-doctag">Fulfillment &amp; Equipment</span>
      </div>

      {/* Next appointment */}
      <div className="stp-section-hd">Your Next Appointment</div>
      {next ? (
        <div className="stp-appt">
          <div className="stp-appt-tile">
            <span className="stp-appt-mon">{next.when.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
            <span className="stp-appt-day">{next.when.getDate()}</span>
          </div>
          <div className="stp-appt-info">
            <b>{next.title || "IOT TECHS — Installation"}</b>
            <span>{dt(next)} · {tm(next)}</span>
            {next.location && <span className="stp-appt-loc">{next.location}</span>}
            {nextIsPast && <span className="stp-appt-note">Most recent appointment — new dates will appear here.</span>}
          </div>
        </div>
      ) : (
        <div className="stp-appt empty">
          {fallbackDate
            ? <>Your visit is penciled in for <b>{fallbackDate}</b> — we'll confirm the exact time window shortly.</>
            : <>We're lining up your installation date — it will appear here as soon as it's booked.</>}
        </div>
      )}
      {/* Assigned technicians — internal only (never shown to the customer). Office can add/remove. */}
      {role !== "customer" && !preview && (
        <div className="stp-appt-tech">
          <div className="stp-crew-top">
            <span className="stp-tech-lbl">Assigned Technician{crew.length !== 1 ? "s" : ""}</span>
            <span className="stp-tech-int">Internal</span>
          </div>
          <div className="stp-crew-chips">
            {crew.length ? crew.map((t) => (
              <span key={t} className="stp-crew-chip">{t}{canAssign && <button type="button" className="stp-crew-x" title="Remove" onClick={() => removeTech(t)}>✕</button>}</span>
            )) : <span className="stp-tech-none">Not yet assigned</span>}
          </div>
          {canAssign && (
            <div className="stp-crew-add">
              <input className="stp-crew-in" list="stp-tech-list" value={techAdd} placeholder="Add technician…"
                     onChange={(e) => setTechAdd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTech(techAdd)} />
              <datalist id="stp-tech-list">{staffTechNames.map((n) => <option key={n} value={n} />)}</datalist>
              <button type="button" className="stp-crew-addbtn" disabled={!techAdd.trim()} onClick={() => addTech(techAdd)}>+ Add</button>
            </div>
          )}
        </div>
      )}


      {/* Tracking — only rendered once a real number exists (or for staff, who can add one) */}
      {showTracking && (<>
      <div className="stp-section-hd stp-track-hd">
        <span>Shipment Tracking{shipments.length > 1 ? ` — ${shipments.length} Packages` : ""}</span>
        {isStaff && !preview && (
          <button type="button" className="stp-addmini" onClick={() => { setQuick(""); setAddOpen(true); }} title="Add a tracking number">+ Add</button>
        )}
      </div>
      <div className="stp-track">

        {/* Package chips — everyone can flip the scene between boxes */}
        {shipments.length > 1 && (
          <div className="stp-pkgs">
            {shipments.map((s, i) => {
              const st = deriveStage(s.status);
              return (
                <button key={s.number + i} type="button" className={`stp-pkg${i === active ? " on" : ""}${st === 4 ? " done" : ""}`} onClick={() => setActive(i)}>
                  <span className="stp-pkg-n">{st === 4 ? "✓" : i + 1}</span>
                  Package {i + 1} · {s.carrier} ····{last4(s.number)}
                </button>
              );
            })}
          </div>
        )}

        {activeShip ? (() => {
          const lv = live[activeShip.number] || null;
          const shown = lv ? { ...activeShip, status: lv.status || activeShip.status, eta: lv.eta || activeShip.eta } : activeShip;
          const st = liveState[activeShip.number];
          return (
            <>
              <div className="stp-liverow">
                <span className={`stp-livedot ${st || ""}`} />
                <span className="stp-livetxt">
                  {st === "loading" ? "Checking carrier…"
                    : st === "pending" ? "Carrier is fetching this shipment — refresh in a moment"
                    : st === "ok" ? (lv?.lastLocation ? `Live · last scan ${lv.lastLocation}` : "Live from carrier")
                    : st === "nokey" ? "Showing the status set by our team"
                    : st === "limit" ? "Daily carrier-lookup limit reached — showing last known status"
                    : st === "err" ? "Couldn't reach the carrier — showing last known status"
                    : "Tracking"}
                </span>
                <button type="button" className="stp-mini" onClick={() => refreshLive(activeShip, true)} disabled={st === "loading" || st === "pending"}>↻ Refresh</button>
              </div>
              <CinematicTracking tracking={shown} />
              {lv?.checkpoints?.length > 0 && (
                <div className="stp-scan">
                  <div className="stp-scan-hd">Tracking history</div>
                  {lv.checkpoints.slice(-6).reverse().map((c, i) => (
                    <div key={i} className="stp-scan-row">
                      <span className="stp-scan-dot" />
                      <div className="stp-scan-body">
                        <span className="stp-scan-msg">{c.message || "Update"}</span>
                        <span className="stp-scan-meta">{[c.location, fmtScan(c.time)].filter(Boolean).join(" · ")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isStaff && !preview && st === "nokey" && (
                <div className="stp-livehint">Live carrier tracking isn't connected yet — packages show the status you set here. Add a <b>TRACKING_API_KEY</b> (AfterShip or TrackingMore) to auto-pull real status, ETA &amp; last scan.</div>
              )}
            </>
          );
        })() : (
          <div className="stp-track-wait">
            <span className="stp-track-ph">— — — —  — — — —  — — — —</span>
            <span>Paste a tracking number above and we'll pull the live status here.</span>
          </div>
        )}

        {/* Staff: per-package status rows with inline details */}
        {isStaff && !preview && shipments.length > 0 && (
          <div className="stp-shiplist">
            {shipments.map((s, i) => (
              <div key={s.number + i} className="stp-shiprow-wrap">
                <div className="stp-shiprow">
                  <span className="stp-quick-carrier">{s.carrier}</span>
                  <span className="stp-ship-num">{s.number}</span>
                  <select className="stp-input slim" value={s.status || "Order Placed"} disabled={busy}
                          onChange={(e) => saveShipments(shipments.map((x, xi) => (xi === i ? { ...x, status: e.target.value } : x)))}>
                    {SHIP_STAGES.map((st) => <option key={st}>{st}</option>)}
                  </select>
                  {deriveStage(s.status) !== 4 && (
                    <button type="button" className="stp-mini stp-delivered" disabled={busy} title="Mark this package delivered"
                            onClick={() => saveShipments(shipments.map((x, xi) => (xi === i ? { ...x, status: "Delivered" } : x)))}>✓ Delivered</button>
                  )}
                  <button type="button" className="stp-mini" onClick={() => { setConfirmRemove(false); editIdx === i ? setEditIdx(null) : openEdit(i); }}>{editIdx === i ? "Close" : "Details"}</button>
                </div>
                {editIdx === i && editBuf && (
                  <div className="stp-track-edit">
                    <input className="stp-input" placeholder="Tracking number" value={editBuf.number} onChange={(e) => setEditBuf((v) => ({ ...v, number: e.target.value }))} />
                    <select className="stp-input" value={editBuf.carrier} onChange={(e) => setEditBuf((v) => ({ ...v, carrier: e.target.value }))}>
                      <option>UPS</option><option>FedEx</option><option>USPS</option><option>Amazon</option><option>Freight</option><option>Other</option>
                    </select>
                    <input className="stp-input" type="date" title="Estimated delivery" value={editBuf.eta || ""} onChange={(e) => setEditBuf((v) => ({ ...v, eta: e.target.value }))} />
                    <input className="stp-input" placeholder="Note (optional)" value={editBuf.note || ""} onChange={(e) => setEditBuf((v) => ({ ...v, note: e.target.value }))} />
                    <button type="button" className="stp-btn" disabled={busy} onClick={saveEdit}>Save</button>
                    {confirmRemove ? (
                      <>
                        <button type="button" className="stp-btn ghost danger" disabled={busy} onClick={() => { removeShipment(i); setConfirmRemove(false); }}>Confirm</button>
                        <button type="button" className="stp-btn ghost" onClick={() => setConfirmRemove(false)}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" className="stp-btn ghost danger" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      </>)}

      {/* Equipment receiving checklist — imported from the proposal. Shown to everyone (the customer
          gets a read-only view), so it lives outside the staff-only tracking gate. */}
      <ReceivingChecklist accessId={accessId} proposal={proposal} role={role} preview={preview} />

      {/* Add-tracking popup — a tiny modal instead of an always-on paste box. */}
      {addOpen && (
        <div className="stp-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }}>
          <div className="stp-modal" role="dialog" aria-modal="true">
            <div className="stp-modal-hd"><b>Add Tracking Number</b><button type="button" className="stp-modal-x" onClick={() => setAddOpen(false)}>✕</button></div>
            <div className="stp-modal-bd">
              <input className="stp-input stp-quick-in" autoFocus placeholder="Paste a tracking number…" value={quick}
                     onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && quickAdd()} />
              <div className="stp-modal-row">
                {quick.trim() ? <span className="stp-quick-carrier">{detectCarrier(quick)}</span> : <span className="stp-modal-hint">We auto-detect the carrier.</span>}
                <button type="button" className="stp-btn" disabled={busy || !quick.trim()} onClick={quickAdd}>{busy ? "Adding…" : "Add"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="stp-footer">IOT TECHS · (646) 396-0775 · support@iot-techs.com</div>
    </div>
  );
}

const STP_CSS = `
.stp-root{background:#FAF8F4;border-radius:14px;border:1px solid #d9d4ca;overflow:hidden;margin:0 0 16px;
  box-shadow:0 10px 30px rgba(11,15,26,.08);font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif}
.stp-header{background:#0B0F1A;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-top:4px solid #4b6a9b}
.stp-hd-left{display:flex;flex-direction:column;gap:2px}
.stp-brand{font-size:1.2rem;font-weight:800;color:#fff;letter-spacing:.02em}
.stp-tagline{font-size:.66rem;font-weight:600;color:#C9A96E;letter-spacing:.03em}
.stp-doctag{font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9fc0e8;border:1px solid rgba(75,106,155,.55);border-radius:100px;padding:5px 13px}
.stp-section-hd{margin:16px 22px 0;background:#2C3347;color:#FAF8F4;font-size:.74rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:9px 12px;border-left:4px solid #4b6a9b}
.stp-footer{margin-top:18px;background:#0B0F1A;border-top:2px solid #4b6a9b;color:#9aa1af;font-size:.7rem;text-align:center;padding:11px 22px}

.stp-appt{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:none;padding:14px 16px;display:flex;gap:14px;align-items:center}
.stp-appt.empty{display:block;font-size:.84rem;color:#4a5270}
.stp-appt-tech{margin:0 22px;background:#0B0F1A;border:1px solid #d9d4ca;border-top:none;padding:11px 16px;display:flex;flex-direction:column;gap:9px}
.stp-crew-top{display:flex;align-items:center;gap:10px}
.stp-tech-lbl{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a93a8}
.stp-tech-int{margin-left:auto;font-size:.6rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#C9A96E;border:1px solid rgba(201,169,110,.4);border-radius:100px;padding:2px 8px}
.stp-crew-chips{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.stp-crew-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;font-size:.82rem;font-weight:700;border-radius:100px;padding:5px 6px 5px 12px}
.stp-crew-x{width:18px;height:18px;border:none;border-radius:50%;background:rgba(255,255,255,.15);color:#fff;font-size:.62rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.stp-crew-x:hover{background:#c0392b}
.stp-tech-none{color:#8a93a8;font-weight:600;font-style:italic;font-size:.84rem}
.stp-crew-add{display:flex;gap:7px;align-items:center}
.stp-crew-in{flex:1;min-width:140px;max-width:240px;height:32px;border:1px solid #3a4260;border-radius:8px;background:#151a2d;color:#fff;padding:0 10px;font-size:.8rem;font-family:inherit;outline:none}
.stp-crew-in:focus{border-color:#C9A96E}
.stp-crew-addbtn{height:32px;padding:0 13px;border:1px solid rgba(201,169,110,.5);background:rgba(201,169,110,.15);color:#C9A96E;border-radius:8px;font-size:.76rem;font-weight:800;cursor:pointer;font-family:inherit}
.stp-crew-addbtn:disabled{opacity:.5;cursor:default}
.stp-appt-tile{width:56px;height:56px;flex-shrink:0;border-radius:11px;background:#0B0F1A;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.stp-appt-mon{font-size:.6rem;font-weight:800;letter-spacing:.08em;color:#C9A96E}
.stp-appt-day{font-size:1.4rem;font-weight:800;line-height:1}
.stp-appt-info{display:flex;flex-direction:column;gap:2px;min-width:0}
.stp-appt-info b{font-size:.9rem;color:#0B0F1A}
.stp-appt-info span{font-size:.8rem;color:#4a5270}
.stp-appt-loc{color:#6f7686}
.stp-appt-note{font-size:.72rem;color:#8a6d2f;font-style:italic}

.stp-gather{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:none;padding:18px 16px;display:flex;flex-direction:column;gap:14px}
.stp-anim{display:flex;align-items:flex-end;gap:7px;height:34px}
.stp-box{width:13px;height:13px;border-radius:3px;background:#C9A96E;opacity:.25;animation:stpPulse 1.5s ease-in-out infinite}
.stp-box.b2{animation-delay:.25s}
.stp-box.b3{animation-delay:.5s}
.stp-truck{color:#4b6a9b;margin-left:8px;animation:stpTruck 2.6s ease-in-out infinite}
@keyframes stpPulse{0%,100%{opacity:.2;transform:translateY(0)}45%{opacity:1;transform:translateY(-7px)}}
@keyframes stpTruck{0%,100%{transform:translateX(0)}50%{transform:translateX(9px)}}
.stp-gather-txt{display:flex;flex-direction:column;gap:3px}
.stp-gather-txt b{font-size:.92rem;color:#0B0F1A}
.stp-gather-txt span{font-size:.8rem;color:#4a5270}
.stp-dots i{font-style:normal;animation:stpDot 1.4s infinite;opacity:0}
.stp-dots i:nth-child(2){animation-delay:.25s}
.stp-dots i:nth-child(3){animation-delay:.5s}
@keyframes stpDot{0%,60%,100%{opacity:0}30%{opacity:1}}

.stp-timeline{display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding-top:4px}
.stp-tl-step{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:74px;text-align:center}
.stp-tl-dot{width:24px;height:24px;border-radius:50%;border:1.5px solid #d9d4ca;background:#fff;color:#8a93a8;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:800}
.stp-tl-step.done .stp-tl-dot{background:#2f7d5a;border-color:#2f7d5a;color:#fff}
.stp-tl-step.now .stp-tl-dot{border-color:#C9A96E;color:#8a6d2f;box-shadow:0 0 0 3px rgba(201,169,110,.2);animation:stpNow 1.8s ease-in-out infinite}
@keyframes stpNow{0%,100%{box-shadow:0 0 0 3px rgba(201,169,110,.2)}50%{box-shadow:0 0 0 6px rgba(201,169,110,.06)}}
.stp-tl-lbl{font-size:.68rem;font-weight:700;color:#4a5270;line-height:1.25}
.stp-tl-lbl em{display:block;font-style:normal;font-weight:600;color:#8a93a8;font-size:.64rem}
.stp-tl-line{flex:1;height:1.5px;background:#e6e1d6;margin-top:12px;min-width:12px}

.stp-track{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:none;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.stp-track-wait{display:flex;flex-direction:column;gap:5px}
.stp-track-ph{font-family:ui-monospace,Consolas,monospace;font-size:.9rem;color:#c2bcae;letter-spacing:.08em;animation:stpShimmer 2.2s ease-in-out infinite}
@keyframes stpShimmer{0%,100%{opacity:.45}50%{opacity:1}}
.stp-track-wait span{font-size:.8rem;color:#4a5270}
.stp-track-edit{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.stp-track-edit .stp-input:first-child{flex:2;min-width:180px}
.stp-input{height:38px;border:1px solid #d9d4ca;border-radius:8px;background:#fff;color:#0B0F1A;padding:0 11px;font-size:.82rem;font-family:inherit;outline:none}
.stp-input:focus{border-color:#4b6a9b}
.stp-btn{height:38px;padding:0 18px;border:none;border-radius:9px;background:#4b6a9b;color:#fff;font-size:.8rem;font-weight:800;cursor:pointer;font-family:inherit}
.stp-btn:hover{filter:brightness(1.08)}
.stp-btn:disabled{opacity:.5;cursor:default}
.stp-btn.ghost{background:#fff;border:1px solid #d9d4ca;color:#0B0F1A}
.stp-btn.outline{background:#fff;border:1.5px dashed #4b6a9b;color:#3a4a72;align-self:flex-start}
.stp-btn.danger{color:#a8442f;border-color:#e0b0a8}
.stp-btn.danger:hover{background:#fbeceb}

.stp-track-hd{display:flex;align-items:center;justify-content:space-between;gap:10px}
.stp-addmini{height:26px;padding:0 12px;border-radius:100px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font-size:.72rem;font-weight:800;letter-spacing:.03em;cursor:pointer;font-family:inherit}
.stp-addmini:hover{background:rgba(255,255,255,.2)}
.stp-modal-bg{position:fixed;inset:0;z-index:12000;background:rgba(11,15,26,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px}
.stp-modal{width:min(440px,96vw);background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 24px 70px rgba(11,15,26,.4)}
.stp-modal-hd{display:flex;align-items:center;justify-content:space-between;background:#0B0F1A;color:#fff;padding:13px 16px;font-size:.9rem}
.stp-modal-x{background:none;border:none;color:#9aa1af;font-size:1rem;cursor:pointer}
.stp-modal-x:hover{color:#fff}
.stp-modal-bd{padding:16px;display:flex;flex-direction:column;gap:11px}
.stp-modal-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.stp-modal-hint{font-size:.76rem;color:#8a8f9c}
.stp-quick{display:flex;gap:8px;align-items:center;background:#f4f7fb;border:1.5px dashed #b9c8de;border-radius:10px;padding:9px 10px}
.stp-quick-in{flex:1;min-width:150px;font-family:ui-monospace,Consolas,monospace}
.stp-quick-carrier{flex-shrink:0;font-size:.64rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:#eef3fa;border:1px solid #ccd6e6;color:#3a4a72;border-radius:100px;padding:4px 10px}
.stp-pkgs{display:flex;gap:8px;flex-wrap:wrap}
.stp-pkg{display:flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:100px;border:1.5px solid #d9d4ca;background:#fff;color:#4a5270;font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit}
.stp-pkg:hover{border-color:#4b6a9b}
.stp-pkg.on{background:#0B0F1A;border-color:#0B0F1A;color:#fff}
.stp-pkg.done .stp-pkg-n{background:#2f7d5a;color:#fff}
.stp-pkg-n{width:18px;height:18px;border-radius:50%;background:#e6e1d6;color:#4a5270;display:flex;align-items:center;justify-content:center;font-size:.64rem;font-weight:800}
.stp-pkg.on .stp-pkg-n{background:#C9A96E;color:#0B0F1A}
.stp-shiplist{display:flex;flex-direction:column;gap:8px}
.stp-shiprow-wrap{border:1px solid #ece8e0;border-radius:10px;padding:8px 10px;background:#fcfbf8}
.stp-shiprow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.stp-ship-num{font-family:ui-monospace,Consolas,monospace;font-size:.78rem;color:#0B0F1A;flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stp-input.slim{height:30px;font-size:.74rem;padding:0 8px}
.stp-mini{height:28px;padding:0 12px;border-radius:100px;border:1px solid #d9d4ca;background:#fff;color:#4a5270;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit}
.stp-mini:hover{border-color:#4b6a9b;color:#3a4a72}
.stp-delivered{border-color:#bfe0c9;color:#1d7a3a;font-weight:800}
.stp-delivered:hover{border-color:#2f7d5a;background:#f2f9f4;color:#1d7a3a}
.stp-track-edit{margin-top:9px}
.stp-liverow{display:flex;align-items:center;gap:9px}
.stp-livedot{width:9px;height:9px;border-radius:50%;background:#c2bcae;flex-shrink:0}
.stp-livedot.ok{background:#2f7d5a;box-shadow:0 0 0 3px rgba(47,125,90,.16);animation:stpNow 1.8s ease-in-out infinite}
.stp-livedot.loading,.stp-livedot.pending{background:#C9A96E;animation:stpPulse 1s ease-in-out infinite}
.stp-livedot.err,.stp-livedot.nokey,.stp-livedot.limit{background:#c99a6e}
.stp-livetxt{flex:1;min-width:0;font-size:.76rem;font-weight:700;color:#4a5270;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stp-scan{border:1px solid #ece8e0;border-radius:10px;background:#fcfbf8;padding:10px 12px;display:flex;flex-direction:column;gap:9px}
.stp-scan-hd{font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a6d2f}
.stp-scan-row{display:flex;gap:9px;align-items:flex-start}
.stp-scan-dot{width:7px;height:7px;border-radius:50%;background:#4b6a9b;margin-top:5px;flex-shrink:0}
.stp-scan-body{display:flex;flex-direction:column;gap:1px;min-width:0}
.stp-scan-msg{font-size:.8rem;font-weight:600;color:#0B0F1A}
.stp-scan-meta{font-size:.72rem;color:#6f7686}
.stp-livehint{font-size:.74rem;color:#4a5270;background:#f4f7fb;border:1px dashed #b9c8de;border-radius:9px;padding:9px 11px;line-height:1.5}
.stp-livehint b{color:#3a4a72;font-family:ui-monospace,Consolas,monospace;font-size:.72rem}

/* ---- Cinematic tracker ---- */
@keyframes cinTwinkle{0%,100%{opacity:.15}50%{opacity:.9}}
@keyframes cinShoot{0%{transform:translate(0,0);opacity:0}8%{opacity:1}100%{transform:translate(-260px,90px);opacity:0}}
@keyframes cinDrift{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes cinLane{from{background-position-x:0}to{background-position-x:-64px}}
@keyframes cinWheel{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes cinBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes cinFlicker{0%,100%{opacity:.5}50%{opacity:.75}}
@keyframes cinPuff{0%{opacity:.5;transform:translate(0,0) scale(.5)}100%{opacity:0;transform:translate(-20px,-14px) scale(1.7)}}
@keyframes cinWindow{0%,92%,100%{opacity:.85}95%{opacity:.2}}
@keyframes cinFw{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.4)}}
@keyframes cinStamp{0%{opacity:0;transform:translateX(-50%) scale(2.6) rotate(-14deg)}60%{opacity:1;transform:translateX(-50%) scale(.92) rotate(2deg)}80%{transform:translateX(-50%) scale(1.06) rotate(-1deg)}100%{opacity:1;transform:translateX(-50%) scale(1) rotate(0)}}
@keyframes cinHouseGlow{0%,100%{filter:drop-shadow(0 0 4px rgba(201,169,110,.5))}50%{filter:drop-shadow(0 0 12px rgba(201,169,110,.9))}}
@keyframes cinDoor{from{opacity:0;transform:scaleY(0)}to{opacity:.35;transform:scaleY(1)}}
@keyframes cinUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes cinReveal{0%{opacity:0;transform:translateY(12px) scale(.985)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes cinSweep{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes cinBorder{0%,100%{border-color:rgba(201,169,110,.16)}50%{border-color:rgba(201,169,110,.42)}}
@keyframes cinMoon{0%,100%{box-shadow:0 0 18px 4px rgba(201,169,110,.25)}50%{box-shadow:0 0 26px 8px rgba(201,169,110,.4)}}
@keyframes cinDust{0%{transform:translateY(0);opacity:0}15%{opacity:.5}85%{opacity:.5}100%{transform:translateY(-46px);opacity:0}}
@keyframes cinScan{from{transform:translateY(-100%)}to{transform:translateY(420%)}}

.cin-card{background:linear-gradient(180deg,#10152A,#0D1122);border:1px solid rgba(201,169,110,.16);border-radius:16px;overflow:hidden;
  box-shadow:0 24px 60px -20px rgba(0,0,0,.7);animation:cinBorder 3s ease-in-out infinite,cinReveal .6s cubic-bezier(.22,1,.36,1)}
.cin-head{padding:14px 18px 0;display:flex;align-items:center;gap:9px}
.cin-brandbox{width:30px;height:30px;border-radius:8px;background:rgba(201,169,110,.12);border:1px solid rgba(201,169,110,.3);display:flex;align-items:center;justify-content:center;color:#C9A96E;font-weight:800;font-size:9.5px;flex-shrink:0}
.cin-brandtxt{display:flex;flex-direction:column;flex:1;min-width:0}
.cin-brandtxt b{font-size:12.5px;font-weight:800;color:#F5F3EF;letter-spacing:.4px}
.cin-brandtxt span{font-size:8.5px;color:#C9A96E;letter-spacing:2.4px;text-transform:uppercase}
.cin-live{font-size:9px;color:#5B6486;letter-spacing:1.6px;border:1px solid rgba(201,169,110,.16);padding:4px 9px;border-radius:12px}

.cin-scene{position:relative;height:190px;overflow:hidden;margin-top:14px;border-top:1px solid rgba(201,169,110,.16);border-bottom:1px solid rgba(201,169,110,.16);
  background:linear-gradient(180deg,#060912 0%,#0B1226 46%,#131A33 68%,#0E1326 100%)}
.cin-star{position:absolute;border-radius:50%;background:#DDE3F2;animation:cinTwinkle 3s ease-in-out infinite}
.cin-shoot{position:absolute;right:6%;top:12%;width:46px;height:1.5px;background:linear-gradient(90deg,transparent,#F5F3EF);border-radius:2px;animation:cinShoot 7s ease-in 2s infinite}
.cin-moon{position:absolute;right:26px;top:16px;width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#F0E6D2,#C9A96E);animation:cinMoon 4s ease-in-out infinite}
.cin-sky{position:absolute;left:0;width:200%;display:flex}
.cin-sky.far{bottom:58px;height:60px;opacity:.5;animation:cinDrift 26s linear infinite}
.cin-sky.near{bottom:46px;height:74px;animation:cinDrift 14s linear infinite}
.cin-road{position:absolute;bottom:0;left:0;right:0;height:46px;background:linear-gradient(180deg,#10152A,#0A0E1D)}
.cin-road-top{position:absolute;top:0;left:0;right:0;height:2px;background:#232C4E}
.cin-lane{position:absolute;top:21px;left:0;right:0;height:3px;opacity:.5;
  background-image:linear-gradient(90deg,rgba(201,169,110,.55) 0 26px,transparent 26px 64px);background-size:64px 3px;animation:cinLane .7s linear infinite}
.cin-progress{position:absolute;top:0;left:0;height:2px;background:linear-gradient(90deg,transparent,#C9A96E);box-shadow:0 0 10px 1px rgba(201,169,110,.6);transition:width 2.2s cubic-bezier(.65,0,.35,1)}
.cin-house{position:absolute;bottom:42px;left:calc(93% - 16px)}
.cin-doorlight{position:absolute;bottom:-7px;left:8px;width:18px;height:8px;background:radial-gradient(ellipse at top,rgba(201,169,110,.6),transparent 70%);transform-origin:top;animation:cinDoor .8s ease forwards}
.cin-package{position:absolute;bottom:-2px;left:-13px;font-size:13px;animation:cinUp .6s cubic-bezier(.34,1.56,.64,1) forwards}
.cin-truckwrap{position:absolute;bottom:30px;transition:left 2.2s cubic-bezier(.65,0,.35,1)}
.cin-headlight{position:absolute;left:52px;top:12px;width:58px;height:20px;background:linear-gradient(90deg,rgba(232,213,174,.35),transparent 85%);
  clip-path:polygon(0 40%,100% 0,100% 100%,0 62%);animation:cinFlicker 1.4s ease-in-out infinite}
.cin-trucksvg{display:block;animation:cinBounce .5s ease-in-out infinite;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))}
.cin-wheel{animation:cinWheel .45s linear infinite}
.cin-puff{position:absolute;left:-3px;top:18px;width:5px;height:5px;border-radius:50%;background:#4A5478;animation:cinPuff 1s ease-out infinite}
.cin-fw{position:absolute;width:4px;height:4px;border-radius:50%;animation:cinFw 1.2s ease-out forwards}
.cin-stamp{position:absolute;top:26%;left:50%;animation:cinStamp .7s cubic-bezier(.22,1.4,.36,1) forwards;border:3px solid #C9A96E;color:#C9A96E;font-weight:900;
  font-size:21px;letter-spacing:5px;padding:7px 22px;border-radius:6px;background:rgba(8,11,20,.55);backdrop-filter:blur(2px);
  text-shadow:0 0 18px rgba(201,169,110,.6);box-shadow:0 0 30px -4px rgba(201,169,110,.45),inset 0 0 18px rgba(201,169,110,.12)}
.cin-dust{position:absolute;bottom:50px;width:2.5px;height:2.5px;border-radius:50%;background:#C9A96E;animation:cinDust 4s ease-in-out infinite}
.cin-scan{position:absolute;left:0;right:0;top:0;height:34%;background:linear-gradient(180deg,rgba(245,243,239,.03),transparent);animation:cinScan 8s linear infinite;pointer-events:none}
.cin-vignette{position:absolute;inset:0;box-shadow:inset 0 0 60px 18px rgba(4,6,12,.8);pointer-events:none}

.cin-stages{position:relative;height:16px;margin:10px 18px 0}
.cin-stage{position:absolute;font-size:8.5px;letter-spacing:.5px;text-transform:uppercase;color:#4A5478;font-weight:500;white-space:nowrap;transition:color .5s ease}
.cin-stage.on{color:#C9A96E}
.cin-stage.now{font-weight:800}

.cin-statusrow{padding:14px 18px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.cin-carrier{background:rgba(201,169,110,.12);border:1px solid rgba(201,169,110,.3);color:#C9A96E;font-weight:800;font-size:10.5px;padding:7px 10px;border-radius:7px;flex-shrink:0}
.cin-status{display:flex;flex-direction:column;min-width:0}
.cin-status-lbl{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#5B6486}
.cin-status b{font-size:15px;font-weight:800;color:#F5F3EF;margin-top:1px}
.cin-num{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#9AA1B4;letter-spacing:.04em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cin-link{font-size:11.5px;color:#9AA1B4;text-decoration:none;border:1px solid rgba(201,169,110,.16);padding:7px 11px;border-radius:8px;white-space:nowrap;flex-shrink:0}
.cin-link:hover{color:#C9A96E;border-color:rgba(201,169,110,.4)}

.cin-banner{margin:14px 18px;border-radius:10px;padding:12px 16px;text-align:center}
.cin-banner.eta{background:linear-gradient(180deg,#1B2138,#151A2D);border:1px solid rgba(201,169,110,.22)}
.cin-banner-lbl{display:block;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#5B6486}
.cin-banner-date{font-size:18px;font-weight:900;margin-top:2px;background-image:linear-gradient(90deg,#C9A96E 0%,#F0E6D2 50%,#C9A96E 100%);
  background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:cinSweep 3s linear infinite}
.cin-banner.delivered{background:linear-gradient(180deg,#182A22,#131F1A);border:1px solid rgba(76,175,109,.3)}
.cin-banner.delivered span{font-weight:800;font-size:14px;background-image:linear-gradient(90deg,#4CAF6D 0%,#F5F3EF 50%,#4CAF6D 100%);
  background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:cinSweep 2.6s linear infinite}
.cin-note{margin:0 18px 14px;font-size:11.5px;color:#9AA1B4}
`;
