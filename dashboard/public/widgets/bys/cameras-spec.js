/* =====================================================================
   BYS — "Build Your System" · cameras spec
   The vertical-specific catalog + pricing engine for Build Your Camera System.
   This is a classic <script> (NOT a module): CONFIG and Engine are top-level
   consts shared with the BYS shell's inline script. To white-label another
   vertical, provide a sibling spec file that declares the same CONFIG + Engine.
   Phase 0: moved verbatim out of cctv-quote-calculator.html — no behavior change.
   ===================================================================== */
/* The vertical's IDENTITY — the brand shown in the BYS shell + where leads are delivered. The shell reads
   SPEC.brand (header + <title>) and SPEC.lead (submit endpoint). Swap this (with CONFIG + Engine) to
   white-label another vertical, e.g. { id:'pos', brand:{…'Build Your POS System'}, lead:{service:'POS', endpoint:'/api/leads/pos'} }. */
const SPEC = {
  id: 'cameras',
  brand: { company: 'IOT TECHS', tagline: 'Build your camera system', title: 'Build Your CCTV System' },
  lead:  { service: 'CCTV', endpoint: '/api/leads/cctv' },
  // The vertical's CONFIG steps — they sit between the shell's built-in Intake + Quote bookends. Each names
  // the renderer topic(s) it draws (dispatched by the shell as R[topic]). Phase 0.3: flow is now spec-owned;
  // the renderers themselves move into the spec in the next increment.
  steps: [
    { id: 'features', label: 'Features', title: 'Security features',  single: ['features'] },
    { id: 'project',  label: 'Project',  title: 'About your project', single: ['site'] },
    { id: 'system',   label: 'System',   title: 'Your system',        single: ['system'] },
  ],
};

/* =====================================================================
   CONFIG — everything product-specific lives here. Swap this object to
   make a calculator for another product line. Money is integer cents.
   ===================================================================== */
