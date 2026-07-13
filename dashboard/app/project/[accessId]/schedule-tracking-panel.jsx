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
// Fallback ONLY for shipments that never got a live carrier lookup — the staff dropdown always
// writes one of the exact SHIP_STAGES strings, so this narrow regex match is safe there.
function deriveStage(status) {
  const s = (status || "").toLowerCase();
  if (/delivered/.test(s)) return 4;
  if (/out for delivery/.test(s)) return 3;
  if (/transit/.test(s)) return 2;
  if (/picked up/.test(s)) return 1;
  return 0;
}
// The authoritative stage (0-4) comes straight from the carrier's raw tag (see lib/tracking.js
// tagToStage) and is far more reliable than re-guessing from the humanized status text — e.g. an
// AfterShip "AttemptFail" tag becomes the display text "Delivery Attempted", which doesn't match
// any of deriveStage's patterns and would silently reset the truck to the start of the road.
function stageOf(s) { return typeof s?.stage === "number" ? s.stage : deriveStage(s?.status); }
// deterministic pseudo-random so the stars don't reshuffle every render
function seeded(i, salt) { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); }
const fmtEta = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); } catch { return d; } };
// Checkpoint timestamps come back as ISO strings — show a compact "Jul 3, 2:14 PM".
const fmtScan = (t) => { if (!t) return ""; try { return new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
// One live carrier lookup per number per day — a shipment stamped with a lastFetch inside 24h is
// considered current and never re-hits the API on a page load.
const DAY_MS = 24 * 60 * 60 * 1000;
const fetchedToday = (s) => !!s?.lastFetch && (Date.now() - s.lastFetch) < DAY_MS;
const fmtAgo = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

// ---- The night-drive scene ---------------------------------------------------------------
function CinematicTracking({ tracking }) {
  const stage = stageOf(tracking);
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
export default function ShipmentTracking({ accessId, role, preview, proposal }) {
  const isStaff = ["admin", "manager"].includes(role);
  // Shipments — a project's equipment usually arrives in several boxes. Record shape:
  // { shipments: [{number, carrier, status, eta, note}, …] } (legacy single-object records
  // are normalized into a one-element list on load).
  const [shipments, setShipments] = useState([]);
  const [active, setActive] = useState(0);          // which package the scene shows
  const [quick, setQuick] = useState("");           // paste-and-go input, always visible top-right
  const [rowEdit, setRowEdit] = useState({});       // per-row in-progress tracking-number edits {i: text}
  const [confirmRemove, setConfirmRemove] = useState(null); // index of the row pending remove confirm
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState({});             // { number: liveRecord } from the carrier API
  const [liveState, setLiveState] = useState({});   // { number: "loading"|"ok"|"nokey"|"stale"|"pending" }

  useEffect(() => {
    let live = true;
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

  const activeShip = shipments[Math.min(active, shipments.length - 1)] || null;
  const shipped = shipments.some((s) => stageOf(s) >= 1);
  const deliveredNow = shipments.length > 0 && shipments.every((s) => stageOf(s) === 4);
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
    if (await saveShipments([...shipments, ship])) { setQuick(""); setActive(shipments.length); }
  }
  // Save an edited tracking number — carrier is re-detected from the number's shape (no manual
  // carrier/status/date fields; the live lookup fills status + ETA automatically).
  async function saveRow(i, number) {
    const num = String(number || "").trim().replace(/\s+/g, "");
    if (!num || busy) return;
    const list = shipments.map((s, x) => {
      if (x !== i) return s;
      // A genuinely new number: clear the old package's cached snapshot so it re-fetches once.
      const reset = num !== s.number ? { status: "Order Placed", stage: 0, eta: "", lastLocation: "", lastFetch: null } : {};
      return { ...s, number: num, carrier: detectCarrier(num), ...reset };
    });
    if (await saveShipments(list)) setRowEdit((m) => { const n = { ...m }; delete n[i]; return n; });
  }
  async function removeShipment(i) {
    const list = shipments.filter((_, x) => x !== i);
    if (await saveShipments(list)) { setConfirmRemove(null); setActive(0); }
  }

  // Pull the REAL carrier status for a package. Updates the in-memory live record for display and,
  // for staff, persists the snapshot + a lastFetch stamp so no other page view re-hits the carrier
  // before tomorrow. `force` (a deliberate Refresh click) bypasses the 24h server cache.
  async function refreshLive(ship, persist, retried, force) {
    if (!ship?.number) return;
    setLiveState((s) => ({ ...s, [ship.number]: "loading" }));
    const r = await trackPackageAction(accessId, ship.number, ship.carrier, !!force);
    if (r?.ok) {
      setLive((l) => ({ ...l, [ship.number]: r }));
      setLiveState((s) => ({ ...s, [ship.number]: "ok" }));
      // Stamp lastFetch on every successful staff lookup (even if nothing changed) so the durable
      // "already checked today" guard below stops repeat lookups from every page refresh.
      if (persist && isStaff && !preview) {
        saveShipments(shipments.map((x) => (x.number === ship.number
          ? { ...x, status: r.status, stage: r.stage, eta: r.eta || x.eta, lastLocation: r.lastLocation || x.lastLocation, lastFetch: Date.now() }
          : x)));
      }
    } else if (r?.reason === "pending") {
      // Just registered with the carrier — data isn't ingested yet. Show "fetching" and retry once.
      setLiveState((s) => ({ ...s, [ship.number]: "pending" }));
      if (!retried) setTimeout(() => refreshLive(ship, persist, true, force), 6000);
    } else {
      // no_key / rate_limit / error — quietly fall back to the last known status (no banner).
      setLiveState((s) => ({ ...s, [ship.number]: r?.reason === "no_key" ? "nokey" : "stale" }));
    }
  }
  // Auto-fetch the on-screen package ONCE per day per number: skip entirely if we already have a
  // fetch stamped within 24h (durable, shared across every viewer of this project) — a page refresh
  // must never burn the tiny carrier-API quota.
  useEffect(() => {
    if (!activeShip?.number) return;
    if (liveState[activeShip.number] !== undefined) return;   // already tried this session
    if (fetchedToday(activeShip)) return;                     // checked within the last 24h
    refreshLive(activeShip, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShip?.number]);

  return (
    <div className="stp-root">
      <style>{STP_CSS}</style>
      {/* Tracking — only rendered once a real number exists (or for staff, who can add one) */}
      {showTracking && (<>
      {(shipments.length > 1 || (isStaff && !preview)) && (
        <div className="stp-track-topbar">
          {shipments.length > 1 && <span className="stp-pkgcount">{shipments.length} Packages</span>}
          {isStaff && !preview && (
            <div className="stp-quickadd">
              <input className="stp-quickadd-in" placeholder="Paste tracking #…" value={quick}
                     onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && quickAdd()} />
              <button type="button" className="stp-quickadd-btn" disabled={busy || !quick.trim()} onClick={quickAdd}>{busy ? "…" : "+ Add"}</button>
            </div>
          )}
        </div>
      )}
      <div className="stp-track">

        {/* Package chips — everyone can flip the scene between boxes */}
        {shipments.length > 1 && (
          <div className="stp-pkgs">
            {shipments.map((s, i) => {
              const st = stageOf(s);
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
          const shown = lv ? { ...activeShip, status: lv.status || activeShip.status, eta: lv.eta || activeShip.eta, stage: typeof lv.stage === "number" ? lv.stage : activeShip.stage } : activeShip;
          const st = liveState[activeShip.number];
          const ago = shown.lastFetch ? fmtAgo(Date.now() - shown.lastFetch) : "";
          const liveTxt = st === "loading" ? "Checking carrier…"
            : st === "pending" ? "Carrier is fetching this shipment — refresh in a moment"
            : st === "ok" ? (lv?.lastLocation ? `Live · last scan ${lv.lastLocation}` : "Live from carrier")
            : st === "nokey" ? "Showing the status set by our team"
            : shown.lastLocation ? `Last scan ${shown.lastLocation}${ago ? ` · ${ago}` : ""}`
            : ago ? `Checked ${ago}`
            : "Tracking";
          return (
            <>
              <div className="stp-liverow">
                <span className={`stp-livedot ${st || ""}`} />
                <span className="stp-livetxt">{liveTxt}</span>
                {isStaff && !preview && (
                  <button type="button" className="stp-mini" title="Check the carrier now (uses one lookup)"
                          onClick={() => refreshLive(activeShip, true, false, true)} disabled={st === "loading" || st === "pending"}>↻ Refresh</button>
                )}
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

        {/* Staff: one simple editable row per package — carrier badge (auto-detected) + the tracking
            number (editable) + Save + Remove. Status/ETA come automatically from the carrier. */}
        {isStaff && !preview && shipments.length > 0 && (
          <div className="stp-shiplist">
            {shipments.map((s, i) => {
              const draft = rowEdit[i] ?? s.number;
              const dirty = draft.trim().replace(/\s+/g, "") !== s.number;
              const carrier = detectCarrier(draft) === "Other" ? (s.carrier || "Pkg") : detectCarrier(draft);
              return (
                <div key={i} className="stp-shiprow">
                  <span className="stp-quick-carrier">{carrier}</span>
                  <input className="stp-input" value={draft}
                         onChange={(e) => setRowEdit((m) => ({ ...m, [i]: e.target.value }))}
                         onKeyDown={(e) => { if (e.key === "Enter" && dirty) saveRow(i, draft); }} />
                  <button type="button" className="stp-btn" disabled={busy || !draft.trim() || !dirty} onClick={() => saveRow(i, draft)}>Save</button>
                  {confirmRemove === i ? (
                    <>
                      <button type="button" className="stp-btn ghost danger" disabled={busy} onClick={() => removeShipment(i)}>Confirm</button>
                      <button type="button" className="stp-btn ghost" onClick={() => setConfirmRemove(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="stp-btn ghost danger" disabled={busy} onClick={() => setConfirmRemove(i)}>Remove</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      </>)}

      {/* Equipment receiving checklist — imported from the proposal. Shown to everyone (the customer
          gets a read-only view), so it lives outside the staff-only tracking gate. */}
      <ReceivingChecklist accessId={accessId} proposal={proposal} role={role} preview={preview} />
    </div>
  );
}

const STP_CSS = `
.stp-root{background:#FAF8F4;border:1px solid #d9d4ca;border-top:4px solid #C9A96E;border-radius:14px;padding:16px 16px 18px;
  font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif;box-shadow:0 10px 30px rgba(11,15,26,.06)}
.stp-track-topbar{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:8px}
.stp-pkgcount{margin-right:auto;font-size:.72rem;font-weight:800;letter-spacing:.03em;color:#8a93a8}
.stp-addmini{height:26px;padding:0 12px;border-radius:100px;border:1px solid #e2d3ad;background:#f8f0e0;color:#8a6d2f;font-size:.72rem;font-weight:800;letter-spacing:.03em;cursor:pointer;font-family:inherit}
.stp-addmini:hover{background:#C9A96E;border-color:#C9A96E;color:#0B0F1A}
@keyframes stpPulse{0%,100%{opacity:.2;transform:translateY(0)}45%{opacity:1;transform:translateY(-7px)}}
@keyframes stpNow{0%,100%{box-shadow:0 0 0 3px rgba(201,169,110,.2)}50%{box-shadow:0 0 0 6px rgba(201,169,110,.06)}}

.stp-track{background:#fff;border:1px solid #d9d4ca;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.stp-track-wait{display:flex;flex-direction:column;gap:5px}
.stp-track-ph{font-family:ui-monospace,Consolas,monospace;font-size:.9rem;color:#c2bcae;letter-spacing:.08em;animation:stpShimmer 2.2s ease-in-out infinite}
@keyframes stpShimmer{0%,100%{opacity:.45}50%{opacity:1}}
.stp-track-wait span{font-size:.8rem;color:#4a5270}
.stp-input{height:38px;border:1px solid #d9d4ca;border-radius:8px;background:#fff;color:#0B0F1A;padding:0 11px;font-size:.82rem;font-family:inherit;outline:none}
.stp-input:focus{border-color:#4b6a9b}
.stp-btn{height:38px;padding:0 18px;border:none;border-radius:9px;background:#4b6a9b;color:#fff;font-size:.8rem;font-weight:800;cursor:pointer;font-family:inherit}
.stp-btn:hover{filter:brightness(1.08)}
.stp-btn:disabled{opacity:.5;cursor:default}
.stp-btn.ghost{background:#fff;border:1px solid #d9d4ca;color:#0B0F1A}
.stp-btn.outline{background:#fff;border:1.5px dashed #4b6a9b;color:#3a4a72;align-self:flex-start}
.stp-btn.danger{color:#a8442f;border-color:#e0b0a8}
.stp-btn.danger:hover{background:#fbeceb}

.stp-quickadd{display:flex;gap:6px;align-items:center}
.stp-quickadd-in{height:30px;width:180px;border:1px solid #d9d4ca;border-radius:8px;background:#fff;color:#0B0F1A;padding:0 10px;font-size:.78rem;font-family:ui-monospace,Consolas,monospace;outline:none}
.stp-quickadd-in:focus{border-color:#4b6a9b}
.stp-quickadd-btn{height:30px;padding:0 13px;border:none;border-radius:8px;background:#4b6a9b;color:#fff;font-size:.76rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.stp-quickadd-btn:hover{filter:brightness(1.08)}
.stp-quickadd-btn:disabled{opacity:.5;cursor:default}
.stp-quick-carrier{flex-shrink:0;font-size:.64rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:#eef3fa;border:1px solid #ccd6e6;color:#3a4a72;border-radius:100px;padding:4px 10px}
.stp-pkgs{display:flex;gap:8px;flex-wrap:wrap}
.stp-pkg{display:flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:100px;border:1.5px solid #d9d4ca;background:#fff;color:#4a5270;font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit}
.stp-pkg:hover{border-color:#4b6a9b}
.stp-pkg.on{background:#0B0F1A;border-color:#0B0F1A;color:#fff}
.stp-pkg.done .stp-pkg-n{background:#2f7d5a;color:#fff}
.stp-pkg-n{width:18px;height:18px;border-radius:50%;background:#e6e1d6;color:#4a5270;display:flex;align-items:center;justify-content:center;font-size:.64rem;font-weight:800}
.stp-pkg.on .stp-pkg-n{background:#C9A96E;color:#0B0F1A}
.stp-shiplist{display:flex;flex-direction:column;gap:8px}
.stp-shiprow{display:flex;align-items:center;gap:8px;border:1px solid #ece8e0;border-radius:10px;padding:8px 10px;background:#fcfbf8}
.stp-shiprow .stp-input{flex:1;min-width:120px;height:34px;font-family:ui-monospace,Consolas,monospace;font-size:.78rem}
.stp-shiprow .stp-btn{height:34px;padding:0 14px;font-size:.76rem}
.stp-mini{height:28px;padding:0 12px;border-radius:100px;border:1px solid #d9d4ca;background:#fff;color:#4a5270;font-size:.7rem;font-weight:700;cursor:pointer;font-family:inherit}
.stp-mini:hover{border-color:#4b6a9b;color:#3a4a72}
.stp-liverow{display:flex;align-items:center;gap:9px}
.stp-livedot{width:9px;height:9px;border-radius:50%;background:#c2bcae;flex-shrink:0}
.stp-livedot.ok{background:#2f7d5a;box-shadow:0 0 0 3px rgba(47,125,90,.16);animation:stpNow 1.8s ease-in-out infinite}
.stp-livedot.loading,.stp-livedot.pending{background:#C9A96E;animation:stpPulse 1s ease-in-out infinite}
.stp-livedot.nokey{background:#c99a6e}
.stp-livedot.stale{background:#c2bcae}
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
