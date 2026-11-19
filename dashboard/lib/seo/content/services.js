// Service pages — the money pages. PURE DATA (no DB, no imports), rendered by app/[...seoSlug]/page.jsx.
//
// Why these live in code and not in seo_pages: the SEO engine's tables are part of the app database,
// which is per-environment — authoring a page locally would never reach production. Code pages deploy
// with the repo, are reviewable in a diff, and are covered by tests. The engine keeps its role for
// AI-drafted pages: a PUBLISHED seo_pages row at the same slug always wins over the entry here.
//
// Slugs deliberately match lib/seo.js PLAN_PAGES so the engine's seeded opportunity rows and these
// pages are the SAME URL — never two pages competing for one keyword.
//
// CLAIM DISCIPLINE. Everything here is either (a) a capability recorded as a verified, public-use fact
// in the fact store (lib/seo/schema.js seedFacts), or (b) general trade practice. Deliberately absent,
// because nothing verifies them yet: years in business, install counts, client names, licence numbers,
// prices, warranty length, response times, "licensed and insured", "free". NAP is never written as a
// literal — {{phone}} / {{email}} are substituted from publicFacts() at render time.

// Shared tail blocks. The project lifecycle below is the one this app actually runs (site survey →
// proposal → install → close-out), so it is a description of the real process, not marketing copy.
const PROCESS = [
  { type: "h2", value: "How a project runs" },
  { type: "ol", items: [
    "On-site site survey. We walk the property, photograph it and mark every device position on a floor plan or an aerial view of the building — not a guess made over the phone.",
    "System design. Device counts, mounting heights, fields of view, cable routes and recorder or panel sizing, all set against the survey.",
    "Written proposal. Itemised equipment and labour, reviewed and signed online, with a copy kept against the job.",
    "Installation. Cabling, mounting, aiming, configuration and setup on your phone, done around your opening hours where the site needs it.",
    "Walkthrough and sign-off. We go through the finished system with you on screen before the job is closed out.",
  ] },
];

const survey = (what) => ({ type: "callout", value: `Every quote starts with an on-site survey. ${what} We would rather spend an hour on site than price a system from a phone call.` });