const CONFIG = {
  id: 'cctv', version: 'CCTV spec v1.0 · Oct 2026',
  // PUBLIC BUILD — rep mode / PIN and the promo code list are intentionally stripped from this file.
  // Cost, margin and discount tooling never ship in the public calculator; they live in the internal
  // staff copy served behind the authed dashboard. Do not re-add a client-side PIN or promo list here.
  catalog: {
    cam: { 8: { code:'CAM-8',  name:'8MP camera',  price:6500, watts:6.5 },
           12:{ code:'CAM-12', name:'12MP camera', price:7500, watts:null } },
    // Security level / feature tier — framed at the start. Price adders default to $0 (set per camera or flat in rep settings).
    levels: [
      { id:'essential', name:'Essential', tag:'Simple', line:'Record & watch',
        blurb:'Reliable 24/7 recording with live and recorded phone access.',
        features:['24/7 continuous recording','Live & recorded phone viewing','Clear day and night video'],
        addPerCamera:0, addFlat:0 },
      { id:'smart', name:'Smart', tag:'Most popular', line:'AI alerts',
        blurb:'Adds intelligent person and vehicle alerts for faster review and fewer unnecessary notifications.',
        features:['AI human & vehicle detection','Smart alerts to your phone','Far fewer false alarms'],
        addPerCamera:2500, addFlat:0, aiLabel:'Advanced AI detection & alerts', recommended:true },
      { id:'pro', name:'Pro', tag:'Advanced', line:'AI search & plates',
        blurb:'Adds advanced search, facial recognition, and license plate recognition.',
        features:['Facial recognition','AI smart search (person, vehicle, color)','License plate recognition','Best with 12MP cameras'],
        addPerCamera:2500, addFlat:0, aiLabel:'Advanced AI detection & alerts', suggest12MP:true, specialized:true }
    ],
    // Security feature checklist (Step 2). `level` is the INTERNAL recommendation tier (1 Essential ·
    // 2 Smart · 3 Pro), never shown to the customer. `service` = an add-on service (live monitoring),
    // not a camera-package driver. `specialized` = needs dedicated equipment/analytics (custom quote).
    securityFeatures: [
      { id:'rec247',       label:'24/7 Video Recording',          level:1, info:'Every camera records around the clock to the on-site recorder, so footage is always there to review — not only when motion is detected.' },
      { id:'colornight',   label:'Full-Color Night Vision',       level:1, info:'Cameras stay in full color after dark instead of black-and-white infrared, so clothing, vehicle and skin tones are visible at night.' },
      { id:'hd4k',         label:'4K HD Video',                   level:1, info:'8-megapixel 4K resolution — sharp enough to read detail and zoom into recorded footage without it turning to blur.' },
      { id:'mobile',       label:'Mobile App Access',             level:1, info:'View live and recorded video from your phone anywhere, and jump to any camera in a couple of taps.' },
      { id:'audio',        label:'Audio Recording',               level:1, allPackages:true, caveat:'Audio depends on the camera model — confirmed at the survey.', info:'Records sound alongside video where the camera and local law allow it — confirmed per camera at the survey.' },
      { id:'aidetect',     label:'AI Human & Vehicle Detection',  level:2, info:'The system tells people and vehicles apart from wind, rain and moving shadows, so you get far fewer false alerts.' },
      { id:'motionnotify', label:'Phone Motion Notifications',    level:2, info:'Your phone is notified the moment the cameras detect activity, with a snapshot so you can glance and decide.' },
      { id:'facial',       label:'Facial Recognition',            level:3, specialized:true, info:'Flags and searches for specific faces you enroll — for staff, VIPs or watch lists. Needs dedicated setup, reviewed at the survey.' },
      { id:'lpr',          label:'License Plate Recognition',     level:3, specialized:true, info:'Reads and logs vehicle license plates as they pass a positioned camera. Works best on 12MP cameras; reviewed at the survey.' },
      { id:'livemon',      label:'24/7 Live Monitoring',          level:0, service:true, info:'A monitoring team watches your cameras live and responds to events — an optional add-on service, not part of the camera hardware.' },
      { id:'alarm',        label:'Security Alarm + Monitoring',    level:0, service:true, info:'Adds alarm sensors with professional monitoring; on a verified alarm the monitoring provider can request emergency response. Dispatch depends on verification procedures and local requirements.' },
    ],
    // 8MP body styles — same price, same sensor. Internal SKU kept private (rep view only).
    styles: {
      turret:{ name:'Turret', sku:'I91DF', rating:'IP67 + IK08 impact rated', size:'4.8" round', info:'Ball-in-socket design aims anywhere and has no glass dome over the lens, so night vision never reflects. Our default for eaves, entrances and storefronts.' },
      bullet:{ name:'Bullet', sku:'I91DL', rating:'IP67', size:'6.7" long', info:'Long, visible body that points down a fixed line. Good for driveways, side yards and fence lines, and its look alone deters people.' },
      dome:  { name:'Dome',   sku:'I91DM', rating:'IP67', size:'4.3" round', info:'Low-profile and discreet, hard to tell which way it faces. Best for ceilings, hallways, registers and interiors.' }
    },
    services: [
      { code:'DROP',  name:'Cable pull & routing',   price:15000, info:'A dedicated cable is run from the recorder to each camera. Charged per cable (one per camera).' },
      { code:'TERM',  name:'Cable termination',      price:2500,  info:'Both ends get a connector, then each run is tested and labeled so it can be traced later.' },
      { code:'MOUNT', name:'Camera mounting',        price:2500,  info:'Each camera is positioned, fastened and aimed at the area you want covered.' },
      { code:'PROG',  name:'Camera programming',     price:2500,  info:'Network addressing, recording schedule and setup of the viewing app on your phone.' },
      { code:'HW',    name:'Mounting hardware',      price:1000,  info:'Anchors, fasteners and weather sealing used at each camera.' },
      { code:'CMGT',  name:'Cable management',       price:2500,  info:'Clips, ties and labeling so every run is tidy and serviceable.' }
    ],
    cable: { outdoor:{ code:'CB-OUT', name:'Outdoor-rated Cat6', price:15000 },
             indoor: { code:'CB-IN',  name:'Indoor Cat6',        price:10000 },
             feetPerBox:1000, feetPerCam:100 },
    nvr: {
      8:  { code:'NVR-8',  name:'8-channel recorder',  price:18999, ch:8,  bays:1, maxTB:8,  poe:null, verified:false },  // 1 bay × 8TB  = 8TB max
      16: { code:'NVR-16', name:'16-channel recorder', price:36999, ch:16, bays:2, maxTB:8,  poe:null, verified:false },  // 2 bays × 8TB  = 16TB max
      32: { code:'NVR-32', name:'32-channel recorder', price:45000, ch:32, bays:4, maxTB:10, poe:16,   verified:true }    // 4 bays × 10TB = 40TB max
    },
    // purchasable surveillance drives, 2TB increments (cents). Any 2TB capacity target is realized from these.
    drives: { 2:17449, 4:19499, 6:32290, 8:42500, 10:52900 },
    poe: { standard:{ code:'SW16', price:9900 }, bundle:{ code:'SW16-BUNDLE', price:4999 } },
    addons: {
      monitor:{ code:'MON',         name:'Monitor',                 price:9900,  info:'A screen at the recorder so you can watch live and recorded video without a phone.' },
      mount:  { code:'MON-INSTALL', name:'Monitor mount & install', price:9900,  info:'We wall-mount the monitor and run the video connection to the recorder.' },
      ups:    { code:'UPS',         name:'Battery backup (UPS)',    price:19900, info:'Keeps the recorder and cameras running through short power outages and protects them from surges.' }
    },
    plans: { warranty:700, protection:1500 },   // per month, per 8-camera tier
    discounts: [0],   // PUBLIC BUILD — rep discount tiers stripped (margin data never ships publicly)
    // ONE SOURCE OF TRUTH for storage/retention assumptions. Admin-editable; never shown to customers.
    retention: {
      defaultDays: 28, incrementTB: 2, minTB: 2, maxPerBayTB: 10,
      dayRange: [7, 180], dayPresets: [15, 30, 45, 60, 90],
      recordingLabel: '24/7 continuous recording',
      // storage rate per camera per day, by resolution. 8MP: ~1TB per camera ≈ 28 days (1/28 TB/day).
      profiles: {
        '8MP':  { mp:8,  multiplier:1.0, tbPerDay:0.0357 },
        '12MP': { mp:12, multiplier:1.5, tbPerDay:0.0536 }
      }
    },
    calcVersion: 'retention-v2 · 8MP ~1TB/cam≈28d (0.0357TB/day) · 2TB steps · 8ch 8TB / 16ch 16TB / 32ch 40TB',
    // PUBLIC BUILD — the promo / voucher code list is intentionally NOT shipped in the public page
    // (it would be discoverable in source). Promo validation belongs server-side; until then there are
    // no client-side codes. A code a customer types is captured into the lead snapshot for the rep to honor.
    promos: {}
  },
  defaults: { level:'essential', levelManual:false, features:['rec247','colornight','hd4k','mobile','audio'], sizeTier:8, cams:4, overCams:false, customOpen:false, n12:0, env:'indoor', footage:null, extraBoxes:0,
              desiredDays:28, daysMode:'preset', extStorage:false, selectedStorageTB:null, nvrUpgrade:'auto', nvrPick:null, poe:'auto',
              skipProg:false, monitorMode:'buy', monitor:true, mount:true, monitorQty:1, ups:false, plan:'none', term:1, billing:'monthly',
              cableColor:'white', camColor:'white', camRes:'8',
              discount:0, promoCode:null, taxRate:0, adjust:0, adjustReason:'' },
  sizeTiers: [
    { ch:8,  label:'Up to 8 cameras',  sub:'Best for smaller systems',   presets:[4,6,8] },
    { ch:16, label:'Up to 16 cameras', sub:'Best for medium systems',    presets:[8,10,12,16] },
    { ch:32, label:'Up to 32 cameras', sub:'Best for larger properties', presets:[16,24,32] }
  ],
  camRange: [1,32],
  slides: [
    { id:'intro',   title:'Start',              type:'intro' },
    { id:'contact', title:'Your details',       type:'contact' },
    { id:'site',    title:'About the property',  type:'site' },
    { id:'level',   title:'Security level',      type:'level',     fields:['level'] },
    { id:'size',    title:'System size',         type:'size',      fields:['sizeTier'] },
    { id:'count',   title:'How many cameras',   type:'count',     fields:['cams','customOpen'] },
    { id:'res',     title:'Camera detail',      type:'resolution',fields:['n12'] },
    { id:'cable',   title:'Cable',              type:'cable',     fields:['env','footage','extraBoxes'] },
    { id:'rec',     title:'Recorder & storage', type:'recorder',  fields:['desiredDays','daysMode','selectedStorageTB','nvrUpgrade','poe'] },
    { id:'install', title:'Installation',       type:'install',   fields:['skipProg'] },
    { id:'monitor', title:'Monitor',            type:'monitor',   fields:['monitorMode','monitor','mount'] },
    { id:'addons',  title:'Add-ons',            type:'addons',    fields:['ups'] },
    { id:'plan',    title:'Protection plan',    type:'plan',      fields:['plan','term','billing'] },
    { id:'review',  title:'Your quote',         type:'review' }
  ]
};

