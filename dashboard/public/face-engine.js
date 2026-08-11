/* ============================================================================
   IOT TECHS — shared face-embedding engine   (window.IOTFace)

   Loads face-api.js + ArcFace (ONNX/WASM) from CDN and turns a photo/frame into
   a normalized face embedding — the vector the identity system stores and the
   1:N login matcher compares. Ported from the Face Verify tool so enrolment and
   login share ONE pipeline. Client-side; the face never goes to a server as an
   image for matching — only the vector does.

   API
     await IOTFace.ready()                  -> loads models (idempotent)
     await IOTFace.embed(img|canvas|video)  -> { kind, vec, box, score } | null
        kind: 'arcface' (preferred) or 'faceapi' (fallback)
     IOTFace.cosine(a, b)                   -> cosine similarity of two vecs
     IOTFace.status()                       -> { ready, engine }
   ========================================================================== */
(function () {
  if (window.IOTFace) return;

  const LIB_SOURCES = [
    "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js",
    "https://unpkg.com/@vladmandic/face-api@1.7.13/dist/face-api.js",
  ];
  // Self-hosted first (fast, no CDN round-trip, cacheable) — populate /public/models
  // with scripts/fetch-face-models.mjs. Falls through to CDN when absent, so this
  // is a zero-risk speedup: it just gets faster once the files are local.
  const MODEL_SOURCES = [
    "/models/faceapi",
    "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model",
    "https://unpkg.com/@vladmandic/face-api@1.7.13/model",
  ];
  // WASM runtime — verified reliable. (WebGPU was tried but hard-fails instead of
  // gracefully falling back on devices without it, and we run only one inference
  // per scan, so WASM's speed is plenty — the win is load time, not inference.)
  // Self-hosted first (same-origin, no CDN wait on ~10MB of wasm), then CDNs.
  // Each entry pairs the loader script with the dir its wasm/glue lives in —
  // ort.env.wasm.wasmPaths must match whichever script actually loaded.
  const ORT_SOURCES = [
    { js: "/models/ort/ort.min.js", wasm: "/models/ort/" },
    { js: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js", wasm: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/" },
    { js: "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.19.2/ort.min.js", wasm: "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.19.2/" },
  ];
  // Self-hosted first, then our same-origin proxy (GitHub releases have no CORS
  // header, so a direct browser fetch is blocked — the proxy is what makes real
  // ArcFace embeddings actually load in the browser).
  const ARC_MODELS = [
    "/models/w600k_mbf.onnx",
    "/api/face-model",
  ];
  const ALIGN = 220;
  const ARC_REF = [[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];

  let arcSession = null, arcReady = false, faceReady = false;
  let readyPromise = null;

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  }

  async function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      // face-api lib + models
      let ok = false;
      for (const s of LIB_SOURCES) { try { await loadScript(s); if (window.faceapi) { ok = true; break; } } catch (e) {} }
      if (!ok || !window.faceapi) throw new Error("face engine failed to load");
      for (const b of MODEL_SOURCES) {
        try {
          await faceapi.nets.ssdMobilenetv1.loadFromUri(b);
          await faceapi.nets.tinyFaceDetector.loadFromUri(b);   // fast per-frame detect for the liveness loop
          await faceapi.nets.faceLandmark68Net.loadFromUri(b);
          await faceapi.nets.faceRecognitionNet.loadFromUri(b);
          faceReady = true; break;
        } catch (e) {}
      }
      if (!faceReady) throw new Error("face models failed to load");
      // ArcFace (best accuracy); falls back to the face-api descriptor if it can't load
      try {
        let ortWasm = null;
        for (const s of ORT_SOURCES) { try { await loadScript(s.js); if (window.ort) { ortWasm = s.wasm; break; } } catch (e) {} }
        if (window.ort && ortWasm) {
          try { ort.env.wasm.wasmPaths = ortWasm; ort.env.wasm.numThreads = 1; ort.env.wasm.simd = true; } catch (e) {}
          for (const url of ARC_MODELS) {
            try {
              const r = await fetch(url); if (!r.ok) continue;
              const buf = await r.arrayBuffer();
              arcSession = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
              arcReady = true; break;
            } catch (e) {}
          }
        }
      } catch (e) { arcReady = false; }
      return true;
    })();
    return readyPromise;
  }

  const centroid = (p) => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function upscale(img, minW = 1100) {
    const w = img.naturalWidth || img.width || img.videoWidth || 0;
    if (!w) return img;
    const k = w < minW ? Math.min(3, minW / w) : 1;
    if (k === 1) return img;
    const h = img.naturalHeight || img.height || img.videoHeight || 0;
    const c = document.createElement("canvas"); c.width = w * k; c.height = h * k;
    const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  async function describe(src) {
    let d = await faceapi.detectSingleFace(src, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 }))
      .withFaceLandmarks().withFaceDescriptor();
    return d || null;
  }

  function similarityTransform(src, dst) {
    const n = src.length;
    const mp = { x: src.reduce((s, p) => s + p[0], 0) / n, y: src.reduce((s, p) => s + p[1], 0) / n };
    const mq = { x: dst.reduce((s, p) => s + p[0], 0) / n, y: dst.reduce((s, p) => s + p[1], 0) / n };
    let nR = 0, nI = 0, de = 0;
    for (let i = 0; i < n; i++) {
      const px = src[i][0] - mp.x, py = src[i][1] - mp.y, qx = dst[i][0] - mq.x, qy = dst[i][1] - mq.y;
      nR += qx * px + qy * py; nI += qy * px - qx * py; de += px * px + py * py;
    }
    de = de || 1; const ax = nR / de, ay = nI / de;
    return { ax, ay, bx: mq.x - (ax * mp.x - ay * mp.y), by: mq.y - (ay * mp.x + ax * mp.y) };
  }
  function fivePoints(lm) {
    const p = lm.positions, le = centroid(lm.getLeftEye()), re = centroid(lm.getRightEye());
    return [[le.x, le.y], [re.x, re.y], [p[30].x, p[30].y], [p[48].x, p[48].y], [p[54].x, p[54].y]];
  }
  async function arcEmbed(src, lm) {
    if (!arcReady) return null;
    try {
      const t = similarityTransform(fivePoints(lm), ARC_REF);
      const c = document.createElement("canvas"); c.width = c.height = 112;
      const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 112, 112);
      g.imageSmoothingQuality = "high"; g.setTransform(t.ax, t.ay, -t.ay, t.ax, t.bx, t.by); g.drawImage(src, 0, 0);
      const d = c.getContext("2d").getImageData(0, 0, 112, 112).data;
      const f = new Float32Array(3 * 112 * 112), pl = 112 * 112;
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        f[j] = (d[i] - 127.5) / 127.5; f[j + pl] = (d[i + 1] - 127.5) / 127.5; f[j + 2 * pl] = (d[i + 2] - 127.5) / 127.5;
      }
      const feeds = {}; feeds[arcSession.inputNames[0]] = new ort.Tensor("float32", f, [1, 3, 112, 112]);
      const out = await arcSession.run(feeds);
      const v = out[arcSession.outputNames[0]].data;
      let nm = 0; for (let i = 0; i < v.length; i++) nm += v[i] * v[i]; nm = Math.sqrt(nm) || 1;
      const e = new Array(v.length); for (let i = 0; i < v.length; i++) e[i] = v[i] / nm;
      return e;
    } catch (e) { return null; }
  }

  function l2norm(a) { let n = 0; for (let i = 0; i < a.length; i++) n += a[i] * a[i]; n = Math.sqrt(n) || 1; return a.map((x) => x / n); }

  async function embed(source) {
    await ready();
    const src = upscale(source);
    const det = await describe(src);
    if (!det) return null;
    const arc = await arcEmbed(src, det.landmarks);
    if (arc) return { kind: "arcface", vec: arc, box: det.detection.box, score: det.detection.score };
    return { kind: "faceapi", vec: l2norm(Array.from(det.descriptor)), box: det.detection.box, score: det.detection.score };
  }

  function cosine(a, b) {
    if (!a || !b || a.length !== b.length) return null;
    let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s;
  }

  /* ---- Liveness scan (natural, low-friction) ----
     One deliberate gesture the user is comfortable with — a slow HEAD TURN — plus
     a PASSIVE signal a flat photo can't fake even when moved: real EYE micro-motion.
     A held photo/ID never turns; a photo waved to fake a turn has frozen eyes
     (eye-openness variance ~0) while a live face's eyes always drift/blink a little.
     No "blink on command". Captures a frontal frame once both are satisfied.
     Documented limit: a video replay still needs hardware depth (native app).
       onCue(text) → "Turn your head slowly", "Hold still", …
       returns { ok:true, embedding } | { ok:false, reason } */
  async function scanLive(video, opts = {}) {
    await ready();
    const onCue = opts.onCue || (() => {});
    const timeoutMs = opts.timeoutMs || 15000;
    const t0 = performance.now();

    const ears = [];
    let sawFace = 0, lastCue = "";
    const cue = (t) => { if (t !== lastCue) { lastCue = t; onCue(t); } };
    const std = (a) => { if (a.length < 4) return 0; const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); };
    cue("Look at the camera");

    while (performance.now() - t0 < timeoutMs) {
      let det = null;
      try {
        det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })).withFaceLandmarks();
      } catch (e) {}
      if (!det) { sawFace = 0; cue("Center your face"); await sleep(40); continue; }
      sawFace++;

      const lm = det.landmarks;
      const le = centroid(lm.getLeftEye()), re = centroid(lm.getRightEye());
      const iod = dist2(le, re) || 1;
      const earOf = (e) => (dist2(e[1], e[5]) + dist2(e[2], e[4])) / (2 * iod);
      const ear = (earOf(lm.getLeftEye()) + earOf(lm.getRightEye())) / 2;
      ears.push(ear); if (ears.length > 60) ears.shift();

      // Frontal-face check — nose offset from the eye-midline, normalized.
      const nose = lm.getNose(); const tip = nose[nose.length - 4] || nose[3];
      const mid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
      const yaw = ((tip.x - mid.x) / iod) * 90;

      // Passive vitality: real eyes drift/blink; a photo's are frozen. Prefer to
      // capture on a live-eye signal, but HARD-CAP the wait so a still subject
      // never stalls the scan — after a few frontal frames we capture regardless.
      const vitality = std(ears);
      const alive = ears.length >= 4 && vitality > 0.0035;
      const frontal = Math.abs(yaw) <= 20;

      if (sawFace < 2) cue("Hold still");
      else if (!frontal) cue("Face forward");
      else if (alive || sawFace >= 6) {   // live signal, or give up waiting → capture (~<0.8s)
        const emb = await embed(video);
        if (emb) return { ok: true, embedding: emb };
      } else cue("Look at the camera");
      await sleep(35);
    }
    return { ok: false, reason: "no_face" };
  }

  window.IOTFace = { ready, embed, cosine, scanLive, status: () => ({ ready: faceReady, engine: arcReady ? "arcface" : faceReady ? "faceapi" : "loading" }) };
})();
