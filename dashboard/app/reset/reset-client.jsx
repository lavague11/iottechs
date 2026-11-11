"use client";
import { useState, useTransition } from "react";
import { completePasswordResetAction } from "./actions";

const pwStrong = (p) => p.length >= 6 && /[A-Z]/.test(p);

export default function ResetClient({ token, valid }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const [pending, startTx] = useTransition();

  function submit(e) {
    e.preventDefault(); setErr(null);
    if (!pwStrong(pw)) { setErr("Password needs 6+ characters and a capital letter."); return; }
    if (pw !== confirm) { setErr("Passwords don't match."); return; }
    startTx(async () => {
      const r = await completePasswordResetAction(token, pw, confirm).catch(() => ({ error: "Something went wrong — please try again." }));
      if (r?.error) { setErr(r.error); return; }
      setDone(true);
      setTimeout(() => { window.location.assign(r?.dest || "/"); }, 650);
    });
  }

  return (
    <div className="rst-bg">
      <div className="rst-card">
        <div className="rst-logo"><span className="rst-mark">🔒</span><div className="rst-brand">IOT&nbsp;TECHS</div><div className="rst-sub">Secure Access</div></div>

        {!valid ? (
          <div className="rst-mid">
            <div className="rst-h">Link expired</div>
            <p className="rst-p">This reset link is invalid or has expired. Reset links are good for 30 minutes and can be used once.</p>
            <a className="rst-btn" href="/forgot">Request a new link →</a>
            <a className="rst-alt" href="/login">Back to sign in</a>
          </div>
        ) : done ? (
          <div className="rst-mid">
            <div className="rst-h">Password updated ✓</div>
            <p className="rst-p">Signing you in…</p>
          </div>
        ) : (
          <form className="rst-form" onSubmit={submit}>
            <div className="rst-h">Set a new password</div>
            <label className="rst-lbl">New password</label>
            <div className="rst-pwwrap">
              <input className="rst-in" type={show ? "text" : "password"} value={pw} autoFocus autoComplete="new-password"
                placeholder="6+ characters, 1 capital" disabled={pending} onChange={(e) => setPw(e.target.value)} />
              <button type="button" className="rst-eye" onClick={() => setShow((s) => !s)} aria-label="Show password">{show ? "🙈" : "👁"}</button>
            </div>
            {pw && <div className={`rst-mini ${pwStrong(pw) ? "ok" : "no"}`}>{pwStrong(pw) ? "Looks good" : "Needs 6+ characters & a capital"}</div>}
            <label className="rst-lbl">Confirm password</label>
            <input className="rst-in" type={show ? "text" : "password"} value={confirm} autoComplete="new-password"
              placeholder="••••••••" disabled={pending} onChange={(e) => setConfirm(e.target.value)} />
            {confirm && <div className={`rst-mini ${pw === confirm ? "ok" : "no"}`}>{pw === confirm ? "Passwords match" : "No match"}</div>}
            {err && <div className="rst-err">{err}</div>}
            <button className="rst-btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Set password & sign in →"}</button>
            <a className="rst-alt" href="/login">Back to sign in</a>
          </form>
        )}
      </div>
      <style>{RST_CSS}</style>
    </div>
  );
}

const RST_CSS = `
.rst-bg{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(1200px 600px at 50% -10%,#121725,#0b0f1a 60%)}
.rst-card{width:100%;max-width:400px;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45);padding:30px 28px}
.rst-logo{text-align:center;margin-bottom:18px}
.rst-mark{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:#111826;font-size:20px}
.rst-brand{margin-top:12px;font-weight:800;letter-spacing:.14em;color:#0b0f1a}
.rst-sub{font-size:.68rem;letter-spacing:.22em;text-transform:uppercase;color:#C9A96E;margin-top:4px;font-weight:700}
.rst-mid{text-align:center;padding:6px 0}
.rst-form{display:flex;flex-direction:column}
.rst-h{font-size:1.05rem;font-weight:700;color:#0b0f1a;text-align:center;margin:8px 0 14px}
.rst-p{font-size:.88rem;color:#55607a;line-height:1.5;margin:0 0 18px}
.rst-lbl{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8a90a0;margin:10px 0 5px}
.rst-pwwrap{position:relative}
.rst-in{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #e4e6ec;border-radius:10px;font-size:.95rem;background:#fafbfc}
.rst-in:focus{outline:none;border-color:#C9A96E;background:#fff}
.rst-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:none;cursor:pointer;font-size:1rem;padding:4px}
.rst-mini{font-size:.76rem;margin:5px 0 0}
.rst-mini.ok{color:#2e7d5b}.rst-mini.no{color:#c0392b}
.rst-err{margin-top:12px;background:#fdeceb;border:1px solid #f5c6c2;color:#b23b3b;border-radius:9px;padding:9px 12px;font-size:.82rem;text-align:center}
.rst-btn{display:block;text-align:center;margin-top:18px;padding:13px 14px;border:0;border-radius:10px;background:#C9A96E;color:#1b1710;font-weight:700;font-size:.92rem;cursor:pointer;text-decoration:none}
.rst-btn:disabled{opacity:.6;cursor:default}
.rst-alt{display:block;text-align:center;margin-top:14px;color:#6b7280;font-size:.84rem;text-decoration:none}
.rst-alt:hover{color:#0b0f1a}
`;
