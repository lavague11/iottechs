// Location pages — PURE DATA (no DB, no imports), rendered by app/[...seoSlug]/page.jsx.
//
// A location page only earns its place if it says something that is TRUE OF THAT PLACE and not of the
// others. A page that swaps the city name into the same paragraph is a doorway page: Google treats it
// as thin duplicate content and it drags the rest of the site down with it. So each page below carries
// its own real geography (corridors, neighbourhoods, the business mix that is actually there) and its
// own install constraints — what the buildings in that place are made of and what that does to a cable
// route. tests/seo-content.test.mjs enforces this: it fails if the location pages share paragraphs.
//
// Claim discipline is the same as services.js: capabilities from the verified fact store, plus general
// trade practice. No install counts, no client names, no licence numbers, no response or travel times.
// {{phone}} / {{email}} / {{phoneDigits}} are substituted from publicFacts() at render time.
//
// The base town (Little Ferry, NJ) is named because it is a verified public fact and matches the Google
// Business Profile. The STREET ADDRESS is deliberately never rendered on these pages — owner's call.

const PROCESS = [
  { type: "h2", value: "How a project runs" },
  { type: "ol", items: [
    "On-site site survey — we come to the property, photograph it and mark every device position on a floor plan or an aerial view.",
    "System design — device counts, mounting heights, fields of view, cable routes and recorder sizing.",
    "Written proposal — itemised equipment and labour, reviewed and signed online.",
    "Installation — cabling, mounting, aiming, configuration and setup on your phone.",
    "Walkthrough and sign-off — the finished system checked with you on screen before the job closes.",
  ] },
];

const SERVICE_LINKS = [
  { to: "commercial-security-camera-installation", label: "Security cameras" },
  { to: "commercial-access-control", label: "Access control" },
  { to: "commercial-alarm-systems", label: "Alarm systems" },
  { to: "commercial-networking-wifi", label: "Networking & Cat6" },
  { to: "commercial-sound-systems", label: "Sound systems" },
  { to: "restaurant-technology-installation", label: "Restaurant & Toast POS" },
];

