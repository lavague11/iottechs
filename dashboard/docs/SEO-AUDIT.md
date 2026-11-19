# iot-techs.com — SEO audit

Audited 2026-11-19 against the live site (commit `3348f51`) and the verified Search Console
property `https://iot-techs.com/`. Everything below was measured, not assumed; each finding
names how it was checked.

---

## 0. The headline

The technical SEO is in good shape. Titles, descriptions, canonicals, robots, HTTPS
redirects, structured data and Lighthouse SEO scores are all correct or near-correct — this
is not a site with a crawling problem.

**The problem is that there is almost nothing to rank.** Six pages are indexed, and five of
them are tools or utilities (`/`, `/systems`, `/build`, `/apply`, `/guides`). The site has:

- **no service pages** — access control, alarms, networking, Toast/POS and commercial audio
  are sold by the business but have no page of their own;
- **no location pages** — Union NJ, Queens, Brooklyn and the rest of NJ/NYC have no page;
- **one piece of content** — a single guide.

Search Console confirms the consequence exactly. All six queries the site has ever appeared
for are variations of the brand name. There is not one non-brand commercial query:

| Query | Clicks | Impr. | Position |
|---|---|---|---|
| iot techs | 2 | 6 | 1.5 |
| cameras iot services | 0 | 3 | 71.3 |
| iot 'nj | 0 | 1 | 1.0 |
| iot security jobs | 0 | 1 | 1.0 |
| iot company nyc | 0 | 1 | 14.0 |
| iot security cameras services | 0 | 1 | 26.0 |

Totals: **4 clicks, 21 impressions, average position 16.8.** The site ranks for its own name
and nothing else, because nothing else exists on it.

So the small fixes in §6 are worth doing — one of them is a confirmed Search Console error —
but none of them will move non-brand traffic. The items in §7 are the actual growth work.

---

## 1. Search Console

Property `https://iot-techs.com/` (a second property for `www` also exists; harmless, since
www 301s to the apex).

**Performance data begins 2026-11-15** — three days at the time of audit. The property is new,
so there is no history to compare against and no trend to read yet. Judgements below about
rankings are therefore about *presence*, not movement.

### Indexing — 6 indexed, 0 "not indexed"

| URL | Last crawled |
|---|---|
| /apply | Nov 16, 2026 |
| / | Nov 15, 2026 |
| /build | Nov 15, 2026 |
| /guides | Nov 15, 2026 |
| /guides/install-security-cameras-side-yard-driveway-and-pool-d3wh | Nov 15, 2026 |
| /systems | Nov 15, 2026 |

The Page indexing report also claims **zero** URLs in "Discovered – not indexed". **Both figures
are stale** — the report's data only runs to Nov 15. Live URL Inspection, which is current, gives
the real picture for the two sitemap URLs the report omits:

- **`/report-issue` — "URL is on Google", page is indexed.** The report simply has not caught up.
  (An earlier draft of this audit read the report literally and tied the omission to the page's
  orphan status; the inspection disproves that. The orphan finding in §3 stands on its own —
  internal links drive crawl priority and authority — but it did not cost this page its indexing.)
- **`/terms` — "URL is not on Google: Discovered – currently not indexed."** Never crawled
  (last crawl N/A), and Google reports **"Referring page: None detected"**. Low-value boilerplate,
  so this is not worth chasing — but it is a clean demonstration that a page Google sees no
  internal link to is a page it does not bother to fetch.

Lesson for future audits: the Page indexing report lags by days on a new property. Confirm any
"not indexed" claim with URL Inspection before acting on it.

### Sitemap — submitted, read, **1 error**

Submitted Nov 15, last read Nov 18, 8 pages discovered. Google reports:

> Sitemap can be read, but has errors — **Invalid date**, 1 instance.

**Root cause found.** `app/sitemap.js` passes the raw SQLite timestamp straight through:

```xml
<lastmod>2026-11-14 18:41:09</lastmod>
```

The sitemap protocol requires W3C Datetime (`2026-11-14T18:41:09-05:00`). A space instead of
`T` and no timezone makes it invalid, so Google discards the `lastmod` for that URL. Only the
guide entry carries a `lastmod` today, so it is the only instance — but every future SEO page
and guide would inherit the same bug. Fixed in §6.

### Other checks

