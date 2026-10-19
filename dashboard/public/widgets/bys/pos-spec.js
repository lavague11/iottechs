/* =====================================================================
   BYS — "Build Your System" · POS (Toast-style) spec
   Build Your POS System. The SECOND BYS vertical — proves the white-label seam:
   same shell, a different spec file. Declares the same shared globals the BYS shell
   consumes (SPEC, CONFIG, Engine) + SPEC.render / SPEC.actions for its config steps.
   Classic <script> — shares the shell's global scope. Money is integer cents.
   ===================================================================== */

/* The vertical's identity — brand shown in the shell + where leads go. */
const SPEC = {
  id: 'pos',
  brand: { company: 'IOT TECHS', tagline: 'Build your POS system', title: 'Build Your POS System' },
  lead:  { service: 'POS', endpoint: '/api/leads/pos' },
  // Config steps between the shell's Intake + Quote bookends.
  steps: [
    { id: 'capabilities', label: 'Capabilities', title: 'What do you need?', single: ['features'] },
    { id: 'hardware',     label: 'Hardware',     title: 'Your hardware',    single: ['system'] },
  ],
};

/* =====================================================================
   CONFIG — everything product-specific. (The tier ids essential/smart/pro are
   reused so the shell's shared Quote + recommendLevel machinery works unchanged;
   the customer-facing names are Starter / Standard / Pro Kitchen.)
   ===================================================================== */
const CONFIG = {
  version: 'pos-2026.10',
  // state defaults (merged into the shell's state at init)
  defaults: {
    stations: 2, handhelds: 0, kds: 1, printers: 1, router: true, skipInstall: false,
    level: 'essential', levelManual: false, features: [],
    term: 1, billing: 'monthly', plan: 'none', discount: 0, promoCode: null, taxRate: 0,
  },
  catalog: {
    station:  { price: 89900 },   // countertop POS terminal
    handheld: { price: 64900 },   // tableside handheld
    kds:      { price: 59900 },   // kitchen display screen
    printer:  { price: 29900 },   // receipt / kitchen printer
    router:   { price: 24900 },   // networking (router / switch)
    cableDrop:{ price: 12500 },   // per wired-device cabling drop
    install:  { perDevice: 7500 },
    // POS capability tiers — shared Quote machinery reads this (ids kept as essential/smart/pro).
    levels: [
      { id:'essential', name:'Starter', tag:'Simple', line:'Order & pay',
        blurb:'Everything to ring up orders and take payments on day one.',
        features:['Order entry & payments','Receipt & kitchen printing','Daily sales reports'],
        addPerStation:0, addFlat:0 },
      { id:'smart', name:'Standard', tag:'Most popular', line:'Online + loyalty',
        blurb:'Adds online ordering and loyalty to grow repeat business.',
        features:['Online ordering','Loyalty & gift cards','Menu & inventory'],
        addPerStation:15000, addFlat:0, recommended:true },
      { id:'pro', name:'Pro Kitchen', tag:'Advanced', line:'KDS + multi-location',
        blurb:'Adds kitchen display routing, multi-location and advanced reporting.',
        features:['Kitchen display routing','Multi-location management','Advanced analytics & payroll'],
        addPerStation:15000, addFlat:0, specialized:true },
    ],
    // Capability checklist (Capabilities step). `level` drives the recommended tier.
    securityFeatures: [
      { id:'orders',    label:'Order entry & payments', level:1, info:'Take dine-in, takeout and card payments from any station.' },
      { id:'receipts',  label:'Receipt & kitchen printing', level:1, info:'Print guest receipts and route tickets to the kitchen.' },
      { id:'online',    label:'Online ordering', level:2, info:'Accept orders from your site and apps, straight into the POS.' },
      { id:'loyalty',   label:'Loyalty & gift cards', level:2, info:'Reward repeat guests and sell digital gift cards.' },
      { id:'inventory', label:'Menu & inventory', level:2, info:'Track stock and 86 items automatically as they sell.' },
      { id:'kds',       label:'Kitchen display (KDS)', level:3, specialized:true, info:'Route orders to kitchen screens instead of paper tickets.' },
      { id:'multiloc',  label:'Multi-location', level:3, specialized:true, info:'Manage menus, pricing and reporting across locations.' },
      { id:'payroll',   label:'Payroll & scheduling', level:3, info:'Staff scheduling and payroll tied to POS hours.' },
    ],
  },
};

