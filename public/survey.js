// Inline SVG icon set (no emoji anywhere in the UI). Shared by both IIFEs.
var SVI=(function(){var p='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex:none">',e='</svg>',o={};
  function d(k,b){o[k]=p+b+e;}
  d('place','<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>');
  d('move','<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>');
  d('select','<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"/><path d="M13 13l6 6"/>');
  d('pen','<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>');
  d('structure','<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>');
  d('furniture','<path d="M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M2 13a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5h-2v-2H4v2H2z"/>');
  d('note','<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>');
  d('blank','<rect x="4" y="4" width="16" height="16" rx="2"/>');
  d('image','<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>');
  d('bright','<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>');
  d('dim','<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>');
  d('upload','<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>');
  d('crop','<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h2M6 6h12v12M18 22v-2"/>');
  d('rotL','<path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 .5-4.5"/>');
  d('rotR','<path d="M21 2v6h-6"/><path d="M21 13a9 9 0 1 1-.5-4.5"/>');
  d('flip','<path d="M12 3v18"/><path d="M8 7l-4 5 4 5M16 7l4 5-4 5"/>');
  d('tag','<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.2"/>');
  d('eye','<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');
  d('trash','<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
  d('layers','<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>');
  d('expand','<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>');
  d('undo','<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2-5.7L3 11"/>');
  d('refresh','<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>');
  d('tools','<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>');
  d('bulb','<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>');
  d('paper','<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>');
  d('pin','<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>');
  d('plus','<path d="M12 5v14M5 12h14"/>');
  return o;
})();
(function(){
  var ICONS={
    cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    face:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8"/><path d="M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8"/><path d="M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16"/><path d="M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16"/><path d="M9 10v1.5"/><path d="M15 10v1.5"/><path d="M9 15a4 4 0 0 0 6 0"/></svg>',
    plate:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="9" y1="10" x2="9" y2="14"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="15" y1="10" x2="15" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/></svg>',
    hdmi:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h11l4 2.5v3L15 16H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><line x1="7" y1="11" x2="7" y2="13"/><line x1="10" y1="11" x2="10" y2="13"/><line x1="13" y1="11" x2="13" y2="13"/></svg>',
    fiber:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2.3"/><path d="M7.3 12H12"/><path d="M12 12l8.5-4"/><path d="M12 12h9"/><path d="M12 12l8.5 4"/></svg>',
    coax:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="12" r="5.5"/><circle cx="8.5" cy="12" r="1.6"/><path d="M14 12h7"/></svg>',
    power:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 4 14 11 14 10 22 19 9 12 9 13 2"/></svg>',
    nvr:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><line x1="7" y1="7" x2="7.01" y2="7"/><line x1="7" y1="17" x2="7.01" y2="17"/></svg>',
    isp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M8.5 16.1a6 6 0 0 1 7 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
    poe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="8" rx="1"/><line x1="6" y1="16" x2="6" y2="19"/><line x1="10" y1="16" x2="10" y2="19"/><line x1="14" y1="16" x2="14" y2="19"/><line x1="18" y1="16" x2="18" y2="19"/></svg>',
    rj45:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4"/><rect x="5" y="10" width="14" height="9" rx="1.5"/><line x1="8.5" y1="10" x2="8.5" y2="13"/><line x1="12" y1="10" x2="12" y2="13"/><line x1="15.5" y1="10" x2="15.5" y2="13"/></svg>',
    amp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><line x1="15" y1="10" x2="18" y2="10"/><line x1="15" y1="14" x2="18" y2="14"/></svg>',
    spk:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7" r="1.2"/></svg>',
    aux:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>',
    router:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="13" width="18" height="6" rx="1"/><line x1="7" y1="16" x2="7.01" y2="16"/><path d="M12 13V8"/><path d="M8.5 8a3.5 3.5 0 0 1 7 0"/></svg>',
    ap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12a7 7 0 0 1 14 0"/><path d="M8.5 12a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="12" r="1"/></svg>',
    pos:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="11" rx="1"/><line x1="8" y1="18" x2="16" y2="18"/><line x1="12" y1="14" x2="12" y2="18"/></svg>',
    printer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="5"/><rect x="3" y="8" width="18" height="8" rx="1"/><rect x="7" y="14" width="10" height="6"/></svg>',
    display:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>',
    kiosk:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="15" rx="1"/><circle cx="12" cy="9.5" r="2"/><rect x="9" y="17" width="6" height="5"/></svg>',
    note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>',
    outlet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="10" y1="9" x2="10" y2="12"/><line x1="14" y1="9" x2="14" y2="12"/><circle cx="12" cy="16" r="1"/></svg>',
    hazard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 22 20 2 20Z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    door:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="11" height="18" rx="1"/><circle cx="13.5" cy="12" r="1"/><line x1="3" y1="21" x2="21" y2="21"/></svg>',
    motion:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="M13 7l-2 5 3 3 1 6"/><path d="M11 12l-4 2"/><path d="M14 15l4 1"/></svg>',
    glass:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3l-3 7 4 4-2 7"/><path d="M12 10l5 2"/></svg>',
    keypad:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="7" x2="8.01" y2="7"/><line x1="12" y1="7" x2="12.01" y2="7"/><line x1="16" y1="7" x2="16.01" y2="7"/><line x1="8" y1="11" x2="8.01" y2="11"/><line x1="12" y1="11" x2="12.01" y2="11"/><line x1="16" y1="11" x2="16.01" y2="11"/><line x1="8" y1="15" x2="8.01" y2="15"/><line x1="12" y1="15" x2="12.01" y2="15"/><line x1="16" y1="15" x2="16.01" y2="15"/></svg>',
    fire:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5-1-7 0-1 1-3 2-4z"/></svg>',
    important:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>'
  };
  var GROUPS=[
    {key:'cctv',name:'Cameras',color:'#C9A96E',items:[
      {k:'cam',label:'Camera',tag:'CAM',ic:'cam'},{k:'fr',label:'Facial',tag:'FR',ic:'face',cable:true,fov:70},{k:'lpr',label:'License',tag:'LPR',ic:'plate',cable:true,fov:38},{k:'rj45',label:'Cat 6',tag:'C6',ic:'rj45',cable:true},{k:'nvr',label:'NVR',tag:'NVR',ic:'nvr'},
      {k:'isp',label:'ISP',tag:'ISP',ic:'isp'},{k:'poe',label:'PoE Switch',tag:'POE',ic:'poe'},{k:'disp',label:'Display',tag:'DISP',ic:'display'}]},
    {key:'sound',name:'Sound',color:'#B084E0',items:[
      {k:'amp',label:'Amp',tag:'AMP',ic:'amp'},{k:'spk',label:'Speaker',tag:'SPK',ic:'spk'},{k:'aux',label:'Audio Input',tag:'AUX',ic:'aux'}]},
    {key:'toast',name:'Toast',color:'#E8743B',items:[
      {k:'pronto',label:'Pronto',tag:'PRO',ic:'router'},{k:'tap',label:'Access Point',tag:'AP',ic:'ap',cable:true},
      {k:'tpoe',label:'PoE Switch',tag:'POE',ic:'poe'},{k:'pos',label:'POS Terminal',tag:'POS',ic:'pos',cable:true},
      {k:'kprint',label:'Kitchen Printer',tag:'KP',ic:'printer',cable:true},{k:'kds',label:'Kitchen Display (KDS)',tag:'KDS',ic:'display',cable:true},
      {k:'ssk',label:'Self-Service Kiosk',tag:'SSK',ic:'kiosk',cable:true}]},
    {key:'wiring',name:'Wires',color:'#34C759',items:[
      {k:'wcat6',label:'Cat 6',tag:'C6',ic:'rj45'},{k:'whdmi',label:'HDMI',tag:'HDMI',ic:'hdmi'},{k:'wfiber',label:'Fiber',tag:'FIB',ic:'fiber'},
      {k:'wcoax',label:'Coax',tag:'COAX',ic:'coax'},{k:'wpower',label:'Power',tag:'PWR',ic:'power'},{k:'wspeaker',label:'Speaker',tag:'SPK',ic:'spk'}]},
    {key:'alarm',name:'Alarms',color:'#5FB8DB',items:[
      {k:'door',label:'Door / Window Sensor',tag:'DR',ic:'door'},
      {k:'motion',label:'Motion Detector',tag:'MOT',ic:'motion',fov:110},
      {k:'glass',label:'Glassbreak',tag:'GB',ic:'glass',fov:360},
      {k:'keypad',label:'Keypad',tag:'KEY',ic:'keypad'},
      {k:'fire',label:'Fire / CO Alarm',tag:'FCO',ic:'fire',fov:360}]},
    {key:'misc',name:'Misc',color:'#E8C547',items:[
      {k:'important',label:'Important',tag:'IMP',ic:'important'},
      {k:'outlet',label:'Outlet',tag:'OUT',ic:'outlet'},
      {k:'hazard',label:'Hazard',tag:'HAZ',ic:'hazard'}]}
  ];
  var TYPE={},ORDER=[],IC={},TL={};
  GROUPS.forEach(function(g){g.items.forEach(function(it){it.group=g.key;it.color=g.color;it.iconSvg=ICONS[it.ic];TYPE[it.k]=it;ORDER.push(it.k);IC[it.k]=it.iconSvg;TL[it.k]=it.label;});});
  var CONE={cam:1,motion:1,glass:1,fire:1,fr:1,lpr:1};
  var CAMK={cam:1,fr:1,lpr:1};  // camera family: green tag badge + Cat 6 cable note
  function defFov(k){return (TYPE[k]&&TYPE[k].fov)||90;}
  // ── Site conditions (surfaces / structure) — captured per floor, travels with the survey & import ──
  var CONDITIONS=[
    {k:'propertyType',label:'Property Type',def:'Retail',opts:['Retail','Residential','Warehouse','Framing','Other']},
    {k:'exterior',label:'Exterior Material',def:'Vinyl Siding',opts:['Vinyl Siding','Aluminum Siding','Wood Siding','Stucco','Brick / Stone','Other']},
    {k:'interiorWall',label:'Interior Wall Material',def:'Sheetrock',opts:['Sheetrock','Wood Paneling','Commercial Kitchen Panels (FRP)','Tile','Metal Panels','Brick / Stone','Other']},
    {k:'floor',label:'Floor Material',def:'Hardwood / Vinyl',opts:['Hardwood / Vinyl','Carpet','Tile','Other']},
    {k:'ceiling',label:'Ceiling Material',def:'Sheetrock',opts:['Sheetrock','Drop Ceiling','Exposed Ceiling','Wood','Metal','Other']},
    {k:'basement',label:'Basement',def:'None',opts:['None','Unfinished','Finished','Framing','Crawl Space']},
    {k:'attic',label:'Attic',def:'None',opts:['None','Unfinished','Finished','Framing','Limited Access']}
  ];
  function defaultConditions(){var o={};CONDITIONS.forEach(function(c){o[c.k]=c.def;});return o;}
  function conditionsSummary(cond){if(!cond)cond=defaultConditions();return CONDITIONS.map(function(c){return c.label+': '+(cond[c.k]||c.def);}).join(' · ');}
  var condsCollapsed=false;
  var SPOTS=[
    {id:'front-left',label:'Front Left',x:27,y:90},{id:'front-center',label:'Front Center',x:50,y:90},{id:'front-right',label:'Front Right',x:73,y:90},
    {id:'right-front',label:'Right Side Front',x:90,y:73},{id:'right-middle',label:'Right Side Middle',x:90,y:50},{id:'right-back',label:'Right Side Back',x:90,y:27},
    {id:'back-right',label:'Back Right',x:73,y:10},{id:'back-center',label:'Back Center',x:50,y:10},{id:'back-left',label:'Back Left',x:27,y:10},
    {id:'left-front',label:'Left Side Front',x:10,y:73},{id:'left-middle',label:'Left Side Middle',x:10,y:50},{id:'left-back',label:'Left Side Back',x:10,y:27}
  ];
  var $=function(i){return document.getElementById(i);};
  var card=$('card'),pill=$('pill'),out=$('out'),outPre=$('outPre'),doneBtn=$('doneBtn'),sideHead=$('sideHead');
  var list=$('list'),empty=$('empty'),toolbar=$('toolbar'),hint=$('hint');
  var viewport=$('viewport'),zoomlayer=$('zoomlayer'),board=$('board'),boardImg=$('boardImg'),drawCanvas=$('drawCanvas');
  var dctx=drawCanvas.getContext('2d');
  var B={bg:'blank',img:null,imgSource:null,imgRatio:1,imgRotate:0,ftWide:0,rooms:[],strokes:[],notes:[],overlays:[],sat:null,zoom:{s:1,tx:0,ty:0},iconScale:0.8,bright:false,locked:false,conditions:defaultConditions()};
  var AREALAB={building:['Buildings','BLD'],room:['Rooms','RM'],bathroom:['Bathrooms','WC'],stairs:['Stairs','ST'],entrance:['Entrances','EN'],parking:['Parking','PK'],aisle:['Aisles','AI'],counter:['Counters','CTR'],fridge:['Fridges','FRG'],dining:['Dining','DN'],booth:['Booths','BO'],register:['Registers','REG']};
  var AREAKINDS=['building','room','bathroom','stairs','entrance','parking','aisle','counter','fridge','dining','booth','register'];
  var NOTE_COLOR='#4FB6B6';
  var markers=[],uid=1,placeMode='in',activeType='cam',tool='place',drawMode='line',roomKind='room',cropping=false,lineColor='#0B0F1A',boardBright=false,viewLocked=false,fillColor=null;
  var STRUCT_KINDS=['room','bathroom','stairs','entrance','parking'],FURN_KINDS=['counter','fridge','aisle','dining','booth'];
  var KINDLABEL={room:'Room',building:'Building',bathroom:'Bathroom',stairs:'Stairs',entrance:'Entrance',parking:'Parking lot',counter:'Counter',fridge:'Fridge / Cooler',aisle:'Aisle',dining:'Dining',booth:'Booth',register:'Cash Register'};
  var areaPolyKind='room';
  var AREACOLOR={building:'#C9A96E',room:'#2C3347',bathroom:'#7FB0C0',stairs:'#6CA0F0',entrance:'#9AA3B2',parking:'#8A93A8',counter:'#B0966E',fridge:'#6FB3CF',aisle:'#9FB0C8',dining:'#E0A36E',booth:'#D98E5A',register:'#4A90D9'};
  function hexA(h,a){var n=parseInt(h.slice(1),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}
  function centroid(pts){var x=0,y=0,i;for(i=0;i<pts.length;i++){x+=pts[i].x;y+=pts[i].y;}return {x:x/pts.length,y:y/pts.length};}
  var show={cctv:true,wiring:true,sound:true,toast:true,alarm:true,misc:true,range:true,builder:true};
  var showOpen=false;
  var floors=[{name:'Floor 1',B:B,markers:markers,uid:uid}],curFloor=0,pendingReset=false,floorMenuOpen=false,resetMenuOpen=false;
  function freshFloor(name){return{name:name,B:{bg:'blank',img:null,imgSource:null,imgRatio:1,imgRotate:0,ftWide:0,rooms:[],strokes:[],notes:[],overlays:[],sat:null,zoom:{s:1,tx:0,ty:0},iconScale:0.8,bright:false,locked:false,conditions:defaultConditions()},markers:[],uid:1};}
  var PAT={parking:{w:26,h:48,sw:2,stroke:'#E3C766',fill:"<line x1='1.2' y1='3' x2='1.2' y2='45'/><line x1='1.2' y1='3' x2='25' y2='3'/>"}};
  var SYMFILL={
    dining:{stroke:'#E0A36E',sw:3,g:"<rect x='30' y='30' width='40' height='40' rx='3'/><rect x='41' y='12' width='18' height='11' rx='2.5'/><rect x='41' y='77' width='18' height='11' rx='2.5'/><rect x='12' y='41' width='11' height='18' rx='2.5'/><rect x='77' y='41' width='11' height='18' rx='2.5'/>"},
    booth:{stroke:'#D98E5A',sw:3,g:"<rect x='5' y='22' width='90' height='56' rx='9'/><rect x='5' y='22' width='15' height='56' rx='8'/><rect x='80' y='22' width='15' height='56' rx='8'/><path d='M20 41 H80'/><line x1='40' y1='41' x2='40' y2='78'/><line x1='60' y1='41' x2='60' y2='78'/>"},
    fridge:{stroke:'#6FB3CF',sw:3,g:"<rect x='6' y='8' width='88' height='84' rx='4'/><line x1='36.7' y1='8' x2='36.7' y2='92'/><line x1='63.3' y1='8' x2='63.3' y2='92'/><line x1='30' y1='42' x2='30' y2='58'/><line x1='57' y1='42' x2='57' y2='58'/><line x1='84' y1='42' x2='84' y2='58'/>"},
    aisle:{stroke:'#9FB0C8',sw:2.6,g:"<rect x='6' y='10' width='88' height='80' rx='2'/><line x1='6' y1='30' x2='94' y2='30'/><line x1='6' y1='50' x2='94' y2='50'/><line x1='6' y1='70' x2='94' y2='70'/>"}
  };
  var SYM={
    bathroom:{stroke:'#7FB0C0',sw:3.5,g:"<rect x='12' y='16' width='20' height='12' rx='2'/><ellipse cx='22' cy='42' rx='13' ry='10'/><line x1='22' y1='28' x2='22' y2='32'/><rect x='54' y='30' width='32' height='22' rx='3'/><circle cx='70' cy='41' r='3.5'/><line x1='70' y1='20' x2='70' y2='30'/>"},
    register:{stroke:'#4A90D9',sw:3.5,g:"<rect x='18' y='44' width='64' height='34' rx='3'/><rect x='44' y='16' width='30' height='22' rx='2'/><line x1='18' y1='60' x2='82' y2='60'/><line x1='46' y1='70' x2='62' y2='70'/><circle cx='29' cy='52' r='2'/><circle cx='37' cy='52' r='2'/><circle cx='45' cy='52' r='2'/>"}
  };
  function patSvg(kind,rm){var p=PAT[kind],fx=rm.flip?-1:1,id='pat'+rm.id;
    return "<svg class='pat' width='100%' height='100%' preserveAspectRatio='none' xmlns='http://www.w3.org/2000/svg'><defs><pattern id='"+id+"' patternUnits='userSpaceOnUse' width='"+p.w+"' height='"+p.h+"' patternTransform='scale("+fx+",1)'><g fill='none' stroke='"+p.stroke+"' stroke-width='"+p.sw+"' opacity='0.85'>"+p.fill+"</g></pattern></defs><rect width='100%' height='100%' fill='url(#"+id+")'/></svg>";}
  function symSvgFill(kind,rm){var s=SYMFILL[kind],fx=rm.flip?-1:1;
    return "<svg width='100%' height='100%' viewBox='0 0 100 100' preserveAspectRatio='none' xmlns='http://www.w3.org/2000/svg'><g transform='translate(50 50) scale("+fx+",1) translate(-50 -50)' fill='none' stroke='"+s.stroke+"' stroke-width='"+s.sw+"' stroke-linecap='round' stroke-linejoin='round'>"+s.g+"</g></svg>";}
  function symSvg(kind,rm){var s=SYM[kind],fx=rm.flip?-1:1;
    return "<svg viewBox='0 0 100 100' preserveAspectRatio='xMidYMid meet' xmlns='http://www.w3.org/2000/svg'><g transform='translate(50 50) scale("+fx+",1) translate(-50 -50)' fill='none' stroke='"+s.stroke+"' stroke-width='"+s.sw+"' stroke-linecap='round' stroke-linejoin='round'>"+s.g+"</g></svg>";}
  function decorate(d,rm){var kind=rm.kind,w;
    if(kind==='building'){var f=document.createElement('div');f.className='bld-front';f.title='Curb / street (front)';d.appendChild(f);return;}
    if(SYMFILL[kind]){w=document.createElement('div');w.className='decor decor-fill';w.innerHTML=symSvgFill(kind,rm);d.appendChild(w);}
    else if(PAT[kind]){w=document.createElement('div');w.className='decor decor-fill';w.innerHTML=patSvg(kind,rm);d.appendChild(w);}
    else if(SYM[kind]){w=document.createElement('div');w.className='decor';w.innerHTML=symSvg(kind,rm);d.appendChild(w);}}
  function hasDecor(kind){return !!(PAT[kind]||SYM[kind]||SYMFILL[kind]);}
  function snapFloor(){B.bright=boardBright;B.locked=viewLocked;floors[curFloor].B=B;floors[curFloor].markers=markers;floors[curFloor].uid=uid;}
  function loadFloor(i){curFloor=i;B=floors[i].B;markers=floors[i].markers;uid=floors[i].uid;
    if(B.iconScale==null)B.iconScale=0.8;boardBright=!!B.bright;viewLocked=!!B.locked;syncIconUI();}
  function syncIconUI(){var v=$('iconScaleVal');if(v){v.textContent=Math.round((B.iconScale||0.8)*100)+'%';}}
  function gotoFloor(i){if(i===curFloor)return;cancelPending();snapFloor();loadFloor(i);render();}
  function nextFloorNum(){var mx=1;floors.forEach(function(f){var m=/floor\s*(\d+)/i.exec(f.name);if(m)mx=Math.max(mx,+m[1]);});return mx+1;}
  function addFloorNamed(name){cancelPending();snapFloor();floors.push(freshFloor(name));loadFloor(floors.length-1);render();showToast('Added “'+name+'”');}
  function delFloor(i){if(floors.length<=1)return;cancelPending();snapFloor();floors.splice(i,1);loadFloor(Math.min(curFloor>=floors.length?floors.length-1:(i<curFloor?curFloor-1:curFloor),floors.length-1));render();}
  function resetAll(){cancelPending();floors=[freshFloor('Floor 1')];loadFloor(0);boardImg.hidden=true;boardImg.removeAttribute('src');boardImg.style.transform='';setSat('');render();showToast('Project reset');}
  function resetFloor(){cancelPending();var nm=floors[curFloor].name;floors[curFloor]=freshFloor(nm);loadFloor(curFloor);boardImg.hidden=true;boardImg.removeAttribute('src');boardImg.style.transform='';setSat('');render();showToast('Floor reset');}
  // ── Undo: snapshot the floor's content before a mutating action; undo restores the last snapshot ──
  var undoStack=[];
  function snapUndo(){undoStack.push(JSON.stringify({m:markers,r:B.rooms||[],s:B.strokes||[],n:B.notes||[],o:B.overlays||[]}));if(undoStack.length>50)undoStack.shift();}
  function undo(){if(!undoStack.length){showToast('Nothing to undo');return;}cancelPending();var s=JSON.parse(undoStack.pop());markers=s.m;floors[curFloor].markers=markers;B.rooms=s.r;B.strokes=s.s;B.notes=s.n;B.overlays=s.o||[];render();showToast('Undone');}
  var toastT=null;
  function showToast(msg){var t=$('toast');if(!t)return;t.textContent=msg;t.classList.add('show');if(toastT)clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('show');},1900);}
  var ddwrap=$('ddwrap');
  function closeMenus(){var o=document.querySelectorAll('.dd.open');for(var i=0;i<o.length;i++)o[i].classList.remove('open');showOpen=false;}
  document.addEventListener('click',closeMenus);
  function buildDropdowns(){
    ddwrap.innerHTML='';
    GROUPS.forEach(function(g){
      var dd=document.createElement('div');dd.className='dd';
      var btn=document.createElement('button');btn.className='dd-btn';
      var rep=IC[{cctv:'cam',sound:'spk',toast:'pos'}[g.key]]||g.items[0].iconSvg;
      btn.innerHTML='<span class="di-ic dd-ic" style="background:'+g.color+'">'+rep+'</span><span class="dd-name">'+g.name+'</span><span class="car">▾</span>';
      var menu=document.createElement('div');menu.className='dd-menu';
      g.items.forEach(function(it){var row=document.createElement('div');row.className='dd-item'+(activeType===it.k?' active':'');
        row.innerHTML='<span class="di-ic" style="background:'+g.color+'">'+it.iconSvg+'</span>'+it.label+'<span class="di-tag">'+it.tag+'</span>';
        row.addEventListener('click',function(e){e.stopPropagation();selectType(it.k);closeMenus();});menu.appendChild(row);});
      var add=document.createElement('div');add.className='dd-add';add.innerHTML='<input class="dd-add-in" placeholder="Custom '+g.name+' item…"><button class="dd-add-btn">Add</button>';
        var inp=add.querySelector('input'),ab=add.querySelector('button');
        add.addEventListener('click',function(e){e.stopPropagation();});add.addEventListener('pointerdown',function(e){e.stopPropagation();});
        inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();addCustomType(inp.value,g.key);}});
        ab.addEventListener('click',function(e){e.stopPropagation();addCustomType(inp.value,g.key);});menu.appendChild(add);
      btn.addEventListener('click',function(e){e.stopPropagation();var was=dd.classList.contains('open');closeMenus();if(!was){dd.classList.add('open');
        // Position the menu with fixed coords so the scrollable legend can't clip it and it stays above the tools
        var r=btn.getBoundingClientRect();menu.style.position='fixed';menu.style.left=(r.right+8)+'px';menu.style.zIndex='300';menu.style.maxHeight='';menu.style.overflowY='visible';
        var mh=menu.offsetHeight,top=r.top;if(mh>window.innerHeight-20){top=10;menu.style.maxHeight=(window.innerHeight-20)+'px';menu.style.overflowY='auto';}else if(top+mh>window.innerHeight-10){top=Math.max(10,window.innerHeight-10-mh);}menu.style.top=top+'px';}});
      dd.appendChild(btn);dd.appendChild(menu);ddwrap.appendChild(dd);
    });
    updatePlacing();
  }
  function updatePlacing(){
    var t=TYPE[activeType];
    var dds=ddwrap.querySelectorAll('.dd');
    // The selected equipment is shown by a shaded highlight on its group in the left bar (no "Placing:" text).
    GROUPS.forEach(function(g,gi){var dd=dds[gi];if(!dd)return;var nm=dd.querySelector('.dd-name'),ic=dd.querySelector('.dd-ic');var sel=(t&&t.group===g.key)?t:null;
      dd.classList.toggle('sel',!!sel);
      if(nm)nm.textContent=sel?sel.label:g.name;
      if(ic)ic.innerHTML=sel?IC[sel.k]:(IC[{cctv:'cam',sound:'spk',toast:'pos'}[g.key]]||g.items[0].iconSvg);
      var items=dd.querySelectorAll('.dd-item');g.items.forEach(function(it,ii){if(items[ii])items[ii].classList.toggle('active',it.k===activeType);});});
  }
  function selectType(k){cancelPending();activeType=k;tool='place';updatePlacing();render();}
  var customSeq=0;
  function addCustomType(name,gkey){name=(name||'').trim();if(!name)return;gkey=gkey||'misc';customSeq++;var k='cust'+customSeq;
    var tag=(name.replace(/[^A-Za-z0-9]/g,'').slice(0,4).toUpperCase())||('C'+customSeq);
    var tg=GROUPS.filter(function(g){return g.key===gkey;})[0]||GROUPS[0];
    var repIc={cctv:'cam',sound:'spk',toast:'pos',alarm:'door',misc:'outlet'}[gkey]||(tg.items[0]?tg.items[0].ic:'pos');var icon=ICONS[repIc]||ICONS['pos']||'';
    var it={k:k,label:name,tag:tag,ic:repIc,group:gkey,color:tg.color,iconSvg:icon,custom:true};
    TYPE[k]=it;ORDER.push(k);IC[k]=icon;TL[k]=name;tg.items.push(it);
    buildDropdowns();selectType(k);showToast('Added “'+name+'” to '+tg.name);}
  var segs=document.querySelectorAll('#modetog button');
  for(var s2=0;s2<segs.length;s2++){(function(b){b.addEventListener('click',function(){cancelPending();placeMode=b.dataset.mode;
    for(var k=0;k<segs.length;k++)segs[k].classList.toggle('active',segs[k]===b);updatePlacing();render();});})(segs[s2]);}
  function applyZoom(){var z=B.zoom;zoomlayer.style.transform='translate('+z.tx+'px,'+z.ty+'px) scale('+z.s+')';}
  function clampPan(){var z=B.zoom,vw=viewport.clientWidth,vh=viewport.clientHeight,bw=board.clientWidth||vw,bh=board.clientHeight||vh,cw=bw*z.s,ch=bh*z.s;
    if(cw<=vw)z.tx=(vw-cw)/2;else z.tx=Math.min(0,Math.max(vw-cw,z.tx));
    if(ch<=vh)z.ty=(vh-ch)/2;else z.ty=Math.min(0,Math.max(vh-ch,z.ty));}
  function resetZoom(){B.zoom={s:1,tx:0,ty:0};clampPan();applyZoom();}
  // Zoom the board to scale s keeping the center (the pin/property) centered in the viewport.
  function centerZoomTo(s){var vw=viewport.clientWidth||1,vh=viewport.clientHeight||1,bw=board.clientWidth||vw,bh=board.clientHeight||vh;B.zoom={s:s,tx:(vw-bw*s)/2,ty:(vh-bh*s)/2};clampPan();applyZoom();}
  viewport.addEventListener('wheel',function(e){e.preventDefault();if(viewLocked)return;var z=B.zoom,r=viewport.getBoundingClientRect();
    var mx=e.clientX-r.left,my=e.clientY-r.top,prev=z.s,ns=Math.max(0.35,Math.min(6,prev*(e.deltaY<0?1.12:0.89)));
    var bx=(mx-z.tx)/prev,by=(my-z.ty)/prev;z.tx=mx-bx*ns;z.ty=my-by*ns;z.s=ns;clampPan();applyZoom();},{passive:false});
  function ratio(){return B.bg==='image'?B.imgRatio:1;}
  function layoutBoard(){var vw=viewport.clientWidth||800,vh=viewport.clientHeight||520,r;
    // For images: fit the WHOLE image inside the viewport (contain) and keep the true aspect. clampPan() then
    // centers it; zooming in (wheel) enlarges it and you pan/scroll within the frame.
    if(B.bg==='image'&&B.img){r=ratio();var w=vw,h=w/r;if(h>vh){h=vh;w=h*r;}board.style.width=Math.round(w)+'px';board.style.height=Math.round(h)+'px';}
    else{board.style.width=vw+'px';board.style.height=vh+'px';r=vw/vh;}
    // Backing store scaled by devicePixelRatio (+ a little headroom for zoom) so strokes render crisp, not blurry.
    var dpr=Math.min(window.devicePixelRatio||1,2),bw=parseFloat(board.style.width)||vw;
    var W=Math.max(1600,Math.min(2800,Math.round(bw*dpr*1.6))),H=Math.max(1,Math.round(W/r));drawCanvas.width=W;drawCanvas.height=H;}
  function pct(e){var r=board.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.height*100};}
  function findSpot(id){for(var i=0;i<markers.length;i++){var m=markers[i];if(m.kind==='cam'&&m.position===id)return i;}return -1;}
  function placeMarker(x,y){snapUndo();markers.push({id:uid++,mode:placeMode,kind:activeType,x:+x.toFixed(2),y:+y.toFixed(2)});out.classList.remove('show');render();}
  function removeMarker(id){snapUndo();markers=markers.filter(function(m){return m.id!==id;});floors[curFloor].markers=markers;out.classList.remove('show');render();}
  function addRoom(x,y,w,h){snapUndo();var same=B.rooms.filter(function(r){return r.kind===roomKind;}).length;var lab={building:'Building',room:'Room',bathroom:'Bathroom',stairs:'Stairs',aisle:'Aisle',counter:'Counter',fridge:'Fridge',dining:'Dining',booth:'Booth',entrance:'Entrance',parking:'Parking',register:'Register'}[roomKind]||'Room';
    B.rooms.push({id:uid++,kind:roomKind,x:+x.toFixed(2),y:+y.toFixed(2),w:+w.toFixed(2),h:+h.toFixed(2),name:lab+' '+(same+1)});out.classList.remove('show');render();}
  function removeRoom(id){snapUndo();B.rooms=B.rooms.filter(function(r){return r.id!==id;});render();}
  function removeOverlay(id){snapUndo();B.overlays=(B.overlays||[]).filter(function(o){return o.id!==id;});render();}
  function sizeRoom(rm,f){var cx=rm.x+rm.w/2,cy=rm.y+rm.h/2;rm.w=Math.max(2,Math.min(100,+(rm.w*f).toFixed(2)));rm.h=Math.max(2,Math.min(100,+(rm.h*f).toFixed(2)));rm.x=+(Math.max(0,Math.min(100-rm.w,cx-rm.w/2))).toFixed(2);rm.y=+(Math.max(0,Math.min(100-rm.h,cy-rm.h/2))).toFixed(2);render();}
  function addNote(x,y){snapUndo();var id=uid++;B.notes.push({id:id,x:+x.toFixed(2),y:+y.toFixed(2),text:''});out.classList.remove('show');render();
    var ta=list.querySelector('[data-note="'+id+'"] textarea');if(ta)ta.focus();}
  function removeNote(id){snapUndo();B.notes=B.notes.filter(function(n){return n.id!==id;});render();}
  function startRotate(e,rm,d){e.stopPropagation();e.preventDefault();handleActive=true;var br=board.getBoundingClientRect();
    function mv(ev){var cx=br.left+(rm.x+rm.w/2)/100*br.width,cy=br.top+(rm.y+rm.h/2)/100*br.height;
      var deg=Math.atan2(ev.clientY-cy,ev.clientX-cx)*180/Math.PI+90;deg=((deg%360)+360)%360;
      var near=Math.round(deg/45)*45,snap=false;if(Math.abs(deg-near)<6){deg=near%360;snap=true;}
      rm.rot=+deg.toFixed(1);d.style.transform='rotate('+rm.rot+'deg)';var nmEl=d.querySelector('.rname');if(nmEl)nmEl.style.transform='translate(-50%,-50%) rotate('+(-rm.rot)+'deg)';
      showBadge(ev,Math.round(rm.rot)+'°',snap);}
    function up(){window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);hideAngle();lastPinDrag=Date.now();setTimeout(function(){handleActive=false;},0);render();}
    window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);}
  function startResize(e,rm,d,dir){handleActive=true;d.setPointerCapture(e.pointerId);var br=board.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,z=B.zoom.s,o={x:rm.x,y:rm.y,w:rm.w,h:rm.h},MIN=3,rr=-(rm.rot||0)*Math.PI/180,cs=Math.cos(rr),sn=Math.sin(rr);
    function mv(ev){var pdx=(ev.clientX-sx)/z,pdy=(ev.clientY-sy)/z,lx=pdx*cs-pdy*sn,ly=pdx*sn+pdy*cs;var dx=lx/br.width*100,dy=ly/br.height*100,x=o.x,y=o.y,w=o.w,h=o.h;
      if(dir.indexOf('e')>=0)w=o.w+dx;if(dir.indexOf('s')>=0)h=o.h+dy;if(dir.indexOf('w')>=0){x=o.x+dx;w=o.w-dx;}if(dir.indexOf('n')>=0){y=o.y+dy;h=o.h-dy;}
      if(w<MIN){if(dir.indexOf('w')>=0)x=o.x+o.w-MIN;w=MIN;}if(h<MIN){if(dir.indexOf('n')>=0)y=o.y+o.h-MIN;h=MIN;}
      if(x<0){w+=x;x=0;}if(y<0){h+=y;y=0;}if(x+w>100)w=100-x;if(y+h>100)h=100-y;
      rm.x=+x.toFixed(2);rm.y=+y.toFixed(2);rm.w=+w.toFixed(2);rm.h=+h.toFixed(2);d.style.left=rm.x+'%';d.style.top=rm.y+'%';d.style.width=rm.w+'%';d.style.height=rm.h+'%';}
    function up(){d.removeEventListener('pointermove',mv);d.removeEventListener('pointerup',up);lastPinDrag=Date.now();setTimeout(function(){handleActive=false;},0);renderList();}
    d.addEventListener('pointermove',mv);d.addEventListener('pointerup',up);}
  function arrowHead(x,y,rad,size,color){dctx.save();dctx.translate(x,y);dctx.rotate(rad);dctx.fillStyle=color;dctx.beginPath();dctx.moveTo(0,0);dctx.lineTo(-size,-size*0.55);dctx.lineTo(-size,size*0.55);dctx.closePath();dctx.fill();dctx.restore();}
  function redrawStrokes(){var W=drawCanvas.width,H=drawCanvas.height;dctx.clearRect(0,0,W,H);
    drawAreaPolys();
    // Leader lines: when devices are placed at (almost) the same spot they fan out — draw a dashed line from each
    // back to a shared anchor dot so it reads as "these are all here, next to each other" (not overlapping).
    fanLeaders.forEach(function(L){var cx=L.cx/100*W,cy=L.cy/100*H,px=L.px/100*W,py=L.py/100*H;dctx.save();
      dctx.strokeStyle='rgba(201,169,110,.75)';dctx.lineWidth=1.5;dctx.setLineDash([3,3]);dctx.beginPath();dctx.moveTo(cx,cy);dctx.lineTo(px,py);dctx.stroke();dctx.setLineDash([]);
      dctx.fillStyle='#C9A96E';dctx.beginPath();dctx.arc(cx,cy,3.2,0,6.2832);dctx.fill();dctx.restore();});
    B.strokes.forEach(function(st){if((st.type==='wall'||st.type==='measure')&&!show.builder)return;dctx.lineCap='round';dctx.lineJoin='round';dctx.beginPath();
      st.pts.forEach(function(p,i){var X=p.x/100*W,Y=p.y/100*H;if(i===0)dctx.moveTo(X,Y);else dctx.lineTo(X,Y);});
      if(st.fill&&st.pts.length>2){dctx.save();dctx.closePath();dctx.globalAlpha=0.72;dctx.fillStyle=st.fill;dctx.fill();dctx.restore();}
      if(boardBright){dctx.strokeStyle='rgba(255,255,255,.95)';dctx.lineWidth=(st.w||2)+6;dctx.stroke();}
      dctx.strokeStyle=st.color;dctx.lineWidth=st.w;dctx.stroke();
      if(st.arrow&&st.pts.length>=2){var a=st.pts[st.pts.length-2],b=st.pts[st.pts.length-1];var ax=a.x/100*W,ay=a.y/100*H,bx=b.x/100*W,by=b.y/100*H;arrowHead(bx,by,Math.atan2(by-ay,bx-ax),18,st.color);}
      if(st.type==='wall'&&st.pts.length>=2){var f=segFeet(st.pts[0],st.pts[1]);if(f!=null){var mx=(st.pts[0].x+st.pts[1].x)/2/100*W,my=(st.pts[0].y+st.pts[1].y)/2/100*H;dctx.save();dctx.font='bold 22px -apple-system,Helvetica,Arial';dctx.fillStyle='#2C3347';dctx.textAlign='center';dctx.textBaseline='middle';var t=fmtFeet(f);var tw=dctx.measureText(t).width;dctx.fillStyle='rgba(255,255,255,.85)';dctx.fillRect(mx-tw/2-6,my-13,tw+12,26);dctx.fillStyle='#2C3347';dctx.fillText(t,mx,my);dctx.restore();}}
      if(st.type==='measure'&&st.pts.length>=2){var a=st.pts[0],b=st.pts[1];var ax=a.x/100*W,ay=a.y/100*H,bx=b.x/100*W,by=b.y/100*H;var ang=Math.atan2(by-ay,bx-ax);
        arrowHead(ax,ay,ang+Math.PI,11,'#2C3347');arrowHead(bx,by,ang,11,'#2C3347');
        var tkx=Math.cos(ang+Math.PI/2),tky=Math.sin(ang+Math.PI/2),tl=9;dctx.strokeStyle='#2C3347';dctx.lineWidth=2;dctx.beginPath();dctx.moveTo(ax-tkx*tl,ay-tky*tl);dctx.lineTo(ax+tkx*tl,ay+tky*tl);dctx.moveTo(bx-tkx*tl,by-tky*tl);dctx.lineTo(bx+tkx*tl,by+tky*tl);dctx.stroke();
        var ff=segFeet(a,b),lab=ff!=null?fmtFeet(ff):(Math.round(segUnits(a,b)/W*100)+'%');var mmx=(ax+bx)/2,mmy=(ay+by)/2;dctx.save();dctx.font='bold 22px -apple-system,Helvetica,Arial';dctx.textAlign='center';dctx.textBaseline='middle';var lw=dctx.measureText(lab).width;dctx.fillStyle='rgba(255,255,255,.92)';dctx.fillRect(mmx-lw/2-7,mmy-14,lw+14,28);dctx.fillStyle='#2C3347';dctx.fillText(lab,mmx,mmy);dctx.restore();}});
    markers.forEach(function(m){if(!m.arrow||!show.range)return;var mg=TYPE[m.kind]?TYPE[m.kind].group:'cctv';if(!show[mg])return;var col=TYPE[m.kind]?TYPE[m.kind].color:'#C9A96E';var sx=m.x/100*W,sy=m.y/100*H,rad=m.arrow.angle*Math.PI/180,L=m.arrow.len/100*W;
      if(CONE[m.kind]){var half=(m.fov||defFov(m.kind))/2*Math.PI/180,p1=rad-half,p2=rad+half;dctx.save();dctx.beginPath();dctx.moveTo(sx,sy);dctx.lineTo(sx+Math.cos(p1)*L,sy+Math.sin(p1)*L);dctx.arc(sx,sy,L,p1,p2);dctx.closePath();
        var g=dctx.createRadialGradient(sx,sy,0,sx,sy,L);g.addColorStop(0,hexA(col,.40));g.addColorStop(1,hexA(col,.08));dctx.fillStyle=g;dctx.fill();dctx.strokeStyle=hexA(col,.55);dctx.lineWidth=1.5;dctx.stroke();
        dctx.strokeStyle=col;dctx.lineWidth=2;dctx.beginPath();dctx.moveTo(sx,sy);dctx.lineTo(sx+Math.cos(rad)*L,sy+Math.sin(rad)*L);dctx.stroke();dctx.restore();}
      else if(m.kind==='spk'||m.kind==='tap'){dctx.save();dctx.globalAlpha=0.15;dctx.fillStyle=col;dctx.beginPath();dctx.arc(sx,sy,L,0,2*Math.PI);dctx.fill();dctx.globalAlpha=1;dctx.strokeStyle=col;dctx.lineWidth=2;dctx.setLineDash([7,5]);dctx.beginPath();dctx.arc(sx,sy,L,0,2*Math.PI);dctx.stroke();dctx.setLineDash([]);dctx.restore();}
      else{var ex=sx+Math.cos(rad)*L,ey=sy+Math.sin(rad)*L;dctx.lineCap='round';dctx.beginPath();dctx.moveTo(sx,sy);dctx.lineTo(ex,ey);if(boardBright){dctx.strokeStyle='rgba(255,255,255,.95)';dctx.lineWidth=7;dctx.stroke();}dctx.strokeStyle=col;dctx.lineWidth=3;dctx.stroke();arrowHead(ex,ey,rad,18,col);}});}
  var moved=false,curStroke=null,roomStart=null,roomEl=null,panStart=null,angleEl=null,pending=null,pinDragging=null,lastPinDrag=0,handleActive=false,curArea=null,areaTap=0,areaPos=null;
  function snapLine(s,c){var r=board.getBoundingClientRect();
    var sx=s.x/100*r.width,sy=s.y/100*r.height,cx=c.x/100*r.width,cy=c.y/100*r.height;
    var dx=cx-sx,dy=cy-sy,len=Math.hypot(dx,dy),deg=Math.atan2(dy,dx)*180/Math.PI;
    var near=Math.round(deg/15)*15,snapped=false;if(Math.abs(deg-near)<=3){deg=near;snapped=true;}
    var ang=deg*Math.PI/180,ex=sx+Math.cos(ang)*len,ey=sy+Math.sin(ang)*len;
    var dev=((deg%180)+180)%180;if(dev>90)dev=180-dev;
    return {end:{x:+(ex/r.width*100).toFixed(2),y:+(ey/r.height*100).toFixed(2)},dev:Math.round(dev),snapped:snapped};}
  function showBadge(e,text,snap){if(!angleEl){angleEl=document.createElement('div');angleEl.className='angle-readout';viewport.appendChild(angleEl);}
    var vr=viewport.getBoundingClientRect();angleEl.style.left=(e.clientX-vr.left)+'px';angleEl.style.top=(e.clientY-vr.top)+'px';
    angleEl.textContent=text;angleEl.classList.toggle('snap',!!snap);}
  function showAngle(e,dev){showBadge(e,dev===0?'0° · level':(dev===90?'90° · plumb':dev+'°'),dev===0||dev===90);}
  // Move tool: drag a placed device to reposition it (its left/top % follow the cursor).
  function startPinMove(e,m,p){e.stopPropagation();e.preventDefault();snapUndo();pinDragging=m;p.style.zIndex=20;p.style.marginLeft='0';p.style.marginTop='0';
    function mv(ev){var q=pct(ev);m.x=Math.max(0,Math.min(100,+q.x.toFixed(2)));m.y=Math.max(0,Math.min(100,+q.y.toFixed(2)));p.style.left=m.x+'%';p.style.top=m.y+'%';redrawStrokes();}
    function up(){window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);lastPinDrag=Date.now();pinDragging=null;render();}
    window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);}
  function startPinArrow(e,m,p){e.stopPropagation();e.preventDefault();pinDragging=m;var br=board.getBoundingClientRect();var cx=br.left+m.x/100*br.width,cy=br.top+m.y/100*br.height;var movedA=false,maxDist=0;
    function mv(ev){var dx=ev.clientX-cx,dy=ev.clientY-cy,dist=Math.hypot(dx,dy);if(dist>maxDist)maxDist=dist;if(maxDist<12)return;movedA=true;
      if(dist<10){if(m.arrow){m.arrow=null;redrawStrokes();hideAngle();}return;}
      var deg=Math.atan2(dy,dx)*180/Math.PI,near=Math.round(deg/45)*45,snap=false;if(Math.abs(deg-near)<=7){deg=near;snap=true;}
      var lenPct=dist/br.width*100;m.arrow={angle:+deg.toFixed(1),len:+lenPct.toFixed(2)};redrawStrokes();
      if(m.kind==='spk'||m.kind==='tap')showBadge(ev,'⊙ r '+(B.ftWide?fmtFeet(lenPct/100*B.ftWide):Math.round(lenPct)+'%'),false);
      else showBadge(ev,'↙ '+(((Math.round(deg)%360)+360)%360)+'°',snap);}
    function up(){window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);hideAngle();lastPinDrag=Date.now();pinDragging=null;render();}
    window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);}
  function segUnits(a,b){var W=drawCanvas.width,H=drawCanvas.height;return Math.hypot((b.x-a.x)/100*W,(b.y-a.y)/100*H);}
  function segFeet(a,b){if(!B.ftWide)return null;return segUnits(a,b)*B.ftWide/drawCanvas.width;}
  function fmtFeet(f){if(f==null)return'';var ft=Math.floor(f),inch=Math.round((f-ft)*12);if(inch===12){ft++;inch=0;}return ft+"' "+inch+'"';}
  function startStroke(e){snapUndo();var p=pct(e);var st={pts:[{x:p.x,y:p.y},{x:p.x,y:p.y}]};
    if(drawMode==='wall'){st.color='#5A6478';st.w=7;st.type='wall';}
    else if(drawMode==='measure'){st.color='#2C3347';st.w=2;st.type='measure';}
    else{st.color=lineColor;st.w=3;st.type=drawMode;st.arrow=drawMode==='arrow';}
    curStroke=st;B.strokes.push(curStroke);pending={type:'stroke'};redrawStrokes();render();}
  function updateStroke(e){var sl=snapLine(curStroke.pts[0],pct(e));curStroke.pts[1]=sl.end;redrawStrokes();
    if(curStroke.type==='wall'||curStroke.type==='measure'){var f=segFeet(curStroke.pts[0],curStroke.pts[1]);showBadge(e,(f!=null?fmtFeet(f):Math.round(segUnits(curStroke.pts[0],curStroke.pts[1])/drawCanvas.width*100)+'%')+' · '+sl.dev+'°',sl.dev===0||sl.dev===90);}
    else showAngle(e,sl.dev);}
  function finalizeStroke(e){updateStroke(e);pending=null;curStroke=null;hideAngle();render();}
  var polyTap=0,polyPos=null;
  function startPoly(e){snapUndo();var p=pct(e);curStroke={color:lineColor,w:3,type:'poly',fill:fillColor||null,pts:[{x:p.x,y:p.y},{x:p.x,y:p.y}]};B.strokes.push(curStroke);pending={type:'poly'};polyTap=Date.now();polyPos=p;redrawStrokes();render();}
  function updatePoly(e){var pts=curStroke.pts,prev=pts[pts.length-2],sl=snapLine(prev,pct(e));pts[pts.length-1]=sl.end;redrawStrokes();showAngle(e,sl.dev);}
  function clickPoly(e){var now=Date.now(),p=pct(e),pts=curStroke.pts;
    if(now-polyTap<340&&polyPos&&Math.hypot(p.x-polyPos.x,p.y-polyPos.y)<2.5){pts.pop();if(pts.length<2){var i=B.strokes.indexOf(curStroke);if(i>=0)B.strokes.splice(i,1);}pending=null;curStroke=null;hideAngle();render();return;}
    var prev=pts[pts.length-2],sl=snapLine(prev,p);pts[pts.length-1]=sl.end;pts.push({x:sl.end.x,y:sl.end.y});polyTap=now;polyPos=sl.end;redrawStrokes();render();}
  function finishPoly(){if(!curStroke)return;curStroke.pts.pop();if(curStroke.pts.length<2){var i=B.strokes.indexOf(curStroke);if(i>=0)B.strokes.splice(i,1);}pending=null;curStroke=null;hideAngle();render();}
  function cancelPending(){if(!pending){return;}if(pending.type==='poly'){finishPoly();return;}if(pending.type==='areapoly'){finishArea();return;}if(pending.type==='stroke'){var i=B.strokes.indexOf(curStroke);if(i>=0)B.strokes.splice(i,1);curStroke=null;}pending=null;hideAngle();}
  function snapArea(s,c){var r=board.getBoundingClientRect();
    var sx=s.x/100*r.width,sy=s.y/100*r.height,cx=c.x/100*r.width,cy=c.y/100*r.height;
    var dx=cx-sx,dy=cy-sy,len=Math.hypot(dx,dy),deg=Math.atan2(dy,dx)*180/Math.PI;
    var near=Math.round(deg/45)*45,snapped=false;if(Math.abs(deg-near)<=11){deg=near;snapped=true;}
    var ang=deg*Math.PI/180,ex=sx+Math.cos(ang)*len,ey=sy+Math.sin(ang)*len;
    var dev=((deg%180)+180)%180;if(dev>90)dev=180-dev;
    return {end:{x:+(ex/r.width*100).toFixed(2),y:+(ey/r.height*100).toFixed(2)},dev:Math.round(dev),snapped:snapped};}
  function startArea(e){snapUndo();var p=pct(e);curArea={kind:areaPolyKind,pts:[{x:+p.x.toFixed(2),y:+p.y.toFixed(2)},{x:+p.x.toFixed(2),y:+p.y.toFixed(2)}],guideX:null,guideY:null};pending={type:'areapoly'};areaTap=Date.now();areaPos=p;redrawStrokes();render();}
  function alignArea(prev,end){var pts=curArea.pts,n=pts.length,tol=1.5,gx=null,gy=null;
    var horiz=Math.abs(end.y-prev.y)<0.4,vert=Math.abs(end.x-prev.x)<0.4,free=!horiz&&!vert;
    for(var i=0;i<n-1;i++){var v=pts[i];
      if((horiz||free)&&Math.abs(end.x-v.x)<tol&&(gx===null||Math.abs(end.x-v.x)<Math.abs(end.x-gx)))gx=v.x;
      if((vert||free)&&Math.abs(end.y-v.y)<tol&&(gy===null||Math.abs(end.y-v.y)<Math.abs(end.y-gy)))gy=v.y;}
    if(gx!==null)end.x=gx;if(gy!==null)end.y=gy;curArea.guideX=gx;curArea.guideY=gy;}
  function updateArea(e){var pts=curArea.pts,prev=pts[pts.length-2],sl=snapArea(prev,pct(e));alignArea(prev,sl.end);pts[pts.length-1]=sl.end;redrawStrokes();
    var f=segFeet(prev,sl.end),aln=(curArea.guideX!==null||curArea.guideY!==null)?' · aligned':'';showBadge(e,(f!=null?fmtFeet(f):Math.round(segUnits(prev,sl.end)/drawCanvas.width*100)+'%')+' · '+sl.dev+'°'+aln,sl.dev===0||sl.dev===90||curArea.guideX!==null||curArea.guideY!==null);}
  function clickArea(e){var now=Date.now(),p=pct(e),pts=curArea.pts,first=pts[0];
    var nearFirst=pts.length>3&&Math.hypot(p.x-first.x,p.y-first.y)<2.8;
    if((now-areaTap<340&&areaPos&&Math.hypot(p.x-areaPos.x,p.y-areaPos.y)<2.5)||nearFirst){finishArea();return;}
    var prev=pts[pts.length-2],sl=snapArea(prev,p);alignArea(prev,sl.end);pts[pts.length-1]=sl.end;pts.push({x:sl.end.x,y:sl.end.y});curArea.guideX=null;curArea.guideY=null;areaTap=now;areaPos=sl.end;redrawStrokes();render();}
  function finishArea(){if(!curArea){pending=null;return;}curArea.pts.pop();
    if(curArea.pts.length>=3){var k=curArea.kind,same=B.rooms.filter(function(r){return r.kind===k;}).length;B.rooms.push({id:uid++,kind:k,poly:curArea.pts,name:KINDLABEL[k]+' '+(same+1)});}
    curArea=null;pending=null;hideAngle();render();}
  function drawAreaPolys(){var W=drawCanvas.width,H=drawCanvas.height;
    function poly(pts){dctx.beginPath();pts.forEach(function(p,i){var X=p.x/100*W,Y=p.y/100*H;if(i===0)dctx.moveTo(X,Y);else dctx.lineTo(X,Y);});}
    if(show.builder)B.rooms.forEach(function(rm){if(!rm.poly)return;var col=AREACOLOR[rm.kind]||'#9FB0C8';
      poly(rm.poly);dctx.closePath();dctx.fillStyle=hexA(col,rm.kind==='building'?0.06:0.10);dctx.fill();
      dctx.strokeStyle=col;dctx.lineWidth=rm.kind==='building'?4:2.5;dctx.lineJoin='round';dctx.setLineDash(rm.kind==='room'?[]:(rm.kind==='building'?[]:[8,5]));dctx.stroke();dctx.setLineDash([]);
      var c=centroid(rm.poly),cx=c.x/100*W,cy=c.y/100*H;dctx.save();dctx.font='600 19px -apple-system,Helvetica,Arial';dctx.textAlign='center';dctx.textBaseline='middle';dctx.globalAlpha=0.5;dctx.fillStyle=col;dctx.fillText(rm.name,cx,cy);dctx.restore();});
    if(curArea){var col2=AREACOLOR[curArea.kind]||'#9FB0C8',pts=curArea.pts;
      dctx.save();dctx.strokeStyle=col2;dctx.lineWidth=curArea.kind==='building'?4:2.5;dctx.lineJoin='round';dctx.lineCap='round';poly(pts);dctx.stroke();
      if(pts.length>2){dctx.setLineDash([7,6]);dctx.strokeStyle=hexA(col2,0.5);dctx.beginPath();var a=pts[pts.length-1],b=pts[0];dctx.moveTo(a.x/100*W,a.y/100*H);dctx.lineTo(b.x/100*W,b.y/100*H);dctx.stroke();dctx.setLineDash([]);}
      pts.forEach(function(p,i){if(i===pts.length-1)return;dctx.fillStyle=i===0?col2:'#fff';dctx.strokeStyle=col2;dctx.lineWidth=2;dctx.beginPath();dctx.arc(p.x/100*W,p.y/100*H,i===0?5.5:4,0,2*Math.PI);dctx.fill();dctx.stroke();});
      var ep=pts[pts.length-1];
      if(curArea.guideX!==null){dctx.save();dctx.strokeStyle='rgba(224,195,132,.9)';dctx.lineWidth=1;dctx.setLineDash([4,4]);dctx.beginPath();dctx.moveTo(curArea.guideX/100*W,0);dctx.lineTo(curArea.guideX/100*W,H);dctx.stroke();dctx.restore();}
      if(curArea.guideY!==null){dctx.save();dctx.strokeStyle='rgba(224,195,132,.9)';dctx.lineWidth=1;dctx.setLineDash([4,4]);dctx.beginPath();dctx.moveTo(0,curArea.guideY/100*H);dctx.lineTo(W,curArea.guideY/100*H);dctx.stroke();dctx.restore();}
      if(curArea.guideX!==null||curArea.guideY!==null){dctx.save();dctx.fillStyle='#E0C384';dctx.strokeStyle=col2;dctx.lineWidth=2;dctx.beginPath();dctx.arc(ep.x/100*W,ep.y/100*H,5,0,2*Math.PI);dctx.fill();dctx.stroke();dctx.restore();}
      dctx.restore();}}
  var fanLeaders=[];
  function fanOverlaps(pinEls){fanLeaders=[];var bw=board.clientWidth||1,bh=board.clientHeight||1,thr=22,used=[];
    for(var i=0;i<pinEls.length;i++){if(used[i])continue;var cluster=[pinEls[i]];used[i]=true;var ax=pinEls[i].x/100*bw,ay=pinEls[i].y/100*bh;
      for(var j=i+1;j<pinEls.length;j++){if(used[j])continue;var bx=pinEls[j].x/100*bw,by=pinEls[j].y/100*bh;if(Math.hypot(bx-ax,by-ay)<thr){cluster.push(pinEls[j]);used[j]=true;}}
      if(cluster.length>1){var R=14+(cluster.length-2)*5,cmx=0,cmy=0;cluster.forEach(function(c){cmx+=c.x;cmy+=c.y;});cmx/=cluster.length;cmy/=cluster.length;
      cluster.forEach(function(c,k){var ang=(k/cluster.length)*2*Math.PI-Math.PI/2,mlx=Math.cos(ang)*R,mly=Math.sin(ang)*R;c.el.style.marginLeft=mlx+'px';c.el.style.marginTop=mly+'px';c.el.style.zIndex=8;
        fanLeaders.push({cx:cmx,cy:cmy,px:c.x+mlx/bw*100,py:c.y+mly/bh*100});});}}}
  function hideAngle(){if(angleEl){angleEl.remove();angleEl=null;}}
  // Closest placed marker to a screen point, within rad (screen px) — used for a forgiving grab around the small pins.
  function nearestMarker(e,rad){var br=board.getBoundingClientRect(),best=null,bd=rad;
    for(var i=0;i<markers.length;i++){var m=markers[i];var mx=br.left+m.x/100*br.width,my=br.top+m.y/100*br.height;
      var d=Math.hypot(e.clientX-mx,e.clientY-my);if(d<bd){bd=d;best=m;}}
    return best;}
  board.addEventListener('pointerdown',function(e){
    if(cropping)return;if(e.target.closest('.pin')||e.target.closest('.room')||e.target.closest('.spot'))return;
    if(pending||pinDragging)return;
    moved=false;
    // Forgiving grab: a press that lands just shy of a camera/device aims (or moves) it instead of panning the
    // board or dropping a brand-new marker right next to it. Fixes "setting the angle pans the picture / adds a camera".
    if((tool==='place'||tool==='move')){var near=nearestMarker(e,20);if(near){var pel=board.querySelector('.pin[data-mid="'+near.id+'"]');
      if(pel){if(tool==='move')startPinMove(e,near,pel);else startPinArrow(e,near,pel);return;}}}
    if(tool==='draw'&&drawMode==='pen'){board.setPointerCapture(e.pointerId);var p=pct(e);curStroke={color:lineColor,w:3,type:'pen',pts:[{x:p.x,y:p.y}]};B.strokes.push(curStroke);redrawStrokes();}
    else if(tool==='room'){board.setPointerCapture(e.pointerId);var p2=pct(e);roomStart=p2;roomEl=document.createElement('div');roomEl.className='room'+(roomKind==='building'?' building':'');roomEl.style.left=p2.x+'%';roomEl.style.top=p2.y+'%';roomEl.style.width='0%';roomEl.style.height='0%';board.appendChild(roomEl);}
    else if(tool==='place'||tool==='note'||tool==='move'){var z=B.zoom;if(z.s>1&&!viewLocked){board.setPointerCapture(e.pointerId);panStart={x:e.clientX,y:e.clientY,tx:z.tx,ty:z.ty};}}
  });
  board.addEventListener('pointermove',function(e){
    if(cropping)return;
    if(pending&&pending.type==='stroke'){updateStroke(e);return;}
    if(pending&&pending.type==='poly'){updatePoly(e);return;}
    if(pending&&pending.type==='areapoly'){updateArea(e);return;}
    if(tool==='draw'&&drawMode==='pen'&&curStroke){var p=pct(e);curStroke.pts.push(p);moved=true;redrawStrokes();return;}
    if(tool==='room'&&roomStart&&roomEl){var p3=pct(e);var x=Math.min(roomStart.x,p3.x),y=Math.min(roomStart.y,p3.y),w=Math.abs(p3.x-roomStart.x),h=Math.abs(p3.y-roomStart.y);roomEl.style.left=x+'%';roomEl.style.top=y+'%';roomEl.style.width=w+'%';roomEl.style.height=h+'%';moved=true;return;}
    if(panStart){var z=B.zoom;z.tx=panStart.tx+(e.clientX-panStart.x);z.ty=panStart.ty+(e.clientY-panStart.y);moved=true;clampPan();applyZoom();return;}
  });
  board.addEventListener('pointerup',function(e){
    if(cropping)return;
    if(handleActive){handleActive=false;moved=false;return;}
    if(pinDragging||Date.now()-lastPinDrag<250){moved=false;return;}
    if(pending&&pending.type==='stroke'){finalizeStroke(e);moved=false;return;}
    if(pending&&pending.type==='poly'){clickPoly(e);moved=false;return;}
    if(pending&&pending.type==='areapoly'){clickArea(e);moved=false;return;}
    if(tool==='draw'&&drawMode==='pen'){curStroke=null;hideAngle();render();moved=false;return;}
    if(tool==='draw'&&(drawMode==='line'||drawMode==='arrow'||drawMode==='wall'||drawMode==='measure')){startStroke(e);moved=false;return;}
    if(tool==='draw'&&drawMode==='poly'){startPoly(e);moved=false;return;}
    if(tool==='areapoly'){if(!moved)startArea(e);panStart=null;moved=false;return;}
    if(tool==='room'){if(roomEl){var rr=roomEl.getBoundingClientRect(),br=board.getBoundingClientRect();var w=rr.width/br.width*100,h=rr.height/br.height*100,x=(rr.left-br.left)/br.width*100,y=(rr.top-br.top)/br.height*100;roomEl.remove();roomEl=null;roomStart=null;if(w>3&&h>3)addRoom(x,y,w,h);}moved=false;return;}
    if(tool==='note'){if(!moved){var pn=pct(e);addNote(pn.x,pn.y);}panStart=null;moved=false;return;}
    if(tool==='place'&&!moved){var p=pct(e);placeMarker(p.x,p.y);}panStart=null;moved=false;
  });
  function startCrop(){if(cropping||B.bg!=='image'||!B.img)return;
    // Bake any rotation into the image FIRST so the crop box lines up 1:1 with what's on screen.
    if(B.imgRotate){bakeRotation(function(){actuallyStartCrop();});}else{actuallyStartCrop();}}
  function actuallyStartCrop(){resetZoom();cropping=true;
    var ov=document.createElement('div');ov.className='crop-ov';var sel=document.createElement('div');sel.className='crop-sel';var cr={x:18,y:18,w:64,h:64},acts;
    function clamp(){cr.w=Math.max(5,cr.w);cr.h=Math.max(5,cr.h);cr.x=Math.max(0,Math.min(100-cr.w,cr.x));cr.y=Math.max(0,Math.min(100-cr.h,cr.y));}
    function paint(){clamp();sel.style.left=cr.x+'%';sel.style.top=cr.y+'%';sel.style.width=cr.w+'%';sel.style.height=cr.h+'%';
      if(acts){var below=(cr.y+cr.h)<80;acts.style.top=below?'calc(100% + 6px)':'auto';acts.style.bottom=below?'auto':'calc(100% + 6px)';}}
    // 8 resize handles
    ['nw','n','ne','e','se','s','sw','w'].forEach(function(dir){var h=document.createElement('div');h.className='crop-h h-'+dir;
      h.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();h.setPointerCapture(e.pointerId);var r=ov.getBoundingClientRect();
        function mv(ev){var px=Math.max(0,Math.min(100,(ev.clientX-r.left)/r.width*100)),py=Math.max(0,Math.min(100,(ev.clientY-r.top)/r.height*100)),x2=cr.x+cr.w,y2=cr.y+cr.h;
          if(dir.indexOf('w')>=0){cr.x=Math.min(px,x2-5);cr.w=x2-cr.x;} if(dir.indexOf('e')>=0){cr.w=Math.max(5,px-cr.x);}
          if(dir.indexOf('n')>=0){cr.y=Math.min(py,y2-5);cr.h=y2-cr.y;} if(dir.indexOf('s')>=0){cr.h=Math.max(5,py-cr.y);} paint();}
        function up(){h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',up);}
        h.addEventListener('pointermove',mv);h.addEventListener('pointerup',up);});sel.appendChild(h);});
    paint();ov.appendChild(sel);
    var st=null,mvd=null;
    ov.addEventListener('pointerdown',function(e){if(e.target.closest('.crop-actions')||e.target.closest('.crop-h'))return;var r=ov.getBoundingClientRect();
      var fx=(e.clientX-r.left)/r.width*100,fy=(e.clientY-r.top)/r.height*100;ov.setPointerCapture(e.pointerId);
      if(sel.contains(e.target)){mvd={fx:fx,fy:fy,ox:cr.x,oy:cr.y};}else{st={x:fx,y:fy};}});
    ov.addEventListener('pointermove',function(e){var r=ov.getBoundingClientRect(),cx=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),cy=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));
      if(mvd){cr.x=mvd.ox+(cx-mvd.fx);cr.y=mvd.oy+(cy-mvd.fy);paint();}
      else if(st){cr={x:Math.min(st.x,cx),y:Math.min(st.y,cy),w:Math.abs(cx-st.x),h:Math.abs(cy-st.y)};paint();}});
    ov.addEventListener('pointerup',function(){st=null;mvd=null;});
    acts=document.createElement('div');acts.className='crop-actions';var ok=document.createElement('button');ok.className='crop-ok';ok.textContent='Apply crop';var no=document.createElement('button');no.className='crop-no';no.textContent='Cancel';
    var armed=false,armT=null;
    ok.addEventListener('click',function(ev){ev.stopPropagation();if(cr.w<3||cr.h<3)return;
      if(!armed){armed=true;ok.textContent='Confirm';ok.classList.add('arm');armT=setTimeout(function(){armed=false;ok.textContent='Apply crop';ok.classList.remove('arm');},3000);return;}
      clearTimeout(armT);var rect={x:cr.x,y:cr.y,w:cr.w,h:cr.h};endCrop();transformImage('crop',rect);});
    no.addEventListener('click',function(ev){ev.stopPropagation();endCrop();});acts.appendChild(ok);acts.appendChild(no);sel.appendChild(acts);paint();board.appendChild(ov);}
  function endCrop(){cropping=false;var ov=board.querySelector('.crop-ov');if(ov)ov.remove();}
  function mapCoord(k,p,cr){if(k==='rotR')return{x:100-p.y,y:p.x};if(k==='rotL')return{x:p.y,y:100-p.x};if(k==='flip')return{x:100-p.x,y:p.y};
    if(k==='crop'){if(p.x<cr.x||p.x>cr.x+cr.w||p.y<cr.y||p.y>cr.y+cr.h)return null;return{x:(p.x-cr.x)/cr.w*100,y:(p.y-cr.y)/cr.h*100};}return{x:p.x,y:p.y};}
  function transformImage(kind,cr){if(!B.img)return;var im=new Image();im.crossOrigin='anonymous';im.onload=function(){
      var w=im.naturalWidth,h=im.naturalHeight,cv=document.createElement('canvas'),x=cv.getContext('2d');
      if(kind==='rotL'||kind==='rotR'){cv.width=h;cv.height=w;}else{cv.width=w;cv.height=h;}
      x.save();if(kind==='rotR'){x.translate(cv.width,0);x.rotate(Math.PI/2);x.drawImage(im,0,0);}else if(kind==='rotL'){x.translate(0,cv.height);x.rotate(-Math.PI/2);x.drawImage(im,0,0);}else if(kind==='flip'){x.translate(cv.width,0);x.scale(-1,1);x.drawImage(im,0,0);}
        else if(kind==='crop'){ // keep the image size; white out everything outside the selection
          x.fillStyle='#ffffff';x.fillRect(0,0,cv.width,cv.height);
          var rx=Math.round(w*cr.x/100),ry=Math.round(h*cr.y/100),rw=Math.round(w*cr.w/100),rh=Math.round(h*cr.h/100);
          x.drawImage(im,rx,ry,rw,rh,rx,ry,rw,rh);}
        else{x.drawImage(im,0,0);}x.restore();
      B.img=cv.toDataURL('image/jpeg',0.92);B.imgRatio=cv.width/cv.height;
      if(kind!=='crop'){ // crop keeps full dimensions, so markers/areas stay put; only rotate/flip remap them
        var keep=[];markers.forEach(function(m){var t=mapCoord(kind,{x:m.x,y:m.y},cr);if(t){m.x=+t.x.toFixed(2);m.y=+t.y.toFixed(2);m.position=null;keep.push(m);}});markers=keep;
        B.rooms=B.rooms.map(function(rm){var tl=mapCoord(kind,{x:rm.x,y:rm.y},cr),br=mapCoord(kind,{x:rm.x+rm.w,y:rm.y+rm.h},cr);if(!tl||!br)return null;var nx=Math.min(tl.x,br.x),ny=Math.min(tl.y,br.y);rm.x=+nx.toFixed(2);rm.y=+ny.toFixed(2);rm.w=+Math.abs(br.x-tl.x).toFixed(2);rm.h=+Math.abs(br.y-tl.y).toFixed(2);return rm;}).filter(Boolean);
      }
      boardImg.src=B.img;resetZoom();render();};im.src=B.img;}
  function setImageFile(f){if(!f||!/^image\//.test(f.type))return;var r=new FileReader();r.onload=function(ev){var im=new Image();im.onload=function(){B.img=ev.target.result;B.imgSource='upload';B.sat=null;B.imgRatio=im.naturalWidth/im.naturalHeight;B.bg='image';resetZoom();render();};im.src=ev.target.result;};r.readAsDataURL(f);}
  // Upload an image that floats ON TOP of the background (draggable + resizable reference image).
  function addOverlayFromFile(f){if(!f||!/^image\//.test(f.type))return;var r=new FileReader();r.onload=function(ev){var im=new Image();im.onload=function(){
    snapUndo();var bw=board.clientWidth||800,bh=board.clientHeight||520,imgA=im.naturalWidth/im.naturalHeight||1;
    var w=38,h=w*(bw/bh)/imgA;if(h>80){h=80;w=h*imgA*(bh/bw);}
    B.overlays=B.overlays||[];B.overlays.push({id:uid++,x:+((100-w)/2).toFixed(2),y:+((100-h)/2).toFixed(2),w:+w.toFixed(2),h:+h.toFixed(2),src:ev.target.result});render();};im.src=ev.target.result;};r.readAsDataURL(f);}
  var uploadMode='bg';
  $('fileIn').addEventListener('change',function(e){var f=e.target.files[0];if(uploadMode==='overlay')addOverlayFromFile(f);else setImageFile(f);uploadMode='bg';e.target.value='';});
  // Drag an image file straight onto the board to set it as the background.
  var dropHint=document.createElement('div');dropHint.className='drop-hint';dropHint.textContent='Drop image to set background';viewport.appendChild(dropHint);
  function dragLeaveOut(e){if(!viewport.contains(e.relatedTarget))viewport.classList.remove('dragging');}
  viewport.addEventListener('dragenter',function(e){if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>=0){e.preventDefault();viewport.classList.add('dragging');}});
  viewport.addEventListener('dragover',function(e){if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>=0){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
  viewport.addEventListener('dragleave',dragLeaveOut);
  viewport.addEventListener('drop',function(e){viewport.classList.remove('dragging');if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){e.preventDefault();setImageFile(e.dataTransfer.files[0]);}});
  var satStatus='';
  function setSat(s){satStatus=s;var el=$('satStatus');if(el)el.textContent=s;}
  function satUrl(lat,lon,span){var latSpan=span,lonSpan=span/Math.max(.2,Math.cos(lat*Math.PI/180));
    var bbox=(lon-lonSpan).toFixed(6)+','+(lat-latSpan).toFixed(6)+','+(lon+lonSpan).toFixed(6)+','+(lat+latSpan).toFixed(6);
    return 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox='+bbox+'&bboxSR=4326&imageSR=4326&size=1024,1024&format=jpg&f=image';}
  function wireAddr(ai,menu){var items=[],active=-1,timer=null,seq=0;
    function close(){menu.style.display='none';menu.innerHTML='';items=[];active=-1;}
    function choose(p){var d=p.description||p.main||'';close();ai.value=d;searchAddress(d);}
    function draw(){menu.innerHTML='';if(!items.length){close();return;}
      items.forEach(function(p,i){var it=document.createElement('div');it.className='addropt'+(i===active?' on':'');
        it.innerHTML='<span class="ao-main">'+escH(p.main||p.description||'')+'</span>'+(p.secondary?'<span class="ao-sec">'+escH(p.secondary)+'</span>':'');
        it.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();choose(p);});menu.appendChild(it);});
      menu.style.display='block';}
    ai.addEventListener('pointerdown',function(e){e.stopPropagation();});
    ai.addEventListener('input',function(){var q=ai.value.trim();active=-1;if(timer)clearTimeout(timer);
      if(q.length<3){close();return;}var my=++seq;
      timer=setTimeout(function(){fetch('/api/address/autocomplete?q='+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(d){
        if(my!==seq)return;items=(d&&d.predictions)||[];active=-1;draw();}).catch(function(){close();});},220);});
    ai.addEventListener('keydown',function(e){
      if(e.key==='ArrowDown'){e.preventDefault();if(items.length){active=(active+1)%items.length;draw();}}
      else if(e.key==='ArrowUp'){e.preventDefault();if(items.length){active=(active-1+items.length)%items.length;draw();}}
      else if(e.key==='Enter'){e.preventDefault();if(active>=0&&items[active])choose(items[active]);else if(ai.value.trim()){close();searchAddress(ai.value);}}
      else if(e.key==='Escape'){e.stopPropagation();close();}});
    ai.addEventListener('blur',function(){setTimeout(close,160);});}
  function searchAddress(q){q=(q||'').trim();if(!q){setSat('Enter an address');return;}setSat('Searching…');
    fetch('/api/geocode?q='+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(d){
      if(d&&d.lat!=null&&d.lon!=null){loadSat(+d.lat,+d.lon,q);return;}
      return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(arr){if(!arr||!arr.length){setSat('Address not found');return;}loadSat(+arr[0].lat,+arr[0].lon,q);});
    }).catch(function(){setSat('Search needs internet');});}
  var satLabels=false;
  function satMapType(){return satLabels?'hybrid':'satellite';}
  function toggleSatLabels(){if(!B.sat||B.sat.provider!=='google')return;satLabels=!satLabels;
    var url='/api/staticmap?lat='+B.sat.lat+'&lon='+B.sat.lon+'&zoom='+(B.sat.zoom||19)+'&type='+satMapType();setSat(satLabels?'Loading street names…':'Loading…');
    var im=new Image();im.crossOrigin='anonymous';im.onload=function(){B.img=url;B.sat.type=satMapType();render();setSat('');};im.onerror=function(){setSat('Load failed');};im.src=url;}
  function loadSat(lat,lon,q){var zoom=19;setSat('Loading satellite…');  // fetch ~500ft of context...
    var gurl='/api/staticmap?lat='+lat+'&lon='+lon+'&zoom='+zoom+'&type='+satMapType();
    var im=new Image();im.crossOrigin='anonymous';
    im.onload=function(){B.img=gurl;B.imgSource='sat';B.imgRatio=1;B.imgRotate=0;B.bg='image';B.sat={lat:lat,lon:lon,q:q,zoom:zoom,provider:'google',type:satMapType()};render();centerZoomTo(5/3);setSat('');};  // ...but open zoomed to ~300ft, centered
    im.onerror=function(){ var span=0.0015,url=satUrl(lat,lon,span);var im2=new Image();im2.crossOrigin='anonymous';
      im2.onload=function(){B.img=url;B.imgSource='sat';B.imgRatio=1;B.imgRotate=0;B.bg='image';B.sat={lat:lat,lon:lon,span:span,q:q,provider:'arcgis'};render();centerZoomTo(5/3);setSat('');};
      im2.onerror=function(){setSat('Imagery blocked here');};im2.src=url; };
    im.src=gurl;}
  function satZoom(f){if(!B.sat)return;
    if(B.sat.provider==='google'){B.sat.zoom=Math.max(15,Math.min(21,(B.sat.zoom||19)+(f<1?1:-1)));var url='/api/staticmap?lat='+B.sat.lat+'&lon='+B.sat.lon+'&zoom='+B.sat.zoom+'&type='+satMapType();setSat('Loading…');
      var im=new Image();im.crossOrigin='anonymous';im.onload=function(){B.img=url;render();setSat('');};im.onerror=function(){setSat('Load failed');};im.src=url;}
    else{B.sat.span=Math.max(0.0003,Math.min(0.02,B.sat.span*f));var url=satUrl(B.sat.lat,B.sat.lon,B.sat.span);setSat('Loading…');
      var im=new Image();im.crossOrigin='anonymous';im.onload=function(){B.img=url;render();setSat('');};im.onerror=function(){setSat('Load failed');};im.src=url;}}
  function bakeRotation(cb){if(!B.img||!B.imgRotate){if(cb)cb();return;}
    var im=new Image();im.crossOrigin='anonymous';im.onload=function(){
      var ar=B.imgRatio||1,OW=1600,OH=Math.max(1,Math.round(1600/ar));var cv=document.createElement('canvas');cv.width=OW;cv.height=OH;var x=cv.getContext('2d');x.fillStyle='#0e1320';x.fillRect(0,0,OW,OH);
      var th=B.imgRotate*Math.PI/180,cov=Math.abs(Math.cos(th))+Math.abs(Math.sin(th));var iw=im.naturalWidth,ih=im.naturalHeight,s=Math.max(OW/iw,OH/ih)*cov;
      x.save();x.translate(OW/2,OH/2);x.rotate(th);x.scale(s,s);x.drawImage(im,-iw/2,-ih/2);x.restore();
      try{B.img=cv.toDataURL('image/jpeg',0.92);B.imgSource='upload';B.imgRatio=OW/OH;B.imgRotate=0;boardImg.style.transform='';boardImg.src=B.img;}catch(err){setSat('Rotate bake blocked (CORS)');}
      if(cb)cb();else render();};
    im.onerror=function(){setSat('Rotate bake blocked');if(cb)cb();};im.src=B.img;}
  function setBg(bg){B.bg=bg;resetZoom();render();}
  function buildToolbar(){
    toolbar.innerHTML='';
    function grp(){var g=document.createElement('div');g.className='tgrp';return g;}
    function btn(label,on,active,warn){var b=document.createElement('button');b.className='tbtn'+(active?' active':'')+(warn?' warn':'');b.innerHTML=label;b.addEventListener('click',on);return b;}
    function ddBtn(label,active,items,opts){opts=opts||{};var dd=document.createElement('div');dd.className='dd';
      var b=document.createElement('button');b.className='tbtn'+(active?' active':'');b.innerHTML=label+(opts.noCaret?'':' <span style="font-size:9px">▾</span>');
      var menu=document.createElement('div');menu.className='dd-menu';
      items.forEach(function(it){if(it.head){var hd=document.createElement('div');hd.className='dd-head';hd.textContent=it.head;menu.appendChild(hd);return;}var row=document.createElement('div');row.className='dd-item'+(it.sel?' active':'');row.textContent=it.label;row.addEventListener('click',function(e){e.stopPropagation();it.on();closeMenus();});menu.appendChild(row);});
      b.addEventListener('click',function(e){e.stopPropagation();var was=dd.classList.contains('open');closeMenus();if(!was){dd.classList.add('open');
        // Position with fixed coords so the scrolling tools strip can't clip the popup.
        var r=b.getBoundingClientRect();menu.style.position='fixed';menu.style.left=r.left+'px';menu.style.top=(r.bottom+6)+'px';menu.style.maxHeight=(window.innerHeight-r.bottom-24)+'px';menu.style.overflowY='auto';
        if(r.left+menu.offsetWidth>window.innerWidth-10)menu.style.left=Math.max(10,window.innerWidth-10-menu.offsetWidth)+'px';}});
      dd.appendChild(b);dd.appendChild(menu);return dd;}
    // ── Tools strip (flat, evenly spaced): Select · Draw · Note · Upload · Location · Dim · Layers · Reset zoom · Undo · Reset all ──
    var moveB=btn(SVI.select,function(){cancelPending();tool='move';render();},tool==='move');moveB.title='Select';toolbar.appendChild(moveB);
    var inPoly=tool==='areapoly';
    function areaItem(k){return {label:KINDLABEL[k],on:function(){cancelPending();tool='room';roomKind=k;render();},sel:tool==='room'&&roomKind===k};}
    function polyItem(k){return {label:KINDLABEL[k]+' — multipoint',on:function(){cancelPending();tool='areapoly';areaPolyKind=k;render();},sel:inPoly&&areaPolyKind===k};}
    var drawItems=[{head:'DRAW'},
      {label:'Pen (freehand)',on:function(){cancelPending();tool='draw';drawMode='pen';render();},sel:tool==='draw'&&drawMode==='pen'},
      {label:'Line (straight)',on:function(){cancelPending();tool='draw';drawMode='line';render();},sel:tool==='draw'&&drawMode==='line'},
      {label:'Arrow (line + head)',on:function(){cancelPending();tool='draw';drawMode='arrow';render();},sel:tool==='draw'&&drawMode==='arrow'},
      {label:'Multi-line (polyline)',on:function(){cancelPending();tool='draw';drawMode='poly';render();},sel:tool==='draw'&&drawMode==='poly'},
      {label:'Wall (measured)',on:function(){cancelPending();tool='draw';drawMode='wall';render();},sel:tool==='draw'&&drawMode==='wall'},
      {label:'Measure (smart tool)',on:function(){cancelPending();tool='draw';drawMode='measure';render();},sel:tool==='draw'&&drawMode==='measure'},
      {head:'STRUCTURE / AREAS'}].concat(STRUCT_KINDS.map(areaItem)).concat([polyItem('room')]);
    var drawB=ddBtn(SVI.pen,(tool==='draw'||tool==='room'||tool==='areapoly'),drawItems);
    (function(){var t=drawB.querySelector('.tbtn');if(t)t.title='Draw — lines, shapes & rooms';})();toolbar.appendChild(drawB);
    var noteB=btn(SVI.note,function(){cancelPending();tool='note';render();},tool==='note');noteB.title='Add note';toolbar.appendChild(noteB);
    // Upload — Background / Image / Remove background
    var upItems=[{label:'Background',on:function(){uploadMode='bg';$('fileIn').click();}},{label:'Image (on top)',on:function(){uploadMode='overlay';$('fileIn').click();}}];
    if(B.img)upItems.push({label:'Remove background',on:function(){B.img=null;B.imgSource=null;B.sat=null;B.imgRotate=0;B.bg='blank';boardImg.style.transform='';setSat('');render();}});
    var upDd=ddBtn(SVI.upload,false,upItems,{noCaret:true});(function(){var t=upDd.querySelector('.tbtn');if(t)t.title='Upload';})();toolbar.appendChild(upDd);
    // Location — address search → satellite background
    var addrDd=document.createElement('div');addrDd.className='dd';
    var pinBtn=document.createElement('button');pinBtn.className='tbtn';pinBtn.innerHTML=SVI.pin;pinBtn.title='Location — search an address for a satellite background';
    var pop=document.createElement('div');pop.className='dd-menu';pop.style.cssText='padding:9px;min-width:252px;';
    var ai=document.createElement('input');ai.type='text';ai.className='addrin';ai.placeholder='Type an address…';ai.autocomplete='off';ai.spellcheck=false;ai.style.cssText='width:100%;box-sizing:border-box;';if(B.sat&&B.sat.q)ai.value=B.sat.q;
    var amenu=document.createElement('div');amenu.className='addrmenu';amenu.style.display='none';
    pop.appendChild(ai);pop.appendChild(amenu);
    ai.addEventListener('pointerdown',function(e){e.stopPropagation();});ai.addEventListener('click',function(e){e.stopPropagation();});
    pinBtn.addEventListener('click',function(e){e.stopPropagation();var was=addrDd.classList.contains('open');closeMenus();if(!was){addrDd.classList.add('open');var r=pinBtn.getBoundingClientRect();pop.style.position='fixed';pop.style.left=Math.max(10,Math.min(r.left,window.innerWidth-272))+'px';pop.style.top=(r.bottom+6)+'px';setTimeout(function(){ai.focus();},20);}});
    addrDd.appendChild(pinBtn);addrDd.appendChild(pop);toolbar.appendChild(addrDd);wireAddr(ai,amenu);
    // Dim
    var dimB=btn(SVI.dim,function(){boardBright=!boardBright;render();},boardBright);dimB.title='Dim the background';toolbar.appendChild(dimB);
    // Layers — show / hide (fixed-positioned popup so the scrolling strip can't clip it)
    var sdd=document.createElement('div');sdd.className='dd'+(showOpen?' open':'');
    var sbtn=document.createElement('button');sbtn.className='tbtn';var hid=[['cctv'],['wiring'],['sound'],['toast'],['alarm'],['misc'],['range'],['builder']].filter(function(p){return !show[p[0]];}).length;
    sbtn.innerHTML=SVI.layers;sbtn.title='Layers — show / hide'+(hid?' ('+hid+' hidden)':'');if(hid)sbtn.classList.add('active');
    var smenu=document.createElement('div');smenu.className='dd-menu';
    var SHOWKEYS=['cctv','wiring','sound','toast','alarm','misc','range','builder'];
    var allOn=SHOWKEYS.every(function(k){return show[k];});
    var selAll=document.createElement('div');selAll.className='dd-item active';selAll.style.fontWeight='800';selAll.textContent=(allOn?'Deselect all':'Select all');
    selAll.addEventListener('pointerdown',function(e){e.stopPropagation();});
    selAll.addEventListener('click',function(e){e.stopPropagation();var on=!allOn;SHOWKEYS.forEach(function(k){show[k]=on;});render();});
    smenu.appendChild(selAll);var sdiv=document.createElement('div');sdiv.style.cssText='height:1px;background:var(--slate-line);margin:4px 2px;';smenu.appendChild(sdiv);
    [['cctv','Cameras'],['sound','Sound'],['toast','Toast'],['wiring','Wires'],['alarm','Alarms'],['misc','Misc'],['range','Angles / Range'],['builder','Builder / areas']].forEach(function(p){
      var row=document.createElement('label');row.className='dd-chk';var cb=document.createElement('input');cb.type='checkbox';cb.checked=show[p[0]];
      row.addEventListener('pointerdown',function(e){e.stopPropagation();});row.addEventListener('click',function(e){e.stopPropagation();});
      cb.addEventListener('change',function(){show[p[0]]=cb.checked;render();});
      row.appendChild(cb);row.appendChild(document.createTextNode(' '+p[1]));smenu.appendChild(row);});
    function posShow(){var r=sbtn.getBoundingClientRect();smenu.style.position='fixed';smenu.style.left=Math.max(10,Math.min(r.left,window.innerWidth-232))+'px';smenu.style.top=(r.bottom+6)+'px';smenu.style.maxHeight=(window.innerHeight-r.bottom-24)+'px';smenu.style.overflowY='auto';}
    sbtn.addEventListener('click',function(e){e.stopPropagation();showOpen=!showOpen;sdd.classList.toggle('open',showOpen);if(showOpen)posShow();});
    sdd.appendChild(sbtn);sdd.appendChild(smenu);toolbar.appendChild(sdd);
    // Reset zoom
    var rzB=btn(SVI.expand,function(){resetZoom();});rzB.title='Reset zoom';toolbar.appendChild(rzB);
    // Undo
    var undoB=btn(SVI.undo,function(){undo();});undoB.title='Undo';if(!undoStack.length)undoB.style.opacity='.45';toolbar.appendChild(undoB);
    // Reset all (this floor / whole project)
    var resetDd=ddBtn(SVI.refresh,false,[
      {label:'Reset this floor',on:function(){resetFloor();}},
      {label:'Reset all (whole project)',on:function(){if(confirm('Reset the WHOLE project? This clears every floor and cannot be undone.'))resetAll();}}],{noCaret:true});
    (function(){var t=resetDd.querySelector('.tbtn');if(t)t.title='Reset all';})();toolbar.appendChild(resetDd);
    // satellite loading status
    var st=document.createElement('div');st.id='satStatus';st.style.cssText='font-size:11px;color:var(--gold);align-self:center;margin-left:4px;';st.textContent=satStatus||'';toolbar.appendChild(st);
    if(showOpen)posShow();
    // contextual: ink undo / clear while there are strokes
    if(B.strokes.length){toolbar.appendChild(btn('Undo ink',function(){B.strokes.pop();redrawStrokes();render();}));toolbar.appendChild(btn('Clear ink',function(){B.strokes=[];redrawStrokes();render();},false,true));}
    // contextual: draw colour swatches (appear at the end while drawing)
    if(tool==='draw'&&drawMode!=='wall'){var gc=grp();var COLORS=['#0B0F1A','#C9A96E','#D9534F','#4FB6B6','#5B8DEF','#6FCF97','#B084E0','#E8743B','#FAF8F4'];
      var llbl=document.createElement('span');llbl.textContent='Outline';llbl.style.cssText='font-size:10px;color:var(--muted);font-weight:700;align-self:center;';gc.appendChild(llbl);
      COLORS.forEach(function(c){var sw=document.createElement('button');sw.className='swatch'+(lineColor===c?' active':'');sw.style.background=c;sw.title=c;sw.addEventListener('click',function(){lineColor=c;render();});gc.appendChild(sw);});
      var custom=document.createElement('input');custom.type='color';custom.className='swatch-custom';custom.value=(/^#[0-9a-fA-F]{6}$/.test(lineColor)?lineColor:'#0B0F1A');custom.title='Custom outline color';custom.addEventListener('input',function(){lineColor=custom.value;});custom.addEventListener('change',function(){lineColor=custom.value;render();});gc.appendChild(custom);
      if(window.EyeDropper){var ed=btn('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 3a2.8 2.8 0 0 0-4 0l-1.6 1.6-1-1-1.4 1.4 1 1L4 13.5V20h6.5l7.5-7.5 1 1 1.4-1.4-1-1L21 9a2.8 2.8 0 0 0 0-4z"/><path d="M13.4 6.6 17 10"/></svg>',function(){try{new window.EyeDropper().open().then(function(res){lineColor=res.sRGBHex;render();}).catch(function(){});}catch(e){}});ed.title='Match a color from anywhere on the board (eyedropper)';gc.appendChild(ed);}
      toolbar.appendChild(gc);
      if(drawMode==='poly'){var gf=grp();
        var flbl=document.createElement('span');flbl.textContent='Fill';flbl.style.cssText='font-size:10px;color:var(--muted);font-weight:700;align-self:center;';gf.appendChild(flbl);
        var none=document.createElement('button');none.className='swatch'+(fillColor==null?' active':'');none.title='No fill (open shape)';none.style.background='repeating-linear-gradient(45deg,#5a6072 0 4px,#2b3040 4px 8px)';none.addEventListener('click',function(){fillColor=null;render();});gf.appendChild(none);
        COLORS.forEach(function(c){var sw=document.createElement('button');sw.className='swatch'+(fillColor===c?' active':'');sw.style.background=c;sw.title=c;sw.addEventListener('click',function(){fillColor=c;render();});gf.appendChild(sw);});
        var fcustom=document.createElement('input');fcustom.type='color';fcustom.className='swatch-custom';fcustom.value=(/^#[0-9a-fA-F]{6}$/.test(fillColor||'')?fillColor:'#6FCF97');fcustom.title='Custom fill color';fcustom.addEventListener('input',function(){fillColor=fcustom.value;});fcustom.addEventListener('change',function(){fillColor=fcustom.value;render();});gf.appendChild(fcustom);
        toolbar.appendChild(gf);}}
  }
  function renderFloors(){var fb=$('floorbar');fb.innerHTML='';
    floors.forEach(function(f,i){var tab=document.createElement('div');tab.className='ftab'+(i===curFloor?' active':'');
      var nm=document.createElement('span');nm.className='fname';nm.textContent=i===curFloor?floors[i].name:f.name;
      if(i===curFloor){nm.contentEditable=true;nm.spellcheck=false;nm.addEventListener('pointerdown',function(e){e.stopPropagation();});nm.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();nm.blur();}});nm.addEventListener('blur',function(){floors[i].name=nm.textContent.trim()||floors[i].name;});}
      tab.appendChild(nm);
      if(floors.length>1&&i===curFloor){var x=document.createElement('span');x.className='fx';x.textContent='×';x.title='Delete this floor';x.addEventListener('click',function(e){e.stopPropagation();delFloor(i);});tab.appendChild(x);}
      tab.addEventListener('click',function(){gotoFloor(i);});fb.appendChild(tab);});
    var add=document.createElement('button');add.className='fadd';add.textContent='+ Floor';add.addEventListener('click',function(e){e.stopPropagation();addFloorNamed('Floor '+nextFloorNum());});fb.appendChild(add);
  }
  function renderConditions(){var el=$('condPanel');if(!el)return;if(!B.conditions)B.conditions=defaultConditions();
    el.className='condpanel'+(condsCollapsed?' collapsed':'');
    var h='<div class="ch" id="condHead">Site Conditions <span>'+(condsCollapsed?'▸':'▾')+'</span></div><div class="cbody">';
    CONDITIONS.forEach(function(c){h+='<div class="condfld"><label>'+c.label+'</label><select data-ck="'+c.k+'">'+c.opts.map(function(o){return '<option'+(B.conditions[c.k]===o?' selected':'')+'>'+o+'</option>';}).join('')+'</select></div>';});
    el.innerHTML=h+'</div>';
    var hd=$('condHead');if(hd)hd.addEventListener('click',function(){condsCollapsed=!condsCollapsed;renderConditions();});
    [].forEach.call(el.querySelectorAll('select[data-ck]'),function(sel){sel.addEventListener('change',function(){B.conditions[sel.getAttribute('data-ck')]=sel.value;if(window.SURVEY&&window.SURVEY.onChange)window.SURVEY.onChange(markers.length);});});}
  function render(){
    buildToolbar();renderFloors();layoutBoard();renderConditions();
    board.style.background=B.bg==='blank'?'#ffffff':'#0e1320';board.classList.toggle('bright',boardBright);viewport.classList.toggle('blank',B.bg==='blank');
    boardImg.hidden=!(B.bg==='image'&&B.img);if(B.bg==='image'&&B.img){boardImg.src=B.img;var th=(B.imgRotate||0)*Math.PI/180,cov=Math.abs(Math.cos(th))+Math.abs(Math.sin(th));boardImg.style.transform='rotate('+(B.imgRotate||0)+'deg) scale('+cov+')';}else boardImg.style.transform='';
    var cnt={};markers.forEach(function(m){
      if(m.kind==='cam'){var key=m.mode==='out'?'O':'I';cnt[key]=(cnt[key]||0)+1;m._tag=key+cnt[key];}
      else{var t=TYPE[m.kind]?TYPE[m.kind].tag:m.kind.toUpperCase();cnt[t]=(cnt[t]||0)+1;m._tag=t+cnt[t];}});
    board.querySelectorAll('.room').forEach(function(r){r.remove();});
    if(show.builder)B.rooms.forEach(function(rm){if(rm.poly)return;var d=document.createElement('div');d.className='room '+rm.kind+(rm.locked?' locked':'');d.style.left=rm.x+'%';d.style.top=rm.y+'%';d.style.width=rm.w+'%';d.style.height=rm.h+'%';d.style.transform='rotate('+(rm.rot||0)+'deg)';
      decorate(d,rm);
      var nm=document.createElement('div');nm.className='rname';nm.textContent=rm.name;nm.style.transform='translate(-50%,-50%) rotate('+(-(rm.rot||0))+'deg)';d.appendChild(nm);
      if(rm.locked){var lk=document.createElement('div');lk.className='rlock';lk.innerHTML='<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';lk.title='Locked — click to edit';lk.addEventListener('pointerdown',function(e){e.stopPropagation();});lk.addEventListener('click',function(e){e.stopPropagation();rm.locked=false;render();});d.appendChild(lk);board.appendChild(d);return;}
      var grip=document.createElement('div');grip.className='rgrip';grip.innerHTML='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';grip.title='Drag to move';d.appendChild(grip);
      var del=document.createElement('div');del.className='rdel';del.textContent='×';del.addEventListener('pointerdown',function(e){e.stopPropagation();});del.addEventListener('click',function(e){e.stopPropagation();removeRoom(rm.id);});d.appendChild(del);
      var setb=document.createElement('div');setb.className='rset';setb.innerHTML='<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.125em"><polyline points="20 6 9 17 4 12"/></svg>';setb.title='Set — lock in place';setb.addEventListener('pointerdown',function(e){e.stopPropagation();});setb.addEventListener('click',function(e){e.stopPropagation();rm.locked=true;render();});d.appendChild(setb);
      if(hasDecor(rm.kind)){var flipb=document.createElement('div');flipb.className='rflip';flipb.innerHTML=SVI.flip;flipb.title='Flip';flipb.addEventListener('pointerdown',function(e){e.stopPropagation();});flipb.addEventListener('click',function(e){e.stopPropagation();rm.flip=!rm.flip;render();});d.appendChild(flipb);}
      var roth=document.createElement('div');roth.className='rrot-h';roth.title='Drag to rotate · snaps 45/90';roth.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 8 16 8"/></svg>';roth.addEventListener('pointerdown',function(e){startRotate(e,rm,d);});d.appendChild(roth);
      var sz=document.createElement('div');sz.className='rsize';
      var dec=document.createElement('div');dec.className='rsz';dec.innerHTML='−';dec.title='Smaller';dec.addEventListener('pointerdown',function(e){e.stopPropagation();});dec.addEventListener('click',function(e){e.stopPropagation();sizeRoom(rm,0.88);});
      var inc=document.createElement('div');inc.className='rsz';inc.innerHTML='+';inc.title='Bigger';inc.addEventListener('pointerdown',function(e){e.stopPropagation();});inc.addEventListener('click',function(e){e.stopPropagation();sizeRoom(rm,1.14);});
      sz.appendChild(dec);sz.appendChild(inc);d.appendChild(sz);
      ['nw','n','ne','e','se','s','sw','w'].forEach(function(dir){var hd=document.createElement('div');hd.className='rhandle h-'+dir;hd.addEventListener('pointerdown',function(e){e.stopPropagation();startResize(e,rm,d,dir);});d.appendChild(hd);});
      grip.addEventListener('pointerdown',function(e){e.stopPropagation();grip.setPointerCapture(e.pointerId);var br=board.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=rm.x,oy=rm.y;
        function mv(ev){var dx=(ev.clientX-sx)/br.width*100/B.zoom.s,dy=(ev.clientY-sy)/br.height*100/B.zoom.s;rm.x=Math.max(0,Math.min(100-rm.w,ox+dx));rm.y=Math.max(0,Math.min(100-rm.h,oy+dy));d.style.left=rm.x+'%';d.style.top=rm.y+'%';}
        function up(){grip.removeEventListener('pointermove',mv);grip.removeEventListener('pointerup',up);}grip.addEventListener('pointermove',mv);grip.addEventListener('pointerup',up);});
      board.appendChild(d);});
    // Overlay images — sit on top of the background, under the device pins; drag the grip, pull the handles to resize.
    board.querySelectorAll('.ovl').forEach(function(o){o.remove();});
    (B.overlays||[]).forEach(function(ov){var d=document.createElement('div');d.className='ovl';d.style.left=ov.x+'%';d.style.top=ov.y+'%';d.style.width=ov.w+'%';d.style.height=ov.h+'%';
      var img=document.createElement('img');img.src=ov.src;img.draggable=false;d.appendChild(img);
      var grip=document.createElement('div');grip.className='ogrip';grip.innerHTML='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';grip.title='Drag to move';d.appendChild(grip);
      var del=document.createElement('div');del.className='odel';del.textContent='×';del.title='Remove image';del.addEventListener('pointerdown',function(e){e.stopPropagation();});del.addEventListener('click',function(e){e.stopPropagation();removeOverlay(ov.id);});d.appendChild(del);
      ['nw','n','ne','e','se','s','sw','w'].forEach(function(dir){var hd=document.createElement('div');hd.className='rhandle h-'+dir;hd.addEventListener('pointerdown',function(e){e.stopPropagation();startResize(e,ov,d,dir);});d.appendChild(hd);});
      grip.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();snapUndo();var br=board.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=ov.x,oy=ov.y;
        function mv(ev){var dx=(ev.clientX-sx)/br.width*100/B.zoom.s,dy=(ev.clientY-sy)/br.height*100/B.zoom.s;ov.x=Math.max(0,Math.min(100-ov.w,ox+dx));ov.y=Math.max(0,Math.min(100-ov.h,oy+dy));d.style.left=ov.x+'%';d.style.top=ov.y+'%';}
        function up(){window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);}
        window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);});
      board.appendChild(d);});
    // Reuse pin elements across renders (keyed by data-mid) so stacking/fan-out animates smoothly via a
    // CSS transition, instead of snapping every time elements are destroyed & recreated.
    var existingPins={};board.querySelectorAll('.pin').forEach(function(p){var k=p.getAttribute('data-mid');if(k)existingPins[k]=p;else p.remove();});
    var keepPins={},pinEls=[];
    markers.forEach(function(m){var mg=TYPE[m.kind]?TYPE[m.kind].group:'cctv';if(!show[mg])return;var col=TYPE[m.kind]?TYPE[m.kind].color:'#C9A96E';
      var cable=!!(TYPE[m.kind]&&TYPE[m.kind].cable);var key=''+m.id;keepPins[key]=1;
      var p=existingPins[key],fresh=!p;
      if(fresh){p=document.createElement('div');p.setAttribute('data-mid',key);
        p.addEventListener('pointerdown',function(e){var k=p.getAttribute('data-mid'),mm=null;for(var z=0;z<markers.length;z++){if(''+markers[z].id===k){mm=markers[z];break;}}if(!mm)return;if(tool==='move')startPinMove(e,mm,p);else startPinArrow(e,mm,p);});}
      p.className='pin'+(m.mode==='out'?' outdoor':'')+(cable?' cable':'');p.setAttribute('data-kind',m.kind);
      p.style.left=m.x+'%';p.style.top=m.y+'%';p.style.background=col;p.style.transform='translate(-50%,-50%) scale('+(B.iconScale||0.8)+')';
      p.style.marginLeft='0';p.style.marginTop='0';p.style.zIndex='';
      p.innerHTML=IC[m.kind]+(CAMK[m.kind]?'<span class="rj45">'+m._tag+'</span>':'<span class="pnum" style="color:'+col+';border-color:'+col+'">'+m._tag+'</span>');
      p.style.cursor=(tool==='move'?'move':'crosshair');p.title=(m.name?m.name+' · ':'')+m._tag+(m.kind==='cam'?(m.mode==='out'?' · outdoor':' · indoor'):'')+(tool==='move'?' — drag to move · click × to remove':' — drag to aim/size');
      if(tool==='move'){(function(mid){var x=document.createElement('span');x.className='pdel';x.textContent='×';x.title='Remove';x.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();});x.addEventListener('click',function(e){e.stopPropagation();removeMarker(mid);});p.appendChild(x);})(m.id);}
      if(fresh)board.appendChild(p);pinEls.push({el:p,x:m.x,y:m.y});});
    B.notes.forEach(function(nt,idx){var tag='N'+(idx+1),key='n'+nt.id;keepPins[key]=1;
      var p=existingPins[key],fresh=!p;
      if(fresh){p=document.createElement('div');p.setAttribute('data-mid',key);p.setAttribute('data-kind','note');
        p.addEventListener('pointerdown',function(e){e.stopPropagation();});
        p.addEventListener('click',function(e){e.stopPropagation();var id=p.getAttribute('data-mid').slice(1);var ta=list.querySelector('[data-note="'+id+'"] textarea');if(ta){ta.focus();ta.scrollIntoView({block:'nearest'});}});}
      p.className='pin';p.style.left=nt.x+'%';p.style.top=nt.y+'%';p.style.background=NOTE_COLOR;
      p.style.marginLeft='0';p.style.marginTop='0';p.style.zIndex='';
      p.innerHTML=ICONS.note+'<span class="pnum" style="color:'+NOTE_COLOR+';border-color:'+NOTE_COLOR+'">'+tag+'</span>';
      p.title=tag+(nt.text?': '+nt.text:'')+' — note';
      if(fresh)board.appendChild(p);pinEls.push({el:p,x:nt.x,y:nt.y});});
    Object.keys(existingPins).forEach(function(k){if(!keepPins[k])existingPins[k].remove();});
    fanOverlaps(pinEls);
    redrawStrokes();clampPan();applyZoom();
    var gc={cctv:0,wiring:0,sound:0,toast:0,alarm:0,misc:0};markers.forEach(function(m){var g=TYPE[m.kind]?TYPE[m.kind].group:'cctv';gc[g]=(gc[g]||0)+1;});
    var bld=B.rooms.filter(function(r){return r.kind==='building';}).length,ar=B.rooms.length-bld,nts=B.notes.length,tot=markers.length+B.rooms.length+nts;
    var parts=[];if(gc.cctv)parts.push('CCTV '+gc.cctv);if(gc.sound)parts.push('Sound '+gc.sound);if(gc.toast)parts.push('Toast '+gc.toast);if(gc.wiring)parts.push('Wires '+gc.wiring);if(gc.alarm)parts.push('Alarm '+gc.alarm);if(gc.misc)parts.push('Misc '+gc.misc);
    if(ar)parts.push(ar+' area'+(ar>1?'s':''));if(bld)parts.push(bld+' building'+(bld>1?'s':''));if(nts)parts.push(nts+' note'+(nts>1?'s':''));
    pill.textContent=tot===0?'0 placed':parts.join(' · ');
    if(doneBtn)doneBtn.disabled=tot===0;
    if(window.SURVEY&&window.SURVEY.onChange)window.SURVEY.onChange(tot);
    hint.innerHTML=SVI.bulb+'<span>'+((pending&&pending.type==='areapoly')?(KINDLABEL[areaPolyKind]+' outline · click each corner · snaps 45/90 · double-click or click the first point to close'):((pending&&pending.type==='poly')?'Multi-line · click each point · double-click (or switch tools) to finish':((pending&&pending.type==='stroke')?'Click the end point (snaps 45/90)':(tool==='note'?'Note · tap the plan to drop a note':(tool==='draw'?'Draw · click start, then end':(tool==='room'?'Drag a box for '+(KINDLABEL[roomKind]||'area'):(tool==='move'?'Move / Select · drag a device to reposition · click the × to remove it':'Tip: Click to place · Drag a device to move · Scroll to zoom · Drag to pan when zoomed')))))))+'</span>';
    sideHead.innerHTML='On this floor <span class="cnt-badge">'+markers.length+'</span>';
    renderList();
  }
  var listCollapsed={};
  // A vertically-collapsible list section: clickable header (label + count + chevron) and a body that
  // smoothly slides open/closed (grid-rows 1fr↔0fr animation). Returns the inner element rows go into.
  function listGroup(key,label){
    var collapsed=!!listCollapsed[key];
    var wrap=document.createElement('div');wrap.className='lgroup'+(collapsed?' collapsed':'');
    var head=document.createElement('div');head.className='grp';
    var lbl=document.createElement('span');lbl.textContent=label;var chev=document.createElement('span');chev.className='gchev';chev.textContent='▾';
    head.appendChild(lbl);head.appendChild(chev);
    head.addEventListener('click',function(){listCollapsed[key]=!listCollapsed[key];wrap.classList.toggle('collapsed',listCollapsed[key]);});
    var body=document.createElement('div');body.className='lgbody';
    var inner=document.createElement('div');inner.className='lginner';body.appendChild(inner);
    wrap.appendChild(head);wrap.appendChild(body);list.appendChild(wrap);
    return inner;
  }
  function renderList(){
    list.innerHTML='';
    if(markers.length===0&&B.rooms.length===0&&B.notes.length===0){empty.innerHTML='<span>+</span>Place cameras/devices, draw the<br>layout, add rooms, or drop notes.';list.appendChild(empty);return;}
    ORDER.forEach(function(kind){var rows=markers.filter(function(m){return m.kind===kind;});if(!rows.length)return;var col=TYPE[kind].color;
      var body=listGroup('k:'+kind,TL[kind]+' ('+rows.length+')');
      rows.forEach(function(m){var name=m.kind==='cam'?(m.mode==='out'?'Outdoor camera':'Indoor camera'):TL[m.kind];
        var row=document.createElement('div');row.className='item';row.setAttribute('data-kind',m.kind);
        row.innerHTML='<div class="dot" style="background:'+col+'">'+m._tag+'</div><div class="meta"><div class="nm" contenteditable="true" spellcheck="false" title="Click to rename — the '+m._tag+' tag stays"></div></div><button class="rm">×</button>';
        var mnm=row.querySelector('.nm');mnm.textContent=m.name||name;
        mnm.addEventListener('pointerdown',function(e){e.stopPropagation();});
        mnm.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();mnm.blur();}});
        mnm.addEventListener('blur',function(){var v=mnm.textContent.trim();m.name=(v&&v!==name)?v:'';render();});
        row.querySelector('.rm').addEventListener('click',function(){removeMarker(m.id);});
        if(CONE[m.kind]&&m.arrow){var fov=m.fov||defFov(m.kind);var fc=document.createElement('div');fc.className='fovrow';
          fc.innerHTML='<span class="fovlbl">FOV</span><input type="range" min="20" max="360" step="1" value="'+fov+'"><span class="fovval">'+fov+'°</span>';
          var rng=fc.querySelector('input'),vv=fc.querySelector('.fovval'),SNAPS=[80,90,128,360];
          rng.addEventListener('pointerdown',function(e){e.stopPropagation();});
          rng.addEventListener('input',function(){var v=+rng.value;for(var i=0;i<SNAPS.length;i++){if(Math.abs(v-SNAPS[i])<=5){v=SNAPS[i];break;}}rng.value=v;m.fov=v;vv.textContent=v+'°';redrawStrokes();});
          row.appendChild(fc);}
        body.appendChild(row);});});
    AREAKINDS.forEach(function(kind){var rows=B.rooms.filter(function(r){return r.kind===kind;});if(!rows.length)return;var lab=AREALAB[kind];
      var body=listGroup('a:'+kind,lab[0]+' ('+rows.length+')');
      rows.forEach(function(rm){var row=document.createElement('div');row.className='item';row.setAttribute('data-kind','room');
        var dim=rm.poly?('polygon · '+rm.poly.length+' pts'):(B.ftWide?(fmtFeet(rm.w/100*B.ftWide)+' × '+fmtFeet(rm.h/100*B.ftWide/ratio())):(Math.round(rm.w)+'% × '+Math.round(rm.h)+'%'));
        row.innerHTML='<div class="dot" style="'+(kind==='building'?'background:var(--gold)':'')+'">'+lab[1]+'</div><div class="meta"><div class="nm" contenteditable="true" spellcheck="false"></div><div class="sb">'+dim+' · edit name</div></div><button class="rm">×</button>';
        var nm=row.querySelector('.nm');nm.textContent=rm.name;nm.addEventListener('blur',function(){rm.name=nm.textContent.trim()||rm.name;render();});nm.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();nm.blur();}});
        row.querySelector('.rm').addEventListener('click',function(){removeRoom(rm.id);});body.appendChild(row);});});
    if(B.notes.length){var body=listGroup('notes','Notes ('+B.notes.length+')');
      B.notes.forEach(function(nt,idx){var row=document.createElement('div');row.className='item';row.setAttribute('data-kind','note');row.setAttribute('data-note',nt.id);
        row.innerHTML='<div class="dot" style="background:'+NOTE_COLOR+'">N'+(idx+1)+'</div><div class="meta" style="width:100%"><textarea class="noteinput" rows="2" placeholder="Type note…"></textarea></div><button class="rm">×</button>';
        var ta=row.querySelector('textarea');ta.value=nt.text;ta.addEventListener('input',function(){nt.text=ta.value;});ta.addEventListener('pointerdown',function(e){e.stopPropagation();});
        row.querySelector('.rm').addEventListener('click',function(){removeNote(nt.id);});body.appendChild(row);});}
  }
  window.addEventListener('resize',function(){layoutBoard();redrawStrokes();clampPan();applyZoom();});
  document.addEventListener('click',function(){if(floorMenuOpen||resetMenuOpen){floorMenuOpen=false;resetMenuOpen=false;pendingReset=false;renderFloors();}});
  $('clearBtn').addEventListener('click',function(){markers=[];B.rooms=[];B.strokes=[];B.notes=[];redrawStrokes();out.classList.remove('show');render();});
  function escH(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function pip(px,py,poly){var inside=false,j=poly.length-1;for(var i=0;i<poly.length;j=i++){var xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;if(((yi>py)!=(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
  function inRect(px,py,rm){var cx=rm.x+rm.w/2,cy=rm.y+rm.h/2,a=-(rm.rot||0)*Math.PI/180,dx=px-cx,dy=py-cy,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);return Math.abs(lx)<=rm.w/2&&Math.abs(ly)<=rm.h/2;}
  function areaSize(rm){if(rm.poly){var s=0,j=rm.poly.length-1;for(var i=0;i<rm.poly.length;j=i++){s+=(rm.poly[j].x+rm.poly[i].x)*(rm.poly[j].y-rm.poly[i].y);}return Math.abs(s/2);}return rm.w*rm.h;}
  var CONTAIN=['building','room','bathroom','stairs','entrance','parking'];
  function assignArea(m,rooms){var best=null,ba=1e9;rooms.forEach(function(rm){if(CONTAIN.indexOf(rm.kind)<0)return;var hit=rm.poly?pip(m.x,m.y,rm.poly):inRect(m.x,m.y,rm);if(hit){var a=areaSize(rm);if(a<ba){ba=a;best=rm;}}});return best;}
  function tagAll(){floors.forEach(function(fl){var cnt={};fl.markers.forEach(function(m){if(m.kind==='cam'){var k=m.mode==='out'?'O':'I';cnt[k]=(cnt[k]||0)+1;m._tag=k+cnt[k];}else{var t=TYPE[m.kind]?TYPE[m.kind].tag:m.kind.toUpperCase();cnt[t]=(cnt[t]||0)+1;m._tag=t+cnt[t];}});});}
  function cropToContent(cv,fb,mk,W,H){
    var xs=[],ys=[];
    mk.forEach(function(m){xs.push(m.x);ys.push(m.y);});
    (fb.rooms||[]).forEach(function(rm){if(rm.poly){rm.poly.forEach(function(p){xs.push(p.x);ys.push(p.y);});}else{xs.push(rm.x);xs.push(rm.x+rm.w);ys.push(rm.y);ys.push(rm.y+rm.h);}});
    (fb.strokes||[]).forEach(function(st){st.pts.forEach(function(p){xs.push(p.x);ys.push(p.y);});});
    function full(){try{return cv.toDataURL('image/png');}catch(e){return '';}}
    if(xs.length<2)return full();
    var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
    var padX=(maxX-minX)*0.14+7,padY=(maxY-minY)*0.14+7;
    minX=Math.max(0,minX-padX);maxX=Math.min(100,maxX+padX);minY=Math.max(0,minY-padY);maxY=Math.min(100,maxY+padY);
    var cw=(maxX-minX)/100*W,ch=(maxY-minY)/100*H,sx=minX/100*W,sy=minY/100*H;
    if(cw<60||ch<60||(cw>W*0.92&&ch>H*0.92))return full();
    var out=document.createElement('canvas');out.width=Math.round(cw);out.height=Math.round(ch);var ox=out.getContext('2d');
    ox.fillStyle='#fbfaf7';ox.fillRect(0,0,out.width,out.height);ox.drawImage(cv,sx,sy,cw,ch,0,0,out.width,out.height);
    try{return out.toDataURL('image/png');}catch(e){return full();}}
  function renderFloorImage(fl,cb){var fb=fl.B,mk=fl.markers,ar=(fb.bg==='image'?fb.imgRatio:1)||1;
    function draw(bg){
      // Render at the background's NATIVE resolution (capped 1280–4000) so uploaded plans stay razor-sharp (no upscaling);
      // blank boards use a high fixed width. Marker / label sizes scale with W so they stay proportional at any resolution.
      var W=bg&&bg.naturalWidth?Math.max(1280,Math.min(4000,bg.naturalWidth)):2400,H=Math.max(1,Math.round(W/ar));
      function label(x,txt,X,Y,col){x.save();x.font='600 '+Math.round(W*0.013)+'px Helvetica,Arial';x.textAlign='center';x.textBaseline='middle';var tw=x.measureText(txt).width;x.fillStyle='rgba(255,255,255,.82)';x.fillRect(X-tw/2-5,Y-Math.round(W*0.008),tw+10,Math.round(W*0.016));x.fillStyle=col;x.fillText(txt,X,Y);x.restore();}
      var cv=document.createElement('canvas');cv.width=W;cv.height=H;var x=cv.getContext('2d');
      x.fillStyle='#fbfaf7';x.fillRect(0,0,W,H);if(bg){try{x.globalAlpha=.95;x.drawImage(bg,0,0,W,H);x.globalAlpha=1;}catch(e){}}
      fb.rooms.forEach(function(rm){var col=AREACOLOR[rm.kind]||'#9FB0C8';
        if(rm.poly){x.beginPath();rm.poly.forEach(function(p,i){var X=p.x/100*W,Y=p.y/100*H;i?x.lineTo(X,Y):x.moveTo(X,Y);});x.closePath();x.fillStyle=hexA(col,.07);x.fill();x.strokeStyle=col;x.lineWidth=rm.kind==='building'?3:2;x.stroke();var c=centroid(rm.poly);label(x,rm.name,c.x/100*W,c.y/100*H,col);}
        else{x.save();var cx=(rm.x+rm.w/2)/100*W,cy=(rm.y+rm.h/2)/100*H,w=rm.w/100*W,h=rm.h/100*H;x.translate(cx,cy);x.rotate((rm.rot||0)*Math.PI/180);x.fillStyle=hexA(col,.07);x.fillRect(-w/2,-h/2,w,h);x.strokeStyle=col;x.lineWidth=rm.kind==='building'?3:2;x.strokeRect(-w/2,-h/2,w,h);x.restore();label(x,rm.name,cx,cy,col);}});
      fb.strokes.forEach(function(st){x.lineCap='round';x.lineJoin='round';x.beginPath();st.pts.forEach(function(p,i){var X=p.x/100*W,Y=p.y/100*H;i?x.lineTo(X,Y):x.moveTo(X,Y);});if(st.fill&&st.pts.length>2){x.save();x.closePath();x.globalAlpha=0.72;x.fillStyle=st.fill;x.fill();x.restore();}x.strokeStyle=st.color;x.lineWidth=st.w||2;x.stroke();});
      mk.forEach(function(m){if(!m.arrow)return;var t=TYPE[m.kind]||{},col=t.color||'#C9A96E',sx=m.x/100*W,sy=m.y/100*H,rad=m.arrow.angle*Math.PI/180,L=m.arrow.len/100*W;
        if(CONE[m.kind]){var half=(m.fov||defFov(m.kind))/2*Math.PI/180;x.save();x.beginPath();x.moveTo(sx,sy);x.lineTo(sx+Math.cos(rad-half)*L,sy+Math.sin(rad-half)*L);x.arc(sx,sy,L,rad-half,rad+half);x.closePath();x.fillStyle=hexA(col,.18);x.fill();x.strokeStyle=hexA(col,.5);x.lineWidth=1.2;x.stroke();x.restore();}
        else if(m.kind==='spk'||m.kind==='tap'){x.save();x.globalAlpha=.12;x.fillStyle=col;x.beginPath();x.arc(sx,sy,L,0,6.2832);x.fill();x.restore();}});
      mk.forEach(function(m){var t=TYPE[m.kind]||{},col=t.color||'#C9A96E',sx=m.x/100*W,sy=m.y/100*H,r=Math.max(13,W*0.0105)*(fb.iconScale||0.8);
        x.beginPath();x.arc(sx,sy,r,0,6.2832);x.fillStyle=col;x.fill();x.lineWidth=t.cable?3.5:2.5;x.strokeStyle=t.cable?'#34C759':(m.mode==='out'?'#D9534F':'#fff');x.stroke();
        x.fillStyle='#fff';x.font='bold '+Math.round(r*0.92)+'px Helvetica,Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(m._tag,sx,sy);
        if(CAMK[m.kind]){x.font='bold '+Math.round(r*0.62)+'px Helvetica,Arial';var bt='Cat 6',bw=x.measureText(bt).width;x.fillStyle='#34C759';x.fillRect(sx-bw/2-3,sy+r+1,bw+6,Math.round(r*0.86));x.fillStyle='#04210f';x.textBaseline='top';x.fillText(bt,sx,sy+r+2);}});
      // Show the ENTIRE image at high resolution (no content-cropping). PNG for line-art (lossless, sharp, tiny);
      // JPEG q0.95 when there's a photo/satellite background (keeps the big canvas a sane file size).
      var url;try{url=bg?cv.toDataURL('image/jpeg',0.95):cv.toDataURL('image/png');}catch(e){try{url=cv.toDataURL('image/png');}catch(e2){url='';}}cb(url);}
    if(fb.bg==='image'&&fb.img&&(fb.imgSource!=='sat'||(fb.sat&&fb.sat.provider==='google'))){var im=new Image();im.onload=function(){draw(im);};im.onerror=function(){draw(null);};im.src=fb.img;}else draw(null);}
  function floorImages(cb){snapFloor();tagAll();var imgs=[],i=0;(function nx(){if(i>=floors.length){cb(imgs);return;}renderFloorImage(floors[i],function(u){imgs[i]=u;i++;nx();});})();}
  function emitProposalHTML(imgs){
    var GT={},floorHtml=floors.map(function(fl,fi){var mk=fl.markers,groups={};
      mk.forEach(function(m){var a=assignArea(m,fl.B.rooms),an=a?a.name:'General / Unassigned';groups[an]=groups[an]||{order:a?areaSize(a):1e9,items:{}};var it=groups[an].items;it[m.kind]=it[m.kind]||{c:0,tags:[]};it[m.kind].c++;it[m.kind].tags.push(m._tag);var g=TYPE[m.kind]?TYPE[m.kind].group:'cctv';GT[g]=(GT[g]||0)+1;});
      var names=Object.keys(groups).sort(function(a,b){return groups[a].order-groups[b].order;}),rows='',ftot=0;
      names.forEach(function(an){var it=groups[an].items,kinds=Object.keys(it),sub=kinds.reduce(function(s,k){return s+it[k].c;},0);ftot+=sub;
        rows+='<tr class="ar"><td colspan="3">'+escH(an)+'</td><td class="q">'+sub+'</td></tr>';
        kinds.forEach(function(k){var t=TYPE[k]||{};rows+='<tr><td class="ind">'+escH(t.label||k)+'</td><td><span class="sys" style="background:'+(t.color||'#999')+'">'+escH(t.group||'')+'</span></td><td class="tg">'+escH(it[k].tags.join(', '))+'</td><td class="q">'+it[k].c+'</td></tr>';});});
      return '<section class="fl"><div class="flh"><h2>'+escH(fl.name)+'</h2><span class="cnt">'+ftot+' devices</span></div>'+(imgs[fi]?'<img class="plan" src="'+imgs[fi]+'">':'<p class="noimg">[floor plan image unavailable]</p>')+'<table><thead><tr><th>Item</th><th>System</th><th>Tags</th><th>Qty</th></tr></thead><tbody>'+rows+'</tbody></table></section>';
    }).join('');
    var sysLbl={cctv:'Cameras / CCTV',sound:'Sound',toast:'Toast',alarm:'Alarms',misc:'Misc'},grand=0;
    var sysRows=Object.keys(sysLbl).filter(function(k){return GT[k];}).map(function(k){grand+=GT[k];return '<tr><td>'+sysLbl[k]+'</td><td class="q">'+GT[k]+'</td></tr>';}).join('');
    var date=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
    return '<!doctype html><html><head><meta charset="utf-8"><title>IOT TECHS — Floor Plan Proposal</title><style>'
      +'*{box-sizing:border-box}body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#1a1f2c;background:#e9e6df}.wrap{max-width:1000px;margin:0 auto;background:#faf8f4}'
      +'.head{background:#0B0F1A;color:#fff;padding:26px 30px;border-bottom:4px solid #C9A96E}.head h1{margin:0;font-size:24px}.head .tag{color:#C9A96E;font-size:13px;letter-spacing:2px;margin-top:4px}.head .meta{color:#aeb6c6;font-size:12px;margin-top:10px}'
      +'.bar{position:sticky;top:0;background:#2C3347;padding:10px 30px;display:flex;gap:10px;z-index:5}.bar button{background:#C9A96E;border:0;color:#0B0F1A;font-weight:700;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px}.bar button.alt{background:none;border:1px solid #C9A96E;color:#C9A96E}'
      +'.body{padding:24px 30px}.fl{margin-bottom:34px;page-break-inside:avoid}.flh{display:flex;align-items:baseline;gap:12px;border-bottom:2px solid #C9A96E;padding-bottom:6px;margin-bottom:12px}.flh h2{margin:0;font-size:18px;color:#2C3347}.cnt{color:#8a7a55;font-size:13px;font-weight:700}'
      +'.plan{width:100%;border:1px solid #d8d2c6;border-radius:8px;display:block;margin-bottom:14px}.noimg{color:#999;font-style:italic}'
      +'table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;background:#2C3347;color:#fff;padding:7px 10px;font-size:11px}th:last-child,td.q{text-align:right}td{padding:6px 10px;border-bottom:1px solid #ece8e0}tr.ar td{background:#f0ede8;font-weight:700;color:#2C3347;border-top:2px solid #C9A96E}td.ind{padding-left:22px}td.tg{color:#8a93a8;font-size:11px}td.q{font-weight:700}.sys{color:#fff;font-size:10px;padding:2px 7px;border-radius:10px;text-transform:capitalize}'
      +'.summary{margin-top:10px;border:2px solid #C9A96E;border-radius:8px;overflow:hidden}.summary h3{margin:0;background:#0B0F1A;color:#C9A96E;padding:10px 14px;font-size:14px}.grand{background:#0B0F1A;color:#fff}.grand td{color:#C9A96E;font-size:15px;font-weight:700;border-bottom:0}'
      +'.foot{padding:16px 30px;color:#8a93a8;font-size:11px;border-top:1px solid #ddd}@media print{.bar{display:none}body{background:#fff}.wrap{max-width:none}}'
      +'</style></head><body><div class="wrap"><div class="bar"><button onclick="window.print()"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.125em"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Save as PDF / Print</button><button class="alt" onclick="window.close()">Close</button></div>'
      +'<div class="head"><h1>IOT TECHS — Site Survey &amp; Floor Plan Proposal</h1><div class="tag">SECURITY · AUDIO · LOW-VOLTAGE</div><div class="meta">Prepared '+escH(date)+' · '+floors.length+' floor'+(floors.length>1?'s':'')+' · '+grand+' devices total</div></div>'
      +'<div class="body">'+floorHtml+'<div class="summary"><h3>Project Equipment Summary</h3><table><tbody>'+sysRows+'<tr class="grand"><td>Total devices</td><td class="q">'+grand+'</td></tr></tbody></table></div></div>'
      +'<div class="foot">IOT TECHS · La Vague Inc. · Generated from Site Survey tool.</div></div></body></html>';
  }
  function buildProposal(){snapFloor();tagAll();
    if(!floors.some(function(f){return f.markers.length;})){showToast('Place some devices first');return;}
    floorImages(function(imgs){var html=emitProposalHTML(imgs);
      try{var blob=new Blob([html],{type:'text/html'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='IOT-TECHS-Floorplan-Proposal.html';document.body.appendChild(a);a.click();a.remove();}catch(e){}
      var w=window.open('','_blank');if(w){w.document.write(html);w.document.close();}showToast('Floor plan proposal downloaded');});}
  function floorDeviceLines(fl){var by={};fl.markers.forEach(function(m){var lbl=m.kind==='cam'?(m.mode==='out'?'Outdoor Camera':'Indoor Camera'):(TL[m.kind]||m.kind);by[lbl]=(by[lbl]||0)+1;});return Object.keys(by).map(function(k){return by[k]+' × '+k;});}
  // Build the whole survey as a multi-page PDF (one page per floor: floor plan image + device list). cb receives the jsPDF doc.
  function buildSurveyPDF(cb){snapFloor();tagAll();
    var JP=window.jspdf&&window.jspdf.jsPDF;if(!JP){showToast('PDF library not loaded');return;}
    showToast('Building PDF…');
    floorImages(function(imgs){try{
      var doc=new JP({orientation:'portrait',unit:'pt',format:'letter'});
      var PW=doc.internal.pageSize.getWidth(),PH=doc.internal.pageSize.getHeight(),M=40;
      floors.forEach(function(fl,i){if(i>0)doc.addPage();
        doc.setFillColor(11,15,26);doc.rect(0,0,PW,68,'F');
        doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text('IOT TECHS — Site Survey',M,32);
        doc.setTextColor(201,169,110);doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.text('SECURITY · AUDIO · LOW-VOLTAGE',M,50);
        var y=94;doc.setTextColor(40,40,40);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(fl.name+'  ·  '+fl.markers.length+' devices',M,y);
        var img=imgs[i];
        if(img){try{var pr=doc.getImageProperties(img);var iw=PW-M*2,ih=iw*pr.height/pr.width,maxH=PH*0.56;if(ih>maxH){ih=maxH;iw=ih*pr.width/pr.height;}y+=14;doc.addImage(img,(/^data:image\/png/.test(img)?'PNG':'JPEG'),M+((PW-M*2)-iw)/2,y,iw,ih);y+=ih+22;}catch(e){y+=16;}}
        var lines=floorDeviceLines(fl);
        if(lines.length){if(y>PH-60){doc.addPage();y=60;}doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(44,51,71);doc.text('Devices on this floor',M,y);y+=16;
          doc.setFont('helvetica','normal');doc.setFontSize(10.5);doc.setTextColor(60,60,60);
          lines.forEach(function(ln){if(y>PH-46){doc.addPage();y=56;}doc.text('•  '+ln,M+6,y);y+=15;});}
        // Site conditions (surfaces / structure) for this floor
        if(y>PH-90){doc.addPage();y=56;}y+=6;doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(44,51,71);doc.text('Site Conditions',M,y);y+=15;
        doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(60,60,60);
        CONDITIONS.forEach(function(c){if(y>PH-40){doc.addPage();y=56;}var cv=(fl.B.conditions&&fl.B.conditions[c.k])||c.def;doc.text(c.label+': '+cv,M+6,y);y+=14;});});
      cb(doc);
    }catch(e){showToast('PDF build failed');}});}
  // Download PDF — download only (no upload).
  $('planBtn').addEventListener('click',function(){buildSurveyPDF(function(doc){doc.save('IOT-Site-Survey.pdf');showToast('PDF downloaded');});});
  // View — open the HTML embedment (same HTML that rides along with the proposal) in a new tab.
  var viewBtn=$('viewBtn');if(viewBtn)viewBtn.addEventListener('click',function(){
    if(!floors.some(function(f){return f.markers.length||(f.B.rooms&&f.B.rooms.length)||(f.B.strokes&&f.B.strokes.length);})){showToast('Place some devices or draw the layout first');return;}
    floorImages(function(imgs){var html=emitProposalHTML(imgs);var w=window.open('','_blank');if(w){w.document.write(html);w.document.close();}else showToast('Allow pop-ups to view');});});
  // Save image — download the current floor plan as a PNG.
  var imgBtn=$('imgBtn');if(imgBtn)imgBtn.addEventListener('click',function(){
    snapFloor();tagAll();renderFloorImage(floors[curFloor],function(url){
      var ext=/^data:image\/png/.test(url||'')?'.png':'.jpg';
      var a=document.createElement('a');a.href=url;a.download='IOT-'+((floors[curFloor].name||'Floor').replace(/\s+/g,'-'))+ext;document.body.appendChild(a);a.click();a.remove();showToast('Image saved');});});
  // ── Top-bar controls: icon-size +/− (10% steps) for every device on this floor ──
  var iconScaleVal=$('iconScaleVal'),iconDec=$('iconDec'),iconInc=$('iconInc');
  var sideCollapse=$('sideCollapse'),cardBody=document.querySelector('.card-body');
  if(sideCollapse&&cardBody)sideCollapse.addEventListener('click',function(){var c=cardBody.classList.toggle('side-collapsed');sideCollapse.textContent=c?'⟨':'⟩';layoutBoard();redrawStrokes();clampPan();applyZoom();});
  // Collapse / expand the Devices category list vertically.
  var eqHead=$('eqHead'),eqBody=$('eqBody');
  if(eqHead&&eqBody)eqHead.addEventListener('click',function(){var c=eqBody.classList.toggle('collapsed');eqHead.classList.toggle('collapsed',c);});
  var addNoteBtn=$('addNoteBtn');if(addNoteBtn)addNoteBtn.addEventListener('click',function(){addNote(50,50);});
  function stepIcon(d){var v=Math.round(((B.iconScale||0.8)+d)*10)/10;v=Math.max(0.3,Math.min(2,v));B.iconScale=v;if(iconScaleVal)iconScaleVal.textContent=Math.round(v*100)+'%';render();}
  if(iconScaleVal)iconScaleVal.textContent=Math.round((B.iconScale||0.8)*100)+'%';
  if(iconDec)iconDec.addEventListener('click',function(){stepIcon(-0.1);});
  if(iconInc)iconInc.addEventListener('click',function(){stepIcon(0.1);});
  // ── integration hooks ──
  window.SURVEY={
    serialize:function(){snapFloor();return{floors:floors,v:1};},
    restore:function(d){try{if(d&&d.floors&&d.floors.length){floors=d.floors;floors.forEach(function(f){if(!f.B)f.B=freshFloor(f.name).B;if(!f.B.zoom)f.B.zoom={s:1,tx:0,ty:0};if(!f.markers)f.markers=[];if(!f.B.rooms)f.B.rooms=[];if(!f.B.strokes)f.B.strokes=[];if(!f.B.notes)f.B.notes=[];if(!f.B.overlays)f.B.overlays=[];});loadFloor(0);render();return true;}}catch(e){}return false;},
    counts:function(){snapFloor();var bk={},camOut=0,camIn=0,total=0;floors.forEach(function(fl){fl.markers.forEach(function(m){total++;bk[m.kind]=(bk[m.kind]||0)+1;if(m.kind==='cam'){if(m.mode==='out')camOut++;else camIn++;}});});
      return{byKind:bk,cameras:camOut+camIn,camOut:camOut,camIn:camIn,fr:bk.fr||0,lpr:bk.lpr||0,nvr:bk.nvr||0,speaker:bk.spk||0,amp:bk.amp||0,door:bk.door||0,motion:bk.motion||0,glass:bk.glass||0,keypad:bk.keypad||0,fire:bk.fire||0,pos:bk.pos||0,ap:bk.tap||0,total:total};},
    proposalHTML:function(cb){floorImages(function(imgs){cb(emitProposalHTML(imgs));});},
    pdf:function(cb){buildSurveyPDF(cb);},
    conditions:function(){snapFloor();return floors.map(function(f){return {floor:f.name, conditions:f.B.conditions||defaultConditions()};});},
    // Load an address as the satellite background. onlyIfEmpty: skip if the floor already has work on it.
    loadAddress:function(addr,onlyIfEmpty){if(!addr)return;if(onlyIfEmpty&&(B.img||markers.length||(B.rooms&&B.rooms.length)||(B.strokes&&B.strokes.length)))return;searchAddress(addr);},
    onChange:null
  };
  buildDropdowns();render();setTimeout(render,40);
})();
// ── Integration: attach to a customer, save plan as documents, import counts to a proposal ──
(function(){
  var $=function(i){return document.getElementById(i);};
  var CUST=null, PROJ=null, book=null, searchT=null;
  // Build a project-scoped /api/project/<custId> URL. PROJ (a project id) tells the server which
  // of the customer's projects to act on; without it the server falls back to the most-recent project.
  function papi(sub){ return '/api/project/'+CUST.id+sub+(PROJ?('?project='+encodeURIComponent(PROJ)):''); }
  function custApi(){ return '/api/customers/'+CUST.id+(PROJ?('?project='+encodeURIComponent(PROJ)):''); }
  function srvNum(){ return 'SRV-'+(PROJ||CUST.id); }   // stable per-PROJECT survey proposal number
  var custSearch=$('custSearch'),custMenu=$('custMenu'),custLabel=$('custLabel'),custClear=$('custClear'),loadBtn=$('loadSurveyBtn');
  var saveBtn=$('saveCustBtn'),autoStat=$('autoStatus');
  function toast(m){ if(window.SURVEY&&false){} var t=$('toast'); if(t){t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2400);} }
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function b64(str){ try{ return btoa(unescape(encodeURIComponent(str))); }catch(e){ return btoa(str); } }
  function setCust(c){ CUST=c; if(c){ custLabel.innerHTML=SVI.pin+' '+esc(c.business||c.name||('#'+c.id)); custLabel.style.display='inline-block'; custSearch.style.display='none'; custClear.style.display='inline-block'; loadBtn.style.display='inline-block'; autoStat.style.display='inline-flex'; setAuto('idle','Auto-save on'); }
    else { custLabel.style.display='none'; custSearch.style.display='inline-block'; custSearch.value=''; custClear.style.display='none'; loadBtn.style.display='none'; autoStat.style.display='none'; showProp(null); }
    saveBtn.disabled=!c; }
  // Summarize a proposal's enabled line items into "Cameras: 6 × 4K Camera, 1 × NVR · Sound: …"
  function proposalSummary(state){ if(!state||!state.SECTIONS)return '';
    var secLbl={camera:'Cameras',speaker:'Sound',toast:'Toast',adt:'ADT'},segs=[];
    ['camera','speaker','toast','adt'].forEach(function(k){var sec=state.SECTIONS[k];if(!sec||!sec.items)return;
      var its=sec.items.filter(function(it){return it.enabled&&Number(it.qty)>0;}).map(function(it){return it.qty+' × '+it.desc;});
      if(its.length)segs.push('<span class="pseg"><b>'+secLbl[k]+':</b> '+esc(its.join(', '))+'</span>');});
    return segs.join(''); }
  function showProp(prop,state){ var pb=$('propBar'); if(!pb)return;
    if(!prop){pb.style.display='none';pb.innerHTML='';if(CUST)CUST.propNum='';return;}
    if(CUST)CUST.propNum=prop.proposal_num||'';
    var summary=proposalSummary(state);
    pb.innerHTML='<span class="pnum">'+SVI.paper+' Proposal '+esc(prop.proposal_num||('#'+prop.id))+'</span>'+(summary||'<span class="pseg" style="color:var(--muted)">No line items yet — auto-builds from the survey as you place devices</span>')
      +'<span class="pact"><span class="plink" id="propOpen">Open in calculator</span>'+((CUST&&CUST.proposals&&CUST.proposals.length>1)?'<span class="plink" id="propChange">Change ('+CUST.proposals.length+')</span>':'')+'</span>';
    pb.style.display='flex';
    var po=$('propOpen');if(po)po.addEventListener('click',function(){location.href='/calc.html?customer='+CUST.id+(PROJ?('&project='+PROJ):'');});
    var pc=$('propChange');if(pc)pc.addEventListener('click',function(e){e.stopPropagation();openPropChooser();}); }
  function linkProposal(prop){ if(!prop){showProp(null);return;}
    fetch('/api/proposals/'+prop.id).then(function(r){return r.json();}).then(function(p){ showProp(prop,p&&p.state); }).catch(function(){ showProp(prop,null); }); }
  function openPropChooser(){ if(!CUST||!CUST.proposals)return; custMenu.innerHTML='<div class="dd-head" style="padding:6px 10px;">LINK A PROPOSAL</div>'+CUST.proposals.map(function(p){return '<div class="srch-item propopt" data-pid="'+p.id+'"><div>'+esc(p.proposal_num||('#'+p.id))+'</div><div class="sb">'+esc((p.status||'')+(p.grand_total?' · $'+Number(p.grand_total).toLocaleString():''))+'</div></div>';}).join('');
    custMenu.classList.add('open');
    [].forEach.call(custMenu.querySelectorAll('.srch-item[data-pid]'),function(el){el.addEventListener('click',function(){custMenu.classList.remove('open');var pid=+el.getAttribute('data-pid');var pr=CUST.proposals.filter(function(p){return p.id===pid;})[0];linkProposal(pr);});}); }
  function setAuto(cls,msg){ if(!autoStat)return; autoStat.className='autostat'+(cls&&cls!=='idle'?' '+cls:''); autoStat.textContent=(cls==='saving'?'⟳ ':cls==='saved'?'':cls==='err'?'':'')+msg; }
  // Save the editable survey state (internal) + the floor-plan doc (external, shared with the assigned tech).
  // replace:true keeps a single current copy of each; silent:true skips the activity-log entry (used by auto-save).
  function uploadSurvey(opts,done){ if(!CUST){done&&done(false);return;}
    var state=window.SURVEY.serialize();
    var stateDoc={ name:'Site Survey.json', mime:'application/json', visibility:'internal', source:'survey-state', replace:true, silent:!!opts.silent, data:'data:application/json;base64,'+b64(JSON.stringify(state)) };
    fetch(papi('/documents'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(stateDoc)})
      .then(function(r){return r.json();}).then(function(){
        window.SURVEY.proposalHTML(function(html){
          var planDoc={ name:'Site Survey - Floor Plan.html', mime:'text/html', visibility:'external', source:'survey-plan', replace:true, silent:!!opts.silent, data:'data:text/html;base64,'+b64(html) };
          fetch(papi('/documents'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(planDoc)})
            .then(function(r){return r.json();}).then(function(){ done&&done(true); })
            .catch(function(){ done&&done(false); });
        });
      }).catch(function(){ done&&done(false); });
  }
  // Auto-save: debounce edits, never overlap requests, re-run if edits land mid-save.
  var autoT=null,autoBusy=false,autoDirty=false;
  function scheduleAuto(){ if(!CUST)return; if(autoT)clearTimeout(autoT); autoT=setTimeout(runAuto,1500); }
  function runAuto(){ if(!CUST)return; if(autoBusy){autoDirty=true;return;} autoBusy=true; setAuto('saving','Saving…');
    uploadSurvey({silent:true},function(ok){
      function fin(){ autoBusy=false; if(ok)clearDraft(); setAuto(ok?'saved':'err',ok?'Saved':'Save failed — retrying'); if(!ok){autoDirty=true;} if(autoDirty){autoDirty=false;scheduleAuto();} }
      // On every save, also push the device counts into the proposal (no redirect), then refresh the proposal bar.
      if(ok && window.SURVEY.counts().total>0){ importToProposal(false,function(imp){ if(imp)refreshProp(); fin(); }); }
      else fin();
    }); }
  // ── Local draft: persist the board even with NO customer attached, so work is never lost. ──
  // A floor with any marker / room / stroke / note / uploaded photo counts as non-empty (empty = nothing to keep).
  var DRAFT_KEY='iot-survey-draft-v1',draftT=null;
  function draftIsEmpty(state){ if(!state||!state.floors||!state.floors.length)return true;
    return !state.floors.some(function(f){ var b=f.B||{}; return (f.markers&&f.markers.length)||(b.rooms&&b.rooms.length)||(b.strokes&&b.strokes.length)||(b.notes&&b.notes.length)||(b.overlays&&b.overlays.length)||!!b.img; }); }
  function saveDraftNow(){ if(CUST)return; try{ var s=window.SURVEY.serialize();
    if(draftIsEmpty(s)){ localStorage.removeItem(DRAFT_KEY); if(autoStat)autoStat.style.display='none'; return; }
    localStorage.setItem(DRAFT_KEY,JSON.stringify({state:s,savedAt:Date.now()}));
    if(autoStat)autoStat.style.display='inline-flex'; setAuto('saved','Draft saved'); }catch(e){ /* e.g. storage quota with a large photo */ } }
  function scheduleDraft(){ if(draftT)clearTimeout(draftT); draftT=setTimeout(saveDraftNow,900); }
  function clearDraft(){ try{ localStorage.removeItem(DRAFT_KEY); }catch(e){} }
  function restoreDraft(){ try{ var raw=localStorage.getItem(DRAFT_KEY); if(!raw)return; var d=JSON.parse(raw);
    if(d&&d.state&&!draftIsEmpty(d.state)&&window.SURVEY.restore(d.state)){ if(autoStat)autoStat.style.display='inline-flex'; setAuto('saved','Draft restored'); } }catch(e){} }
  // With a customer → autosave to that customer; without one → keep a local draft so nothing is lost.
  if(window.SURVEY) window.SURVEY.onChange=function(){ if(CUST) scheduleAuto(); else scheduleDraft(); };
  function addNewCustomer(q){ q=(q||'').trim(); if(!q)return; custMenu.classList.remove('open'); custSearch.value=''; toast('Adding customer…');
    fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer:{name:q,business:q}})})
      .then(function(r){return r.json();}).then(function(res){ if(res&&res.customerId){ toast('Customer added'); pickCust(res.customerId, res.projectId); } else toast('Could not add customer'); })
      .catch(function(){ toast('Could not add customer'); }); }
  custSearch.addEventListener('input',function(){ var q=custSearch.value.trim(); clearTimeout(searchT); if(!q){custMenu.classList.remove('open');return;}
    searchT=setTimeout(function(){ fetch('/api/customers/search?q='+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(rows){
      var html=(rows&&rows.length)?rows.slice(0,10).map(function(c){ return '<div class="srch-item" data-id="'+c.id+'"><div>'+esc(c.business||c.name||('#'+c.id))+'</div><div class="sb">'+esc([c.name&&c.name!==c.business?c.name:'',c.phone,c.address].filter(Boolean).join(' · '))+'</div></div>'; }).join(''):'<div class="srch-item" style="color:var(--muted)">No matches</div>';
      html+='<div class="srch-item addnew" data-addnew="1">'+SVI.plus+' Add “'+esc(q)+'” as new customer</div>';
      custMenu.innerHTML=html; custMenu.classList.add('open');
      [].forEach.call(custMenu.querySelectorAll('.srch-item[data-id]'),function(el){ el.addEventListener('click',function(){ pickCust(+el.getAttribute('data-id')); }); });
      var an=custMenu.querySelector('[data-addnew]'); if(an)an.addEventListener('click',function(){ addNewCustomer(q); });
    }).catch(function(){}); },250);
  });
  function pickCust(id,projectId){ custMenu.classList.remove('open'); PROJ=projectId?Number(projectId):null;
    fetch('/api/customers/'+id+(projectId?('?project='+encodeURIComponent(projectId)):'')).then(function(r){return r.json();}).then(function(c){
    if(c.error){toast('Could not load customer');return;}
    if(!PROJ && c.project_id) PROJ=c.project_id;
    setCust({id:Number(id),name:c.name,business:c.business,address:c.address,propNum:'',proposals:c.proposals||[]});
    var latest=(c.proposals&&c.proposals[0]); if(latest)showProp(latest,c.latestState); else showProp(null);
    if(pendingLoad){pendingLoad=false;loadSavedSurvey();}
    else if(c.address&&window.SURVEY&&window.SURVEY.loadAddress) window.SURVEY.loadAddress(c.address,true); }); }
  var pendingLoad=false;
  custClear.addEventListener('click',function(){ setCust(null); });
  document.addEventListener('click',function(e){ if(!e.target.closest('#attach')) custMenu.classList.remove('open'); });
  // Submit to customer: build the survey PDF, upload it to the customer (and persist the editable state/plan).
  saveBtn.addEventListener('click',function(){ if(!CUST)return; var lbl=saveBtn.innerHTML; saveBtn.disabled=true; saveBtn.innerHTML='Submitting…'; setAuto('saving','Submitting…');
    window.SURVEY.pdf(function(doc){ var data;try{data=doc.output('datauristring');}catch(e){data='';}
      if(!data){saveBtn.disabled=false;saveBtn.innerHTML=lbl;setAuto('err','PDF failed');toast('Could not build PDF');return;}
      var pdfDoc={ name:'Site Survey.pdf', mime:'application/pdf', visibility:'external', source:'survey-pdf', replace:true, data:data };
      fetch(papi('/documents'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pdfDoc)})
        .then(function(r){return r.json();}).then(function(res){
          uploadSurvey({silent:true},function(){ saveBtn.disabled=false; saveBtn.innerHTML=lbl;
            var ok=res&&res.ok; setAuto(ok?'saved':'err',ok?'Submitted':'Submit failed'); toast(ok?('Submitted survey PDF to '+(CUST.business||CUST.name)):'Submit failed'); }); })
        .catch(function(){ saveBtn.disabled=false; saveBtn.innerHTML=lbl; setAuto('err','Submit failed'); toast('Submit failed'); }); });
  });
  // Share — builds a link then opens a popup (link · Copy · Open · Send to customer).
  // With a customer → their proposal link (/p/<token>). Without → a standalone survey link (/sv/<token>).
  var shareBtn=$('shareBtn'), surveyShareToken='', shareCtx={};
  function openShareModal(url,ctx){ shareCtx=ctx||{}; shareCtx.url=url;
    var li=$('shareLink'); if(li)li.value=url;
    $('shareTitle').textContent=shareCtx.customer?('Share with '+(shareCtx.name||'customer')):'Survey link';
    $('shareSub').textContent=shareCtx.customer?'Customer proposal — floor plans, pricing & e-signature. They can review and sign.':'Standalone survey link of the floor plans. Link a customer to turn it into a full proposal.';
    $('shareSend').textContent=shareCtx.customer?'Send to customer':'Email link';
    var cp=$('shareCopy'); cp.textContent='Copy'; cp.classList.remove('copied');
    $('shareOv').classList.add('on'); }
  function closeShareModal(){ var ov=$('shareOv'); if(ov)ov.classList.remove('on'); }
  if(shareBtn){
    var sClose=$('shareClose'),sOv=$('shareOv'),sCopy=$('shareCopy'),sOpen=$('shareOpen'),sSend=$('shareSend');
    if(sClose)sClose.addEventListener('click',closeShareModal);
    if(sOv)sOv.addEventListener('click',function(e){ if(e.target===sOv)closeShareModal(); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape')closeShareModal(); });
    if(sCopy)sCopy.addEventListener('click',function(){ var u=shareCtx.url||$('shareLink').value;
      function ok(){ sCopy.textContent='Copied!'; sCopy.classList.add('copied'); setTimeout(function(){ sCopy.textContent='Copy'; sCopy.classList.remove('copied'); },1500); }
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(u).then(ok).catch(function(){ try{$('shareLink').select();document.execCommand('copy');}catch(e){} ok(); }); }
      else { try{$('shareLink').select();document.execCommand('copy');}catch(e){} ok(); } });
    if(sOpen)sOpen.addEventListener('click',function(){ window.open(shareCtx.url||$('shareLink').value,'_blank'); });
    if(sSend)sSend.addEventListener('click',function(){ var u=shareCtx.url||$('shareLink').value;
      var subject=encodeURIComponent('Your IOT Techs site survey'+(shareCtx.name?' — '+shareCtx.name:''));
      var body=encodeURIComponent('Hi'+(shareCtx.name?' '+shareCtx.name:'')+',\n\nHere is your site survey / proposal link:\n'+u+'\n\nThank you,\nIOT Techs');
      window.location.href='mailto:'+(shareCtx.email||'')+'?subject='+subject+'&body='+body; });
    shareBtn.addEventListener('click',function(){
      var lbl=shareBtn.innerHTML; shareBtn.disabled=true; shareBtn.textContent='Linking…';
      function done(){ shareBtn.disabled=false; shareBtn.innerHTML=lbl; }
      if(CUST){
        fetch(custApi()).then(function(r){return r.json();}).then(function(c){
          var props=c.proposals||[]; var prop=props.filter(function(p){return p.proposal_num===srvNum();})[0]||props[0];
          if(!prop){ done(); toast('No proposal yet — place devices so the survey auto-imports first'); return; }
          fetch('/api/proposals/'+prop.id+'/share-link',{method:'POST'}).then(function(r){return r.json();}).then(function(link){
            done(); if(link&&link.url){ openShareModal(location.origin+link.url,{customer:true,name:(c.business||c.name||''),email:c.email||''}); } else toast('Could not create link'); })
            .catch(function(){ done(); toast('Could not create link'); });
        }).catch(function(){ done(); toast('Could not load customer'); });
        return;
      }
      var stt=window.SURVEY.serialize();
      var hasContent=stt.floors.some(function(f){var b=f.B||{};return (f.markers&&f.markers.length)||(b.rooms&&b.rooms.length)||(b.strokes&&b.strokes.length)||!!b.img;});
      if(!hasContent){ done(); toast('Place devices, draw the layout, or add a background first'); return; }
      window.SURVEY.proposalHTML(function(html){
        fetch('/api/survey-share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:html,name:'Site Survey',token:surveyShareToken})})
          .then(function(r){return r.json();}).then(function(d){ done();
            if(d&&d.url){ surveyShareToken=d.token; openShareModal(location.origin+d.url,{customer:false}); }
            else toast('Could not create link'); })
          .catch(function(){ done(); toast('Could not create link'); });
      });
    });
  }
  function loadSavedSurvey(){ if(!CUST)return; toast('Loading saved plans…');
    fetch(papi('')).then(function(r){return r.json();}).then(function(p){
      var docs=(p.documents||[]).filter(function(d){return d.source==='survey-state';}); if(!docs.length){toast('No saved plans for this project');return;}
      var d=docs[0]; fetch('/api/documents/'+d.id+'/file').then(function(r){return r.json();}).then(function(state){
        if(window.SURVEY.restore(state)) toast('Plans loaded'); else toast('Could not load plans'); }); }).catch(function(){toast('Load failed');});
  }
  loadBtn.addEventListener('click',loadSavedSurvey);
  // Import: map device counts → proposal line items → save → open the calculator
  function tier(n,a,b,low,mid,hi){ return n<=0?null:(n<=a?low:(n<=b?mid:hi)); }
  // Build the proposal from the placed devices and save it. Uses a stable proposal number per customer
  // (the linked one, else SRV-<id>) so it UPDATES one proposal instead of creating duplicates on every save.
  function importToProposal(redirect,done){ if(!CUST){done&&done(false);return;}
    var c=window.SURVEY.counts();
    (book?Promise.resolve(book):fetch('/api/pricebook').then(function(r){return r.json();})).then(function(bk){ book=bk;
      var qty={},cams=c.cameras,spk=c.speaker,fr=c.fr||0,lpr=c.lpr||0,allCams=cams+fr+lpr;
      // FR & LPR are cameras too: each needs a camera body, drop, termination & mount; FR/LPR add their feature line.
      qty['4K Camera']=allCams; qty['Cat6 Drop']=allCams; qty['Termination']=allCams; qty['Camera Mounting']=allCams;
      qty['Face Recognition']=fr; qty['Facial Recognition + LPR']=lpr;
      var nvrName=tier(allCams,8,16,'NVR (8-Channel)','NVR (16-Channel)','NVR (32-Channel)'); if(nvrName)qty[nvrName]=1;
      qty['Speaker']=spk; qty['Speaker Wire Run']=spk; qty['Drilling Mount']=spk;
      var ampName=tier(spk,4,8,'Amplifier','Amplifier (5–8 speakers)','Amplifier (9+ speakers)'); if(ampName)qty[ampName]=1;
      qty['Door / Window Sensor']=c.door; qty['Motion Sensor']=c.motion; qty['Glass Break Sensor']=c.glass; qty['Keypad']=c.keypad; qty['Smoke / CO Detector']=c.fire;
      var SECTIONS={}, grand=0;
      ['camera','speaker','toast','adt'].forEach(function(line){ SECTIONS[line]={items:(bk[line]||[]).map(function(it){ var q=qty[it.desc]||0; if(q>0)grand+=q*it.price; return{desc:it.desc,qty:q,price:it.price,enabled:q>0};})}; });
      grand=Math.round(grand*100)/100;
      // ALWAYS write a dedicated survey proposal (SRV-<projectId>) — never overwrite the customer's real/manual proposals.
      var pnum=srvNum();
      var state={ SECTIONS:SECTIONS, inputs:{taxToggle:{kind:'check',value:false},taxRate:{kind:'value',value:0}}, paymentStructure:'50/50', payments:[], builder:'survey', fromSurvey:true, siteConditions:(window.SURVEY.conditions?window.SURVEY.conditions():[]) };
      fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        customer:{id:CUST.id,name:CUST.name,business:CUST.business}, projectId:PROJ||undefined,
        proposal:{proposalNum:pnum, clientLabel:CUST.business||CUST.name, grandTotal:grand, status:'saved', state:state}
      })}).then(function(r){return r.json();}).then(function(res){
        if(res&&res.ok){ if(res.projectId&&!PROJ)PROJ=res.projectId; done&&done(true,grand,allCams); } else done&&done(false);
      }).catch(function(){ done&&done(false); });
    }).catch(function(){ done&&done(false); }); }
  // Refresh the linked-proposal bar after an auto-import so it reflects the current device counts.
  function refreshProp(){ if(!CUST)return; fetch(custApi()).then(function(r){return r.json();}).then(function(c){
    if(CUST&&c&&c.proposals){ CUST.proposals=c.proposals; var latest=c.proposals[0]; if(latest)showProp(latest,c.latestState); } }).catch(function(){}); }
  // Import to Proposal is automatic: runAuto() pushes the survey's device counts into the SRV-<id> proposal
  // on every save, so the proposal (and its public /p/ link) always reflects the current site survey.
  // deep-link: ?customer=ID attaches automatically
  var _sp=new URLSearchParams(location.search),qid=_sp.get('customer'),qproj=_sp.get('project'); if(qid){ pendingLoad=(_sp.get('load')==='1'); pickCust(+qid, qproj?+qproj:undefined); } else { restoreDraft(); }
})();