- **Manual actions: none.** No security issues, no penalties.
- **Links report:** still "processing data" on this new property — no backlink data available
  yet. Re-check in a few days; §8 lists where to build links in the meantime.
- **Redirects / canonicalisation — correct.** `http://iot-techs.com/` → 301 → https, and
  `https://www.iot-techs.com/` → 301 → apex. No redirect chains.
- **404s — correct.** `/no-such-page-xyz`, `/index.html` and `/home` all return a clean 404,
  not a soft 200.

---

## 2. On-page

Measured by fetching each live public URL and parsing the served HTML.

| URL | Title (len) | Desc (len) | Canonical | H1 |
|---|---|---|---|---|
| / | 53 | 163 | ✓ self | 1 |
| /systems | 58 | 146 | ✓ self | 1 |
| /build | 58 | 157 | ✓ self | 1 |
| /apply | 65 | 113 | ✓ self | 1 |
| /report-issue | 66 | 162 | ✓ self | 1 |
| /terms | 34 | 61 | ✓ self | 1 |
| /guides | 59 | 139 | ✓ self | 1 |
| /guides/\<slug\> | 76 | 163 | ✓ self | **0** |
| /adt | 30 | 53 | — | 0 (noindex, correct) |

**What is right:** every title and description is unique, hand-written, leads with the service
and geography rather than the brand, and sits in range (titles 34–76 chars, descriptions
61–163). Canonicals are self-referential and absolute. `/adt` is correctly `noindex, nofollow`.
No duplicate titles among indexed pages.

### Defects found

1. **The guide page has no H1.** `/guides/<slug>` renders the guide title inside a `<b>` in its
   header bar and the first step's name as `<h2>`. The site's only content page gives Google no
   top-level heading. Fixed in §6.

2. **The guide's photo has `alt=""`.** It is a real content photo of the installed camera, not
   decoration, so an empty alt throws away both the accessibility and the image-search value.
   Fixed in §6. (The `/guides` index thumbnail is also `alt=""` — same fix.)

3. **Only one step of each guide is in the HTML.** The guide is a stepped player: step 1 renders,
   steps 2–4 appear only on click. Roughly three-quarters of the content is invisible to a
   crawler. Rather than change the UX, §6 adds `HowTo` structured data carrying every step and
   image — the standard way to expose this content.

4. **`/build/<vertical>` pages are invisible.** `/build/adt`, `/build/audio`, `/build/toast` and
   `/build/pos` each serve the *camera* title, the *camera* description, and
   `<link rel="canonical" href="https://iot-techs.com/build">`. The canonical is at least
   honest — these really are one shell — but it means the audio, Toast and ADT builders can
   never rank for anything. Listed as a Big item in §7.

5. **No `og:title` on `/systems` and `/build`**, and `/report-issue`, `/terms`, `/guides` and the
   guide page all fall back to the generic portal OG image. Cosmetic for ranking, but it means a
   shared guide link previews as "IOT TECHS" with the portal card.

**Not a defect (checked and cleared):** a naïve scan flags three `<h1>`s on `/build`. Two of
them sit inside a `<script>` block as template literals (`<h1>${st.title}</h1>`) and never reach
the DOM. `/build` has exactly one real H1.

---

## 3. Internal links — the biggest structural problem

Built by parsing every indexable page with `<script>`/`<style>` stripped, so only real DOM
links count.

| Page | Linked from |
|---|---|
| / | /systems, /build, /report-issue, /terms |
| /systems | / |
| /build | /systems |
| /apply | / |
| /terms | / |
| /guides | *only its own child page* |
| /guides/\<slug\> | /guides |
| **/report-issue** | **nothing — true orphan** |

Two findings:

- **`/report-issue` has zero inbound internal links.** It is reachable only from the sitemap.
  This is the site's highest-commercial-intent page — someone whose cameras are down. It *is*
  indexed (§1), so this is not costing it indexing; what it costs is crawl priority and every
  bit of internal authority the home page could be passing it.
- **`/guides` is effectively orphaned too.** Nothing on the main site links to it; its only
  inbound link comes from the guide beneath it, which is a closed loop. The entire content hub
  receives no internal authority.

The home page links to only three public pages (`/systems`, `/apply`, `/terms`) — the rest of
its links go to app routes (`/go`, `/login`, `/dashboard`, `/forgot`, `/api/logout`). It is not
passing authority to the content.

