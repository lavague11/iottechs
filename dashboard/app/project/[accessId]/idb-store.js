"use client";

// IndexedDB device store — the durable, large-capacity home for the tools' drafts (survey / mockup).
// localStorage caps at ~5MB; a few offline photo captures (base64) blow that quota and the save fails
// silently. IndexedDB has a far larger quota, so it becomes the authoritative on-device store. The sync
// layer keeps the SAME read/write shape (idbGet/idbSet return strings, like localStorage.getItem/setItem),
// so nothing downstream changes. localStorage stays a best-effort fast mirror for the iframes that still
// read it synchronously; IndexedDB is the source of truth that survives the quota.

const DB_NAME = "iot_tools";
const STORE = "kv";
let _dbp = null;

function openDb() {
  if (_dbp) return _dbp;
  _dbp = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("idb open failed"));
    } catch (e) { reject(e); }
  });
  return _dbp;
}

export function idbAvailable() {
  try { return typeof indexedDB !== "undefined"; } catch { return false; }
}

// Read a value (string) by key. Returns null when absent or on any failure (caller falls back).
export async function idbGet(key) {
  if (!idbAvailable()) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result == null ? null : String(r.result));
      r.onerror = () => resolve(null);
    });
  } catch { return null; }
}

// Write a value (string) by key. Resolves { ok } or { ok:false, quota, error } so the caller can show the
// real reason (never a silent failure).
export async function idbSet(key, value) {
  if (!idbAvailable()) return { ok: false, error: "no-indexeddb" };
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      let tx;
      try { tx = db.transaction(STORE, "readwrite"); }
      catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); return; }
      const req = tx.objectStore(STORE).put(value, key);
      req.onsuccess = () => {};
      tx.oncomplete = () => resolve({ ok: true });
      tx.onabort = tx.onerror = () => {
        const err = tx.error || req.error;
        const quota = !!(err && (err.name === "QuotaExceededError" || /quota/i.test(err.name || "") || /quota/i.test(err.message || "")));
        resolve({ ok: false, quota, error: (err && (err.name || err.message)) || "write-failed" });
      };
    });
  } catch (e) {
    const quota = !!(e && (e.name === "QuotaExceededError" || /quota/i.test(e.name || "")));
    return { ok: false, quota, error: (e && (e.name || e.message)) || "write-failed" };
  }
}

export async function idbDel(key) {
  if (!idbAvailable()) return;
  try { const db = await openDb(); await new Promise((res) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(key); tx.oncomplete = res; tx.onabort = res; }); } catch { /* noop */ }
}
