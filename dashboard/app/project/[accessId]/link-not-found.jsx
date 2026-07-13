"use client";

import { useEffect, useState } from "react";
import WarpScreen from "../../components/warp-screen";

// Invalid / missing project link — you fell through a wormhole. No reasons, no forms; the
// black-hole warp plays, then "wrong dimension / no project here", and after 10s it slingshots
// you home on its own.
export default function LinkNotFound() {
  const [count, setCount] = useState(10);

  useEffect(() => {
    const tick = setInterval(() => setCount((c) => (c > 0 ? c - 1 : 0)), 1000);
    const go = setTimeout(() => { window.location.href = "/"; }, 10000);
    return () => { clearInterval(tick); clearTimeout(go); };
  }, []);

  return (
    <WarpScreen
      eyebrow="Whoops"
      title="You've been transported to the wrong dimension."
      subtitle="There's no project here."
    >
      <a href="/" className="warp-btn">Take me home</a>
      <div className="warp-note">Slingshotting you home in {count}s…</div>
    </WarpScreen>
  );
}
