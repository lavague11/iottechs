"use client";
import { useState } from "react";
import { requestAppointmentChangeAction, confirmAppointmentAction } from "../actions";
import { Wordmark, BrandLink } from "../../components/brand";

function whenStr(ev) {
  if (!ev?.date) return "";
  try {
    const d = new Date(`${ev.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const [h, m] = String(ev.time || "").split(":").map(Number);
    if (Number.isNaN(h)) return d;
    const t = new Date(2000, 0, 1, h, m || 0).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${d} · ${t}`;
  } catch { return ev.date; }
}

export default function ApptClient({ token, event, invalid, mode = "change", who = "" }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);   // "reschedule" | "cancel" | "confirm" while submitting
  const [done, setDone] = useState(null);    // { action }
  const [err, setErr] = useState("");

  async function submit(kind) {
    if (busy) return;
    setBusy(kind); setErr("");
    try {
      const r = await requestAppointmentChangeAction(token, kind, note);
      if (r?.ok) setDone({ action: r.action });
      else setErr(r?.error || "Something went wrong. Please try again.");
    } catch { setErr("Something went wrong. Please try again."); }
    setBusy(null);
  }
  async function confirm() {
    if (busy) return;
    setBusy("confirm"); setErr("");
    try {
      const r = await confirmAppointmentAction(token);
      if (r?.ok) setDone({ action: "confirm" });
      else setErr(r?.error || "Something went wrong. Please try again.");
    } catch { setErr("Something went wrong. Please try again."); }
    setBusy(null);
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.head}><BrandLink style={{ color: "#C9A96E" }}><Wordmark height={18} twoTone={false} /></BrandLink></div>
        <div style={S.accent} />
        <div style={S.body}>
          {invalid ? (
            <>
              <h1 style={S.h1}>Link expired</h1>
              <p style={S.p}>This link is invalid or has expired. Please reply to your appointment email and we'll help you directly.</p>
            </>
          ) : done ? (
            <>
              <h1 style={S.h1}>{done.action === "confirm" ? "You're confirmed" : "Request received"}</h1>
              <p style={S.p}>{done.action === "confirm"
                ? "Thanks for confirming — we've got you down and we'll see you then. Add it to your calendar from your invite so you don't miss it."
                : done.action === "cancel"
                ? "Thanks — we've let the team know you'd like to cancel. We'll be in touch to confirm."
                : "Thanks — we've let the team know you'd like a new time. We'll reach out shortly to reschedule."}</p>
            </>
          ) : mode === "confirm" ? (
            <>
              <h1 style={S.h1}>Confirm your appointment</h1>
              {event && (
                <div style={S.appt}>
                  <div style={S.apptTitle}>{event.title || "Your appointment"}</div>
                  {whenStr(event) && <div style={S.apptWhen}>{whenStr(event)}</div>}
                </div>
              )}
              {event?.confirmed
                ? <p style={S.p}>{who ? `${who}, you've` : "You've"} already confirmed this appointment — you're all set. See you then.</p>
                : <p style={S.p}>{who ? `${who}, let` : "Let"} us know <b>you'll</b> be there so we can lock in your slot. This confirms <b>your</b> attendance only.</p>}
              {err && <div style={S.err}>{err}</div>}
              <div style={S.btns}>
                <button style={{ ...S.btn, ...S.btnDark, ...(busy ? S.btnBusy : {}) }} disabled={!!busy} onClick={confirm}>
                  {busy === "confirm" ? "Confirming…" : event?.confirmed ? "Confirm again" : "Yes, I'll be there"}
                </button>
                <button style={{ ...S.btn, ...S.btnGhost, ...(busy ? S.btnBusy : {}) }} disabled={!!busy} onClick={() => submit("reschedule")}>
                  {busy === "reschedule" ? "Sending…" : "Reschedule instead"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 style={S.h1}>Manage your appointment</h1>
              {event && (
                <div style={S.appt}>
                  <div style={S.apptTitle}>{event.title || "Your appointment"}</div>
                  {whenStr(event) && <div style={S.apptWhen}>{whenStr(event)}</div>}
                </div>
              )}
              <p style={S.p}>Need a different time or can't make it? Let us know and the team will follow up — no changes happen automatically.</p>
              <label style={S.label}>Add a note (optional)</label>
              <textarea style={S.ta} rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. mornings work better, or a preferred day" />
              {err && <div style={S.err}>{err}</div>}
              <div style={S.btns}>
                <button style={{ ...S.btn, ...S.btnGold, ...(busy ? S.btnBusy : {}) }} disabled={!!busy} onClick={() => submit("reschedule")}>
                  {busy === "reschedule" ? "Sending…" : "Request to reschedule"}
                </button>
                <button style={{ ...S.btn, ...S.btnGhost, ...(busy ? S.btnBusy : {}) }} disabled={!!busy} onClick={() => submit("cancel")}>
                  {busy === "cancel" ? "Sending…" : "Request to cancel"}
                </button>
              </div>
            </>
          )}
        </div>
        <div style={S.foot}>IOT TECHS · Make tomorrow safer today.</div>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: "100vh", background: "#f4f5f7", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 14px", fontFamily: "var(--font-sans, 'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif)" },
  card: { width: "100%", maxWidth: 460, background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #e6e8ec", boxShadow: "0 10px 40px rgba(11,15,26,.08)" },
  head: { background: "#0B0F1A", padding: "20px 28px" },
  brand: { fontSize: 16, fontWeight: 700, letterSpacing: ".14em", color: "#C9A96E" },
  accent: { height: 4, background: "#C9A96E" },
  body: { padding: "26px 28px 22px" },
  h1: { margin: "0 0 12px", fontSize: 21, lineHeight: 1.3, color: "#0B0F1A", fontWeight: 800 },
  p: { margin: "0 0 18px", fontSize: 15, lineHeight: 1.55, color: "#5a6270" },
  appt: { border: "1px solid #e6e8ec", borderRadius: 12, background: "#fafbfc", padding: "14px 16px", margin: "0 0 18px" },
  apptTitle: { fontSize: 15.5, fontWeight: 700, color: "#0B0F1A" },
  apptWhen: { fontSize: 14, color: "#5a6270", marginTop: 4 },
  label: { display: "block", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "#9aa0ac", marginBottom: 6 },
  ta: { width: "100%", boxSizing: "border-box", border: "1px solid #d6d9df", borderRadius: 9, padding: "10px 12px", fontSize: 14.5, fontFamily: "inherit", color: "#2a2f3a", outline: "none", resize: "vertical" },
  err: { marginTop: 12, fontSize: 13.5, color: "#C0392B", fontWeight: 600 },
  btns: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 },
  btn: { flex: "1 1 auto", padding: "12px 18px", borderRadius: 9, fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid transparent" },
  btnGold: { background: "#C9A96E", color: "#0B0F1A", borderColor: "#C9A96E" },
  btnDark: { background: "#0B0F1A", color: "#F0E7D4", borderColor: "#0B0F1A" },
  btnGhost: { background: "#fff", color: "#5a6270", borderColor: "#d6d9df" },
  btnBusy: { opacity: .6, cursor: "default" },
  foot: { padding: "16px 28px", background: "#fafbfc", borderTop: "1px solid #eef0f3", fontSize: 12, color: "#9aa0ac" },
};
