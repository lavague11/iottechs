/* =====================================================================
   BYS — "Build Your System" · TOAST (restaurant POS) spec
   Build Your Toast System. IOT TECHS configures & installs Toast hardware; this is
   the installer's lead-gen builder (IOT-branded, Toast product line). Declares the
   shared globals the BYS shell consumes (SPEC, CONFIG, Engine) + SPEC.render/actions.
   Classic <script> — shares the shell's global scope. Money is integer cents.
   (Hardware prices are planning estimates — confirm against the current Toast quote.)
   ===================================================================== */

const SPEC = {
  id: 'toast',
  brand: { company: 'IOT TECHS', tagline: 'Build your Toast system', title: 'Build Your Toast System' },
  lead:  { service: 'TOAST', endpoint: '/api/leads/toast' },
  steps: [
    { id: 'capabilities', label: 'Features',  title: 'What do you need?', single: ['features'] },
    { id: 'hardware',     label: 'Hardware',  title: 'Your hardware',     single: ['system'] },
  ],
};

/* =====================================================================
   CONFIG — Toast catalog + tiers (ids essential/smart/pro reused by the shared
   Quote + recommendLevel; customer-facing names Starter / Growth / Full Service).
   ===================================================================== */
const CONFIG = {
  version: 'toast-2026.10',
  defaults: {
    flex: 2, go: 0, kds: 1, printers: 1, kiosks: 0, hub: true, skipInstall: false,
    level: 'essential', levelManual: false, features: [],
    term: 1, billing: 'monthly', plan: 'none', discount: 0, promoCode: null, taxRate: 0,
  },
  catalog: {
    flex:    { price: 84900 },    // Toast Flex terminal (incl. Toast Tap)
    go:      { price: 64900 },    // Toast Go 2 handheld
    kds:     { price: 44900 },    // Kitchen Display System screen
    printer: { price: 29900 },    // receipt / kitchen printer
    kiosk:   { price: 129900 },   // self-order kiosk
    hub:     { price: 24900 },    // Toast Hub (networking)
    cableDrop:{ price: 12500 },   // per wired-device drop
    install: { perDevice: 7500 },
    levels: [
      { id:'essential', name:'Starter', tag:'Simple', line:'Order & pay',
        blurb:'Everything to ring up orders and take payments on day one.',
        features:['Order entry & payments','Receipt & kitchen printing','Sales & menu reporting'],
        addPerStation:0, addFlat:0 },
      { id:'smart', name:'Growth', tag:'Most popular', line:'Online + loyalty',
        blurb:'Adds online ordering, delivery, loyalty and marketing to grow sales.',
        features:['Online ordering & delivery','Loyalty & gift cards','Email marketing'],
        addPerStation:15000, addFlat:0, recommended:true },
      { id:'pro', name:'Full Service', tag:'Advanced', line:'KDS + multi-location',
        blurb:'Adds kitchen display routing, multi-location, payroll and kiosk-ready setup.',
        features:['Kitchen display routing','Multi-location management','Toast Payroll & Team'],
        addPerStation:15000, addFlat:0, specialized:true },
    ],
    securityFeatures: [
      { id:'orders',    label:'Order entry & payments', level:1, info:'Take dine-in, takeout and card payments from any Toast terminal.' },
      { id:'reporting', label:'Sales & menu reporting', level:1, info:'Live sales, labor and menu performance in Toast.' },
      { id:'online',    label:'Online ordering', level:2, info:'Commission-free ordering from your Toast-powered site.' },
      { id:'delivery',  label:'Toast Delivery', level:2, info:'Dispatch your own or on-demand drivers from the POS.' },
      { id:'loyalty',   label:'Loyalty & gift cards', level:2, info:'Points, rewards and digital gift cards.' },
      { id:'marketing', label:'Email marketing', level:2, info:'Automated campaigns built from guest data.' },
      { id:'kds',       label:'Kitchen display (KDS)', level:3, specialized:true, info:'Route tickets to kitchen screens instead of paper.' },
      { id:'multiloc',  label:'Multi-location', level:3, specialized:true, info:'Manage menus, pricing and reporting across locations.' },
      { id:'payroll',   label:'Toast Payroll & Team', level:3, info:'Scheduling and payroll tied to POS hours.' },
    ],
  },
};

/* =====================================================================
   PRICING ENGINE — pure. BYS-Quote-compatible shape + a cameras-shaped `ss` STUB so
   the shell's submit/snapshot path never crashes.
   ===================================================================== */
