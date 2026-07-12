// Live package tracking via a pluggable carrier-aggregator API.
//
// Configure with environment variables (never commit these):
//   TRACKING_API_KEY   — your aggregator key (required for live data)
//   TRACKING_PROVIDER  — "aftership" (default) | "trackingmore"
//
// Returns a normalized record:
//   { ok:true, live:true, status, stage, eta, deliveredAt, lastLocation,
//     checkpoints:[{time, message, location}] }
// or, when no key is configured / the lookup fails:
//   { ok:false, reason }  →  the UI keeps showing the manually-entered status.
//
// One aggregator call covers every carrier (UPS/FedEx/USPS/…), so the office never
// touches a carrier website — paste the number, we fetch the real status + ETA + last scan.

const CARRIER_SLUG = { UPS: "ups", FedEx: "fedex", USPS: "usps", Amazon: "amazon" };
const SHIP_STAGES = ["Order Placed", "Picked Up", "In Transit", "Out for Delivery", "Delivered"];

// Guess the aggregator slug from the number shape when the carrier is unknown.
function detectSlug(num) {
  const n = String(num || "").toUpperCase().replace(/\s+/g, "");
  if (/^1Z[0-9A-Z]{10,16}$/.test(n)) return "ups";
  if (/^TBA[0-9]+$/.test(n)) return "amazon";
  if (/^\d{12}$/.test(n) || /^\d{15}$/.test(n)) return "fedex";
  if (/^9\d{15,25}$/.test(n)) return "usps";
  return null; // let the aggregator auto-detect
}

// Map an aggregator status tag → our 0–4 shipment stage + a clean human status label.
function tagToStage(tag) {
  const t = String(tag || "").toLowerCase();
  if (/deliver/.test(t)) return 4;
  if (/out.?for.?delivery/.test(t)) return 3;
  if (/transit/.test(t)) return 2;
  if (/pick|accepted|info.?received/.test(t)) return 1;
  return 0;
}

// The free AfterShip tier is only 100 lookups/day, and each refresh is 2 calls (register + get).
// Cache results server-side (per number) so repeat views don't hit the API, and remember which
// numbers are already registered so we skip the register POST after the first time. Kept on
// globalThis so it survives Next HMR / route re-eval.
const g = globalThis;
g.__trkCache = g.__trkCache || new Map();        // num -> { at, ttl, result }
g.__trkRegistered = g.__trkRegistered || new Set();
const TRK_TTL_OK = 15 * 60 * 1000;   // fresh live result — 15 min
const TRK_TTL_LIMIT = 60 * 60 * 1000; // rate-limited — back off an hour before trying again
const TRK_TTL_PENDING = 60 * 1000;    // registered but not ingested — retry in a minute
const TRK_TTL_ERR = 5 * 60 * 1000;

export async function fetchTracking(number, carrier) {
  const key = process.env.TRACKING_API_KEY;
  const provider = (process.env.TRACKING_PROVIDER || "aftership").toLowerCase();
  const num = String(number || "").trim().replace(/\s+/g, "");
  if (!num) return { ok: false, reason: "no_number" };
  if (!key) return { ok: false, reason: "no_key" };
  const cached = g.__trkCache.get(num);
  if (cached && (Date.now() - cached.at) < cached.ttl) return { ...cached.result, cached: true };
  let result;
  try {
    result = provider === "trackingmore" ? await viaTrackingMore(num, carrier, key) : await viaAftership(num, carrier, key);
  } catch (e) {
    result = { ok: false, reason: "error", detail: String(e?.message || e) };
  }
  const ttl = result.ok ? TRK_TTL_OK
    : result.reason === "rate_limit" ? TRK_TTL_LIMIT
    : result.reason === "pending" ? TRK_TTL_PENDING
    : TRK_TTL_ERR;
  g.__trkCache.set(num, { at: Date.now(), ttl, result });
  return result;
}

