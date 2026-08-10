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
  const MODEL_SOURCES = [
    "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model",
    "https://unpkg.com/@vladmandic/face-api@1.7.13/model",
  ];
  const ORT_SOURCES = [
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.19.2/ort.min.js",
  ];
  const ARC_MODEL = "https://github.com/yakhyo/face-reidentification/releases/download/v0.0.1/w600k_mbf.onnx";
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
          await faceapi.nets.faceLandmark68Net.loadFromUri(b);
          await faceapi.nets.faceRecognitionNet.loadFromUri(b);
          faceReady = true; break;
        } catch (e) {}
      }
      if (!faceReady) throw new Error("face models failed to load");
      // ArcFace (best accuracy); falls back to the face-api descriptor if it can't load
      try {
        let ortOk = false;
        for (const s of ORT_SOURCES) { try { await loadScript(s); if (window.ort) { ortOk = true; break; } } catch (e) {} }
        if (ortOk) {
          try { ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/"; ort.env.wasm.numThreads = 1; } catch (e) {}
          const buf = await (await fetch(ARC_MODEL)).arrayBuffer();
          arcSession = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
          arcReady = true;
        }
      } catch (e) { arcReady = false; }
      return true;
    })();
    return readyPromise;
  }

  const centroid = (p) => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });

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

  window.IOTFace = { ready, embed, cosine, status: () => ({ ready: faceReady, engine: arcReady ? "arcface" : faceReady ? "faceapi" : "loading" }) };
})();
