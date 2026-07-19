// Device identification from a user agent, for spotting "this account normally signs in from an
// iPhone in Paterson; there's now a Windows PC in Ohio on it".
//
// Deliberately coarse. Apple strips the model from iOS user agents — every iPhone reports the same
// string — so any library claiming to name "iPhone 15 Pro" is guessing. We record the OS family,
// its major version, and the browser, which is what actually changes when a different person signs
// in. Android does expose a model, so we keep it when it's there.
//
// This is a DETECTION signal, not authentication: user agents are trivially spoofed. It exists to
// make an unusual login visible, never to grant or deny access.

const OS = [
  // Order matters — iPadOS claims "Mac OS X", and Edge/Chrome both claim "Safari".
  { re: /iPhone;\s*CPU iPhone OS (\d+)[._](\d+)/i,  name: "iPhone",  kind: "phone"   },
  { re: /iPad;\s*CPU OS (\d+)[._](\d+)/i,           name: "iPad",    kind: "tablet"  },
  { re: /Android (\d+)(?:\.(\d+))?/i,               name: "Android", kind: "phone"   },
  { re: /Windows NT (\d+)\.(\d+)/i,                 name: "Windows", kind: "desktop" },
  { re: /Mac OS X (\d+)[._](\d+)/i,                 name: "Mac",     kind: "desktop" },
  { re: /(CrOS)/i,                                  name: "ChromeOS",kind: "desktop" },
  { re: /(Linux)/i,                                 name: "Linux",   kind: "desktop" },
];

const BROWSERS = [
  { re: /Edg\/(\d+)/i,                 name: "Edge"    },
  { re: /OPR\/(\d+)/i,                 name: "Opera"   },
  { re: /SamsungBrowser\/(\d+)/i,      name: "Samsung Internet" },
  { re: /FxiOS\/(\d+)|Firefox\/(\d+)/i,name: "Firefox" },
  { re: /CriOS\/(\d+)|Chrome\/(\d+)/i, name: "Chrome"  },
  { re: /Version\/(\d+).*Safari/i,     name: "Safari"  },
];

// Windows NT versions don't match their marketing names.
const WINDOWS = { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" };

export function parseUserAgent(ua) {
  const s = String(ua || "");
  if (!s) return { os: "Unknown", osVersion: "", browser: "", kind: "unknown", model: "", label: "Unknown device" };

  let os = "Unknown", osVersion = "", kind = "unknown";
  for (const o of OS) {
    const m = s.match(o.re);
    if (!m) continue;
    os = o.name; kind = o.kind;
    if (o.name === "Windows") osVersion = WINDOWS[`${m[1]}.${m[2]}`] || `${m[1]}.${m[2]}`;
    else if (m[1] && /^\d+$/.test(m[1])) osVersion = m[2] ? `${m[1]}.${m[2]}` : m[1];
    break;
  }

  let browser = "";
  for (const b of BROWSERS) {
    const m = s.match(b.re);
    if (m) { browser = b.name; break; }
  }

  // Android exposes a model; iOS does not. Skip the generic build tokens.
  let model = "";
  if (os === "Android") {
    const m = s.match(/Android [^;]+;\s*([^;)]+?)(?:\s+Build|\))/i);
    const cand = m?.[1]?.trim();
    if (cand && !/^(wv|K)$/i.test(cand)) model = cand;
  }

  const osPart = osVersion ? `${os} ${osVersion}` : os;
  const label = [model || osPart, browser].filter(Boolean).join(" · ");
  return { os, osVersion, browser, kind, model, label };
}

// A stable signature for "the same device". Coarse on purpose: a browser auto-update shouldn't
// look like a new device, so the OS major version and browser family are the only inputs.
export function deviceFingerprint(ua) {
  const d = parseUserAgent(ua);
  const major = String(d.osVersion || "").split(".")[0] || "";
  return [d.os, major, d.browser, d.model].join("|").toLowerCase();
}

export function deviceIcon(kind) {
  return kind === "desktop" ? "desktop" : kind === "tablet" ? "tablet" : "phone";
}