// ---- AfterShip ----
// New keys (prefixed "asat_") use the versioned Tracking API with the "as-api-key" header and a
// flat request body; older keys use the legacy /v4 API with "aftership-api-key". We route by prefix.
const AFTERSHIP_VERSION = process.env.AFTERSHIP_VERSION || "2025-01";
async function viaAftership(num, carrier, key) {
  const slug = CARRIER_SLUG[carrier] || detectSlug(num);
  return key.startsWith("asat_") ? viaAftershipV2(num, slug, key) : viaAftershipV4(num, slug, key);
}
// Current AfterShip Tracking API (asat_ keys).
async function viaAftershipV2(num, slug, key) {
  const base = `https://api.aftership.com/tracking/${AFTERSHIP_VERSION}`;
  const headers = { "as-api-key": key, "Content-Type": "application/json" };
  // Register the number once (flat body). Skip if we've already registered it this process —
  // saves half the daily quota. Already-exists is fine and ignored.
  if (!g.__trkRegistered.has(num)) {
    const reg = await fetch(`${base}/trackings`, {
      method: "POST", headers,
      body: JSON.stringify(slug ? { tracking_number: num, slug } : { tracking_number: num }),
    }).catch(() => null);
    if (reg && reg.status === 429) return { ok: false, reason: "rate_limit" };
    if (reg && (reg.ok || reg.status === 409)) g.__trkRegistered.add(num); // 409 = already exists
  }
  const r = await fetch(`${base}/trackings?tracking_numbers=${encodeURIComponent(num)}`, { headers });
  if (r.status === 429) return { ok: false, reason: "rate_limit" };
  if (!r.ok) return { ok: false, reason: `http_${r.status}` };
  const j = await r.json().catch(() => null);
  const t = (j?.data?.trackings || [])[0];
  // Registered but the carrier data hasn't been ingested yet — caller can refresh shortly.
  if (!t || t.tag === "Pending" && !(t.checkpoints || []).length) return { ok: false, reason: "pending" };
  return normalizeAftership(t);
}
// Legacy AfterShip v4 API (older keys).
async function viaAftershipV4(num, slug, key) {
  const base = "https://api.aftership.com/v4";
  const headers = { "aftership-api-key": key, "Content-Type": "application/json" };
  await fetch(`${base}/trackings`, {
    method: "POST", headers,
    body: JSON.stringify({ tracking: slug ? { slug, tracking_number: num } : { tracking_number: num } }),
  }).catch(() => {});
  let t = null, lastStatus = 0;
  if (slug) {
    const r1 = await fetch(`${base}/trackings/${slug}/${encodeURIComponent(num)}`, { headers });
    lastStatus = r1.status;
    if (r1.ok) { const j1 = await r1.json().catch(() => null); t = j1?.data?.tracking || null; }
  }
  if (!t) {
    const r2 = await fetch(`${base}/trackings?tracking_numbers=${encodeURIComponent(num)}`, { headers });
    lastStatus = r2.status;
    if (r2.ok) { const j2 = await r2.json().catch(() => null); t = j2?.data?.trackings?.[0] || null; }
  }
  if (!t) return { ok: false, reason: lastStatus === 429 ? "rate_limit" : (lastStatus && lastStatus !== 200 ? `http_${lastStatus}` : "pending") };
  return normalizeAftership(t);
}
// Shared normalizer — both AfterShip API generations return the same tracking shape.
function normalizeAftership(t) {
  const cps = (t.checkpoints || []).map((c) => ({
    time: c.checkpoint_time || c.created_at || null,
    message: c.message || c.tag || "",
    location: [c.city, c.state, c.country_name || c.country_iso3].filter(Boolean).join(", "),
  }));
  const last = cps[cps.length - 1] || null;
  const stage = tagToStage(t.tag);
  return {
    ok: true, live: true,
    status: cleanStatus(t.tag, t.subtag_message) || SHIP_STAGES[stage],
    stage,
    eta: t.expected_delivery || null,
    deliveredAt: t.shipment_delivery_date || (stage === 4 ? last?.time : null) || null,
    lastLocation: last?.location || "",
    checkpoints: cps,
  };
}

// ---- TrackingMore v3 (https://www.trackingmore.com/docs) ----
async function viaTrackingMore(num, carrier, key) {
  const slug = CARRIER_SLUG[carrier] || detectSlug(num);
  const base = "https://api.trackingmore.com/v3/trackings";
  const headers = { "Tracking-Api-Key": key, "Content-Type": "application/json" };
  await fetch(`${base}/create`, {
    method: "POST", headers,
    body: JSON.stringify({ tracking_number: num, courier_code: slug || undefined }),
  }).catch(() => {});
  const res = await fetch(`${base}/get?tracking_numbers=${encodeURIComponent(num)}${slug ? `&courier_code=${slug}` : ""}`, { headers });
  if (res.status === 429) return { ok: false, reason: "rate_limit" };
  if (!res.ok) return { ok: false, reason: `http_${res.status}` };
  const j = await res.json();
  const t = j?.data?.[0];
  if (!t) return { ok: false, reason: "no_data" };
  const info = t.origin_info || t.destination_info || {};
  const cps = (info.trackinfo || []).map((c) => ({
    time: c.checkpoint_date || null, message: c.tracking_detail || c.checkpoint_delivery_status || "", location: c.location || "",
  })).reverse();
  const last = cps[cps.length - 1] || null;
  const stage = tagToStage(t.delivery_status);
  return {
    ok: true, live: true,
    status: cleanStatus(t.delivery_status) || SHIP_STAGES[stage],
    stage,
    eta: t.scheduled_delivery_date || t.expected_delivery || null,
    deliveredAt: stage === 4 ? (last?.time || null) : null,
    lastLocation: last?.location || "",
    checkpoints: cps,
  };
}

function cleanStatus(tag, sub) {
  const map = {
    Delivered: "Delivered", OutForDelivery: "Out for Delivery", InTransit: "In Transit",
    InfoReceived: "Order Placed", Pending: "Order Placed", AttemptFail: "Delivery Attempted",
    Exception: "Exception", Expired: "Expired", delivered: "Delivered", transit: "In Transit",
    pickup: "Out for Delivery", notfound: "Order Placed",
  };
  return map[tag] || sub || (tag ? String(tag) : "");
}
