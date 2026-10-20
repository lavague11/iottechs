/* =====================================================================
   BYS — "Build Your System" · ADT (alarm / security) spec
   Build Your ADT System. IOT TECHS designs & installs ADT-monitored alarm systems;
   this is the installer's lead-gen builder. Declares the shared globals the BYS shell
   consumes (SPEC, CONFIG, Engine) + SPEC.render/actions. Classic <script> — shares
   the shell's global scope. Money is integer cents. (Equipment prices are planning
   estimates; 24/7 monitoring is a separate monthly plan finalized with your rep.)
   ===================================================================== */

const SPEC = {
  id: 'adt',
  brand: { company: 'IOT TECHS', tagline: 'Build your ADT system', title: 'Build Your ADT System' },
  lead:  { service: 'ADT', endpoint: '/api/leads/adt' },
  intakeLede: 'Tell us who you are and where to protect — your estimate is sent here.',
  steps: [
    { id: 'capabilities', label: 'Protection', title: 'What do you want to protect?', single: ['features'] },
    { id: 'hardware',     label: 'System',     title: 'Your system',                 single: ['system'] },
  ],
};

/* =====================================================================
   CONFIG — alarm catalog + monitoring tiers (ids essential/smart/pro reused by the
   shared Quote + recommendLevel; customer-facing names Secure / Smart Home / Total).
   ===================================================================== */
const CONFIG = {
  version: 'adt-2026.10',
  defaults: {
    doors: 4, motions: 2, glass: 0, keypads: 1, cameras: 0, smoke: 1, cell: true, skipInstall: false,
    level: 'essential', levelManual: false, features: [],
    term: 1, billing: 'monthly', plan: 'none', discount: 0, promoCode: null, taxRate: 0,
  },
  catalog: {
    panel:    { price: 19900 },   // control panel + hub (always included)
    door:     { price: 3500 },    // door / window contact
    motion:   { price: 4500 },    // motion sensor
    glass:    { price: 6500 },    // glass-break sensor
    keypad:   { price: 5900 },    // keypad / touchscreen
    camera:   { price: 14900 },   // indoor / outdoor camera
    smoke:    { price: 5500 },    // smoke / CO detector
    cell:     { price: 4900 },    // cellular backup radio
    install:  { perDevice: 5000 },
    // monitoring tiers (the one-time equipment side; 24/7 monitoring is a separate monthly plan)
    levels: [
      { id:'essential', name:'Secure', tag:'Simple', line:'Intrusion + 24/7 monitoring',
        blurb:'Break-in protection with round-the-clock professional monitoring.',
        features:['Door / window & motion sensors','24/7 professional monitoring','Cellular backup'],
        addPerStation:0, addFlat:0 },
      { id:'smart', name:'Smart Home', tag:'Most popular', line:'App control + automation',
        blurb:'Adds smartphone arm/disarm, smart locks and a video doorbell.',
        features:['Arm / disarm from your phone','Smart locks & lighting','Video doorbell'],
        addPerStation:0, addFlat:15000, recommended:true },
      { id:'pro', name:'Total', tag:'Advanced', line:'Fire, CO + cameras',
        blurb:'Adds fire/CO/flood protection and recorded security cameras.',
        features:['Fire, CO & flood sensors','Recorded security cameras','Whole-property coverage'],
        addPerStation:0, addFlat:40000, specialized:true },
    ],
    securityFeatures: [
      { id:'intrusion', label:'Burglary / intrusion', level:1, info:'Door, window and motion sensors trip the alarm on a break-in.' },
      { id:'monitoring',label:'24/7 professional monitoring', level:1, info:'A monitoring center responds and can dispatch on a verified alarm.' },
      { id:'app',       label:'Smartphone control', level:2, info:'Arm, disarm and check status from your phone.' },
      { id:'locks',     label:'Smart locks & lighting', level:2, info:'Automate door locks and lights with the system.' },
      { id:'doorbell',  label:'Video doorbell', level:2, info:'See and talk to visitors at the door.' },
      { id:'fire',      label:'Fire & smoke', level:3, info:'Monitored smoke detection for round-the-clock fire response.' },
      { id:'env',       label:'CO & flood sensors', level:3, specialized:true, info:'Carbon-monoxide, water-leak and freeze protection.' },
      { id:'cameras',   label:'Security cameras', level:3, specialized:true, info:'Recorded indoor/outdoor cameras tied to the system.' },
    ],
  },
};

/* =====================================================================
   PRICING ENGINE — pure. BYS-Quote-compatible shape + a cameras-shaped `ss` STUB.
   One-time equipment + install (wireless sensors — no cabling); monitoring is monthly, handled by the rep.
   ===================================================================== */
