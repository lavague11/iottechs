/* =====================================================================
   BYS — "Build Your System" · AUDIO (commercial sound) spec
   Build Your Sound System. The THIRD BYS vertical. Declares the shared globals the
   BYS shell consumes (SPEC, CONFIG, Engine) + SPEC.render / SPEC.actions for its
   config steps. Classic <script> — shares the shell's global scope. Money is cents.
   Pricing follows the commercial-audio rate sheet: ceiling speaker ~$300 installed,
   4-zone amplifier $350, rack & mount $150, zone volume control $90.
   ===================================================================== */

const SPEC = {
  id: 'audio',
  brand: { company: 'IOT TECHS', tagline: 'Build your sound system', title: 'Build Your Sound System' },
  lead:  { service: 'AUDIO', endpoint: '/api/leads/audio' },
  steps: [
    { id: 'capabilities', label: 'Sound', title: 'What do you need?', single: ['features'] },
    { id: 'hardware',     label: 'System', title: 'Your system',      single: ['system'] },
  ],
};

/* =====================================================================
   CONFIG — audio catalog + tiers (ids essential/smart/pro reused by the shared
   Quote + recommendLevel machinery; customer-facing names Background / Multi-Zone / Pro).
   ===================================================================== */
const CONFIG = {
  version: 'audio-2026.10',
  defaults: {
    zones: 2, speakers: 6, speakerType: 'ceiling', rack: true, zoneControls: true, skipInstall: false,
    level: 'essential', levelManual: false, features: [],
    term: 1, billing: 'monthly', plan: 'none', discount: 0, promoCode: null, taxRate: 0,
  },
  catalog: {
    // speaker is all-in INSTALLED (speaker + mount + cable), per the rate sheet (~$300 ceiling)
    speaker: {
      ceiling: { price: 30000, label: 'Ceiling' },
      surface: { price: 32000, label: 'Surface / wall' },
      outdoor: { price: 40000, label: 'Outdoor-rated' },
    },
    amp:    { price: 35000, zones: 4 },   // 4-zone amplifier (head end)
    rack:   { price: 15000 },             // rack & mount
    volume: { price: 9000 },              // per-zone volume control
    setup:  { flat: 15000 },              // system setup & tuning (unless DIY)
    // Audio capability tiers (shared Quote machinery)
    levels: [
      { id:'essential', name:'Background', tag:'Simple', line:'Music everywhere',
        blurb:'Clean background music across your space, controlled from your phone.',
        features:['Background music','Phone / app control','Clear, even coverage'],
        addPerStation:0, addFlat:0 },
      { id:'smart', name:'Multi-Zone', tag:'Most popular', line:'Zones + paging',
        blurb:'Independent zone volumes, paging/announcements and streaming.',
        features:['Independent zone volumes','Paging & announcements','Streaming & Bluetooth'],
        addPerStation:0, addFlat:25000, recommended:true },
      { id:'pro', name:'Pro Audio', tag:'Advanced', line:'Outdoor + control',
        blurb:'Outdoor-rated zones, microphone/PA input and advanced multi-room control.',
        features:['Outdoor-rated zones','Microphone / PA input','Advanced multi-room control'],
        addPerStation:0, addFlat:60000, specialized:true },
    ],
    // Capability checklist (Sound step). `level` drives the recommended tier.
    securityFeatures: [
      { id:'bgmusic',  label:'Background music', level:1, info:'Even, low-profile music across the space.' },
      { id:'volume',   label:'Volume control', level:1, info:'Set and forget, or adjust from your phone.' },
      { id:'zones',    label:'Independent zones', level:2, info:'Different volume (or source) in different areas.' },
      { id:'paging',   label:'Paging & announcements', level:2, info:'Make announcements to one area or everywhere.' },
      { id:'streaming',label:'Streaming & Bluetooth', level:2, info:'Play from Spotify, a streaming box or Bluetooth.' },
      { id:'outdoor',  label:'Outdoor speakers', level:3, specialized:true, info:'Weatherproof speakers for patios and exteriors.' },
      { id:'mic',      label:'Microphone / PA', level:3, specialized:true, info:'Wired/wireless mic input for live announcements.' },
    ],
  },
};

/* =====================================================================
   PRICING ENGINE — pure. Returns a shape compatible with the BYS Quote machinery
   plus a cameras-shaped `ss` STUB so the shell's submit/snapshot path never crashes.
   ===================================================================== */
