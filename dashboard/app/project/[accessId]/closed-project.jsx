"use client";

import { useState, useEffect, useTransition } from "react";
import WarpScreen from "../../components/warp-screen";
import { requestProjectReopenAction } from "./actions";

// A customer opening a closed/lost project link — they "missed the train". Same black-hole warp,
// then the offer to reopen. Reopening files a ticket for the office (no reasons shown, no silent
// un-closing); staff reopen from there.
export default function ClosedProject({ accessId }) {
  const [pending, startTx] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [home, setHome] = useState("/");   // logged-in viewers head to their dashboard, not marketing home

  useEffect(() => {
    let live = true;
    fetch("/api/me").then((r) => r.json()).then((d) => { if (live && d?.user?.home) setHome(d.user.home); }).catch(() => {});
    return () => { live = false; };
  }, []);

  function reopen() {
    setErr("");
    startTx(async () => {
      const r = await requestProjectReopenAction(accessId);
      if (r?.error) setErr(r.error); else setDone(true);
    });
  }

  return (
    <WarpScreen
      eyebrow="Oops"
      title="You've missed your train."
      subtitle={done ? "Reopen request sent — our team will be in touch to get you moving again." : "This project is closed. Would you like to reopen it?"}
    >
      {done ? (
        <a href={home} className="warp-btn ghost">Back to my dashboard</a>
      ) : (
        <>
          <button className="warp-btn" onClick={reopen} disabled={pending}>{pending ? "Sending…" : "Reopen this project"}</button>
          {err && <div className="warp-note" style={{ color: "#f2a3a3" }}>{err}</div>}
          <a href={home} className="warp-btn ghost">Not now</a>
        </>
      )}
    </WarpScreen>
  );
}