/* =====================================================================
   PRICING ENGINE — pure, no DOM. Returns a shape compatible with the BYS shell's
   Quote machinery (q.n, q.level, q.lines, q.total, q.addons, q.plan) plus a
   cameras-shaped `ss` STUB so the shell's submit/snapshot path never crashes.
   (Generalizing finalizeQuote/quoteText so they don't assume cameras is a follow-up.)
   ===================================================================== */
const Engine = (() => {
  const C = CONFIG.catalog;
  function compute(s){
    const stations = Math.max(1, +s.stations||1), handhelds = Math.max(0,+s.handhelds||0),
          kds = Math.max(0,+s.kds||0), printers = Math.max(0,+s.printers||0), router = !!s.router;
    const lv = C.levels.find(l=>l.id===s.level) || C.levels[0];
    const lines = [];
    lines.push({ g:'Equipment', code:'STATION', label:'POS station', qty:stations, unit:C.station.price, amt:stations*C.station.price });
    if(handhelds) lines.push({ g:'Equipment', code:'HH', label:'Handheld', qty:handhelds, unit:C.handheld.price, amt:handhelds*C.handheld.price });
    if(kds) lines.push({ g:'Equipment', code:'KDS', label:'Kitchen display', qty:kds, unit:C.kds.price, amt:kds*C.kds.price });
    if(printers) lines.push({ g:'Equipment', code:'PRN', label:'Printer', qty:printers, unit:C.printer.price, amt:printers*C.printer.price });
    if(router) lines.push({ g:'Equipment', code:'NET', label:'Networking (router/switch)', qty:1, unit:C.router.price, amt:C.router.price });
    const tierAdd = (lv.addPerStation||0)*stations;
    if(tierAdd) lines.push({ g:'Equipment', code:'SW', label:lv.name+' software setup', qty:stations, unit:lv.addPerStation, amt:tierAdd });
    const drops = stations + kds + printers;
    if(drops) lines.push({ g:'Cable', code:'DROP', label:'Cabling drop', qty:drops, unit:C.cableDrop.price, amt:drops*C.cableDrop.price });
    const devices = stations + handhelds + kds + printers + (router?1:0);
    const installAmt = s.skipInstall ? 0 : devices*C.install.perDevice;
    if(installAmt) lines.push({ g:'Installation', code:'INSTALL', label:'Install & setup', qty:devices, unit:C.install.perDevice, amt:installAmt });
    const base = lines.reduce((a,l)=>a+l.amt,0);
    const tax = Math.round(base*(+s.taxRate||0));
    const total = base + tax;
    // cameras-shaped stub so the shell's finalizeQuote / quoteText / upgrade-toast never throw on POS
    const ss = { calcVersion:'pos', days:0, recommendedTB:0, storageTB:0, estimatedDays:0, daily:0, rawTB:0,
      drives:[], activeNvr:{ code:'—', name:'—' }, requiresUpgrade:false, noStandardFit:false, groups:[] };
    return { n:stations, stations, handhelds, kds, printers, level:lv, lines, addons:[], base, discount:0,
      promo:null, promoDiscount:0, adjust:0, tax, total, ss, warnings:[], flags:[],
      plan:{ kind:'none', monthly:0, months:0, termTotal:0, prepaid:0, upfront:0, monthlyDue:0, tier:1 } };
  }
  return { compute };
})();

/* =====================================================================
   VERTICAL RENDERERS + ACTIONS — the BYS step-registry contract.
   ===================================================================== */
