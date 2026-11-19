// Hub pages — /services and /locations. Rendered by app/[...seoSlug]/page.jsx.
//
// These are the internal-linking backbone. Every service and location page is one click from a hub, and
// both hubs are linked from the home-page footer, so nothing in this content set is an orphan (an orphan
// is what /report-issue and /guides were before the 2026-11-19 audit).
//
// /locations is also the SERVICE-AREA page — the owner's "rest of NJ/NYC" coverage. It is written as a
// real page with the actual counties and towns rather than a thin fourth city page that would compete
// with the three deep location pages for the same queries.
//
// Slugs match lib/seo.js PLAN_PAGES ("services", "locations") so the engine's seeded opportunity rows
// and these pages are the same URL.
import { SERVICE_PAGES } from "./services.js";
import { LOCATION_PAGES } from "./locations.js";

// Short hub blurbs. Kept here, not on the page records, because they describe the service from the
// hub's point of view — a one-line answer to "which of these do I need?".
const SERVICE_NOTE = {
  "commercial-security-camera-installation": "Camera systems designed, cabled and recorded on site, with live footage on your phone.",
  "restaurant-technology-installation": "Toast POS, kitchen displays, cameras, Wi-Fi and sound — the whole restaurant fit-out from one contractor.",
  "commercial-access-control": "Card, fob and mobile credentials on the doors that matter, revocable the day somebody leaves.",
  "commercial-alarm-systems": "Intrusion detection, glass-break and panic buttons, with alerts and footage on your phone.",
  "commercial-networking-wifi": "Cat6 structured cabling, racks, PoE switching and Wi-Fi that reaches the whole building.",
  "commercial-sound-systems": "Zoned background music and paging, with even coverage instead of hot spots.",
};

const serviceLinks = () => SERVICE_PAGES.map((p) => ({ to: p.slug, label: p.title, note: SERVICE_NOTE[p.slug] }));
const locationLinks = () => LOCATION_PAGES.map((p) => ({ to: p.slug, label: p.location, note: p.primary_topic }));