export const SERVICE_PAGES = [
  // ---------------------------------------------------------------- cameras
  {
    slug: "commercial-security-camera-installation",
    page_type: "service",
    title: "Commercial Security Camera Installation",
    primary_topic: "Camera system design, cabling and installation for businesses across New Jersey and New York.",
    primary_keyword: "commercial security camera installation",
    search_intent: "transactional",
    service: "Commercial security camera installation",
    meta_title: "Commercial Security Camera Installation | NJ & NYC",
    meta_description: "Commercial security camera installation across New Jersey and New York City — on-site survey, Cat6 cabling, recorder setup and live footage on your phone.",
    cta: { label: "Build your camera quote", href: "/build" },
    body: [
      { type: "p", value: "IOT TECHS installs commercial camera systems for businesses across New Jersey and the New York City metro — dealerships and collision centres, restaurants and bars, retail storefronts, warehouses, offices and multi-tenant buildings. Every system is cabled, recorded and configured on site, and every job starts with somebody walking the property." },
      { type: "h2", value: "What a commercial install includes" },
      { type: "ul", items: [
        "Camera selection per position — turret, dome, bullet, multi-sensor or panoramic, chosen for the distance and the light at that spot rather than one model everywhere.",
        "Cat6 cabling to every camera, run in the building's own pathways and terminated properly at both ends.",
        "A network video recorder sized to the camera count and to how far back you need to look, with the drives to hold it.",
        "PoE switching and a UPS so the recorder and the cameras ride out a short power cut instead of losing the footage you need.",
        "Phone and desktop access, set up and tested with you before we leave.",
        "Exterior work where the site needs it — weather-rated housings, sealed penetrations and conduit on exposed runs.",
      ] },
      { type: "h2", value: "Getting the cabling and recording right" },
      { type: "p", value: "Most camera systems that disappoint their owners do so for reasons that were decided before anything was mounted. Recording retention is set by drive capacity against camera count, resolution and frame rate — ask for thirty days on sixteen cameras and the recorder has to be specified for thirty days, not sold as \"expandable\". A recorder with free bays is not the same as a recorder with the storage in it." },
      { type: "p", value: "Camera positions matter as much as camera specifications. A camera that covers a whole car park identifies nobody; the useful positions are the ones people have to walk through — doors, tills, service counters, loading bays, the gate. Mounting height is the other half of it: high enough to be out of reach, low enough to get a face rather than the top of a head." },
      { type: "p", value: "Exterior runs and shared buildings are where the real constraints appear. Masonry, brick and landmarked facades each take a different fixing. In a multi-tenant building an exterior cable route usually needs the landlord's agreement before it needs a drill. Those are survey questions, which is why the survey comes first." },
      survey("We measure the distances, check the light at the positions you care about, and find the cable routes."),
      { type: "h2", value: "Watching the system yourself" },
      { type: "p", value: "The systems we install record continuously and give you live and recorded footage on your phone, with motion and alarm alerts pushed to you. This is self-monitoring: you hold the access, you get the alerts, and you decide what to do with them. IOT TECHS does not run a central monitoring station, and no page here will tell you otherwise." },
      ...PROCESS,
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "How many cameras does my business need?", a: "Fewer than most quotes assume, placed better. The count comes from the positions that actually matter — every entrance and exit, every till or service counter, the loading area, the yard or lot, and any blind corner where stock or cash sits. The survey produces that list; the camera count follows from it." },
        { q: "How long will the system keep footage?", a: "As long as the recorder is specified for. Retention is a function of camera count, resolution, frame rate and drive capacity, so it is a number we work out with you during design and then build to — thirty days on a small system is routine, and longer is a storage decision rather than a different system." },
        { q: "Can I see the cameras on my phone?", a: "Yes. Live and recorded footage, from multiple sites if you have more than one, with motion and alarm notifications. We set the apps up and test them with you at the walkthrough rather than emailing you a login afterwards." },
        { q: "Can you work outside our opening hours?", a: "On most sites, yes, and on restaurants and retail it is usually the sensible way to do it. Tell us the hours that cannot be disturbed and the install is planned around them." },
        { q: "Do you service systems you did not install?", a: "Often. If an existing system has failed, send us the details through the camera repair page and we will tell you honestly whether it is worth repairing or replacing." },
      ] },
      { type: "links", value: "Related", items: [
        { to: "commercial-networking-wifi", label: "Networking & Cat6 cabling", note: "The network the cameras and recorder sit on." },
        { to: "commercial-access-control", label: "Access control", note: "Door entry, tied to the same cabling." },
        { to: "security-camera-installation-union-nj", label: "Union, NJ" },
        { to: "security-camera-installation-queens-ny", label: "Queens, NY" },
        { to: "security-camera-installation-brooklyn-ny", label: "Brooklyn, NY" },
        { to: "report-issue", label: "Camera repair", note: "An existing system that has stopped working." },
      ] },
    ],
  },

  // -------------------------------------------------------- restaurant / POS
  {
    slug: "restaurant-technology-installation",
    page_type: "service",
    title: "Restaurant Technology & Toast POS Installation",
    primary_topic: "Cabling, point-of-sale, cameras and sound for restaurants, bars and cafés.",
    primary_keyword: "restaurant toast pos installation",
    search_intent: "transactional",
    service: "Restaurant technology and Toast POS installation",
    meta_title: "Restaurant Technology & Toast POS Installation | NJ & NYC",
    meta_description: "Toast POS cabling, kitchen displays, restaurant cameras, Wi-Fi and sound across New Jersey and New York City — one contractor for the whole low-voltage fit-out.",
    cta: { label: "Build your Toast quote", href: "/build/toast" },
    body: [
      { type: "p", value: "A restaurant opening needs one low-voltage contractor, not four. IOT TECHS cables and installs the point-of-sale, the kitchen displays, the cameras, the Wi-Fi and the music across restaurants, bars, cafés and takeaways in New Jersey and New York City — and sequences the work so it lands with the build rather than after it." },
      { type: "h2", value: "What we install in a restaurant" },
      { type: "ul", items: [
        "Toast POS terminals, handhelds and kitchen display screens, cabled and mounted — front counter, server stations, bar, expo and kitchen.",
        "Receipt and kitchen printer drops, including the runs to the line that are always forgotten until opening week.",
        "Cat6 structured cabling to every terminal, screen, printer and access point, with a tidy terminated rack rather than a knot above the ceiling.",
        "Commercial Wi-Fi sized for handhelds on the floor and separated from the guest network.",
        "Cameras covering the tills, the bar, the back door, the walk-in and the dining room.",
        "Background music and paging through a zoned sound system, so the bar and the dining room are not stuck at one volume.",
      ] },
      { type: "h2", value: "What makes a kitchen different" },
      { type: "p", value: "Kitchens are hot, greasy and wet, and they are cleaned with hoses and degreaser. Equipment that is fine in an office fails in a month over a line. Screens and terminals near cooking need to be positioned out of the steam path and the spray path, printers need to be reachable without crossing the pass, and cable needs to be routed where it will not be cooked or scrubbed." },
      { type: "p", value: "The other restaurant-specific problem is the cellar and the back of house. Offices, walk-ins and basements are exactly where phone signal dies and exactly where the recorder and the rack end up, so those positions have to be served by wired network rather than assumed to be covered." },
      { type: "p", value: "Cameras over a till do a specific job in a restaurant: they let you put a transaction and a picture of the counter at that moment side by side. That only works if the camera is aimed at the drawer and the hands rather than at the room, which is a placement decision made during the survey." },
      survey("For a fit-out we work from the kitchen layout and the floor plan so the drops are in before the walls close."),
      ...PROCESS,
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "We are opening in a few weeks — is that enough time?", a: "Usually, if the cabling can start before the walls and ceilings close. The sequence that causes trouble is tiling and painting finishing first and the data drops being chased afterwards. Call as soon as you have a floor plan, even a rough one." },
        { q: "Do you work with Toast specifically?", a: "Yes — Toast terminals, handhelds and kitchen displays are a system we cable and install regularly, and there is a Toast quote builder on this site. We also cable other point-of-sale platforms; the cabling and the mounting are the same discipline." },
        { q: "Can you do the cameras and the POS on one job?", a: "That is the point. One survey, one proposal, one crew and one set of cable routes, rather than three contractors each drilling the same wall on a different day." },
        { q: "Can the music be different in the bar and the dining room?", a: "Yes, with a zoned amplifier — that is the normal arrangement for a room that wants background music at lunch and something louder at the bar later." },
      ] },
      { type: "links", value: "Related", items: [
        { to: "commercial-security-camera-installation", label: "Security cameras" },
        { to: "commercial-networking-wifi", label: "Networking & Cat6" },
        { to: "commercial-sound-systems", label: "Sound systems" },
        { to: "security-camera-installation-queens-ny", label: "Queens, NY" },
        { to: "security-camera-installation-brooklyn-ny", label: "Brooklyn, NY" },
      ] },
    ],
  },

  // --------------------------------------------------------- access control
  {
    slug: "commercial-access-control",
    page_type: "service",
    title: "Commercial Access Control",
    primary_topic: "Door entry, readers and locks for businesses in New Jersey and New York.",
    primary_keyword: "commercial access control installation",
    search_intent: "transactional",
    service: "Commercial access control",
    meta_title: "Commercial Access Control Installation | NJ & NYC",
    meta_description: "Access control installation for businesses across New Jersey and New York City — readers, maglocks, strikes, and credentials you can revoke the same day.",
    cta: { label: "Talk it through", href: "tel:{{phoneDigits}}" },
    body: [
      { type: "p", value: "Access control replaces the key you cannot get back. IOT TECHS installs door entry for offices, warehouses, dealerships, clinics and multi-tenant buildings across New Jersey and New York City — readers, locks, controllers and the cabling behind them, set up so you can add or revoke somebody's access the day they start or leave." },
      { type: "h2", value: "What we install" },
      { type: "ul", items: [
        "Card, fob and mobile credential readers at the doors that need to be controlled — main entrance, back of house, stockroom, server room, yard gate.",
        "Electric strikes, maglocks and electrified hardware matched to the door and the frame you actually have.",
        "Controllers and power supplies in a proper enclosure, with battery backup so a power cut does not become a locked-out morning.",
        "Request-to-exit devices, door position contacts and automatic door releases where the exit arrangement requires them.",
        "Intercom and video entry at doors where somebody has to be identified before being let in.",
        "Scheduling and credential administration, handed over to you working rather than left as a default.",
      ] },
      { type: "h2", value: "The door decides the hardware" },
      { type: "p", value: "The single biggest variable on an access control job is the door itself. A hollow metal door in a steel frame, a timber door in a timber frame, an aluminium storefront with a narrow stile and a glass door with a patch fitting all take different locking hardware, and the wrong choice either fails to hold or stops the door closing properly. Getting that right is a survey job — somebody has to look at the frame, the closer, the existing hardware and the way the door swings." },
      { type: "p", value: "Egress is the constraint that cannot be negotiated. People have to be able to get out of a building under power failure and under alarm, and the locking arrangement, the release device and the fire alarm interface all have to serve that. We design to it and we say so plainly, because it is the part of an access control system that matters most on the worst day." },
      { type: "p", value: "Access control is also at its most useful alongside cameras. A door event tells you a credential was used; the camera over that door tells you who used it. Cabled together on one survey and one cable plan, the two answer a question neither answers alone." },
      survey("We check every door's frame, closer and hardware before specifying a lock for it."),
      ...PROCESS,
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "Can we use phones instead of cards?", a: "Yes — mobile credentials are standard now, and they solve the problem cards never did: nobody lends their phone, and a leaver's access is switched off centrally rather than chased around the building." },
        { q: "What happens in a power cut?", a: "The controllers and the locking hardware are specified with battery backup, and the egress arrangement is designed to let people out regardless. We walk you through exactly what each door does under power failure at the handover, because that is the question worth knowing the answer to in advance." },
        { q: "Can we control just one or two doors?", a: "Yes, and it is a common starting point — the back door and the stockroom, or the main entrance and the server room. The design leaves room to add doors later without replacing the controller." },
        { q: "Can it work with our cameras?", a: "Yes, and it should. We install both, so the door positions and the camera positions are planned together instead of arriving as two separate systems with two separate cable runs." },
      ] },
      { type: "links", value: "Related", items: [
        { to: "commercial-security-camera-installation", label: "Security cameras" },
        { to: "commercial-alarm-systems", label: "Alarm systems" },
        { to: "commercial-networking-wifi", label: "Networking & Cat6" },
        { to: "security-camera-installation-union-nj", label: "Union, NJ" },
      ] },
    ],
  },

  // ----------------------------------------------------------------- alarms
  {
    slug: "commercial-alarm-systems",
    page_type: "service",
    title: "Commercial Alarm Systems",
    primary_topic: "Intrusion detection, panic buttons and alerting for business premises.",
    primary_keyword: "commercial alarm system installation",
    search_intent: "transactional",
    service: "Commercial alarm systems",
    meta_title: "Commercial Alarm System Installation | NJ & NYC",
    meta_description: "Commercial alarm installation across New Jersey and New York City — door and window contacts, motion detection, glass-break, panic buttons and alerts to your phone.",
    cta: { label: "Build your alarm quote", href: "/build/adt" },
    body: [
      { type: "p", value: "An alarm system tells you something has happened on your premises while you are not there. IOT TECHS installs intrusion detection for shops, restaurants, warehouses, offices and yards across New Jersey and New York City, with alerts pushed to your phone and the detection laid out around how your building is actually broken into rather than a standard package." },
      { type: "h2", value: "What we install" },
      { type: "ul", items: [
        "Door and window contacts on the perimeter openings, including the back and side doors that get used far less and watched far less.",
        "Motion detection inside, positioned for the routes through the building rather than pointed at the middle of a room.",
        "Glass-break detection on storefronts and ground-floor glazing.",
        "Panic, duress and emergency buttons at tills, reception desks and back offices, fixed or wearable.",
        "Keypads and arming points where staff actually enter and leave, with codes per person so an event has a name against it.",
        "Environmental sensors where a flood or a failed freezer would cost more than a break-in — walk-ins, cellars, server rooms.",
      ] },
      { type: "h2", value: "Where alarms get beaten" },
      { type: "p", value: "Intrusion systems are rarely defeated by clever attacks on the detection; they are defeated by gaps. The rear fire door nobody included, the roof hatch, the shared wall with the empty unit next door, the stockroom window behind the shelving. A perimeter is only a perimeter if everything in it was surveyed, which is why we walk the whole envelope and not just the front." },
      { type: "p", value: "The second failure is the human one. A system that is awkward to arm gets left unarmed, and a system that sends false alarms gets ignored within a fortnight. Keypad placement, sensible entry and exit timing, and detection positioned away from heaters, vents and delivery routes are what make the difference between a system that is armed every night and one that is not." },
      { type: "p", value: "Alarms also work much better next to cameras. An alarm tells you a zone has been triggered; the camera on that zone tells you whether it is a break-in or a cardboard box that fell over. Installed together, they stop you driving across town to find out." },
      { type: "callout", value: "A straight answer on monitoring: the systems we install alert you — push notifications and recorded footage on your phone, with alarm events against the camera that saw them. IOT TECHS does not operate a central or professional monitoring station. If you need a dispatched, operator-answered service, say so early and we will be clear about what we do and do not provide." },
      survey("We walk the full perimeter — including the openings that are not on the plan — before laying out zones."),
      ...PROCESS,
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "Is the alarm monitored by an operator?", a: "Not by us. The systems we install notify you and give you the footage from the camera covering that zone, so you can see what triggered it. We do not run a central station, and we would rather tell you that plainly than let it be assumed." },
        { q: "Can we have a panic button at the till?", a: "Yes — fixed under a counter, at a reception desk, or wearable. It is one of the most worthwhile things to add to a retail or restaurant system and one of the cheapest." },
        { q: "Will it false-alarm?", a: "Not if the detection is placed properly. Most false alarms trace back to a sensor aimed at a heater, a vent, a door that rattles or a delivery route, and those are placement decisions made at the survey rather than problems to be tuned out afterwards." },
        { q: "Can staff have their own codes?", a: "Yes, and they should. Per-person codes mean an arming or disarming event has a name attached, which is the difference between knowing something happened and knowing who was there." },
      ] },
      { type: "links", value: "Related", items: [
        { to: "commercial-security-camera-installation", label: "Security cameras" },
        { to: "commercial-access-control", label: "Access control" },
        { to: "security-camera-installation-brooklyn-ny", label: "Brooklyn, NY" },
        { to: "security-camera-installation-union-nj", label: "Union, NJ" },
      ] },
    ],
  },

  // ------------------------------------------------------ networking / Cat6
  {
    slug: "commercial-networking-wifi",
    page_type: "service",
    title: "Commercial Networking & Wi-Fi",
    primary_topic: "Cat6 structured cabling, switching and business Wi-Fi, installed and documented.",
    primary_keyword: "commercial network cabling wifi installation",
    search_intent: "transactional",
    service: "Commercial networking, Wi-Fi and structured cabling",
    meta_title: "Commercial Networking, Cat6 Cabling & Wi-Fi | NJ & NYC",
    meta_description: "Cat6 structured cabling, switching and commercial Wi-Fi across New Jersey and New York City — proper racks, labelled runs and coverage across the whole building.",
    cta: { label: "Talk it through", href: "tel:{{phoneDigits}}" },
    body: [
      { type: "p", value: "Cameras, access control, point-of-sale and phones all sit on the same network, and when that network is improvised everything above it is unreliable. IOT TECHS installs structured cabling, switching and commercial Wi-Fi across New Jersey and New York City — the layer everything else depends on, built so it can be worked on later." },
      { type: "h2", value: "What we install" },
      { type: "ul", items: [
        "Cat6 structured cabling from a central point to every outlet, terminated on patch panels and labelled at both ends.",
        "Wall-mounted or floor racks with patch panels, switching, power and ventilation, instead of equipment stacked on a shelf.",
        "PoE switching sized for what it has to power — cameras, access points, door controllers, phones — with headroom rather than exactly enough.",
        "Commercial Wi-Fi access points placed from a coverage walk, with separate staff and guest networks.",
        "UPS protection on the rack so a brief outage does not take the recorder, the switch and the till down with it.",
        "A documented install: what is on which port, where each run goes, handed to you at the end.",
      ] },
      { type: "h2", value: "Why consumer kit fails in a business" },
      { type: "p", value: "The router the internet provider supplied is designed for a flat with half a dozen devices. A business asks it to carry camera streams, card payments, handhelds moving around the floor, staff laptops and guest phones at once, and it manages that until the busiest hour of the week. Business switching and access points fail differently: they are specified for the device count and the throughput, and they keep going at the point when it matters." },
      { type: "p", value: "Wi-Fi coverage is the other thing routinely got wrong. Coverage is decided by the building, not the box — masonry, foil-backed insulation, lift shafts, walk-in fridges and a basement office all stop signal cold, and no number of repeaters fixes a path that was never going to work. We walk the building and place access points against what the walls actually do, and anything that cannot be reliably covered gets a cable instead." },
      { type: "p", value: "Labelling and documentation sound like housekeeping and are actually the whole cost of the next job. An unlabelled bundle above a ceiling means every future change starts with tracing cables; a labelled patch panel means it starts with moving one." },
      survey("We walk the building for coverage and cable routes rather than estimating from a floor plan."),
      ...PROCESS,
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "Can you cable a space during a fit-out?", a: "Yes, and that is the cheapest time to do it by a wide margin. Cable run before the walls and ceilings close costs a fraction of the same cable chased in afterwards, so bring us in with the build rather than after it." },
        { q: "Our Wi-Fi drops in part of the building — can you fix it?", a: "Usually, once we have walked it. The common causes are a single access point trying to cover too much, or a wall, fridge or shaft that the signal was never going to cross. The answer is placement and sometimes a cable, not a stronger box." },
        { q: "Do we need a rack?", a: "If you have more than a handful of drops, yes. A rack is what keeps the switching, the patch panel and the recorder serviceable and protected; the alternative is a shelf that nobody can work on safely." },
        { q: "Can you work with our IT provider?", a: "Yes. We install and document the physical layer — cabling, racks, switching, access points — and hand over labelling and port assignments so whoever manages the network can pick it up without reverse-engineering it." },
      ] },
      { type: "links", value: "Related", items: [
        { to: "commercial-security-camera-installation", label: "Security cameras" },
        { to: "restaurant-technology-installation", label: "Restaurant & Toast POS" },
        { to: "commercial-access-control", label: "Access control" },
        { to: "security-camera-installation-queens-ny", label: "Queens, NY" },
      ] },
    ],
  },

  // ------------------------------------------------------------------ audio
  {
    slug: "commercial-sound-systems",
    page_type: "service",
    title: "Commercial Sound Systems",
    primary_topic: "Zoned background music and paging for restaurants, bars, retail and offices.",
    primary_keyword: "commercial sound system installation",
    search_intent: "transactional",
    service: "Commercial sound systems",
    meta_title: "Commercial Sound System Installation | NJ & NYC",
    meta_description: "Zoned background music and paging across New Jersey and New York City — ceiling and surface speakers, multi-zone amplifiers, even coverage without hot spots.",
    cta: { label: "Build your audio quote", href: "/build/audio" },
    body: [
      { type: "p", value: "Background music is part of how a room feels, and most commercial sound is either too loud under one speaker and inaudible under the next, or stuck at a single volume for the whole venue. IOT TECHS installs zoned sound systems for restaurants, bars, retail and offices across New Jersey and New York City — even coverage, independent zones, and paging where it is needed." },
      { type: "h2", value: "What we install" },
      { type: "ul", items: [
        "Ceiling speakers laid out on a spacing that gives even coverage, so the level is the same walking across the room.",
        "Surface and pendant speakers where there is no ceiling to go into — exposed ducting, open joists, high industrial ceilings.",
        "Multi-zone amplification, so the bar, the dining room, the patio and the bathrooms each run at their own level.",
        "Weather-rated speakers for patios, terraces and yards.",
        "Paging and announcement microphones for warehouses, showrooms and back of house.",
        "Simple source and volume control staff can actually use, rather than a rack nobody is allowed to touch.",
      ] },
      { type: "h2", value: "Coverage, not volume" },
      { type: "p", value: "Even coverage is a geometry problem. Speaker spacing follows from ceiling height and the coverage angle of the speaker, and when too few speakers are asked to fill a room the result is predictable: loud directly underneath, thin in between, and a manager turning everything up to fix the quiet spots. More speakers at lower level is almost always the better system, and usually not a more expensive one." },
      { type: "p", value: "Zoning is what makes a venue workable. A dining room that wants conversation at lunch, a bar that wants energy at nine and a patio that has neighbours cannot share one volume control. Separate zones mean nobody has to compromise, and paging can be sent to the back of house without broadcasting it over the guests." },
      { type: "p", value: "Hard rooms need the layout thinking about rather than more power. Tile, glass, concrete and bare ceilings reflect everything, and in a busy restaurant that reflected sound is what makes a room exhausting. Speaker placement and level are the levers we have, and they are set on site with the room running." },
      survey("We measure the ceiling heights and the room's surfaces before setting a speaker layout."),
      ...PROCESS,
      { type: "h2", value: "Common questions" },
      { type: "faq", items: [
        { q: "Can different rooms play at different volumes?", a: "Yes — that is what zoning is for, and for anything with a bar, a dining room and an outdoor area it is the arrangement worth having. Each zone gets its own level, and sources can differ too." },
        { q: "We have no ceiling to mount into — is that a problem?", a: "No. Exposed ducting, open joists and high industrial ceilings are common in converted spaces, and surface or pendant speakers are made for exactly that. The layout changes, the result does not." },
        { q: "Can we use it for announcements?", a: "Yes. Paging can be added as a microphone input and directed at the zones you want it in, which is how warehouses and showrooms usually run it." },
        { q: "Can you install audio at the same time as cameras or cabling?", a: "Yes, and it is worth doing. Speakers, cameras and data drops all follow the same routes above the ceiling, so one visit and one cable plan beats three." },
      ] },
      { type: "links", value: "Related", items: [
        { to: "restaurant-technology-installation", label: "Restaurant & Toast POS" },
        { to: "commercial-networking-wifi", label: "Networking & Cat6" },
        { to: "commercial-security-camera-installation", label: "Security cameras" },
        { to: "security-camera-installation-brooklyn-ny", label: "Brooklyn, NY" },
      ] },
    ],
  },
];