const Engine = (() => {
  const C = CONFIG.catalog;
  function compute(s){
    const flex = Math.max(1,+s.flex||1), go = Math.max(0,+s.go||0), kds = Math.max(0,+s.kds||0),
          printers = Math.max(0,+s.printers||0), kiosks = Math.max(0,+s.kiosks||0), hub = !!s.hub;
    const lv = C.levels.find(l=>l.id===s.level) || C.levels[0];
    const lines = [];
    lines.push({ g:'Equipment', code:'FLEX', label:'Toast Flex terminal', qty:flex, unit:C.flex.price, amt:flex*C.flex.price });
    if(go) lines.push({ g:'Equipment', code:'GO', label:'Toast Go 2 handheld', qty:go, unit:C.go.price, amt:go*C.go.price });
    if(kds) lines.push({ g:'Equipment', code:'KDS', label:'Kitchen display', qty:kds, unit:C.kds.price, amt:kds*C.kds.price });
    if(printers) lines.push({ g:'Equipment', code:'PRN', label:'Printer', qty:printers, unit:C.printer.price, amt:printers*C.printer.price });
    if(kiosks) lines.push({ g:'Equipment', code:'KIOSK', label:'Self-order kiosk', qty:kiosks, unit:C.kiosk.price, amt:kiosks*C.kiosk.price });
    if(hub) lines.push({ g:'Equipment', code:'HUB', label:'Toast Hub (networking)', qty:1, unit:C.hub.price, amt:C.hub.price });
    const tierAdd = (lv.addPerStation||0)*flex;
    if(tierAdd) lines.push({ g:'Equipment', code:'SW', label:lv.name+' software setup', qty:flex, unit:lv.addPerStation, amt:tierAdd });
    const drops = flex + kds + printers + kiosks;
    if(drops) lines.push({ g:'Cable', code:'DROP', label:'Cabling drop', qty:drops, unit:C.cableDrop.price, amt:drops*C.cableDrop.price });
    const devices = flex + go + kds + printers + kiosks + (hub?1:0);
    const installAmt = s.skipInstall ? 0 : devices*C.install.perDevice;
    if(installAmt) lines.push({ g:'Installation', code:'INSTALL', label:'Install & setup', qty:devices, unit:C.install.perDevice, amt:installAmt });
    const base = lines.reduce((a,l)=>a+l.amt,0);
    const tax = Math.round(base*(+s.taxRate||0));
    const total = base + tax;
    const ss = { calcVersion:'toast', days:0, recommendedTB:0, storageTB:0, estimatedDays:0, daily:0, rawTB:0,
      drives:[], activeNvr:{ code:'—', name:'—' }, requiresUpgrade:false, noStandardFit:false, groups:[] };
    return { n:flex, flex, go, kds, printers, kiosks, level:lv, lines, addons:[], base, discount:0,
      promo:null, promoDiscount:0, adjust:0, tax, total, ss, warnings:[], flags:[],
      plan:{ kind:'none', monthly:0, months:0, termTotal:0, prepaid:0, upfront:0, monthlyDue:0, tier:1 } };
  }
  return { compute };
})();

/* =====================================================================
   VERTICAL RENDERERS + ACTIONS — the BYS step-registry contract.
   ===================================================================== */
const SPEC_render = {
  features(s, q, i){
    const sel = new Set(state.features||[]);
    const pkg = f => ({1:{t:'ess',l:'Starter'},2:{t:'smart',l:'Growth'},3:{t:'pro',l:'Full Service'}})[f.level] || null;
    const info = f => f.info ? `<span class="feat-info" data-act="featinfo" data-v="${f.id}" role="button" tabindex="0" aria-label="About ${f.label}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11.3v4.4"/><circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none"/></svg></span>` : '';
    const row = f => { const p = pkg(f); return `<button type="button" class="feat-row ${sel.has(f.id)?'on':''}" data-act="feat" data-v="${f.id}" aria-pressed="${sel.has(f.id)}">
      <span class="feat-box" aria-hidden="true"></span><span class="feat-name">${f.label}</span>${info(f)}${p?`<span class="feat-pkg ${p.t}">${p.l}</span>`:''}</button>`; };
    const rec = recommendLevel(state.features);
    const recName = ({essential:'Starter',smart:'Growth',pro:'Full Service'})[rec.level];
    const recNote = rec.hasCamFeatures ? `<div class="feat-rec"><span class="feat-rec-k">Recommended</span> ${recName} plan</div>` : '';
    return `${head(s,i,'Select what you need — we\'ll match you to the right Toast plan.', false)}
      <div class="feat-list">${CONFIG.catalog.securityFeatures.map(row).join('')}</div>
      ${recNote}`;
  },
  system(s, q, i){
    const step = (label, key, val, sub, min) => `<div class="opt">
      <div class="opt-head" style="cursor:default">
        <div><div class="opt-title">${label}</div>${sub?`<div class="opt-sub">${sub}</div>`:''}</div>
        <div class="mini-step"><button data-act="toastqty" data-v="${key}:-1" aria-label="Fewer ${label}" ${val<=(min||0)?'disabled':''}>−</button><b>${val}</b><button data-act="toastqty" data-v="${key}:1" aria-label="More ${label}">+</button></div>
      </div></div>`;
    const toggle = (label, key, on, sub) => `<div class="opt ${on?'sel':''}">
      <button type="button" class="pick opt-head" data-act="toasttoggle" data-v="${key}"><span class="check"></span>
        <div><div class="opt-title">${label}</div>${sub?`<div class="opt-sub">${sub}</div>`:''}</div></button></div>`;
    return `<div class="sys-block"><div class="eyebrow">Front of house</div>
        <div class="opts">
          ${step('Toast Flex terminals','flex',state.flex,'Countertop POS',1)}
          ${step('Toast Go 2 handhelds','go',state.go,'Tableside ordering',0)}
          ${step('Self-order kiosks','kiosks',state.kiosks,'Guest self-service',0)}
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
          ${toggle('Toast Hub (networking)','hub',state.hub,'Dedicated router/switch for the POS network')}
          ${toggle('Professional install','install',!state.skipInstall,'We mount, cable and configure everything')}
        </div></div>`;
  },
};
const SPEC_actions = {
  feat(v){
    const set = new Set(state.features||[]);
    set.has(v) ? set.delete(v) : set.add(v);
    state.features = [...set];
    if(!state.levelManual) state.level = recommendLevel(state.features).level;
  },
  toastqty(v){ const parts = String(v).split(':'); const k = parts[0], d = +parts[1]||0; const min = (k==='flex') ? 1 : 0;
    state[k] = Math.max(min, Math.min(50, (+state[k]||0) + d)); },
  toasttoggle(v){ if(v==='install') state.skipInstall = !state.skipInstall; else state[v] = !state[v]; },
};
SPEC.render = SPEC_render;
SPEC.actions = SPEC_actions;