const SPEC_render = {
  // Capabilities checklist (same shape as the cameras Features step; reads CONFIG.catalog.securityFeatures).
  features(s, q, i){
    const sel = new Set(state.features||[]);
    const pkg = f => ({1:{t:'ess',l:'Starter'},2:{t:'smart',l:'Standard'},3:{t:'pro',l:'Pro'}})[f.level] || null;
    const info = f => f.info ? `<span class="feat-info" data-act="featinfo" data-v="${f.id}" role="button" tabindex="0" aria-label="About ${f.label}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11.3v4.4"/><circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none"/></svg></span>` : '';
    const row = f => { const p = pkg(f); return `<button type="button" class="feat-row ${sel.has(f.id)?'on':''}" data-act="feat" data-v="${f.id}" aria-pressed="${sel.has(f.id)}">
      <span class="feat-box" aria-hidden="true"></span><span class="feat-name">${f.label}</span>${info(f)}${p?`<span class="feat-pkg ${p.t}">${p.l}</span>`:''}</button>`; };
    const rec = recommendLevel(state.features);
    const recName = ({essential:'Starter',smart:'Standard',pro:'Pro Kitchen'})[rec.level];
    const recNote = rec.hasCamFeatures ? `<div class="feat-rec"><span class="feat-rec-k">Recommended</span> ${recName} plan</div>` : '';
    return `${head(s,i,'Select what you need — we\'ll match you to the right plan.', false)}
      <div class="feat-list">${CONFIG.catalog.securityFeatures.map(row).join('')}</div>
      ${recNote}`;
  },
  // Hardware — quantity steppers + setup toggles (reuses shell .opt / .mini-step / .eyebrow classes).
  system(s, q, i){
    const step = (label, key, val, sub, min) => `<div class="opt">
      <div class="opt-head" style="cursor:default">
        <div><div class="opt-title">${label}</div>${sub?`<div class="opt-sub">${sub}</div>`:''}</div>
        <div class="mini-step"><button data-act="posqty" data-v="${key}:-1" aria-label="Fewer ${label}" ${val<=(min||0)?'disabled':''}>−</button><b>${val}</b><button data-act="posqty" data-v="${key}:1" aria-label="More ${label}">+</button></div>
      </div></div>`;
    const toggle = (label, key, on, sub) => `<div class="opt ${on?'sel':''}">
      <button type="button" class="pick opt-head" data-act="postoggle" data-v="${key}"><span class="check"></span>
        <div><div class="opt-title">${label}</div>${sub?`<div class="opt-sub">${sub}</div>`:''}</div></button></div>`;
    return `<div class="sys-block"><div class="eyebrow">Front of house</div>
        <div class="opts">
          ${step('POS stations','stations',state.stations,'Countertop terminals',1)}
          ${step('Handhelds','handhelds',state.handhelds,'Tableside ordering',0)}
        </div></div>
      <hr class="sys-div">
      <div class="sys-block"><div class="eyebrow">Kitchen</div>
        <div class="opts">
          ${step('Kitchen displays','kds',state.kds,'Screens instead of paper tickets',0)}
          ${step('Printers','printers',state.printers,'Receipt & kitchen tickets',0)}
        </div></div>
      <hr class="sys-div">
      <div class="sys-block"><div class="eyebrow">Setup</div>
        <div class="opts">
          ${toggle('Networking','router',state.router,'Router / switch for the POS network')}
          ${toggle('Professional install','install',!state.skipInstall,'We mount, cable and configure everything')}
        </div></div>`;
  },
};
const SPEC_actions = {
  // Capabilities toggle → auto-recommend a plan (unless manually overridden) — same as cameras.
  feat(v){
    const set = new Set(state.features||[]);
    set.has(v) ? set.delete(v) : set.add(v);
    state.features = [...set];
    if(!state.levelManual) state.level = recommendLevel(state.features).level;
  },
  // Hardware quantity steppers: data-v "key:delta".
  posqty(v){ const parts = String(v).split(':'); const k = parts[0], d = +parts[1]||0; const min = (k==='stations') ? 1 : 0;
    state[k] = Math.max(min, Math.min(50, (+state[k]||0) + d)); },
  // Setup toggles.
  postoggle(v){ if(v==='install') state.skipInstall = !state.skipInstall; else state[v] = !state[v]; },
};
SPEC.render = SPEC_render;
SPEC.actions = SPEC_actions;
