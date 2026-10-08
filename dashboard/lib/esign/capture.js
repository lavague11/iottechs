// Validation of what the signer captures. The client is never trusted: every value is re-checked here
// before it is stored, and again when the PDF is flattened.
import { PROPOSAL_ACKS } from "../proposal-terms.js";

export const MAX_SIG_BYTES = 200 * 1024;          // decoded PNG
export const MAX_SIG_PIXELS = { w: 2000, h: 1000 };
export const SIG_METHODS = ["draw", "type", "upload"];
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// "data:image/png;base64,…" → { ok, bytes, width, height } | { ok:false, error }. Checks the real PNG
// signature + IHDR (not just the prefix) and caps size and dimensions.
export function parsePngDataUrl(s) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(s || ""));
  if (!m) return { ok: false, error: "Signature must be a PNG image." };
  if (m[1].length > Math.ceil(MAX_SIG_BYTES * 4 / 3) + 8) return { ok: false, error: "Signature image is too large." };
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > MAX_SIG_BYTES) return { ok: false, error: "Signature image is too large." };
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_MAGIC) || bytes.toString("latin1", 12, 16) !== "IHDR") return { ok: false, error: "Signature image is not a valid PNG." };
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > MAX_SIG_PIXELS.w || height > MAX_SIG_PIXELS.h) return { ok: false, error: "Signature image has unsupported dimensions." };
  return { ok: true, bytes, width, height };
}

const titleCase = (s) => String(s || "").replace(/(^|[\s'\-.])([a-z])/g, (_, p, c) => p + c.toUpperCase());
export function cleanName(s) {
  const n = titleCase(String(s || "").replace(/\s+/g, " ").trim()).slice(0, 120);
  return n.length >= 2 ? n : null;
}

// The acknowledgments this proposal needs initialed (the PCP one only when a credit is on it). Same
// rule the on-screen flow used, so the consent step never asks for more or less than before.
export function requiredAcks(payload) {
  const pcp = +(payload?.pcp_credit || 0) > 0;
  return PROPOSAL_ACKS.filter((a) => !a.pcpOnly || pcp);
}

// Merge a client patch into the stored values, validating each part. Returns { values } or { error }.
export function mergeValues(prev, patch, now = new Date()) {
  const out = { ...(prev || {}) };
  if (patch?.name !== undefined) {
    const n = cleanName(patch.name);
    if (!n) return { error: "Enter your full name." };
    out.name = n;
  }
  if (patch?.signature !== undefined) {
    const sg = patch.signature;
    if (!sg || !SIG_METHODS.includes(sg.method)) return { error: "Unknown signature method." };
    const png = parsePngDataUrl(sg.data);
    if (!png.ok) return { error: png.error };
    out.signature = { method: sg.method, data: sg.data, width: png.width, height: png.height };
    out.adoptedAt = now.toISOString();
  }
  if (patch?.acks !== undefined) {
    if (!patch.acks || typeof patch.acks !== "object" || Array.isArray(patch.acks)) return { error: "Bad acknowledgments." };
    const clean = {};
    for (const a of PROPOSAL_ACKS) clean[a.key] = !!patch.acks[a.key];
    out.acks = clean;
  }
  return { values: out };
}

// What's still missing before the document can be completed. Name + signature fill the three fields
// (the date is stamped by the server at completion); the required acknowledgments must all be checked.
export function missingRequired(values, payload) {
  const miss = [];
  if (!values?.name) miss.push("name");
  if (!values?.signature?.data) miss.push("signature");
  for (const a of requiredAcks(payload)) if (a.required && !values?.acks?.[a.key]) miss.push(`ack:${a.key}`);
  return miss;
}
