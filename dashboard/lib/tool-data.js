// Pure, client+server safe helpers for the survey/mockup tools:
//  - hasData(): is there anything worth the customer approving?
//  - fingerprint(): a stable hash of the MEANINGFUL content, so any real change to the survey
//    or mockup voids a prior customer approval (they must re-approve).
// Cosmetic-only state (zoom/pan, theme, grid layout) is excluded so it doesn't trigger re-approval.

function parse(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}
// Deterministic stringify (sorted keys) so the hash is stable regardless of key order.
function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
}
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) ^ str.charCodeAt(i); h |= 0; }
  return (h >>> 0).toString(36);
}

// ---- Site survey (localStorage key iottechs_sitesurvey_v2_<id>, tool "survey") --------------
function surveyMeaning(d) {
  if (!d || !Array.isArray(d.floors)) return null;
  return {
    title: d.surveyTitle || "",
    floors: d.floors.map(f => ({
      name: f?.name || "",
      markers: (f?.markers || []).map(m => ({ k: m.kind, x: Math.round(m.x || 0), y: Math.round(m.y || 0), n: m.name || "", io: m.mode || "", r: m.rot || 0 })),
      img: f?.B?.img || f?.B?.imgSource || null,
      sat: f?.B?.sat || null,
      rooms: (f?.B?.rooms || []).length,
      strokes: (f?.B?.strokes || []).length,
      notes: f?.B?.notes || [],
    })),
  };
}
export function surveyHasData(raw) {
  const m = surveyMeaning(parse(raw));
  if (!m) return false;
  return m.floors.length > 1 ||
    m.floors.some(f => f.markers.length > 0 || f.img || f.sat || f.rooms > 0 || f.strokes > 0 || (f.notes && f.notes.length > 0));
}

// ---- Camera mockup (localStorage key iot_cctv_<id>, tool "mockup") --------------------------
function mockupMeaning(d) {
  if (!d) return null;
  return { count: d.count || 0, photos: (d.photos || []).map(p => (p ? 1 : 0)), names: d.names || {}, frame: d.frame || null };
}
export function mockupHasData(raw) {
  const m = mockupMeaning(parse(raw));
  if (!m) return false;
  return m.photos.some(p => p) || (m.names && Object.keys(m.names).length > 0);
}

export function toolHasData(tool, raw) {
  if (tool === "survey" || tool === "site_survey") return surveyHasData(raw);
  if (tool === "mockup") return mockupHasData(raw);
  return !!parse(raw);
}
export function toolFingerprint(tool, raw) {
  const d = parse(raw);
  if (d == null) return null;
  const meaning = (tool === "survey" || tool === "site_survey") ? surveyMeaning(d) : tool === "mockup" ? mockupMeaning(d) : d;
  if (!meaning) return null;
  return hash(stable(meaning));
}
