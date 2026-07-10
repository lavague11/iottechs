/* ───────────────────────────────────────────────────────────────────────────
   IOT Techs — Toast Drop Calculator → versioned submissions database
   • Auto-saves every change (id-tracked, no duplicates)
   • Google Places address autocomplete
   • "Saved Submissions" library: reopen to revise, view change history,
     restore previous versions
   • Links back to the Technician Portal
   Uses the tool's own snapshot()/apply() for perfect save/restore.
─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const TOOL = 'toast-drop';
  let currentId = null, _googleAddr = false, _gTimer = null, _saveTimer = null, _lastJSON = '', _inFlight = false;

  function el(id) { return document.getElementById(id); }
  function val(id) { const e = el(id); return e ? (e.value || '') : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function getTotal() { const e = el('tTotalIn'); return e ? (parseFloat(e.value) || 0) : 0; }
  function snap() { return (typeof snapshot === 'function') ? snapshot() : {}; }

  function toast(msg) {
    let t = el('toast-db-toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast-db-toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#13371F;border:1px solid #C9A96E;color:#FAF8F4;padding:11px 20px;border-radius:10px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;z-index:99999;opacity:0;transition:opacity .25s;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:90vw;text-align:center;';
      document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1'; clearTimeout(t._x); t._x = setTimeout(function () { t.style.opacity = '0'; }, 2400);
  }
  function flagSaved() {
    let e = el('toast-autosave');
    if (!e) { e = document.createElement('div'); e.id = 'toast-autosave';
      e.style.cssText = 'position:fixed;bottom:22px;left:22px;background:rgba(19,55,31,.96);color:#cdebd9;border:1px solid #2f7a5b;border-radius:20px;padding:6px 13px;font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;z-index:99998;opacity:0;transition:opacity .25s;pointer-events:none;';
      document.body.appendChild(e); }
    e.textContent = 'Auto-saved'; e.style.opacity = '1'; clearTimeout(e._x); e._x = setTimeout(function () { e.style.opacity = '0'; }, 1500);
  }

  function payload(opts) {
    return { id: currentId || undefined, tool: TOOL,
      label: val('bizname') || val('project') || 'Untitled',
      client: val('bizname'), total: getTotal(), status: 'Saved',
      edited_by: val('poc') || '', snapshot: snap(),
      noVersion: !!(opts && opts.noVersion), note: (opts && opts.note) || '' };
  }
  async function post(p) {
    const r = await (await fetch('/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })).json();
    if (r.ok && r.id) currentId = r.id;
    return r;
  }

  window.toastSave = async function () {
    if (!val('bizname').trim()) { toast('Enter a business name first'); el('bizname') && el('bizname').focus(); return; }
    try {
      const p = payload({ note: currentId ? 'revised' : 'created' });
      const r = await post(p);
      if (r.ok) { _lastJSON = JSON.stringify(p); toast('Saved — ' + (p.label) + ' · $' + money(p.total) + (r.version ? ' (v' + r.version + ')' : '')); }
      else toast('Save failed');
    } catch (e) { toast('Save failed — server offline?'); }
  };
  function scheduleAutoSave() {
    if (val('bizname').trim().length < 2) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async function () {
      if (_inFlight) { scheduleAutoSave(); return; }
      const p = payload({ noVersion: true }); const sig = JSON.stringify(p);
      if (sig === _lastJSON) return;
      _inFlight = true;
      try { const r = await post(p); if (r.ok) { _lastJSON = sig; flagSaved(); } } catch (e) {} finally { _inFlight = false; }
    }, 1500);
  }

  // ── Google Places address autocomplete (override Nominatim searchAddr) ────
  const _origSearchAddr = window.searchAddr;
  window.searchAddr = function () {
    if (!_googleAddr) return _origSearchAddr ? _origSearchAddr() : undefined;
    const q = (val('address') || val('bizname')).trim();
    const box = el('addrResults'); if (!box) return;
    if (q.length < 3) { box.style.display = 'none'; return; }
    box.style.display = 'block'; box.innerHTML = '<div class="ares">Searching…</div>';
    clearTimeout(_gTimer);
    _gTimer = setTimeout(async function () {
      try {
        const r = await (await fetch('/api/address/autocomplete?q=' + encodeURIComponent(q))).json();
        if (r.error === 'no-key') { _googleAddr = false; if (_origSearchAddr) _origSearchAddr(); return; }
        const preds = r.predictions || [];
        if (!preds.length) { box.innerHTML = '<div class="ares">No matches — type it manually.</div>'; return; }
        box.innerHTML = '';
        preds.forEach(function (p) {
          const row = document.createElement('div'); row.className = 'ares';
          row.innerHTML = '<div style="font-weight:600;color:#111;">' + esc(p.main || '') + '</div>' +
            (p.secondary ? '<div style="font-size:11px;color:#888;">' + esc(p.secondary) + '</div>' : '');
          row.onclick = function () { box.style.display = 'none'; window.toastPickAddr(p); };
          box.appendChild(row);
        });
      } catch (e) { box.innerHTML = '<div class="ares">Search unavailable — type it manually.</div>'; }
    }, 280);
  };

  // Selecting a prediction → fetch details, fill the address, and (for a named
  // business / POI) set/replace the Business Name too.
  window.toastPickAddr = async function (p) {
    let addr = p.description || p.main || '';
    try {
      if (p.placeId) {
        const d = await (await fetch('/api/address/details?placeId=' + encodeURIComponent(p.placeId))).json();
        if (d && !d.error) {
          const parts = [d.street, d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean);
          addr = parts.join(', ') || d.formatted || addr;
          const nm = (d.name || '').trim();
          const fmt = (d.formatted || '').toLowerCase();
          const street = (d.street || '').toLowerCase();
          const looksLikeStreet = nm && (fmt.indexOf(nm.toLowerCase()) === 0 || nm.toLowerCase() === street);
          if (nm && !looksLikeStreet) { const bn = el('bizname'); if (bn) bn.value = nm; } // business → fill name
        }
      }
    } catch (e) { /* keep the prediction text */ }
    if (el('address')) el('address').value = addr;
    if (typeof updatePropNo === 'function') updatePropNo();
    scheduleAutoSave();
  };

  // ── Saved submissions library (reopen / revise / history / restore) ───────
  window.toastCloseLib = function () { const m = el('toast-lib'); if (m) m.remove(); };
  window.toastOpenLib = async function () {
    toastCloseLib();
    let rows = [];
    try { rows = (await (await fetch('/api/submissions?tool=' + TOOL)).json()).submissions || []; } catch (e) { toast('Server offline?'); return; }
    const m = document.createElement('div'); m.id = 'toast-lib';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(11,15,26,.78);z-index:100000;display:flex;align-items:flex-start;justify-content:center;padding:30px 16px;overflow-y:auto;font-family:Helvetica,Arial,sans-serif;';
    m.innerHTML = '<div style="background:#FFFDFB;border:2px solid #C9A96E;border-radius:14px;max-width:640px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.45);overflow:hidden;">' +
      '<div style="background:#0B0F1A;color:#C9A96E;padding:14px 18px;font-weight:800;letter-spacing:.04em;display:flex;justify-content:space-between;align-items:center;">' +
        '<span>SAVED SUBMISSIONS <span style="font-size:10px;opacity:.6;font-weight:500;">Toast Drop</span></span>' +
        '<button onclick="toastCloseLib()" style="background:none;border:none;color:#C9A96E;font-size:22px;cursor:pointer;">×</button></div>' +
      '<div style="max-height:70vh;overflow-y:auto;">' +
        (rows.length ? rows.map(function (s) {
          return '<div style="padding:12px 16px;border-bottom:1px solid #F0EBE0;display:flex;align-items:center;gap:10px;">' +
            '<div style="flex:1;min-width:0;"><div style="font-weight:700;color:#1A1F2E;">' + esc(s.label || '(untitled)') + '</div>' +
            '<div style="font-size:11px;color:#6E6658;">$' + money(s.total) + ' · v' + (s.version || 1) + ' · ' + new Date(s.updated_at).toLocaleString() + (s.edited_by ? ' · ' + esc(s.edited_by) : '') + '</div></div>' +
            '<button onclick="toastReopen(' + s.id + ')" style="background:#13371F;color:#fff;border:none;border-radius:7px;padding:6px 12px;font-weight:800;font-size:11px;cursor:pointer;">OPEN</button>' +
            '<button onclick="toastHistory(' + s.id + ')" style="background:none;border:1px solid #C9A96E;color:#8A6A10;border-radius:7px;padding:6px 10px;font-weight:700;font-size:11px;cursor:pointer;">History</button>' +
            '<button onclick="toastDelete(' + s.id + ')" style="background:none;border:none;color:#B84040;font-size:18px;cursor:pointer;">×</button></div>';
        }).join('') : '<div style="padding:40px;text-align:center;color:#8A8478;">No saved submissions yet.</div>') +
      '</div></div>';
    m.onclick = function (e) { if (e.target === m) toastCloseLib(); };
    document.body.appendChild(m);
  };
  window.toastReopen = async function (id) {
    try {
      const s = await (await fetch('/api/submissions/' + id)).json();
      if (s && !s.error && typeof apply === 'function') {
        apply(s.snapshot); currentId = Number(id); _lastJSON = JSON.stringify(payload({ noVersion: true }));
        toastCloseLib(); toast('Editing ' + (s.label || 'submission') + ' · v' + (s.version || 1));
      }
    } catch (e) { toast('Could not open'); }
  };
  window.toastDelete = async function (id) {
    if (!confirm('Delete this submission and its history?')) return;
    await fetch('/api/submissions/' + id, { method: 'DELETE' });
    if (currentId === id) currentId = null;
    toast('Deleted'); toastOpenLib();
  };
  window.toastHistory = async function (id) {
    let vs = [];
    try { vs = (await (await fetch('/api/versions/submission/' + id)).json()).versions || []; } catch (e) { return; }
    const m = el('toast-lib'); if (!m) return;
    const box = m.querySelector('div > div:nth-child(2)');
    box.innerHTML = '<div style="padding:10px 16px;background:#F5F0E8;font-size:11px;font-weight:800;letter-spacing:1px;color:#8A6A10;display:flex;justify-content:space-between;">CHANGE HISTORY <button onclick="toastOpenLib()" style="background:none;border:none;color:#8A6A10;cursor:pointer;font-weight:700;">‹ back</button></div>' +
      (vs.length ? vs.map(function (v) {
        return '<div style="padding:11px 16px;border-bottom:1px solid #F0EBE0;display:flex;align-items:center;gap:10px;">' +
          '<div style="flex:1;"><div style="font-weight:700;color:#1A1F2E;">v' + v.version_no + ' · $' + money(v.total) + '</div>' +
          '<div style="font-size:11px;color:#6E6658;">' + new Date(v.created_at).toLocaleString() + (v.edited_by ? ' · ' + esc(v.edited_by) : '') + (v.note ? ' · ' + esc(v.note) : '') + '</div></div>' +
          '<button onclick="toastRestore(' + id + ',' + v.version_no + ')" style="background:#C9A96E;color:#0B0F1A;border:none;border-radius:7px;padding:6px 12px;font-weight:800;font-size:11px;cursor:pointer;">Restore</button></div>';
      }).join('') : '<div style="padding:30px;text-align:center;color:#8A8478;">No versions.</div>');
  };
  window.toastRestore = async function (id, vno) {
    try {
      const vs = (await (await fetch('/api/versions/submission/' + id)).json()).versions || [];
      const v = vs.find(function (x) { return x.version_no === vno; });
      if (v && typeof apply === 'function') { apply(v.snapshot); currentId = Number(id); toastCloseLib(); toast('Restored v' + vno + ' — edit and save to keep it'); }
    } catch (e) { toast('Could not restore'); }
  };

  function loadFromQuery() {
    let id; try { id = new URLSearchParams(location.search).get('submission'); } catch (e) { return; }
    if (id) { window.toastReopen(Number(id)); history.replaceState(null, '', location.pathname); }
  }

  function injectButtons() {
    const ref = document.querySelector('[onclick="loadDraft()"]');
    if (!ref || el('toast-save-cloud')) return;
    const save = document.createElement('button');
    save.id = 'toast-save-cloud'; save.className = ref.className; save.onclick = window.toastSave;
    save.textContent = 'Save to Cloud';
    save.style.cssText = 'background:#13371F;color:#fff;border:1px solid #1f6b4f;';
    const lib = document.createElement('button');
    lib.id = 'toast-lib-btn'; lib.className = ref.className; lib.onclick = window.toastOpenLib;
    lib.textContent = 'Saved Submissions';
    // Equipment & Cable Guide — view or download the PDF
    const GUIDE = '/docs/toast-equipment-cable-guide.pdf';
    const viewG = document.createElement('button');
    viewG.id = 'toast-guide-view'; viewG.className = ref.className; viewG.textContent = 'View Equipment Guide';
    viewG.style.cssText = 'background:#2C3347;color:#C9A96E;border:1px solid #C9A96E;';
    viewG.onclick = function () { window.open(GUIDE, '_blank'); };
    const dlG = document.createElement('a');
    dlG.id = 'toast-guide-dl'; dlG.className = ref.className; dlG.href = GUIDE;
    dlG.setAttribute('download', 'Toast Equipment & Cable Guide.pdf');
    dlG.textContent = 'Download Guide';
    dlG.style.cssText = 'background:#2C3347;color:#C9A96E;border:1px solid #C9A96E;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;';
    ref.parentNode.insertBefore(save, ref.nextSibling);
    save.parentNode.insertBefore(lib, save.nextSibling);
    lib.parentNode.insertBefore(viewG, lib.nextSibling);
    viewG.parentNode.insertBefore(dlG, viewG.nextSibling);
  }
  function injectPortalLink() {
    if (el('toast-portal-link')) return;
    const a = document.createElement('a'); a.id = 'toast-portal-link'; a.href = '/portal.html';
    a.innerHTML = '← Technician Portal';
    a.style.cssText = 'position:fixed;top:10px;left:10px;z-index:99997;background:rgba(11,15,26,.85);border:1px solid #C9A96E;color:#C9A96E;border-radius:20px;padding:7px 14px;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.4);';
    document.body.appendChild(a);
  }

  function init() {
    injectButtons(); injectPortalLink();
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) { _googleAddr = !!(c && c.googleAddress); }).catch(function () {});
    loadFromQuery();
    document.addEventListener('input', scheduleAutoSave, true);
    document.addEventListener('change', scheduleAutoSave, true);
    console.log('[toast-db] submissions integration loaded');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
