/* IOT TECHS — room-name taxonomy + intelligent suggestions (local, deterministic, no network).
   window.IOTRooms.suggest({query, propertyType, biz, existingNames, limit}) → [{label, semanticType}]
   window.IOTRooms.titleCase(str) · deriveVertical(biz) · semanticFor(label)
   The library is broad UNDER the UI; the UI only ever shows 3–5 ranked results. */
(function () {
  "use strict";

  // ---- Title Case with acronym / number / hyphen awareness -------------------------------------
  var ACR = { it:"IT", vip:"VIP", hvac:"HVAC", pos:"POS", ada:"ADA", wc:"WC", tv:"TV", av:"AV",
              hr:"HR", ev:"EV", suv:"SUV", atm:"ATM", ac:"AC", ceo:"CEO", qa:"QA", rd:"R&D" };
  function cap(w) { return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w; }
  function tcWord(w) {
    if (!w) return w;
    var low = w.toLowerCase();
    if (ACR[low]) return ACR[low];
    if (/^\d+$/.test(w)) return w;                              // pure number: 1, 204
    if (/\d/.test(w) && /[a-z]/i.test(w)) return w.toUpperCase(); // alnum unit: 2a→2A, b12→B12
    if (w.indexOf("-") > -1) return w.split("-").map(tcWord).join("-");
    if (w.indexOf("/") > -1) return w.split("/").map(tcWord).join("/");
    return cap(w);
  }
  function titleCase(str) {
    var s = String(str == null ? "" : str).replace(/\s+/g, " ").trim();
    if (!s) return "";
    return s.split(" ").map(tcWord).join(" ");
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
  function slug(l) { return norm(l).replace(/\s+/g, "_"); }

  // ---- room libraries (data only — never all shown at once) -------------------------------------
  var UNIVERSAL = ["Office","Hallway","Storage","Bathroom","Restroom","Closet","Entry","Exit","Stairs",
    "Utility Room","Mechanical Room","Electrical Room","IT Room","Server Room","Break Room","Kitchen","Kitchenette"];

  var RESIDENTIAL = ["Living Room","Family Room","Great Room","Dining Room","Breakfast Area","Bedroom",
    "Primary Bedroom","Guest Bedroom","Children's Bedroom","Nursery","Primary Bathroom","Half Bathroom",
    "Powder Room","Laundry Room","Mudroom","Foyer","Entryway","Vestibule","Walk-In Closet","Pantry",
    "Linen Closet","Basement","Finished Basement","Garage","Attached Garage","Detached Garage","Landing",
    "Home Office","Study","Library","Den","Loft","Bonus Room","Playroom","Game Room","Media Room","Theater",
    "Home Gym","Sunroom","Conservatory","Patio","Porch","Deck","Balcony","Terrace","Pool House","Wine Cellar",
    "Workshop","Craft Room","Music Room","Driveway","Garden","Shed"];

  var COMMERCIAL = ["Reception","Lobby","Waiting Area","Private Office","Main Office","Manager Office",
    "Executive Office","Open Office","Conference Room","Meeting Room","Training Room","Men's Restroom",
    "Women's Restroom","ADA Restroom","Corridor","Vestibule","Main Entry","Rear Entry","Side Entry","Elevator",
    "Elevator Lobby","Supply Room","Janitor Closet","Maintenance Room","Loading Area","Loading Dock","Warehouse",
    "Stock Room","Receiving","Shipping","Security Office","Security Desk","Cash Office","Customer Service",
    "Employee Area","Telecom Room","Network Room"];

  var VERT = {
    automotive: ["Showroom","Customer Waiting Area","Sales Office","Finance Office","Service Desk",
      "Service Reception","Mechanic Bay","Service Bay","Repair Bay","Alignment Bay","Detail Bay","Wash Bay",
      "Inspection Bay","Parts Department","Parts Room","Parts Storage","Tool Room","Tire Storage","Equipment Room",
      "Vehicle Storage","Indoor Parking","Delivery Area","Vehicle Pickup","Vehicle Drop-Off","Service Entrance",
      "Receiving","Shop","Workshop"],
    restaurant: ["Dining Room","Dining Area","Main Dining","Private Dining","Bar","Bar Area","Prep Kitchen",
      "Prep Area","Cook Line","Cold Prep","Dish Area","Dishwashing","Walk-In Cooler","Walk-In Freezer","Dry Storage",
      "Food Storage","Pantry","Server Station","Host Stand","Pickup Area","Takeout","POS Station","Trash Area","Receiving"],
    retail: ["Sales Floor","Showroom","Checkout","Cash Wrap","Customer Service","Fitting Room","Stock Room",
      "Back Office","Receiving","Warehouse","Display Area","Pickup Area","Returns","Security Office"],
    office: ["Reception","Lobby","Waiting Area","Open Office","Private Office","Executive Office","Manager Office",
      "Conference Room","Meeting Room","Huddle Room","Training Room","Boardroom","Mail Room","Copy Room","File Room",
      "Elevator Lobby"],
    industrial: ["Warehouse","Receiving","Shipping","Loading Dock","Loading Area","Production","Assembly","Packing",
      "Pick Area","Inventory","Stock Room","Cold Storage","Freezer","Equipment Room","Maintenance","Workshop",
      "Supervisor Office","Security"],
    hospitality: ["Lobby","Reception","Front Desk","Concierge","Guest Room","Suite","Housekeeping","Laundry",
      "Ballroom","Meeting Room","Conference Room","Pool Area","Service Corridor","Back Office","Restaurant","Bar"],
    education: ["Classroom","Principal Office","Administration","Reception","Lobby","Library","Computer Lab",
      "Science Lab","Gymnasium","Cafeteria","Auditorium","Music Room","Teacher Lounge","Conference Room"],
    medical: ["Reception","Waiting Room","Exam Room","Treatment Room","Consultation Room","Procedure Room",
      "Nurse Station","Doctor Office","Lab","Pharmacy","Supply Room","ADA Restroom"]
  };

  // The most-typed rooms across every property type — boosted so they surface first on an ambiguous
  // prefix. The pool itself is UNIVERSAL (residential + commercial + every vertical), never split by type.
  var COMMON = ["Bedroom","Bathroom","Kitchen","Living Room","Dining Room","Office","Hallway","Closet",
    "Garage","Laundry Room","Reception","Lobby","Conference Room","Break Room","Restroom","Storage","Entry","Stairs"];

  // Short-prefix synonyms / aliases → boost the canonical label.
  var SYN = { recep:"Reception", rec:"Reception", mech:"Mechanic Bay", conf:"Conference Room",
    ware:"Warehouse", bath:"Bathroom", rest:"Restroom", wc:"Restroom", waiting:"Waiting Area",
    server:"Server Room", lobby:"Lobby", showroom:"Showroom", detail:"Detail Bay", parts:"Parts Department",
    mast:"Primary Bedroom", master:"Primary Bedroom", primary:"Primary Bedroom", loading:"Loading Dock" };

  var VRX = [
    ["automotive", /\b(car|cars|auto|autos|automotive|mechanic|dealer|dealership|vehicle|tire|tires|garage|collision|detailing?|motors|lube|muffler|transmission|body\s?shop)\b/i],
    ["restaurant", /\b(restaurant|cafe|café|diner|grill|pizza|pizzeria|bistro|eatery|bakery|deli|food|catering|taco|sushi|steakhouse|brewery|\bpub\b|kitchen)\b/i],
    ["medical",    /\b(clinic|medical|dental|dentist|doctor|physician|health|hospital|urgent\s?care|pharmacy|orthodont|chiropract|dermat|\bvet\b|veterinar|surgery|wellness)\b/i],
    ["hospitality",/\b(hotel|motel|\binn\b|resort|lodge|suites|hospitality|hostel)\b/i],
    ["education",  /\b(school|academy|college|university|classroom|education|learning|daycare|preschool|montessori|kindergarten|campus)\b/i],
    ["industrial", /\b(warehouse|factory|industrial|manufactur|distribution|logistics|\bplant\b|fulfillment|assembly|packaging|freight)\b/i],
    ["retail",     /\b(retail|store|shop|boutique|\bmart\b|market|outlet|apparel|grocery|jewelry|furniture)\b/i],
    ["office",     /\b(office|corporate|agency|firm|\bllc\b|\binc\b|consult|\blaw\b|legal|account|insurance|realty|real\s?estate|financial|studio|coworking)\b/i]
  ];
  function deriveVertical(biz) {
    var s = String(biz || "");
    for (var i = 0; i < VRX.length; i++) if (VRX[i][1].test(s)) return VRX[i][0];
    return null;
  }

  function subseq(q, t) { var i = 0; for (var j = 0; j < t.length && i < q.length; j++) if (t[j] === q[i]) i++; return i === q.length; }
  function baseNum(name) {
    var m = /^(.*?)\s*#?\s*(\d+)$/.exec(String(name || "").trim());
    return m ? { base: m[1].trim(), n: +m[2] } : { base: String(name || "").trim(), n: null };
  }
  var ALL = null;
  function allLabels() { if (ALL) return ALL; ALL = UNIVERSAL.concat(RESIDENTIAL, COMMERCIAL); Object.keys(VERT).forEach(function (v) { ALL = ALL.concat(VERT[v]); }); return ALL; }
  function semanticFor(label) {
    var nl = String(label || "").toLowerCase(), all = allLabels(), i;
    for (i = 0; i < all.length; i++) if (all[i].toLowerCase() === nl) return slug(all[i]);
    var bn = baseNum(label);
    if (bn.n != null) for (i = 0; i < all.length; i++) if (all[i].toLowerCase() === bn.base.toLowerCase()) return slug(all[i]);
    return "custom";
  }

  // ONE universal pool — residential + commercial + every vertical, never split by property type.
  // Tiers only rank the suggestions (detected vertical > common > universal > the rest); every label is typable.
  function poolFor(pt, vert) {
    var seen = {}, out = [];
    function add(list, tier) { list.forEach(function (l) { var k = l.toLowerCase(); if (seen[k] != null) { if (tier > seen[k]) seen[k] = tier; return; } seen[k] = tier; out.push(l); }); }
    if (vert && VERT[vert]) add(VERT[vert], 4);
    add(COMMON, 3);
    add(UNIVERSAL, 2);
    add(RESIDENTIAL, 1); add(COMMERCIAL, 1);
    Object.keys(VERT).forEach(function (v) { add(VERT[v], 1); });   // every vertical's rooms stay searchable too
    return out.map(function (l) { return { label: l, sem: slug(l), tier: seen[l.toLowerCase()] }; });
  }

  function suggest(opts) {
    opts = opts || {};
    var q = norm(opts.query), limit = opts.limit || 5;
    var pt = opts.propertyType === "residential" ? "residential" : "commercial";
    var vert = opts.vertical || deriveVertical(opts.biz);
    var existing = (opts.existingNames || []).filter(Boolean);

    // group existing names for recently-used + numbering
    var groups = {};
    existing.forEach(function (nm) { var bn = baseNum(nm), kb = bn.base.toLowerCase(); if (!kb) return; if (!groups[kb]) groups[kb] = { base: bn.base, max: 0 }; if (bn.n != null && bn.n > groups[kb].max) groups[kb].max = bn.n; });

    var used = {}, results = [];
    function push(label, score, sem) { var k = label.toLowerCase(); if (used[k]) { if (score > used[k].s) used[k].s = score; return; } var o = { label: label, sem: sem || semanticFor(label), s: score }; used[k] = o; results.push(o); }

    // ---- empty query → NOTHING. Suggestions only appear once the user starts typing. ----
    if (!q) return [];

    // ---- typed query → rank library + recently-used + numbering ----
    poolFor(pt, vert).forEach(function (e) {
      var nl = norm(e.label), score = 0, tierB = e.tier * 4;
      if (nl === q) score = 200;
      else if (nl.indexOf(q) === 0) score = 140;
      else if (nl.split(" ").some(function (w) { return w.indexOf(q) === 0; })) score = 110;
      else if (nl.indexOf(q) > -1) score = 80;
      else if (subseq(q, nl)) score = 45;
      else {
        var hit = false;
        Object.keys(SYN).forEach(function (kk) { if (kk.indexOf(q) === 0 && SYN[kk].toLowerCase() === e.label.toLowerCase()) hit = true; });
        if (!hit) return;
        score = 100;
      }
      score += tierB;
      var g = groups[nl];
      if (g && g.max > 0) push(e.label + " " + (g.max + 1), score + 30, e.sem);   // prefer next number
      push(e.label, score, e.sem);
    });

    // recently-used names (even if custom) that match the query
    existing.forEach(function (nm) { var n2 = norm(nm); if (n2.indexOf(q) > -1) push(nm, n2.indexOf(q) === 0 ? 150 : 120, "custom"); });
    Object.keys(groups).forEach(function (kb) { var g = groups[kb]; if (g.max > 0 && kb.indexOf(q) === 0) push(g.base + " " + (g.max + 1), 170, "custom"); });

    results.sort(function (a, b) { return b.s - a.s || a.label.localeCompare(b.label); });
    return results.slice(0, limit).map(function (o) { return { label: o.label, semanticType: o.sem }; });
  }

  window.IOTRooms = { titleCase: titleCase, suggest: suggest, deriveVertical: deriveVertical, semanticFor: semanticFor };
})();
