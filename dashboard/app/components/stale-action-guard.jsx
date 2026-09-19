"use client";
import { useEffect } from "react";

// Next.js Server Actions carry a BUILD-SPECIFIC id. After a redeploy, a tab still running the previous
// client bundle POSTs a stale action id → the new server can't find it and returns
// "Failed to find Server Action …" (the POST to the route 404s). The only real recovery is to load the
// fresh bundle, so when we see exactly that error we reload ONCE (guarded, so we never loop) to sync the
// client with the new deploy. In-progress tool work autosaves to localStorage, so the reload is seamless.
const RE = /(failed to find server action|server action .* was not found|failed-to-find-server-action)/i;

export default function StaleActionGuard() {
  useEffect(() => {
    let done = false;
    const isStale = (m) => typeof m === "string" && RE.test(m);
    function recover() {
      if (done) return; done = true;
      try {
        const k = "iot_stale_reload_at", now = Date.now();
        if (now - (+(sessionStorage.getItem(k) || 0)) < 60000) return;   // already reloaded recently → don't loop
        sessionStorage.setItem(k, String(now));
      } catch { /* private mode → still reload once via `done` guard */ }
      try { location.reload(); } catch { /* noop */ }
    }
    const onRej = (e) => { const m = e?.reason?.message ?? e?.reason ?? ""; if (isStale(String(m))) recover(); };
    const onErr = (e) => { const m = e?.error?.message ?? e?.message ?? ""; if (isStale(String(m))) recover(); };
    window.addEventListener("unhandledrejection", onRej);
    window.addEventListener("error", onErr);
    return () => { window.removeEventListener("unhandledrejection", onRej); window.removeEventListener("error", onErr); };
  }, []);
  return null;
}
