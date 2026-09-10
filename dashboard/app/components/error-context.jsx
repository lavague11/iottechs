"use client";
import { useEffect } from "react";

// Rolling, sanitized error buffer for the current session — mounted on STAFF pages only (via the root
// layout). It quietly records recent runtime errors, unhandled rejections, failed API calls, and the
// in-app route trail, so a bug report can carry "what the application knew" without anyone opening
// DevTools. It NEVER stores request/response bodies, headers, cookies, tokens, or query strings —
// failed requests keep only method + path + status. The BugReporter reads window.__iotBugContext()
// when a report is filed; on non-staff pages that function simply doesn't exist, so nothing is captured.
const MAX_ERRORS = 20, MAX_ROUTES = 8, RECENT_MS = 5 * 60000;

function install() {
  if (typeof window === "undefined" || window.__iotBugCtx) return;
  const st = { errors: [], routes: [] };
  window.__iotBugCtx = st;

  const recordRoute = () => {
    try { const p = location.pathname; if (st.routes[st.routes.length - 1] !== p) { st.routes.push(p); if (st.routes.length > MAX_ROUTES) st.routes.shift(); } } catch { /* noop */ }
  };
  recordRoute();

  // Dedup by fingerprint — the same error firing 100x becomes one entry with an occurrences count.
  const push = (e) => {
    const fp = `${e.type}|${(e.message || "").slice(0, 120)}|${e.route}`;
    const ex = st.errors.find((x) => x.fp === fp);
    if (ex) { ex.occurrences++; ex.ts = e.ts; return; }
    st.errors.push({ ...e, fp, occurrences: 1 });
    if (st.errors.length > MAX_ERRORS) st.errors.shift();
  };

  window.addEventListener("error", (ev) => {
    if (!ev?.message) return;
    push({ type: "error", message: String(ev.message).slice(0, 300), stack: ev.error?.stack ? String(ev.error.stack).slice(0, 1200) : null, route: location.pathname, ts: Date.now() });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev?.reason;
    push({ type: "rejection", message: String(r?.message || r || "Unhandled rejection").slice(0, 300), stack: r?.stack ? String(r.stack).slice(0, 1200) : null, route: location.pathname, ts: Date.now() });
  });

  const wrapHist = (name) => { const orig = history[name]; if (typeof orig === "function") history[name] = function (...a) { const r = orig.apply(this, a); setTimeout(recordRoute, 0); return r; }; };
  wrapHist("pushState"); wrapHist("replaceState");
  window.addEventListener("popstate", recordRoute);

  // Failed app requests — metadata ONLY (method + path + status). Query strings are dropped so secret
  // params never land in the buffer; bodies and headers are never read.
  const orig = window.fetch;
  if (typeof orig === "function" && !orig.__iotWrapped) {
    const wrapped = async (...args) => {
      const started = Date.now();
      let url = "", method = "GET";
      try { const req = args[0]; url = typeof req === "string" ? req : (req?.url || ""); method = (args[1]?.method || req?.method || "GET").toUpperCase(); } catch { /* noop */ }
      const path = (() => { try { return new URL(url, location.origin).pathname; } catch { return String(url).split("?")[0]; } })();
      try {
        const res = await orig(...args);
        if (res && res.status >= 400) push({ type: "network", message: `${method} ${path} → ${res.status}`, route: location.pathname, ts: started });
        return res;
      } catch (err) { push({ type: "network", message: `${method} ${path} → failed`, route: location.pathname, ts: started }); throw err; }
    };
    wrapped.__iotWrapped = true;
    window.fetch = wrapped;
  }

  window.__iotBugContext = () => {
    const now = Date.now();
    const errors = st.errors.filter((e) => now - e.ts < RECENT_MS).slice(-5)
      .map((e) => ({ type: e.type, message: e.message, stack: e.stack || undefined, route: e.route, occurrences: e.occurrences, agoMs: now - e.ts }));
    const dpr = window.devicePixelRatio || 1;
    return { route: location.pathname, viewport: `${window.innerWidth}×${window.innerHeight}${dpr !== 1 ? ` · DPR ${dpr}` : ""}`, ua: navigator.userAgent.slice(0, 300), routes: st.routes.slice(-MAX_ROUTES), errors };
  };
}

export default function ErrorContextProbe() {
  useEffect(() => { install(); }, []);
  return null;
}