const Engine = (() => {
  const C = CONFIG.catalog;
  function compute(s){
    const doors = Math.max(0,+s.doors||0), motions = Math.max(0,+s.motions||0), glass = Math.max(0,+s.glass||0),
          keypads = Math.max(1,+s.keypads||1), cameras = Math.max(0,+s.cameras||0), smoke = Math.max(0,+s.smoke||0), cell = !!s.cell;
    const lv = C.levels.find(l=>l.id===s.level) || C.levels[0];
    const lines = [];
    lines.push({ g:'Equipment', code:'PANEL', label:'Control panel & hub', qty:1, unit:C.panel.price, amt:C.panel.price });
    if(doors) lines.push({ g:'Equipment', code:'DOOR', label:'Door / window sensor', qty:doors, unit:C.door.price, amt:doors*C.door.price });
    if(motions) lines.push({ g:'Equipment', code:'MOTION', label:'Motion sensor', qty:motions, unit:C.motion.price, amt:motions*C.motion.price });
    if(glass) lines.push({ g:'Equipment', code:'GLASS', label:'Glass-break sensor', qty:glass, unit:C.glass.price, amt:glass*C.glass.price });
    if(keypads) lines.push({ g:'Equipment', code:'KEYPAD', label:'Keypad', qty:keypads, unit:C.keypad.price, amt:keypads*C.keypad.price });
    if(cameras) lines.push({ g:'Equipment', code:'CAM', label:'Security camera', qty:cameras, unit:C.camera.price, amt:cameras*C.camera.price });
    if(smoke) lines.push({ g:'Equipment', code:'SMOKE', label:'Smoke / CO detector', qty:smoke, unit:C.smoke.price, amt:smoke*C.smoke.price });
    if(cell) lines.push({ g:'Equipment', code:'CELL', label:'Cellular backup', qty:1, unit:C.cell.price, amt:C.cell.price });
    if(lv.addFlat) lines.push({ g:'Equipment', code:'PKG', label:lv.name+' package', qty:1, unit:lv.addFlat, amt:lv.addFlat });
    const devices = 1 + doors + motions + glass + keypads + cameras + smoke;
    const installAmt = s.skipInstall ? 0 : devices*C.install.perDevice;
    if(installAmt) lines.push({ g:'Installation', code:'INSTALL', label:'Install & programming', qty:devices, unit:C.install.perDevice, amt:installAmt });
    const base = lines.reduce((a,l)=>a+l.amt,0);
    const tax = Math.round(base*(+s.taxRate||0));
    const total = base + tax;
    const ss = { calcVersion:'adt', days:0, recommendedTB:0, storageTB:0, estimatedDays:0, daily:0, rawTB:0,
      drives:[], activeNvr:{ code:'—', name:'—' }, requiresUpgrade:false, noStandardFit:false, groups:[] };
    return { n:doors+motions+glass, doors, motions, glass, keypads, cameras, smoke, level:lv, lines, addons:[], base, discount:0,
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
    const pkg = f => ({1:{t:'ess',l:'Secure'},2:{t:'smart',l:'Smart Home'},3:{t:'pro',l:'Total'}})[f.level] || null;
    const info = f => f.info ? `<span class="feat-info" data-act="featinfo" data-v="${f.id}" role="button" tabindex="0" aria-label="About ${f.label}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11.3v4.4"/><circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none"/></svg></span>` : '';
    const row = f => { const p = pkg(f); return `<button type="button" class="feat-row ${sel.has(f.id)?'on':''}" data-act="feat" data-v="${f.id}" aria-pressed="${sel.has(f.id)}">
      <span class="feat-box" aria-hidden="true"></span><span class="feat-name">${f.label}</span>${info(f)}${p?`<span class="feat-pkg ${p.t}">${p.l}</span>`:''}</button>`; };
    const rec = recommendLevel(state.features);
    const recName = ({essential:'Secure',smart:'Smart Home',pro:'Total'})[rec.level];
    const recNote = rec.hasCamFeatures ? `<div class="feat-rec"><span class="feat-rec-k">Recommended</span> ${recName} plan</div>` : '';
    return `${head(s,i,'Select what you want to protect — we\'ll match you to the right plan.', false)}
      <div class="feat-list">${CONFIG.catalog.securityFeatures.map(row).join('')}</div>
      ${recNote}`;
  },
  system(s, q, i){
    const step = (label, key, val, sub, min) => `<div class="opt">
      <div class="opt-head" style="cursor:default">
        <div><div class="opt-title">${label}</div>${sub?`<div class="opt-sub">${sub}</div>`:''}</div>
        <div class="mini-step"><button data-act="adtqty" data-v="${key}:-1" aria-label="Fewer ${label}" ${val<=(min||0)?'disabled':''}>−</button><b>${val}</b><button data-act="adtqty" data-v="${key}:1" aria-label="More ${label}">+</button></div>
      </div></div>`;
    const toggle = (label, key, on, sub) => `<div class="opt ${on?'sel':''}">
      <button type="button" class="pick opt-head" data-act="adttoggle" data-v="${key}"><span class="check"></span>
        <div><div class="opt-title">${label}</div>${sub?`<div class="opt-sub">${sub}</div>`:''}</div></button></div>`;
    return `<div class="sys-block"><div class="eyebrow">Perimeter</div>
        <div class="opts">
          ${step('Door / window sensors','doors',state.doors,'One per protected opening',0)}
          ${step('Motion sensors','motions',state.motions,'Cover rooms & hallways',0)}
          ${step('Glass-break sensors','glass',state.glass,'Large windows & storefronts',0)}
        </div></div>
      <hr class="sys-div">
      <div class="sys-block"><div class="eyebrow">Control & life safety</div>
        <div class="opts">
          ${step('Keypads','keypads',state.keypads,'Arm / disarm at the door',1)}
          ${step('Cameras','cameras',state.cameras,'Recorded indoor / outdoor',0)}
          ${step('Smoke / CO detectors','smoke',state.smoke,'Monitored life-safety',0)}
        </div></div>
      <hr class="sys-div">
      <div class="sys-block"><div class="eyebrow">Setup</div>
        <div class="opts">
          ${toggle('Cellular backup','cell',state.cell,'Stays armed if internet or power drops')}
          ${toggle('Professional install','install',!state.skipInstall,'We mount, program and test everything')}
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
  adtqty(v){ const parts = String(v).split(':'); const k = parts[0], d = +parts[1]||0; const min = (k==='keypads') ? 1 : 0;
    state[k] = Math.max(min, Math.min(100, (+state[k]||0) + d)); },
  adttoggle(v){ if(v==='install') state.skipInstall = !state.skipInstall; else state[v] = !state[v]; },
};
SPEC.render = SPEC_render;
SPEC.actions = SPEC_actions;
