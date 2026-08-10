/* ============================================================================
   IOT TECHS — shared PDF417 / AAMVA barcode reader   (window.IOTBarcode)

   One decoder, loaded as a plain <script> in both surfaces that photograph a
   licence: the React ID Scanner (/id-scan) and the standalone Face Verify tool
   (/face-verify/embed). Client-side and offline after the first load — the
   barcode image never leaves the device.

   Engine: zxing-wasm (zxing-cpp compiled to WebAssembly) — far more reliable on
   real phone photos than the pure-JS PDF417 ports. Loaded from CDN as an IIFE
   so it works without a bundler in either context.

   API
     await IOTBarcode.ready()            -> loads + warms the wasm engine
     await IOTBarcode.decode(source)     -> raw AAMVA string | null
        source: File | Blob | HTMLImageElement | HTMLCanvasElement | ImageData
                | data-URL string
     IOTBarcode.parseAAMVA(raw)          -> normalized fields (ISO YYYY-MM-DD)
     IOTBarcode.barcodeFields(raw)       -> { firstName,lastName,middleName,dob,
                                              licenseNumber,expiry,zip } for the
                                              /api/verify-document cross-check
   ========================================================================== */
(function () {
  if (window.IOTBarcode) return;

  var VER = "3.1.2";
  var IIFE = [
    "https://cdn.jsdelivr.net/npm/zxing-wasm@" + VER + "/dist/iife/reader/index.js",
    "https://unpkg.com/zxing-wasm@" + VER + "/dist/iife/reader/index.js",
  ];
  var WASM_BASE = "https://cdn.jsdelivr.net/npm/zxing-wasm@" + VER + "/dist/reader/";

  var enginePromise = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { rej(new Error(src)); };
      document.head.appendChild(s);
    });
  }
  function zx() {
    // The IIFE global name has been stable, but detect defensively.
    return window.ZXingWASM || window.ZXingWASMReader || window.zxingWasm || null;
  }

  function ready() {
    if (enginePromise) return enginePromise;
    enginePromise = (async function () {
      if (!zx()) {
        var loaded = false;
        for (var i = 0; i < IIFE.length; i++) {
          try { await loadScript(IIFE[i]); if (zx()) { loaded = true; break; } } catch (e) {}
        }
        if (!loaded || !zx()) throw new Error("barcode engine failed to load");
      }
      var Z = zx();
      // Point the wasm binary at the CDN (it isn't bundled with the glue).
      try {
        if (typeof Z.prepareZXingModule === "function") {
          Z.prepareZXingModule({
            overrides: {
              locateFile: function (path, prefix) {
                return path.slice(-5) === ".wasm" ? WASM_BASE + path : prefix + path;
              },
            },
          });
        }
      } catch (e) {}
      return Z;
    })();
    return enginePromise;
  }

  /* ---- turn any supported source into a Blob zxing can read ---- */
  function toBlob(source) {
    return new Promise(function (res, rej) {
      if (!source) return rej(new Error("no source"));
      if (source instanceof Blob) return res(source);
      if (typeof source === "string") { // data-URL / URL
        fetch(source).then(function (r) { return r.blob(); }).then(res, rej); return;
      }
      // ImageData -> canvas -> blob
      if (typeof ImageData !== "undefined" && source instanceof ImageData) {
        var ic = document.createElement("canvas");
        ic.width = source.width; ic.height = source.height;
        ic.getContext("2d").putImageData(source, 0, 0);
        return ic.toBlob(function (b) { b ? res(b) : rej(new Error("blob failed")); }, "image/png");
      }
      // Canvas
      if (source.tagName === "CANVAS") {
        return source.toBlob(function (b) { b ? res(b) : rej(new Error("blob failed")); }, "image/png");
      }
      // Image element -> draw to canvas -> blob
      if (source.tagName === "IMG") {
        var w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(source, 0, 0, w, h);
        return c.toBlob(function (b) { b ? res(b) : rej(new Error("blob failed")); }, "image/png");
      }
      rej(new Error("unsupported source"));
    });
  }

  async function decode(source) {
    var Z = await ready();
    var blob = await toBlob(source);
    var opts = { formats: ["PDF417"], tryHarder: true, maxNumberOfSymbols: 1 };
    var results;
    try { results = await Z.readBarcodes(blob, opts); }
    catch (e) { results = null; }
    if (results && results.length) {
      for (var i = 0; i < results.length; i++) {
        var t = results[i] && results[i].text;
        if (t) return t;
      }
    }
    return null;
  }

  /* ---- AAMVA parse (ISO dates, for the document cross-check) ---- */
  var MAP = {
    DCS: "lastName", DAB: "lastName", DAC: "firstName", DCT: "firstName", DAD: "middleName",
    DBB: "dob", DBA: "expiry", DBD: "issued", DBC: "sex",
    DAQ: "licenseNumber", DAG: "street", DAH: "unit", DAI: "city", DAJ: "state", DAK: "zip",
    DCG: "country", DAA: "fullName",
  };
  function isoDate(v, canada) {
    var d = String(v || "").replace(/\D/g, "");
    if (d.length !== 8) return "";
    var mm, dd, yyyy;
    if (canada || +d.slice(0, 2) > 12) { yyyy = d.slice(0, 4); mm = d.slice(4, 6); dd = d.slice(6, 8); }
    else { mm = d.slice(0, 2); dd = d.slice(2, 4); yyyy = d.slice(4, 8); }
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return "";
    return yyyy + "-" + mm + "-" + dd;
  }
  function parseAAMVA(raw) {
    if (!raw || !/DAQ|DCS|ANSI|AAMVA/i.test(raw)) return null;
    var body = raw.slice(Math.max(0, raw.search(/ANSI |AAMVA/i)));
    var out = {};
    body.split(/[\r\n]+/).forEach(function (lineRaw) {
      var line = String(lineRaw).trim();
      if (!line) return;
      if (/^(DL|ID)[A-Z]{3}/.test(line)) line = line.slice(2);
      var id = line.slice(0, 3).toUpperCase(), val = line.slice(3).trim();
      if (MAP[id] && val && out[MAP[id]] == null) out[MAP[id]] = val;
    });
    if (!Object.keys(out).length) return null;
    var canada = /^(CAN|CANADA)$/i.test(out.country || "");
    ["dob", "expiry", "issued"].forEach(function (k) { if (out[k]) out[k] = isoDate(out[k], canada); });
    if (out.sex) out.sex = ({ 1: "M", 2: "F", M: "M", F: "F" })[String(out.sex).trim().toUpperCase()] || "";
    if (out.zip) { var z = String(out.zip).replace(/\D/g, ""); out.zip = z.slice(0, 5); }
    if (out.fullName && !out.lastName) {
      var p = out.fullName.split(",").map(function (x) { return x.trim(); });
      out.lastName = p[0] || ""; out.firstName = p[1] || ""; out.middleName = p[2] || "";
    }
    ["fullName", "country"].forEach(function (k) { delete out[k]; });
    Object.keys(out).forEach(function (k) { out[k] = String(out[k]).replace(/,+$/, "").trim(); });
    return out;
  }
  function barcodeFields(raw) {
    var a = parseAAMVA(raw);
    if (!a) return null;
    return {
      firstName: a.firstName || "", middleName: a.middleName || "", lastName: a.lastName || "",
      dob: a.dob || "", licenseNumber: a.licenseNumber || "", expiry: a.expiry || "", zip: a.zip || "",
    };
  }

  window.IOTBarcode = { ready: ready, decode: decode, parseAAMVA: parseAAMVA, barcodeFields: barcodeFields };
})();