const Engine = (() => {
  const C = CONFIG.catalog;
  function compute(s){
    const zones = Math.max(1, +s.zones||1), speakers = Math.max(1, +s.speakers||1);
    const st = C.speaker[s.speakerType] || C.speaker.ceiling;
    const lv = C.levels.find(l=>l.id===s.level) || C.levels[0];
    const lines = [];
    lines.push({ g:'Equipment', code:'SPK', label:st.label+' speaker', qty:speakers, unit:st.price, amt:speakers*st.price });
    const amps = Math.ceil(zones / C.amp.zones);
    lines.push({ g:'Equipment', code:'AMP', label:'Amplifier ('+C.amp.zones+'-zone)', qty:amps, unit:C.amp.price, amt:amps*C.amp.price });
    if(s.zoneControls) lines.push({ g:'Equipment', code:'VOL', label:'Zone volume control', qty:zones, unit:C.volume.price, amt:zones*C.volume.price });
    if(s.rack) lines.push({ g:'Equipment', code:'RACK', label:'Rack & mount', qty:1, unit:C.rack.price, amt:C.rack.price });
    if(lv.addFlat) lines.push({ g:'Equipment', code:'PKG', label:lv.name+' package', qty:1, unit:lv.addFlat, amt:lv.addFlat });
    const setupAmt = s.skipInstall ? 0 : C.setup.flat;
    if(setupAmt) lines.push({ g:'Installation', code:'SETUP', label:'System setup & tuning', qty:1, unit:setupAmt, amt:setupAmt });
    const base = lines.reduce((a,l)=>a+l.amt,0);
    const tax = Math.round(base*(+s.taxRate||0));
    const total = base + tax;
    const ss = { calcVersion:'audio', days:0, recommendedTB:0, storageTB:0, estimatedDays:0, daily:0, rawTB:0,
      drives:[], activeNvr:{ code:'—', name:'—' }, requiresUpgrade:false, noStandardFit:false, groups:[] };
    return { n:speakers, zones, speakers, amps, level:lv, lines, addons:[], base, discount:0,
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
    const pkg = f => ({1:{t:'ess',l:'Background'},2:{t:'smart',l:'Multi-Zone'},3:{t:'pro',l:'Pro'}})[f.level] || null;
    const info = f => f.info ? `<span class="feat-info" data-act="featinfo" data-v="${f.id}" role="button" tabindex="0" aria-label="About ${f.label}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11.3v4.4"/><circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none"/></svg></span>` : '';
    const row = f => { const p = pkg(f); return `<button type="button" class="feat-row ${sel.has(f.id)?'on':''}" data-act="feat" data-v="${f.id}" aria-pressed="${sel.has(f.id)}">
      <span class="feat-box" aria-hidden="true"></span><span class="feat-name">${f.label}</span>${info(f)}${p?`<span class="feat-pkg ${p.t}">${p.l}</span>`:''}</button>`; };
    const rec = recommendLevel(state.features);
    const recName = ({essential:'Background',smart:'Multi-Zone',pro:'Pro Audio'})[rec.level];
    const recNote = rec.hasCamFeatures ? `<div class="feat-rec"><span class="feat-rec-k">Recommended</span> ${recName} plan</div>` : '';
    return `${head(s,i,'Select what you need — we\'ll match you to the right system.', false)}
      <div class="feat-list">${CONFIG.catalog.securityFeatures.map(row).join('')}</div>
      ${recNote}`;
  },
  system(s, q, i){
    const step = (label, key, val, sub, min) => `<div class="opt">
      <div class="opt-head" style="cursor:default">
        <div><div class="opt-title">${label}</div>${sub?`<div class="opt-sub">${sub}</div>`:''}</div>
        <div class="mini-step"><button data-act="audqty" data-v="${key}:-1" aria-label="Fewer ${label}" ${val<=(min||0)?'disabled':''}>−</button><b>${val}</b><button data-act="audqty" data-v="${key}:1" aria-label="More ${label}">+</button></div>
      </div></div>`;
    const toggle = (label, key, on, sub) => `<div class="opt ${on?'sel':''}">
      <button type="button" class="pick opt-head" data-act="audtoggle" data-v="${key}"><span class="check"></span>
        <div><div class="opt-title">${label}</div>${sub?`<div class="opt-sub">${sub}</div>`:''}</div></button></div>`;
    return `<div class="sys-block"><div class="eyebrow">Coverage</div>
        <div class="opts">
          ${step('Zones','zones',state.zones,'Separately-controlled areas',1)}
          ${step('Speakers','speakers',state.speakers,'Total across the space',1)}
        </div>
        ${cardGroup('Speaker type', 'spktype', state.speakerType, [{v:'ceiling',title:'Ceiling'},{v:'surface',title:'Surface'},{v:'outdoor',title:'Outdoor'}])}
      </div>
      <hr class="sys-div">
      <div class="sys-block"><div class="eyebrow">Head end</div>
        <div class="opts">
          ${toggle('Zone volume controls','zoneControls',state.zoneControls,'A wall control per zone')}
          ${toggle('Rack & mount','rack',state.rack,'Tidy, serviceable equipment rack')}
          ${toggle('Professional install','install',!state.skipInstall,'We run, mount, wire and tune everything')}
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
  audqty(v){ const parts = String(v).split(':'); const k = parts[0], d = +parts[1]||0;
    state[k] = Math.max(1, Math.min(200, (+state[k]||0) + d)); },
  audtoggle(v){ if(v==='install') state.skipInstall = !state.skipInstall; else state[v] = !state[v]; },
  spktype(v){ state.speakerType = v; },
};
SPEC.render = SPEC_render;
SPEC.actions = SPEC_actions;
