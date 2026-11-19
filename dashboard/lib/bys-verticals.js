// BYS ("Build Your System") verticals — per-vertical SEO metadata for the builder shell. PURE: no fs,
// no DB, so the transform is testable on its own.
//
// THE PROBLEM THIS FIXES. /build, /build/adt, /build/audio, /build/toast and /build/pos were all
// rewritten to the same static file, public/widgets/cctv-quote-calculator.html. Every one of them
// therefore served the CAMERA title, the CAMERA description, and `<link rel="canonical"
// href="https://iot-techs.com/build">` — a canonical pointing at a different URL, which tells Google
// "index /build instead of me". Four working builders could never appear in search, and the ones that
// were crawled looked like duplicates of the camera page. The 2026-11-19 audit flagged it as needing a
// route change; this is that change.
//
// The shell stays ONE file. app/build/route.js and app/build/[vertical]/route.js serve it with this
// module's head substitutions applied, so there is still exactly one copy of the 197KB application.
// The client-side spec loader is untouched: it reads the vertical from location.pathname and pulls
// /widgets/bys/<vertical>-spec.js, exactly as before.

export const SITE_ORIGIN = "https://iot-techs.com";

// `h1` is taken verbatim from each spec's brand.title in public/widgets/bys/<id>-spec.js, so the
// heading matches what the top bar actually renders. A test asserts they stay in sync.
// `listed` = linked from /systems and carried in the sitemap. POS is DORMANT: it has a complete spec
// and still works at /build/pos, but it was deliberately swapped out of the picker because Toast
// covers restaurant POS (see the bys-white-label notes). An unlisted vertical is served with
// robots noindex, so a retired builder can never compete with the one that replaced it — "POS System
// Builder" and "Toast POS System Builder" would otherwise be two pages chasing one query.
export const BYS_VERTICALS = [
  {
    id: "cameras",
    path: "build",
    listed: true,
    h1: "Build Your CCTV System",
    title: "Security Camera System Builder — Instant Quote | IOT TECHS",
    description: "Design your security camera system online and get an instant price — pick your cameras, coverage and recording, no sales call. Installed across NJ & NYC.",
  },
  {
    id: "adt",
    path: "build/adt",
    listed: true,
    h1: "Build Your ADT System",
    title: "ADT Alarm System Builder — Instant Quote | IOT TECHS",
    description: "Design your ADT alarm system online and get an instant price — sensors, panel and installation, no sales call. Installed across New Jersey and New York.",
  },
  {
    id: "audio",
    path: "build/audio",
    listed: true,
    h1: "Build Your Sound System",
    title: "Commercial Sound System Builder — Quote | IOT TECHS",
    description: "Design a commercial sound system online and get an instant price — ceiling speakers, zones and amplifiers, no sales call. Installed across NJ & NYC.",
  },
  {
    id: "toast",
    path: "build/toast",
    listed: true,
    h1: "Build Your Toast System",
    title: "Toast POS System Builder — Instant Quote | IOT TECHS",
    description: "Design your Toast POS setup online and get an instant price — terminals, kitchen displays and cabling, no sales call. Installed across NJ & NYC.",
  },
  {
    id: "pos",
    path: "build/pos",
    listed: false,
    h1: "Build Your POS System",
    title: "POS System Builder — Instant Quote | IOT TECHS",
    description: "Design your point-of-sale setup online and get an instant price — terminals, printers and cabling, no sales call. Installed across NJ & NYC.",
  },
];

const BY_ID = new Map(BYS_VERTICALS.map((v) => [v.id, v]));
export const DEFAULT_VERTICAL = BY_ID.get("cameras");

// Only a known vertical resolves. An unknown one must NOT fall back to cameras: the shell used to
// serve /build/anything as a 200 with the camera builder, which is a soft 404 — Google indexes the
// junk URL and the site looks like it has infinite duplicate pages.
export function getVertical(id) {
  return BY_ID.get(String(id || "").trim().toLowerCase()) || null;
}
export function listedVerticals() { return BYS_VERTICALS.filter((v) => v.listed); }

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The three head markers the shell ships with. Exported so a test can assert they still exist in the
// file — if the shell is edited and one of these stops matching, the substitution would silently no-op
// and every vertical would quietly go back to serving the camera metadata.
export const SHELL_MARKERS = {
  canonical: /<link rel="canonical" href="[^"]*">/,
  description: /<meta name="description" content="[^"]*">/,
  title: /<title>[^<]*<\/title>/,
};

// A visually-hidden H1. The served HTML has no heading at all — the app paints one <h1> per wizard
// step at runtime ("Your information", "Your quote"), so the first heading a crawler or a screen
// reader meets describes a step rather than the page. This puts a document-level heading first, using
// the SAME words the top bar renders (brand.title), so it is not cloaking. Clipped rather than
// display:none so screen readers keep it.
const H1_CSS = '<style>.bys-h1{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}</style>';

// Apply a vertical's SEO head to the shell HTML. Returns { html, applied } so the caller (and the
// tests) can tell whether every substitution actually landed.
export function applyVerticalSeo(html, vertical) {
  const v = vertical || DEFAULT_VERTICAL;
  const applied = { canonical: false, description: false, title: false, h1: false, og: false };
  let out = String(html);

  const canonical = `${SITE_ORIGIN}/${v.path}`;
  if (SHELL_MARKERS.canonical.test(out)) {
    applied.canonical = true;
    const og = [
      // A dormant vertical stays reachable and usable, but out of the index so it cannot compete
      // with the builder that replaced it. "follow" so its outbound links still carry.
      ...(v.listed ? [] : [`<meta name="robots" content="noindex,follow">`]),
      `<meta property="og:type" content="website">`,
      `<meta property="og:url" content="${esc(canonical)}">`,
      `<meta property="og:title" content="${esc(v.title)}">`,
      `<meta property="og:description" content="${esc(v.description)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    ].join("");
    applied.og = true;
    out = out.replace(SHELL_MARKERS.canonical, `<link rel="canonical" href="${esc(canonical)}">${og}`);
  }
  if (SHELL_MARKERS.description.test(out)) {
    applied.description = true;
    out = out.replace(SHELL_MARKERS.description, `<meta name="description" content="${esc(v.description)}">`);
  }
  if (SHELL_MARKERS.title.test(out)) {
    applied.title = true;
    out = out.replace(SHELL_MARKERS.title, `<title>${esc(v.title)}</title>`);
  }
  // Inject the heading immediately after <body> so it is first in reading order.
  const body = out.indexOf("<body>");
  if (body >= 0) {
    applied.h1 = true;
    const at = body + "<body>".length;
    out = `${out.slice(0, at)}${H1_CSS}<h1 class="bys-h1">${esc(v.h1)}</h1>${out.slice(at)}`;
  }
  return { html: out, applied };
}
