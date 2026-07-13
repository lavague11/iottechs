"use client";

import { useEffect, useRef, useState } from "react";
import WarpScreen from "../../components/warp-screen";

// Invalid / missing project link — you fell through a wormhole. The black-hole warp plays, then
// 'wrong dimension / no project here', a big animated 5-4-3-2-1, and it slingshots you out —
// to YOUR dashboard if you're logged in, otherwise the marketing home.
export default function LinkNotFound() {
  const [count, setCount] = useState(5);
  const [dest, setDest] = useState("/");
  const [loggedIn, setLoggedIn] = useState(false);
  const destRef = useRef("/");

  // Where "out" goes: a logged-in user drops into their own dashboard; a guest goes home.
  useEffect(() => {
    let live = true;
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (live && d?.user?.home) { destRef.current = d.user.home; setDest(d.user.home); setLoggedIn(true); }
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Kick the countdown off once the warp lands (WarpScreen onArrive), so the 5 animates in the void.
  function startCountdown() {
    const id = setInterval(() => {
      setCount((c) => {
        if (c <= 1) { clearInterval(id); window.location.href = destRef.current; return 0; }
        return c - 1;
      });
    }, 1000);
  }

  return (
    <WarpScreen
      eyebrow="Whoops"
      title="You've been transported to the wrong dimension."
      subtitle="There's no project here."
      onArrive={startCountdown}
    >
      <div className="warp-countdown" key={count}>{count}</div>
      <a href={dest} className="warp-btn">{loggedIn ? "Go to my dashboard" : "Take me home"}</a>
      <div className="warp-note">{loggedIn ? "Beaming you to your dashboard" : "Slingshotting you home"} in {count}s…</div>
      <style>{`
        .warp-countdown{font-size:5.2rem;font-weight:800;line-height:1;margin-bottom:4px;
          background:linear-gradient(180deg,#fff,#C9A96E);-webkit-background-clip:text;background-clip:text;color:transparent;
          animation:wcPop .8s cubic-bezier(.2,1.5,.3,1)}
        @keyframes wcPop{0%{opacity:0;transform:scale(.35)}55%{opacity:1;transform:scale(1.18)}100%{transform:scale(1)}}
      `}</style>
    </WarpScreen>
  );
}