Fixed in §6.

---

## 4. Local SEO

**Structured data is present and correct.** The home page carries an `Organization` +
`LocalBusiness` `@graph`:

- Name **IOT TECHS** (legal name La Vague Inc.) ✓
- Telephone **(917) 727-0081** ✓ — this is the canonical NAP number, and correctly *not* the
  646 number, which is the Zelle token and must never be published as a contact number.
- Locality **Little Ferry, NJ 07643** ✓, with geo coordinates
- `areaServed`: New Jersey, New York City, Westchester, Long Island ✓
- Open 7 days ✓, `sameAs` → the Google Business Profile map listing ✓

Two things to settle:

1. **The schema publishes the street address.** It is in the live `PostalAddress` today. You've
   asked for the street address not to be shown, so this needs your call — it is a trade-off, not
   a clear win: a street address that matches the Google Business Profile is one of the stronger
   local-ranking signals, and removing it may cost local visibility. Options are to keep it, drop
   `streetAddress` and keep locality/region/postcode, or switch the markup to a service-area
   business. **I have not changed it.** See §7.

2. **No location pages exist.** `areaServed` claims four regions; the site has not one page about
   any of them. Union NJ, Queens, Brooklyn and the wider NJ/NYC area each have zero content. This
   is the single biggest reason there are no non-brand impressions. See §7.

Still outstanding from the earlier local-SEO pass: the **Google Business Profile is categorised
as "Corporate office"** rather than a security-system installer category. That is owner-side work
in the GBP dashboard and cannot be fixed from the codebase.

---

## 5. Speed and mobile

Lighthouse 12.8.2, mobile preset, against the live site.

| Page | Perf | A11y | Best prac. | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| / | 84 | 94 | 96 | **100** | 3.1 s | 0.058 | 200 ms |
| /systems | **100** | 100 | 96 | **100** | 0.8 s | 0 | 10 ms |
| /build | 99 | 100 | 100 | **100** | 1.1 s | 0 | 120 ms |
| /report-issue | 83 | 95 | 100 | **100** | 3.8 s | 0 | 90 ms |

**SEO scores 100 on every page.** Nothing to fix there.

The two slow pages share one cause: **render-blocking resources — 2,150 ms on the home page and
1,699 ms on `/report-issue`**, dominated by the synchronous Google Fonts stylesheet. Both LCPs
(3.1 s and 3.8 s) are above Google's 2.5 s "good" threshold, and on the home page the LCP element
is the hero paragraph, i.e. it is waiting on the font. The two static pages that do not block on
fonts score 99–100.

Fixing this means changing how fonts load, which risks a flash of unstyled text — a visual
change, not a meta change — so it is listed in §7 rather than applied. Minor: one low-contrast
element per slow page (`.pill` on home, `.ri-tag` on report-issue) and a heading-order skip
(`h3 → h4 → h5`) on home.

---

## 6. Fixed, deployed and verified

Confined to the lane you set — meta, alt text, internal links, sitemap.

1. **Sitemap `lastmod` is now valid W3C Datetime** — resolves the confirmed Search Console
   "Invalid date" error.
2. **Home and the static pages now carry a `lastmod`** — they had none at all, so Google had no
   freshness signal for the most important URLs.
3. **`/report-issue` and `/guides` are now linked from the home page footer** — de-orphaning the
   highest-intent page and the content hub. Also dropped a self-link that went through the www
   redirect.
