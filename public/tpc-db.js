/* ───────────────────────────────────────────────────────────────────────────
   IOT Techs — TPC (Technician Pay Calculator) database integration
   • Auto-saves every change to the payroll record (id-tracked, no duplicates)
   • Google Places address autocomplete on the location fields
   • Reopen a saved pay record to revise it (?payroll=<id>)
   • Explicit "Save to Payroll" logs a version (change history)
   • Links back to the Technician Portal
─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let currentPayrollId = null;
  let _googleAddr = false, _gToken = '', _locTimer = null, _lastSavedJSON = '', _saveTimer = null, _inFlight = false;

  function $(id) { return document.getElementById(id); }
  function val(id) { const el = $(id); return el ? (el.value || '') : ''; }
  function parseMoney(el) { return el ? (parseFloat(String(el.textContent || el.value || '').replace(/[^0-9.\-]/g, '')) || 0) : 0; }

  function toast(msg) {
    let t = $('tpc-db-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'tpc-db-toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0B3322;border:1px solid #4ADE80;color:#bdf3d0;padding:11px 20px;border-radius:10px;font-family:Barlow,system-ui,sans-serif;font-size:13px;font-weight:600;z-index:99999;opacity:0;transition:opacity .25s;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:90vw;text-align:center;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._x); t._x = setTimeout(function () { t.style.opacity = '0'; }, 2400);
  }
  function flagSaved() {
    let el = $('tpc-autosave');
    if (!el) {
      el = document.createElement('div'); el.id = 'tpc-autosave';
      el.style.cssText = 'position:fixed;bottom:22px;left:22px;background:rgba(31,107,79,.95);color:#cdebd9;border:1px solid #2f7a5b;border-radius:20px;padding:6px 13px;font-family:Barlow,system-ui,sans-serif;font-size:11px;font-weight:700;z-index:99998;opacity:0;transition:opacity .25s;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = 'Auto-saved'; el.style.opacity = '1';
    clearTimeout(el._x); el._x = setTimeout(function () { el.style.opacity = '0'; }, 1500);
  }

  function getNetPay() {
    const gt = $('rp-grand-total');
    if (gt && gt.style.display !== 'none') return parseMoney($('rp-grand-amt'));
    return parseMoney($('balance-display'));
  }
  function getVehicle() {
    if (typeof useCompany !== 'undefined') return useCompany ? 'Rented Vehicle + Tools' : 'Own Vehicle + Tools';
    const own = $('btn-own');
    return (own && own.classList.contains('active')) ? 'Own Vehicle + Tools' : 'Rented Vehicle + Tools';
  }

  function snapshot() {
    const inputs = {};
    document.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.id) inputs[el.id] = (el.type === 'checkbox' ? el.checked : el.value);
    });
    return {
      inputs: inputs,
      lineItems: (typeof lineItems !== 'undefined' ? lineItems : []),
      deductions: (typeof deductions !== 'undefined' ? deductions : []),
      extraJobs: (typeof extraJobs !== 'undefined' ? extraJobs : []),
      useCompany: (typeof useCompany !== 'undefined' ? useCompany : true),
      netPay: getNetPay(), savedAt: Date.now()
    };
  }
  function applyInputs(inputs) {
    if (!inputs) return;
    Object.keys(inputs).forEach(function (id) {
      const el = $(id); if (!el) return;
      if (el.type === 'checkbox') el.checked = !!inputs[id]; else el.value = inputs[id];
    });
  }
  function applySnapshot(s) {
    if (!s) return;
    applyInputs(s.inputs);
    if (Array.isArray(s.lineItems) && typeof lineItems !== 'undefined') { lineItems.length = 0; s.lineItems.forEach(function (x) { lineItems.push(x); }); }
    if (Array.isArray(s.deductions) && typeof deductions !== 'undefined') { deductions.length = 0; s.deductions.forEach(function (x) { deductions.push(x); }); }
    if (Array.isArray(s.extraJobs) && typeof extraJobs !== 'undefined') { extraJobs.length = 0; s.extraJobs.forEach(function (x) { extraJobs.push(x); }); }
    if (s.useCompany != null && typeof setVehicle === 'function') { try { setVehicle(s.useCompany ? 'company' : 'own'); } catch (e) {} }
    ['renderLineItems', 'renderDeductions', 'updateSummary'].forEach(function (fn) { if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) {} } });
  }

  function buildPayload(opts) {
    return {
      id: currentPayrollId || undefined,
      technician_name: val('techName').trim(),
      client: val('clientName'),
      location: val('jobLocation'),
      work_order_id: val('workOrderId'),
      job_date: val('jobDate'),
      vehicle: getVehicle(),
      amount: getNetPay(),
      status: 'Pending',
      snapshot: snapshot(),
      noVersion: !!(opts && opts.noVersion),
      note: (opts && opts.note) || ''
    };
  }

  async function postPayroll(payload) {
    const r = await (await fetch('/api/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json();
    if (r.ok && r.id) currentPayrollId = r.id;
    return r;
  }

  // Explicit save → logs a version (a checkpoint in the change history)
  window.tpcSavePayroll = async function () {
    const tech = val('techName').trim();
    if (!tech) { toast('Enter a technician name first'); $('techName') && $('techName').focus(); return; }
    try {
      const p = buildPayload({ note: currentPayrollId ? 'revised' : 'created' });
      const r = await postPayroll(p);
      if (r.ok) { _lastSavedJSON = JSON.stringify(p); toast('Saved · ' + tech + ' · $' + p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) + (r.version ? ' (v' + r.version + ')' : '')); }
      else toast('Save failed: ' + (r.error || 'unknown'));
    } catch (e) { toast('Save failed — is the server running?'); }
  };

  // Auto-save → keeps the record current, no version spam
  function scheduleAutoSave() {
    if (val('techName').trim().length < 2) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async function () {
      if (_inFlight) { scheduleAutoSave(); return; }
      const p = buildPayload({ noVersion: true });
      const sig = JSON.stringify(p);
      if (sig === _lastSavedJSON) return;
      _inFlight = true;
      try { const r = await postPayroll(p); if (r.ok) { _lastSavedJSON = sig; flagSaved(); } }
      catch (e) { /* offline */ }
      finally { _inFlight = false; }
    }, 1500);
  }

  // ── Google Places location autocomplete (override the Nominatim version) ──
  const _origLocationSearch = window.locationSearch;
  const _origSelectLoc = window.selectLoc;
  window.selectLoc = function () { _gToken = ''; if (_origSelectLoc) return _origSelectLoc.apply(this, arguments); };

  window.locationSearch = function (v, dropdownId, inputId) {
    if (!_googleAddr) return _origLocationSearch ? _origLocationSearch(v, dropdownId, inputId) : undefined;
    const q = (v || '').trim();
    if (q.length < 3) { if (typeof closeLocDropdown === 'function') closeLocDropdown(); return; }
    clearTimeout(_locTimer);
    if (!_gToken) _gToken = 'sess-' + Math.random().toString(36).slice(2);
    _locTimer = setTimeout(async function () {
      try {
        const r = await (await fetch('/api/address/autocomplete?q=' + encodeURIComponent(q) + '&token=' + _gToken)).json();
        if (r.error === 'no-key') { _googleAddr = false; if (_origLocationSearch) _origLocationSearch(v, dropdownId, inputId); return; }
        renderGoogleLoc(r.predictions || [], inputId);
      } catch (e) { if (typeof closeLocDropdown === 'function') closeLocDropdown(); }
    }, 280);
  };

  function renderGoogleLoc(preds, inputId) {
    if (!preds.length) { if (typeof closeLocDropdown === 'function') closeLocDropdown(); return; }
    let dd = $('global-loc-dd');
    if (!dd) { dd = document.createElement('div'); dd.id = 'global-loc-dd'; dd.style.cssText = 'position:fixed;background:#fff;border:1.5px solid rgba(201,169,110,0.5);border-radius:8px;z-index:99999;max-height:300px;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4);'; document.body.appendChild(dd); }
    const inp = $(inputId); const rect = inp ? inp.getBoundingClientRect() : null;
    if (!rect) return;
    dd.style.left = rect.left + 'px'; dd.style.top = (rect.bottom + 4) + 'px'; dd.style.width = rect.width + 'px'; dd.style.display = 'block';
    dd.innerHTML = preds.map(function (p) {
      const safe = String(p.description || p.main).replace(/'/g, '&#39;');
      return '<div style="padding:12px 14px;cursor:pointer;border-bottom:1px solid #f0f0f0;" ' +
        'onmousedown="event.preventDefault();selectLoc(\'' + inputId + '\',\'' + safe + '\')" ' +
        'onmouseover="this.style.background=\'#F5F2EC\'" onmouseout="this.style.background=\'transparent\'">' +
        '<div style="font-size:14px;color:#111;font-weight:600;">' + (p.main || '') + '</div>' +
        (p.secondary ? '<div style="font-size:11px;color:#888;margin-top:2px;">' + p.secondary + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ── Reopen a saved pay record for editing (from the Payroll page) ──────────
  async function loadFromQuery() {
    let id;
    try { id = new URLSearchParams(location.search).get('payroll'); } catch (e) { return; }
    if (!id) return;
    try {
      const rec = await (await fetch('/api/payroll/' + id)).json();
      if (rec && !rec.error) {
        currentPayrollId = Number(id);
        applySnapshot(rec.snapshot);
        _lastSavedJSON = JSON.stringify(buildPayload({ noVersion: true }));
        toast('Editing ' + (rec.technician_name || 'pay record') + (rec.versions && rec.versions.length ? ' · v' + rec.versions[0].version_no : ''));
        history.replaceState(null, '', location.pathname);
      }
    } catch (e) { /* ignore */ }
  }

  async function wireTechRoster() {
    const input = $('techName'); if (!input) return;
    try {
      const techs = await (await fetch('/api/technicians')).json();
      if (!Array.isArray(techs) || !techs.length) return;
      let dl = $('tpc-tech-list');
      if (!dl) { dl = document.createElement('datalist'); dl.id = 'tpc-tech-list'; document.body.appendChild(dl); }
      dl.innerHTML = techs.map(function (t) { return '<option value="' + (t.name || '').replace(/"/g, '&quot;') + '">'; }).join('');
      input.setAttribute('list', 'tpc-tech-list');
    } catch (e) {}
  }

  function injectButtons() {
    const wrap = $('pdf-btn-wrap');
    if (!wrap || $('tpc-save-payroll-btn')) return;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;margin-bottom:10px;';
    const save = document.createElement('button');
    save.id = 'tpc-save-payroll-btn'; save.type = 'button'; save.onclick = window.tpcSavePayroll;
    save.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> SAVE TO PAYROLL';
    save.style.cssText = "flex:1;background:#1f6b4f;border:none;border-radius:8px;padding:14px 10px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:13px;letter-spacing:2px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 2px 12px rgba(31,107,79,.35);";
    const view = document.createElement('a');
    view.href = '/payroll.html'; view.innerHTML = 'PAYROLL →';
    view.style.cssText = "flex:0 0 auto;background:transparent;border:1.5px solid #4ADE80;border-radius:8px;padding:14px 16px;color:#4ADE80;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:13px;letter-spacing:2px;text-decoration:none;display:flex;align-items:center;justify-content:center;";
    row.appendChild(save); row.appendChild(view);
    wrap.parentNode.insertBefore(row, wrap);
  }

  function injectPortalLink() {
    if ($('tpc-portal-link')) return;
    const a = document.createElement('a');
    a.id = 'tpc-portal-link'; a.href = '/portal.html';
    a.innerHTML = '← Technician Portal';
    a.style.cssText = 'position:fixed;top:10px;left:10px;z-index:99997;background:rgba(11,15,26,.85);border:1px solid #C9A96E;color:#C9A96E;border-radius:20px;padding:7px 14px;font-family:Barlow,system-ui,sans-serif;font-size:12px;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.4);';
    document.body.appendChild(a);
  }

  function init() {
    injectButtons(); injectPortalLink(); wireTechRoster();
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) { _googleAddr = !!(c && c.googleAddress); }).catch(function () {});
    loadFromQuery();
    // Auto-save on any edit
    document.addEventListener('input', scheduleAutoSave, true);
    document.addEventListener('change', scheduleAutoSave, true);
    console.log('[tpc-db] payroll integration loaded');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
