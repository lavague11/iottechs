// Maya — AI usage costing + spend-cap math. PURE (no DB, no network) so it unit-tests without the request
// stack; the DB layer (lib/db.js recordAiUsage / aiSpendTodayCents) and the call site (ai-actions.js
// interpret) use these. Rates are USD per MILLION tokens, by model family (substring match) — update here
// if Anthropic pricing changes. Cost is tracked in CENTS (float) so a $10/day cap is 1000.
export const MODEL_RATES = {
  haiku: { in: 1.0, out: 5.0 },
  sonnet: { in: 3.0, out: 15.0 },
  opus: { in: 15.0, out: 75.0 },
};
export function rateFor(model) {
  const m = String(model || "").toLowerCase();
  if (m.includes("opus")) return MODEL_RATES.opus;
  if (m.includes("sonnet")) return MODEL_RATES.sonnet;
  return MODEL_RATES.haiku; // default/fast
}
// Cost of one call in CENTS. inTok/outTok from the Anthropic response `usage`.
export function costCents(model, inTok = 0, outTok = 0) {
  const r = rateFor(model);
  const dollars = ((+inTok || 0) * r.in + (+outTok || 0) * r.out) / 1_000_000;
  return Math.round(dollars * 100 * 10000) / 10000; // cents, 4-dp (sub-cent calls are real)
}
// Spend-cap decisions. capCents = the daily cap (default 1000 = $10); alertPct = warn threshold (default 70).
export const DEFAULT_CAP_CENTS = 1000;
export const DEFAULT_ALERT_PCT = 70;
export const overCap = (spentCents, capCents = DEFAULT_CAP_CENTS) => (+capCents > 0) && (+spentCents >= +capCents);
export const alertCents = (capCents = DEFAULT_CAP_CENTS, pct = DEFAULT_ALERT_PCT) => (+capCents) * (+pct) / 100;
// True exactly when THIS call pushes today's spend across the alert line (so we warn once, on the crossing).
export function crossesAlert(spentBefore, callCost, capCents = DEFAULT_CAP_CENTS, pct = DEFAULT_ALERT_PCT) {
  const line = alertCents(capCents, pct);
  return (+spentBefore < line) && (+spentBefore + +callCost >= line);
}
export const dollars = (cents) => "$" + (Math.round((+cents || 0)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