export const HUB_PAGES = [
  // --------------------------------------------------------------- services
  {
    slug: "services",
    page_type: "hub",
    title: "Services",
    primary_topic: "What IOT TECHS installs for businesses across New Jersey and New York.",
    primary_keyword: "commercial security installation services nj nyc",
    search_intent: "commercial",
    meta_title: "Commercial Security & Low-Voltage Services | NJ & NYC",
    meta_description: "Security cameras, access control, alarms, Cat6 networking, commercial sound and Toast POS installation for businesses across New Jersey and New York City.",
    cta: { label: "Build a quote", href: "/systems" },
    body: [
      { type: "p", value: "IOT TECHS is a commercial low-voltage installer working across New Jersey and the New York City metro area. Everything below is installed by the same crews, on one survey and one cable plan — which is the main reason to use a single contractor rather than three." },
      { type: "links", value: "What we install", items: serviceLinks() },
      { type: "h2", value: "Why one contractor for all of it" },
      { type: "p", value: "Cameras, door readers, point-of-sale terminals, access points and speakers all follow the same routes through a building and all land on the same network. Split across separate contractors, that becomes three surveys, three cable runs through the same wall and nobody owning the network everything depends on. Done as one job it is one survey, one proposal and one crew, and the conflicts get resolved on paper instead of on site." },
      { type: "h2", value: "Every job starts with a site survey" },
      { type: "p", value: "We do not price a system over the phone. Somebody comes to the property, photographs it, and marks every device position on a floor plan or an aerial view — then the design, the device counts and the cable routes come from that. It is why our proposals describe positions rather than quantities, and it is the step that prevents the two most common outcomes of a cheap quote: cameras covering the wrong things, and a price that moves once work starts." },
      { type: "links", value: "Service area", items: [
        ...locationLinks(),
        { to: "locations", label: "Full service area", note: "Every county, borough and town we cover across NJ and NY." },
      ] },
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "Do you work with residential customers?", a: "Our work is mainly commercial — businesses, multi-tenant buildings and larger properties. Larger private properties are something we do take on, so it is worth asking about yours." },
        { q: "Can you take on just one part of a project?", a: "Yes. Plenty of jobs are cameras only, or cabling only, or a point-of-sale fit-out where somebody else is doing the rest. The survey is the same either way." },
        { q: "Do you service systems you did not install?", a: "Often, yes. If an existing system has failed, send the details through the camera repair page and we will tell you whether it is worth repairing or replacing." },
        { q: "How do we get a price?", a: "Call {{phone}}, or use one of the quote builders on this site to put a specification and a budget together yourself. Either way the final proposal follows an on-site survey." },
      ] },
    ],
  },

  // -------------------------------------------------------------- locations
  {
    slug: "locations",
    page_type: "hub",
    title: "Service Area",
    primary_topic: "Where IOT TECHS installs — New Jersey, New York City, Westchester and Long Island.",
    primary_keyword: "commercial security installer nj nyc service area",
    search_intent: "local",
    meta_title: "Service Area — New Jersey & New York | IOT TECHS",
    meta_description: "IOT TECHS installs commercial security cameras, access control and cabling across New Jersey, all five New York City boroughs, Westchester and Long Island.",
    cta: { label: "Build a quote", href: "/build" },
    body: [
      { type: "p", value: "IOT TECHS is based in Little Ferry, New Jersey, and works across New Jersey, the five boroughs of New York City, Westchester and Long Island. Being on the Bergen County side of the Hudson means both the northern New Jersey corridor and the city are routine working areas rather than an exception." },
      { type: "links", value: "Areas with their own page", items: locationLinks() },
      { type: "h2", value: "New Jersey" },
      { type: "p", value: "Bergen County — Little Ferry, Hackensack, Teaneck, Englewood, Fort Lee, Paramus, Ridgewood, Lodi, Garfield and the Route 4 and Route 17 corridors. Hudson County — Jersey City, Hoboken, Union City, West New York, Weehawken, Bayonne, Secaucus and North Bergen. Essex County — Newark, East Orange, Irvington, Bloomfield, Belleville, Nutley and Montclair." },
      { type: "p", value: "Union County — Union Township, Elizabeth, Linden, Hillside, Springfield, Kenilworth, Roselle, Cranford, Rahway and Westfield. Passaic County — Paterson, Clifton, Passaic and Wayne. Middlesex County — New Brunswick, Edison, Woodbridge and Perth Amboy. We also work through Morris, Somerset and Monmouth counties." },
      { type: "h2", value: "New York City" },
      { type: "p", value: "All five boroughs: Queens, Brooklyn, Manhattan, the Bronx and Staten Island. Queens and Brooklyn have their own pages above because the building stock in each creates its own install constraints. In Manhattan and the Bronx the work is much the same discipline — ground-floor commercial in mixed-use buildings, cellar racks, shared facades and landlord permission as part of the design." },
      { type: "h2", value: "Westchester & Long Island" },
      { type: "p", value: "Westchester — Yonkers, Mount Vernon, New Rochelle, White Plains and Port Chester. Long Island — Nassau and Suffolk counties, including Hempstead, Valley Stream, Freeport, Great Neck and out through Huntington." },
      { type: "h2", value: "Working across two states" },
      { type: "p", value: "Most of what differs between these places is the building, not the equipment. A Union County strip plaza, a Queens mixed-use storefront and a Gowanus warehouse conversion get three different cable plans, three different mounting approaches and three different sets of permissions — and the same survey-first process. If you run more than one site across New Jersey and New York, that is an advantage: one contractor, consistent equipment across locations, and footage from every site in one app." },
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "Do you charge differently for the city?", a: "Access is what moves a price, not which side of the river you are on. Parking and loading restrictions, lift access for high ceilings, roof access through a shared building and out-of-hours working all affect labour, and all of them are identified at the survey so the proposal is the price." },
        { q: "We have sites in both New Jersey and New York. Can you do all of them?", a: "Yes, and it is worth consolidating. The same equipment across every site means one app, one way of doing things and one contractor to call, instead of a different installer and a different system per location." },
        { q: "Is our town covered if it is not listed?", a: "Probably. The lists above are the areas we are in most often, not a boundary. Call {{phone}} and ask about your address." },
        { q: "Where are you based?", a: "Little Ferry, in Bergen County, New Jersey — just off the Turnpike, which is what makes both northern New Jersey and the city practical to cover." },
      ] },
      { type: "links", value: "Services", items: [
        ...serviceLinks(),
        { to: "services", label: "All services", note: "Everything IOT TECHS installs, in one place." },
      ] },
    ],
  },
];