export const LOCATION_PAGES = [
  // ------------------------------------------------------------- Union, NJ
  {
    slug: "security-camera-installation-union-nj",
    page_type: "location",
    title: "Security Camera Installation in Union, NJ",
    primary_topic: "Camera, access control and cabling installation across Union Township and Union County.",
    primary_keyword: "security camera installation union nj",
    search_intent: "local",
    service: "Commercial security camera installation",
    location: "Union, New Jersey",
    areas: ["Union Township, NJ", "Union County, NJ"],
    meta_title: "Security Camera Installation in Union, NJ | IOT TECHS",
    meta_description: "Security camera, access control and cabling installation in Union, NJ and Union County — Route 22 dealerships, Union Center retail, warehouses and restaurants.",
    cta: { label: "Build your camera quote", href: "/build" },
    body: [
      { type: "p", value: "IOT TECHS installs commercial camera systems, access control, alarms and network cabling for businesses in Union Township and across Union County. We are based in Little Ferry, New Jersey, and Union is a regular working area — the Route 22 corridor in particular, where the dealerships, collision centres and retail plazas sit." },
      { type: "h2", value: "Where we work in and around Union" },
      { type: "p", value: "Union Township itself — Union Center, Vauxhall, Battle Hill, Townley, the Morris Avenue and Stuyvesant Avenue business strips, the Route 22 frontage and the Vauxhall Road light-industrial blocks, including businesses around Kean University." },
      { type: "p", value: "Across Union County we cover Elizabeth, Linden, Hillside, Springfield, Kenilworth, Roselle and Roselle Park, Cranford, Clark, Rahway, Westfield, Scotch Plains, Mountainside, Summit, Berkeley Heights and Plainfield." },
      { type: "h2", value: "What businesses here install" },
      { type: "p", value: "Union's commercial mix drives what gets specified. Route 22 is an auto corridor, so a large share of the work is dealership and collision-centre systems: inventory coverage across open lots, licence plate reader cameras at the entrances and exits, and cameras on the service drive and the parts counter. Those are high-value outdoor lots that sit unattended overnight, which makes lot coverage and plate capture the two things worth getting right." },
      { type: "p", value: "The retail strips along Morris Avenue, Stuyvesant Avenue and Springfield Avenue are smaller storefront systems — till coverage, the front and rear doors, and the stockroom. The Vauxhall Road and Route 22 industrial blocks are warehouse systems: loading docks, yard gates, racking aisles and the staff entrance. Restaurants in Union Center take the full fit-out, with Toast point-of-sale cabling and zoned sound alongside the cameras." },
      { type: "h2", value: "What is different about installing in Union" },
      { type: "p", value: "The Route 22 properties are large, flat and open, and that changes the whole design. Cameras have long distances to cover and nothing to mount on in the middle of a lot, so coverage usually depends on pole and building-edge positions with the right lens for the distance — and on what the lot lighting actually does after dark. A lot that looks well lit at six o'clock can have black corners at midnight, and that gets checked at the survey rather than discovered later." },
      { type: "p", value: "The older retail buildings along the avenues are masonry with flat roofs and no usable ceiling void, which means surface conduit, core drilling through brick and properly sealed roof penetrations rather than cable tucked above a tile grid. It is slower work than a modern suspended ceiling and it is the difference between an install that stays watertight and one that does not." },
      { type: "p", value: "Most of the strip plazas are multi-tenant. An exterior camera on a shared facade, or a cable route through a shared service corridor or demarc room, usually needs the landlord's agreement before anything is drilled — so we identify that at the survey and tell you what permission the job needs while it is still a quote." },
      ...PROCESS,
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "Do you cover the whole of Union County?", a: "Yes — Union Township, Elizabeth, Linden, Hillside, Springfield, Kenilworth, Roselle, Cranford, Rahway, Westfield and the rest of the county, alongside the wider New Jersey and New York metro area." },
        { q: "Can you read licence plates on a dealership lot?", a: "Yes, with licence plate reader cameras, which are a different specification from general lot cameras — they are aimed at a defined lane at a set distance and angle, so the plate is legible rather than just present in a wide shot. The entrances, exits and service drive are the positions that usually matter." },
        { q: "Our building is brick with no drop ceiling. Is that a problem?", a: "No, it is normal along the Union avenues. It means surface conduit and core drilling instead of running cable above a ceiling grid, which we plan at the survey so the routes are agreed before any work starts." },
        { q: "We rent a unit in a strip plaza — can we still install cameras outside?", a: "Usually, with the landlord's agreement for anything on a shared facade or through a shared service area. We flag exactly what consent the design needs while it is still a proposal, so nothing stalls mid-install." },
      ] },
      { type: "links", value: "Services", items: SERVICE_LINKS },
      { type: "links", value: "Other areas", items: [
        { to: "security-camera-installation-queens-ny", label: "Queens, NY" },
        { to: "security-camera-installation-brooklyn-ny", label: "Brooklyn, NY" },
        { to: "locations", label: "Full service area" },
      ] },
    ],
  },

  // ------------------------------------------------------------ Queens, NY
  {
    slug: "security-camera-installation-queens-ny",
    page_type: "location",
    title: "Security Camera Installation in Queens, NY",
    primary_topic: "Camera, access control and cabling installation across Queens.",
    primary_keyword: "security camera installation queens ny",
    search_intent: "local",
    service: "Commercial security camera installation",
    location: "Queens, New York",
    areas: ["Queens, NY", "New York City"],
    meta_title: "Security Camera Installation in Queens, NY | IOT TECHS",
    meta_description: "Security camera, access control and cabling installation across Queens — Northern Boulevard auto shops, Astoria and Flushing restaurants, Maspeth warehouses.",
    cta: { label: "Build your camera quote", href: "/build" },
    body: [
      { type: "p", value: "IOT TECHS installs commercial camera systems, access control, alarms and network cabling for businesses across Queens. Queens is a borough of small commercial buildings on busy corridors, and the work here is shaped much more by the buildings than by the equipment." },
      { type: "h2", value: "Where we work in Queens" },
      { type: "p", value: "Astoria and Long Island City, Sunnyside and Woodside, Jackson Heights, Elmhurst and Corona, Flushing, College Point and Whitestone, Bayside and Fresh Meadows, Forest Hills, Rego Park and Kew Gardens, Ridgewood, Maspeth, Middle Village and Glendale, Jamaica and Queens Village, Richmond Hill, Woodhaven, Ozone Park and Howard Beach, and the Rockaways." },
      { type: "p", value: "The corridors we are on most are Northern Boulevard, Steinway Street, Roosevelt Avenue, Queens Boulevard, Jamaica Avenue, Myrtle Avenue, Main Street in Flushing and Austin Street in Forest Hills, plus the industrial blocks in Maspeth, Long Island City, College Point and Ozone Park." },
      { type: "h2", value: "What businesses here install" },
      { type: "p", value: "Queens has a very dense automotive trade — body shops, repair shops and dealerships along Northern Boulevard, around Willets Point and through Jamaica — and those sites want yard and bay coverage, plate capture at the gate, and cameras on the parts store. The restaurant density is just as high: Astoria, Flushing, Jackson Heights and Elmhurst, where jobs are usually the full low-voltage fit-out, with Toast point-of-sale cabling, kitchen displays, Wi-Fi and cameras over the tills on one visit." },
      { type: "p", value: "The Maspeth and Long Island City industrial blocks are warehouse and distribution systems: dock doors, yard gates, racking aisles and the staff entrance. The storefront retail along Steinway, Roosevelt, Jamaica and Myrtle is smaller — tills, both doors, the stockroom — but almost always in a building that makes the cabling the hard part." },
      { type: "h2", value: "What is different about installing in Queens" },
      { type: "p", value: "Most Queens commercial space is the ground floor of a mixed-use building with apartments above it, and that single fact decides the job. The roof is not yours, the facade is shared, and a cable route to a rear or upper position crosses residential space — so exterior work and roof access need the building owner's permission, not just yours. We establish that at the survey, because finding it out on install day costs a day." },
      { type: "p", value: "The buildings are attached, with party walls and no side access. There is no running a cable around the outside of the building: routes go out the front, through the cellar, or not at all. Cellars are also where the electrical service, the demarc and usually the recorder end up — and where mobile signal dies completely, so the recorder has to be on wired network rather than anything that assumes a phone signal." },
      { type: "p", value: "Two Queens-specific obstructions catch exterior camera views. The elevated lines — the 7 above Roosevelt Avenue, the J and M above Jamaica Avenue — put structure, deep shade and hard backlight across a storefront, and a camera aimed into that without the right exposure handling produces a silhouette instead of a face. Sidewalk sheds are the other one: scaffolding goes up for facade work and sits there for months, and any camera mounted behind it is looking at plywood. Both are placement problems, solved by choosing the position with them in mind." },
      { type: "p", value: "Nearly every storefront has a roll-down security gate, which is the thing most often got wrong. A camera or a reader mounted where the gate runs gets destroyed within a month, and a camera behind a closed gate sees a steel shutter all night. Positions go beside or above the gate housing, clear of the track." },
      ...PROCESS,
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "Our shop is below apartments. Can we still put cameras outside?", a: "Usually, with the building owner's permission for anything on the shared facade or involving roof access. It is the most common situation in Queens, so we check it at the survey and tell you what consent the design needs while it is still a proposal." },
        { q: "The elevated train is right outside — will the cameras be any good?", a: "Yes, if the positions account for it. The problems are the structure blocking the view and the hard contrast between deep shade and bright street, so we pick positions and camera specifications that handle that backlight rather than mounting into it and hoping." },
        { q: "There is scaffolding up on our building. Should we wait?", a: "Not necessarily. We would rather plan around it — some positions can be installed now and still be clear when the shed comes down, and others are better deferred. A survey will tell you which is which for your frontage." },
        { q: "Where do the cameras get recorded?", a: "Normally the cellar or a back office, in a rack with battery backup. Those spaces have no usable mobile signal, so the recorder runs on wired network, which is part of why the cabling gets designed properly rather than improvised." },
        { q: "Can you park and work on a busy corridor?", a: "Yes. Loading and parking on Northern Boulevard, Roosevelt Avenue and Main Street are genuinely a scheduling factor, so the install is planned around the hours that work for your block and your trading times." },
      ] },
      { type: "links", value: "Services", items: SERVICE_LINKS },
      { type: "links", value: "Other areas", items: [
        { to: "security-camera-installation-brooklyn-ny", label: "Brooklyn, NY" },
        { to: "security-camera-installation-union-nj", label: "Union, NJ" },
        { to: "locations", label: "Full service area" },
      ] },
    ],
  },

  // ---------------------------------------------------------- Brooklyn, NY
  {
    slug: "security-camera-installation-brooklyn-ny",
    page_type: "location",
    title: "Security Camera Installation in Brooklyn, NY",
    primary_topic: "Camera, access control and cabling installation across Brooklyn.",
    primary_keyword: "security camera installation brooklyn ny",
    search_intent: "local",
    service: "Commercial security camera installation",
    location: "Brooklyn, New York",
    areas: ["Brooklyn, NY", "New York City"],
    meta_title: "Security Camera Installation in Brooklyn, NY | IOT TECHS",
    meta_description: "Security camera, access control and cabling installation across Brooklyn — Williamsburg and Bushwick bars, Industry City warehouses, Atlantic Avenue retail.",
    cta: { label: "Build your camera quote", href: "/build" },
    body: [
      { type: "p", value: "IOT TECHS installs commercial camera systems, access control, alarms and network cabling for businesses across Brooklyn. Brooklyn's building stock splits sharply between nineteenth-century rowhouse commercial frontage and converted industrial space, and the two need completely different installs." },
      { type: "h2", value: "Where we work in Brooklyn" },
      { type: "p", value: "Williamsburg and Greenpoint, Bushwick and East Williamsburg, Bedford-Stuyvesant, Crown Heights and Prospect Heights, Downtown Brooklyn, DUMBO, Brooklyn Heights, Fort Greene and Clinton Hill, Park Slope, Gowanus, Carroll Gardens and Red Hook, Sunset Park and Industry City, Bay Ridge, Dyker Heights and Bensonhurst, Borough Park, Flatbush and Midwood, Sheepshead Bay, Brighton Beach and Coney Island, Canarsie, Brownsville and East New York." },
      { type: "p", value: "The corridors we are on most are Atlantic Avenue, Flatbush Avenue, Bedford Avenue, Myrtle Avenue, Fifth Avenue in Park Slope, Smith and Court Streets, Nostrand Avenue and 86th Street in Bay Ridge, plus the industrial blocks in Industry City, Gowanus, Red Hook, the Navy Yard and along Flushing Avenue." },
      { type: "h2", value: "What businesses here install" },
      { type: "p", value: "Brooklyn's hospitality density drives a lot of the work — bars, restaurants and breweries in Williamsburg, Bushwick, Park Slope and Gowanus, where a job is typically the whole low-voltage package: point-of-sale cabling, cameras over the bar and the tills, zoned sound for a room that needs background music at six and something else at eleven, and Wi-Fi that holds up when the room is full." },
      { type: "p", value: "The converted industrial buildings — Industry City, Gowanus, Red Hook, the Navy Yard, East Williamsburg — are warehouse, studio, workshop and light-manufacturing systems: loading doors, freight lifts, yard gates, floor coverage across open space, and access control on a tenancy that may be one floor of a much larger building. The retail frontage on Atlantic, Flatbush, Nostrand and 86th Street is storefront work, and the fitness and sports facilities around Gowanus and Sunset Park want wide floor coverage and entry control on an unstaffed door." },
      { type: "h2", value: "What is different about installing in Brooklyn" },
      { type: "p", value: "Brooklyn has a lot of landmarked historic districts — Brooklyn Heights, DUMBO, Park Slope, Fort Greene, Cobble Hill and Carroll Gardens among them — and in those districts what you may fix to a facade is genuinely restricted. The approach is to mount under cornices and soffits, in reveals, and through existing penetrations rather than drilling a protected elevation, and to choose positions that are discreet because they have to be. It is a design constraint worth knowing about before a camera is specified, not after." },
      { type: "p", value: "Rowhouse and brownstone commercial space is brick, attached on both sides, with no attic and no side access. Cable goes through the cellar or up the front, and the cellar is where the rack ends up. In the converted industrial buildings the opposite problem applies: ceilings of twenty to thirty feet, exposed brick and timber, and no void to hide anything in — so everything is surface conduit, and mounting at height needs a lift, which belongs in the plan and the schedule rather than being discovered on the day." },
      { type: "p", value: "Flooding is a real Brooklyn design input. Red Hook, Gowanus, parts of Sunset Park, Sheepshead Bay and Coney Island are low-lying, and the default position for a recorder — on the floor of a cellar — is the worst place for it in those neighbourhoods. Racks go up on the wall, off the floor, and the one piece of equipment holding all your footage does not sit in the first six inches of a basement." },
      { type: "p", value: "Shared buildings and multi-floor tenancies make permission part of the job. If your unit is one floor of a converted warehouse, roof access and risers belong to the building, and the route from your floor to a roof position has to be agreed. We work that out at the survey so the proposal reflects what is actually possible." },
      ...PROCESS,
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "We are in a landmarked district. Can we have exterior cameras?", a: "Generally yes, but where and how they are fixed matters, and some facade work is restricted. The workable approach is discreet positions under cornices and soffits, in reveals, and through existing penetrations. We design to that from the survey rather than specifying a position that cannot be used." },
        { q: "Our ceilings are twenty-five feet and exposed. How does that work?", a: "Surface conduit on the structure, and a lift to mount at height. It is standard for Industry City, Gowanus and the Navy Yard conversions — it just needs to be in the plan, because access equipment affects both the price and the schedule." },
        { q: "We flooded before. Where should the recorder go?", a: "Off the floor, on a wall-mounted rack, and not in the lowest part of a cellar. In Red Hook, Gowanus, Sheepshead Bay and Coney Island that is the single most important placement decision in the system, because it is the box that holds everything you would want afterwards." },
        { q: "We rent one floor of a larger building. Can we get to the roof?", a: "That depends on the building, and it is a question to settle before the design is finished. We identify at the survey what needs the landlord's agreement, so the proposal only contains positions that can actually be installed." },
        { q: "Can you install around our opening hours?", a: "Yes, and for bars and restaurants it is usually the right way to do it. Tell us the hours that cannot be touched and the work is planned around them." },
      ] },
      { type: "links", value: "Services", items: SERVICE_LINKS },
      { type: "links", value: "Other areas", items: [
        { to: "security-camera-installation-queens-ny", label: "Queens, NY" },
        { to: "security-camera-installation-union-nj", label: "Union, NJ" },
        { to: "locations", label: "Full service area" },
      ] },
    ],
  },
];