/* =====================================================================
   PRICING ENGINE — pure functions, no DOM.
   ===================================================================== */
const Engine = (() => {
  const C = CONFIG.catalog;
  const R = C.retention;
  const nvrTiers = Object.keys(C.nvr).map(Number).sort((a,b)=>a-b); // [8,16,32]
  const driveSizes = Object.keys(C.drives).map(Number).sort((a,b)=>a-b);

  function nvrTier(n){ return n<=8 ? 8 : n<=16 ? 16 : 32; }
  function boxesFor(n){ return n<=4 ? 0.5 : Math.ceil(n/8); }
  function planTier(n){ return Math.ceil(n/8); }
  function planMonthly(kind, n){ return kind==='none' ? 0 : C.plans[kind]*planTier(n); }
  function maxStorageOf(nvr){ return nvr.bays * nvr.maxTB; }

  // ---- canonical storage-sizing engine -----------------------------------
  function profile(res){ return R.profiles[res] || R.profiles['8MP']; }
  // camera groups → [{count,res,tbPerDay}]; mixed resolution handled natively
  function cameraGroups(s){
    const n = s.cams, n12 = Math.min(s.n12||0, n), n8 = n - n12, g = [];
    if(n8)  g.push({ count:n8,  res:'8MP',  tbPerDay:profile('8MP').tbPerDay });
    if(n12) g.push({ count:n12, res:'12MP', tbPerDay:profile('12MP').tbPerDay });
    return g;
  }
  function dailyTB(groups){ return groups.reduce((a,g)=>a + g.count*g.tbPerDay, 0); }
  function roundUpTB(tb){ const inc=R.incrementTB; return Math.max(R.minTB, Math.ceil((tb - 1e-9)/inc)*inc); }
  function clampDays(d){ const [lo,hi]=R.dayRange; d=Math.round(+d||R.defaultDays); return Math.min(hi, Math.max(lo, d)); }
  function retentionDays(storageTB, daily){ return daily>0 ? storageTB/daily : 0; }       // precise
  function estDays(storageTB, daily){ return Math.floor(retentionDays(storageTB, daily)); } // conservative (floor)

  // real drives (≤bays, each ≤maxPerBay) summing to exactly targetTB. Maximize usage per slot: use the
  // FEWEST drives (largest per slot) first, then the cheapest among equal-count sets. e.g. 28TB → 10+10+8,
  // never 10+10+4+4.
  function realizeDrives(targetTB, nvr){
    const bays = nvr.bays, cap = Math.min(nvr.maxTB, R.maxPerBayTB);
    const usable = driveSizes.filter(d=>d<=cap);
    const memo = new Map();
    function best(rem, baysLeft){
      if(rem===0) return { price:0, drives:[] };
      if(baysLeft===0) return null;
      const key = rem+'/'+baysLeft; if(memo.has(key)) return memo.get(key);
      let win = null;
      for(const d of usable){ if(d>rem) break;
        const sub = best(rem-d, baysLeft-1);
        if(sub){ const cand = { price:sub.price+C.drives[d], drives:[d,...sub.drives] };
          if(!win || cand.drives.length<win.drives.length
             || (cand.drives.length===win.drives.length && cand.price<win.price)) win = cand; }
      }
      memo.set(key, win); return win;
    }
    const r = best(targetTB, bays);
    return r ? { price:r.price, drives:r.drives.sort((a,b)=>b-a) } : null;
  }
  // smallest NVR tier satisfying BOTH channel count and storage target
  function smallestNvr(cams, targetTB){
    for(const t of nvrTiers){ const nv=C.nvr[t]; if(nv.ch>=cams && maxStorageOf(nv)>=targetTB) return nv; }
    return null;
  }

  // THE one function every surface derives from
  function sizeStorage(s){
    const groups = cameraGroups(s);
    const daily = dailyTB(groups);                         // TB/day for the whole system
    const days = clampDays(s.desiredDays);
    const rawTB = daily * days;                            // raw requirement
    const recommendedTB = daily>0 ? roundUpTB(rawTB) : R.minTB;

    // baseline recorder = the customer's explicit pick (when it has enough channels), else the cam-count tier.
    const pickOk = s.nvrPick && C.nvr[s.nvrPick] && C.nvr[s.nvrPick].ch >= s.cams;
    const currentNvr = C.nvr[ pickOk ? s.nvrPick : nvrTier(s.cams) ];
    const currentMax = maxStorageOf(currentNvr);

    const recNvr = smallestNvr(s.cams, recommendedTB);     // smallest recorder that would hold the target days
    const noStandardFit = !recNvr;                         // beyond the whole catalog (40TB) → custom quote
    const requiresUpgrade = !noStandardFit && recNvr.ch > currentNvr.ch;   // target needs a bigger recorder

    // STAY on the current recorder — never silently upgrade; the UI prompts. Storage caps to this recorder.
    let activeNvr = currentNvr;
    if(activeNvr.ch < s.cams) activeNvr = smallestNvr(s.cams, 0) || activeNvr;   // channel-count floor
    const activeMax = maxStorageOf(activeNvr);

    // storage target: manual pick if any, else recommended, clamped to what the active recorder holds
    const base = (s.selectedStorageTB!=null) ? roundUpTB(s.selectedStorageTB) : recommendedTB;
    const storageTB = Math.min(activeMax, Math.max(R.minTB, base));
    const realized = realizeDrives(storageTB, activeNvr) || realizeDrives(activeMax, activeNvr);

    const estimatedDays = estDays(storageTB, daily);
    const maxDaysCurrentNvr = estDays(currentMax, daily);
    const meetsTarget = estimatedDays >= days;

    // capacity options to show: 2TB steps around the recommendation, within the active recorder
    const opts = [];
    for(let tb=R.minTB; tb<=activeMax; tb+=R.incrementTB){
      const d = realizeDrives(tb, activeNvr); if(!d) continue;
      opts.push({ tb, price:d.price, drives:d.drives, days:estDays(tb, daily),
                  recommended: tb===recommendedTB && !noStandardFit && tb<=activeMax });
    }
    // trim to a tidy window around the recommended / selected capacity (keep ≤6 for mobile)
    const focus = Math.max(storageTB, recommendedTB);
    let view = opts;
    if(opts.length>6){
      const idx = opts.findIndex(o=>o.tb>=focus);
      const start = Math.max(0, Math.min(idx-1, opts.length-6));
      view = opts.slice(start, start+6);
      if(!view.some(o=>o.recommended)){ const rc=opts.find(o=>o.recommended); if(rc) view=[rc,...view].slice(0,6).sort((a,b)=>a.tb-b.tb); }
    }

    return {
      groups, daily, days, rawTB, recommendedTB,
      currentNvr, currentMax, recNvr, activeNvr, activeMax,
      storageTB, drives:realized ? realized.drives : [], drivePrice:realized ? realized.price : 0,
      estimatedDays, maxDaysCurrentNvr, meetsTarget,
      requiresUpgrade, noStandardFit, options:opts, viewOptions:view,
      manual: s.selectedStorageTB!=null, calcVersion:C.calcVersion
    };
  }

  function compute(s){
    const n = s.cams, n12 = Math.min(s.n12, n), n8 = n - n12;
    const flags = [], warnings = [];

    // canonical storage sizing drives the recorder, the drives and the retention
    const ss = sizeStorage(s);
    const nvr = ss.activeNvr, tier = nvr.ch, autoTier = ss.currentNvr.ch;
    if(!nvr.verified) flags.push(`${nvr.code}: bays (${nvr.bays}), PoE ports and 12MP support are assumptions — confirm the stocked SKU.`);
    if(n12) flags.push('12MP camera SKU + datasheet not verified (spec BLOCKER).');
    if(ss.noStandardFit) warnings.push(`${ss.recommendedTB}TB for ${ss.days} days exceeds every standard recorder. IOT TECHS will size a custom storage system.`);
    if(ss.requiresUpgrade && s.nvrUpgrade==='keep') warnings.push(`Current ${ss.currentNvr.name} holds up to ${ss.currentMax}TB — about ${ss.maxDaysCurrentNvr} days with this setup, below your ${ss.days}-day target.`);

    const level = C.levels.find(l=>l.id===s.level) || C.levels[0];
    if(level.suggest12MP && n12<n) flags.push('Pro tier: license plate recognition works best on 12MP cameras.');

    // cameras
    const lines = [];
    if(n8)  lines.push({ g:'Equipment', code:'CAM-8',  label:'8MP camera',  qty:n8,  unit:C.cam[8].price,  amt:n8*C.cam[8].price });
    if(n12) lines.push({ g:'Equipment', code:'CAM-12', label:'12MP camera', qty:n12, unit:C.cam[12].price, amt:n12*C.cam[12].price });
    const watts = n8*C.cam[8].watts;
    if(n8) flags.push(`PoE load ≈ ${watts.toFixed(1)} W for ${n8} × 8MP at 6.5 W max (802.3af)${n12?' + 12MP draw unknown':''}. Check recorder/switch PoE budget.`);
    lines.push({ g:'Equipment', code:nvr.code, label:nvr.name, qty:1, unit:nvr.price, amt:nvr.price });

    // storage drives (realized from the 2TB capacity target)
    const counts = {}; ss.drives.forEach(d=>counts[d]=(counts[d]||0)+1);
    Object.keys(counts).map(Number).sort((a,b)=>b-a).forEach(tb=>{
      lines.push({ g:'Equipment', code:`HDD-${tb}`, label:`${tb}TB surveillance drive`, qty:counts[tb], unit:C.drives[tb], amt:counts[tb]*C.drives[tb] });
    });

    // PoE switch
    let poeKind = null;
    if(s.poe==='auto'){ if(n>=17) poeKind = 'bundle'; }
    else if(s.poe!=='none') poeKind = s.poe;
    if(n>=17 && s.poe==='none') warnings.push('17+ cameras need more PoE ports than the recorder provides.');
    if(n>=17 && !(nvr.poe>=16)) flags.push('Auto switch price assumes 16 built-in PoE ports on the 32CH recorder.');
    if(poeKind){
      const p = C.poe[poeKind];
      lines.push({ g:'Equipment', code:p.code, label:'16-port PoE switch'+(poeKind==='bundle'?' (bundle price)':''), qty:1, unit:p.price, amt:p.price });
      flags.push('Check PoE switch wattage against total camera draw.');
    }

    // security-level AI programming adder. Essential = $0; Smart/Pro = $25/camera advanced AI programming
    // (same camera hardware, NVR and storage as Essential — only the configuration differs). Pro layers
    // specialized facial/LPR on top, priced separately at the survey (see the `specialized` flag).
    const levelPerCam = level.addPerCamera||0, levelFlat = level.addFlat||0;
    const levelAmt = Math.round(levelFlat + levelPerCam*n);
    if(levelAmt>0){
      const aiLabel = level.aiLabel || `${level.name} AI package`;
      if(levelPerCam>0 && levelFlat===0) lines.push({ g:'Installation', code:'AI-'+level.id.toUpperCase(), label:aiLabel, qty:n, unit:levelPerCam, amt:levelAmt });
      else lines.push({ g:'Installation', code:'AI-'+level.id.toUpperCase(), label:aiLabel, qty:1, unit:levelAmt, amt:levelAmt });
    }

    // installation services (camera programming is optional)
    C.services.forEach(sv=>{
      if(sv.code==='PROG' && s.skipProg) return;
      lines.push({ g:'Installation', code:sv.code, label:sv.name, qty:n, unit:sv.price, amt:n*sv.price });
    });

    // cable — material cost is NOT charged separately (owner decision; cabling runs are bundled into the
    // per-camera installation). Boxes/footage are still computed for the internal spec, but no Cable line.
    const baseBoxes = boxesFor(n), boxes = baseBoxes + (s.extraBoxes||0);
    const cab = C.cable[s.env];
    const footage = s.footage ?? n*C.cable.feetPerCam;
    const allocated = boxes*C.cable.feetPerBox;

    const base = lines.reduce((a,l)=>a+l.amt,0);
    const discount = Math.round(base*(s.discount||0));
    const discountedBase = base - discount;

    // customer promo / voucher — discounts the package only, capped so it can't exceed it
    let promo = null, promoDiscount = 0;
    if(s.promoCode){
      const p = C.promos[s.promoCode];
      if(p){ promo = { code:s.promoCode, ...p };
        promoDiscount = p.type==='percent' ? Math.round(discountedBase*p.value) : Math.min(p.value, discountedBase);
      }
    }
    const netBase = discountedBase - promoDiscount;

    // add-ons (never discounted)
    const addons = [];
    ['monitor','mount','ups'].forEach(k=>{ if(s[k]){ const a=C.addons[k]; const qty = (k==='monitor'||k==='mount') ? Math.max(1, s.monitorQty||1) : 1; addons.push({ g:'Add-ons', code:a.code, label:a.name, qty, unit:a.price, amt:a.price*qty }); }});
    const addonTotal = addons.reduce((a,l)=>a+l.amt,0);

    // service plan
    const monthly = planMonthly(s.plan, n);
    const months = s.term*12;
    const termTotal = monthly*months;
    const prepaid = Math.round(termTotal*5/6/100)*100;
    const planUpfront = s.plan!=='none' && s.billing==='prepaid' ? prepaid : 0;
    const planMonthlyDue = s.plan!=='none' && s.billing==='monthly' ? monthly : 0;

    const adjust = Math.round(s.adjust||0);
    const beforeTax = netBase + addonTotal + planUpfront + adjust;
    const tax = Math.round(beforeTax*(s.taxRate||0));
    const total = beforeTax + tax;

    return { n, n8, n12, level, nvr, tier, autoTier, ss, boxes, baseBoxes, footage, allocated,
             lines, base, discount, discountedBase, promo, promoDiscount, netBase, addons, addonTotal,
             plan:{ kind:s.plan, monthly, months, termTotal, prepaid, upfront:planUpfront, monthlyDue:planMonthlyDue, tier:planTier(n) },
             adjust, beforeTax, tax, total, warnings, flags };
  }
  return { compute, sizeStorage, nvrTier, boxesFor, planMonthly };
})();