4. **The guide page has a real `<h1>`** (the guide's title), styled identically.
5. **Guide photos carry real alt text** from the step they illustrate.
6. **`HowTo` and `BreadcrumbList` structured data on guide pages** — exposes every step and photo
   to Google without changing the player UX.

**Shipped as `eb7c453e`** (rollback tag `seo-audit-rollback-2026-11-19` points at the commit
before it). 1776 tests pass, build clean, and all six were verified against the live site:

- `/sitemap.xml` now emits `2026-11-19T12:13:07.115Z` for the code-driven routes and
  `2026-11-14T23:41:09.000Z` for the guide — the Eastern 18:41 correctly converted. Zero
  space-separated dates remain.
- The guide serves `<h1>Install Security Cameras: Side Yard, Driveway, and Pool</h1>`, its photo
  carries a real alt, and the page publishes `HowTo` with all 4 steps (3 with images) plus
  `BreadcrumbList`. Checked at 375 px — the header is pixel-identical to before.
- The home footer renders *Camera Repair* → `/report-issue` and *Guides* → `/guides`.
- **Sitemap resubmitted** in Search Console ("Sitemap submitted successfully") so Google re-reads
  it and clears the Invalid date error on its next pass.

No indexing was requested: `/report-issue` is already indexed, and `/terms` — the only genuinely
unindexed URL — is boilerplate that cannot rank for anything.

---

## 7. Needs your approval (Big)

Ordered by expected return.

1. ~~**Location pages**~~ and 2. ~~**Service pages**~~ — **APPROVED AND SHIPPED 2026-11-19.**
   See §9 below.
3. ~~**Per-vertical builder landing pages**~~ — **APPROVED AND SHIPPED 2026-11-19.** See §10.
   Items 4-6 are still open.
4. ~~**The street address in LocalBusiness schema**~~ — **DECIDED AND SHIPPED 2026-11-19.** See §12.
5. ~~**Font loading / render-blocking**~~ — **APPROVED AND SHIPPED 2026-11-19.** See §11.
6. **The SEO engine is built but empty.** `/dev/seo` and the `seo_pages` table exist with a
   publish gate and quality threshold; **zero pages are published**, which is why the sitemap
   carries only hand-built routes. Items 1 and 2 above are exactly what it was built to produce.

---

## 8. Backlink targets

No backlink data yet (the Links report is still processing), so this is a build list, not a gap
analysis. Use the canonical NAP everywhere — **IOT TECHS · (917) 727-0081 · Little Ferry, NJ** —
and keep it character-identical across every listing, since inconsistency is what breaks local
ranking.

**Core local citations (do these first):**
Google Business Profile (and fix the "Corporate office" category), Apple Business Connect, Bing
Places, Yelp, Facebook, Nextdoor, Angi, Thumbtack, HomeAdvisor, Houzz, Better Business Bureau,
Yellow Pages, Manta, Foursquare.

**Industry and dealer listings — the strongest links available to you:**
ADT and SafeStreets authorised-dealer directories (you are a dealer; this is a high-authority
link most competitors cannot get), Toast partner/installer directory, and the manufacturer
"where to buy / find an installer" pages for the camera and access-control lines you carry —
Hikvision, Dahua, Alarm.com, Honeywell, Axis, Ubiquiti. Also ESA (Electronic Security
Association) and NJESA membership listings, and Security Systems News / SDM vendor directories.

**Chambers of commerce and local business groups:**
Little Ferry / Bergen County Chamber, Union Township Chamber, Queens Chamber of Commerce,
Brooklyn Chamber of Commerce, Hudson County Chamber, plus the local BNI chapter. Chamber
memberships are paid but give a genuine local `.org` link and real referrals.

**Content-earned links (once §7 exists):**
The guides library is the natural asset here — local news and trade press will link to a
practical "how to position cameras on a commercial property" piece far sooner than to a services
page.

---

## 9. Service & location pages — shipped 2026-11-19

Items 1 and 2 of §7, approved by the owner and built. **Eleven new pages.**

### What went live

| URL | Type | Targets |
|---|---|---|
| `/services` | hub | commercial security installation services nj nyc |
| `/locations` | hub + service area | commercial security installer nj nyc service area |
| `/commercial-security-camera-installation` | service | commercial security camera installation |
| `/restaurant-technology-installation` | service | restaurant toast pos installation |
| `/commercial-access-control` | service | commercial access control installation |
| `/commercial-alarm-systems` | service | commercial alarm system installation |
| `/commercial-networking-wifi` | service | commercial network cabling wifi installation |
| `/commercial-sound-systems` | service | commercial sound system installation |
| `/security-camera-installation-union-nj` | location | security camera installation union nj |
| `/security-camera-installation-queens-ny` | location | security camera installation queens ny |
| `/security-camera-installation-brooklyn-ny` | location | security camera installation brooklyn ny |

450–800 words each, every primary keyword unique (no cannibalization).

### Three decisions worth knowing about

**1. The content is in CODE, not in `seo_pages`.** The SEO engine stores pages in the app
database, which is per-environment — production's `seo_pages` is empty, and a page authored in
`/dev/seo` on a laptop would never reach the live site. So these pages are
`lib/seo/content/*.js`: they deploy with the repo, are reviewable in a diff, and are covered by
tests. The engine is **not** replaced — `app/[...seoSlug]/page.jsx` asks the database first, so a
published `seo_pages` row at the same slug still wins and can supersede a code page without a
deploy. The slugs deliberately match the engine's seeded `PLAN_PAGES`, so each topic is one URL
rather than two competing ones.

**2. "Rest of NJ/NYC" is `/locations`, not a fourth city page.** A thin fourth page would have
competed with the three deep ones for the same queries. Instead `/locations` is a real
service-area page naming the actual counties and towns — Bergen, Hudson, Essex, Union, Passaic,
Middlesex, all five boroughs, Westchester, Nassau and Suffolk — and doubles as the hub.

**3. Security camera installation was added to the approved list of five.** It is the #1 money
page (priority 95 in the engine's own plan), `/build` is a calculator rather than a page that can
rank, and every location page needs a camera service page to link to. Six service pages, not five.

### Claim discipline

Everything on these pages is either a capability the fact store records as verified AND cleared
for public use, or general trade practice. Deliberately **absent**, because nothing verifies
them: install counts, "1500+ locations", Port Authority, NYPD, client names, licence numbers,
prices, warranty length, response times, "licensed and insured", "free". The alarm and camera
pages state the self-monitored model plainly — *IOT TECHS does not run a central station* —
because `company.monitoring` says so and silence would be a monitored-service claim by omission.

NAP is never a literal: pages write `{{phone}}` / `{{phoneDigits}}` / `{{email}}` and the renderer
substitutes from `publicFacts()`. A test fails if any phone number is typed into a content file,
which is what keeps the old Zelle payment number from reappearing as the published line.

**The street address is not rendered on any of these pages** (per your instruction). The *town*
is — Little Ferry — because it matches the Google Business Profile and carries local relevance.

### Internal linking

The home-page footer's eight "Services" links were all on-page `#services` anchors. Six now point
at real pages, and a fifth footer column links the three location pages plus `/locations`. Every
new page is one click from the home page; a test asserts none is an orphan, that every internal
link resolves, and that both hubs link to everything.

### Defects fixed along the way

- **`/#contact` was a dead CTA.** The old catch-all renderer's "Request a Site Survey" button and
  the `cta` block default both pointed at `/#contact` — an anchor that does not exist, because the
  home page's enquiry form is a JS modal. Every click silently dumped the visitor at the top of
  the home page. Now each page carries its own CTA to the matching quote builder, plus tap-to-call.
- **The brand was plain text** in the SEO page header; it now renders `logo.svg`.
- **JSON-LD was unescaped** against `</script>` injection on this route.
- On a phone the header leads with the **phone number**, not the quote button — tap-to-call is the
  conversion that matters on a handset.

### Schema

Location pages now emit `Service` scoped to their own `areaServed` (Queens gets "Queens, NY", not
the company-wide four-region area), alongside `Organization`, `LocalBusiness`, `BreadcrumbList`
and `FAQPage`. Verified live on the rendered page, not just in source.

### One contradiction for you to resolve

The **home page hero still says "monitored 24/7/365" and "Licensed & Insured"**. The fact store
marks both as unverified — `company.licensing` is empty and `company.monitoring` explicitly says
IOT TECHS does not run a central station — so the new pages avoid both. That leaves the site
saying two different things on two pages. Either the home page copy should change, or those facts
should be verified and recorded in `/dev/seo` → Facts. Your call; I have not touched the home
page's claims.

### Tests

`tests/seo-content.test.mjs`, 25 tests. The two that matter most: location pages may not share a
paragraph (the doorway-page guard), and no page may contain an unverified claim.

---

## 10. Builder landing pages — shipped 2026-11-19

Item 3 of §7. The five BYS builders now serve their own metadata.

### What was wrong

`/build`, `/build/adt`, `/build/audio`, `/build/toast` and `/build/pos` were all **rewrites to one
static file**, `public/widgets/cctv-quote-calculator.html`. Every one of them therefore served:

- the **camera** `<title>`,
- the **camera** meta description, and
- `<link rel="canonical" href="https://iot-techs.com/build">` — a canonical pointing at a *different*
  URL, which tells Google "don't index this page, index /build instead".

So four working builders could not appear in search at all, and anything that did get crawled looked
like a duplicate of the camera page.

Two further defects found while fixing it:

- **`/build/<anything>` returned 200** with the camera builder — a soft 404. Google will happily index
  unlimited junk URLs under a path that behaves like that.
- **`applySpecBranding()` overwrote `document.title`** with the spec's short label on every load
  (`document.title = SPEC.brand.title` → "Build Your ADT System"). Google renders JavaScript, so that
  would have replaced the new SEO title on the rendered pass and undone the whole fix. It now only
  applies when the vertical came from `?vertical=`, where the server could not have known which spec
  would load. The brand and tagline are still spec-driven.

### What changed

| URL | Title | Canonical |
|---|---|---|
| `/build` | Security Camera System Builder — Instant Quote | self |
| `/build/adt` | ADT Alarm System Builder — Instant Quote | self |
| `/build/audio` | Commercial Sound System Builder — Quote | self |
| `/build/toast` | Toast POS System Builder — Instant Quote | self |
| `/build/pos` | POS System Builder — Instant Quote | self |

`/build` and `/build/<vertical>` are now route handlers (`app/build/route.js`,
`app/build/[vertical]/route.js`) that serve the **same single shell file** with three head
substitutions plus Open Graph tags and a visually-hidden H1. There is still exactly one copy of the
197 KB application — nothing was duplicated.

The `/build` and `/build/:vertical` rewrites were **removed** from `next.config.js` and must stay
removed: rewrites returned as a flat array are `afterFiles`, which Next matches *before* dynamic
routes, so a `/build/:vertical` rewrite would shadow `app/build/[vertical]` entirely. A test asserts
they do not come back. `/quote` is still a rewrite — it is the plain shell with its canonical pointing
at `/build`, so the duplicate is consolidated, and it doubles as the fallback target.

### Safety

This is a lead-capture tool, so it must never 500. If the shell cannot be read, the handler redirects
to `/quote?vertical=<id>` — still a plain rewrite to the same static file, and the shell's own loader
honours `?vertical=`, so the visitor still gets the right builder. Responses carry an **ETag** and
return **304** on revalidation, so browser caching is equivalent to the static file it replaced.

### Verified live

All five load their own spec (`adt-spec.js`, `audio-spec.js`, `toast-spec.js` each 200), render the
intake form, and keep their own lead endpoint (`/api/leads/toast` etc.). `/build` is unchanged —
camera spec, five steps. `/build/cameras` and `/build/bogus` now **404** instead of soft-404ing.
ETags differ per vertical and revalidate to 304.

The three non-camera builders already have an inbound link from both `/systems` and their matching
service page (`/commercial-sound-systems` → `/build/audio`, `/restaurant-technology-installation` →
`/build/toast`, `/commercial-alarm-systems` → `/build/adt`), so none is an orphan.

### One for you

**`/build/pos` is dormant and now noindexed.** It has a complete, working spec, but it was
deliberately swapped out of the picker because Toast covers restaurant POS. Left indexable it would
have competed with `/build/toast` for the same query, so it serves `robots: noindex,follow` and stays
out of the sitemap while continuing to work for anyone holding the link. If you ever want POS back,
add it to `/systems` and flip `listed: true` in `lib/bys-verticals.js` — the sitemap and the noindex
both follow from that one flag.

### Tests

`tests/bys-verticals.test.mjs`, 12 tests. The load-bearing ones: the three head markers still match the
real shell (a silent no-op would revert every vertical to the camera metadata), the rewrites stay out
of `next.config.js`, and `applySpecBranding` does not overwrite the server-set title again.

---

## 11. Fonts — shipped 2026-11-19

Item 5 of §7. **Measured result on production, Lighthouse 12.8.2, mobile:**

| Page | Before (audit) | After | Render-blocking |
|---|---|---|---|
| `/` | LCP **3.1 s** | LCP **1.6 s**, perf **96**, CLS **0** | was the Google stylesheet → **none** |
| `/report-issue` | ~1.7 s of font cost | LCP **2.0 s**, perf **99**, CLS **0** | down to 60 ms est. savings |

Single runs either side, so treat the exact seconds as indicative — but "render-blocking resources:
none" is structural, not noise.

### What was actually wrong

Two different mechanisms, and the second was worse than the audit first reported.

1. **`public/home.html`** loaded both families with a render-**blocking**
   `<link rel="stylesheet">` to `fonts.googleapis.com`. Nothing painted until that third-party CSS
   returned, and only then could the woff2 be requested from a *second* third-party host
   (`fonts.gstatic.com`) — two DNS lookups and two TLS handshakes on the critical path.
2. **Five app components** (`admin-shell`, `my-projects`, `gateway-client`, `report-issue`,
   `welcome`) pulled the same two families with a CSS `@import` inside their style string. That is
   the worst case: the browser cannot *discover* an `@import` until the stylesheet containing it has
   been fetched and parsed, so the chain was our CSS → Google CSS → gstatic woff2.

`public/widgets/adt-calculator.html` did the same thing.

### What changed

Both families turned out to be **variable fonts**, so one file per subset spans weight 400–800 and
replaces the four to nine static weights those URLs requested. Four files in `public/fonts/`,
**162 KB total** — and `unicode-range` subsetting means a page with no accented characters fetches
only the two latin files (**112 KB**). Verified: the `latin-ext` faces stay `unloaded` on the home page.

- Declared once in `app/globals.css`, which `app/layout.jsx` imports, so it reaches every app route.
- The two static pages outside the Next CSS pipeline carry their own `@font-face` copies.
- The home page **preloads** the two faces the hero needs, with `crossorigin` — a font preload
  without it makes the browser fetch the file twice, which would have quietly eaten the gain.
- `font-display: swap` is unchanged (Google's CSS set it too), so the fallback-flash behaviour is
  exactly as before. **CLS is 0 on both pages**, so the swap is not shifting layout.

### Notes

- The fonts are **OFL 1.1**, which requires the copyright notice to travel with redistributed files.
  `public/fonts/LICENSE.txt` carries both.
- **`lib/email.js` still links Google fonts, deliberately** — it is an HTML email template, not a
  page, and mail clients mostly ignore webfont links.
- The only third-party main-thread cost left on the home page is **Google Maps (~210 ms)**, which is
  unrelated to fonts and was not touched.
- Guard: `tests/fonts-selfhosted.test.mjs` scans every shipped file for a third-party font fetch and
  fails a static page that uses a family it never declares.

---

## 12. Street address — removed 2026-11-19

Item 4 of §7, decided by the owner. The home page's `LocalBusiness` JSON-LD was the **only** public
surface carrying it (`120 Industrial Ave #4`); the service and location pages never rendered it.

### Published as a service-area business

`streetAddress` is gone. **`addressLocality` / `addressRegion` / `postalCode` / `addressCountry`
stay**, and so do `geo`, `sameAs` and `areaServed`.

Dropping the whole address block would have thrown away the locality signal Google matches against
the Business Profile — the corroboration between site and listing is the thing that makes local
search work, and it is the cost that was flagged before making this change. `areaServed` (New Jersey,
New York City, Westchester, Long Island) is what actually describes where the business works.

### The fact store is the real fix

`company.address` is now **verified but NOT cleared for public use**, so `publicFacts()` withholds it
and no page or schema can cite it again. Because seeding is `INSERT OR IGNORE`, an existing store
(production's) keeps the old row, so `withholdStreetAddress()` flips it once on boot — guarded on
`updated_by IN ('seed','nap-fix')`, so if the owner ever republishes the address from `/dev/seo`
their edit stamps their own id and the correction becomes a permanent no-op rather than silently
reverting them on the next boot.

### Two things to be clear about

1. **`geo` was deliberately kept.** It resolves to the premises, but it is a machine signal rather
   than a displayed address and it is a real local-ranking input. One line to remove if wanted.
2. **The full address remains public on the Google Business Profile.** This changes what the *site*
   publishes, not what is discoverable. If the goal is that the address not be findable at all, that
   is a GBP change (switching the listing to a service-area business and hiding the address), not a
   code change — and hiding it there has its own ranking consequences.

Verified: the JSON-LD still parses and the graph contains no `streetAddress`. Guard in
`tests/public-seo-meta.test.mjs` scans every public file and every content module for
`120 Industrial` or a `streetAddress` field, asserts the locality survives, and asserts the one-time
correction cannot clobber an owner edit. The two tests that encoded the old policy were updated
rather than deleted.
