/* ───────────────────────────────────────────────────────────────────────────
   IOT Techs — local database integration
   Wires the existing proposal form to the Node + SQLite backend:
     • Customer search bar  → real lookups (overrides the UI-only stub)
     • Picking a result     → loads that customer's latest proposal
     • Save button          → persists customer + full proposal to the DB
   Loaded after the main inline script, so it can read its globals
   (SECTIONS, discounts, currentGrand, applyDraftState, showToast, …).
─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function debounce(fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  }

  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v || '';
  }

  function money(n) {
    return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.log(msg);
  }

  // ── Customer search (overrides the inline stub) ───────────────────────────
  const runSearch = debounce(async function (query) {
    const results = document.getElementById('customerSearchResults');
    const hint = document.getElementById('customerSearchHint');
    if (!results) return;

    if (!query || !query.trim()) {
      results.style.display = 'none';
      if (hint) { hint.textContent = 'Search saved customers by name, business, phone, email, or address'; hint.style.color = '#8A8478'; }
      return;
    }
    try {
      const res = await fetch('/api/customers/search?q=' + encodeURIComponent(query));
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) {
        results.style.display = 'none';
        if (hint) { hint.textContent = 'No saved customer matches "' + query + '"'; hint.style.color = '#8A6A10'; }
        return;
      }
      if (hint) { hint.textContent = data.length + ' match' + (data.length !== 1 ? 'es' : '') + ' found'; hint.style.color = '#234D3A'; }
      results.innerHTML = data.map(function (c) {
        const title = c.business || c.name || '—';
        const sub = [c.name && c.name !== c.business ? c.name : '', c.phone, c.email].filter(Boolean).join('  ·  ');
        return '' +
          '<div onmousedown="event.preventDefault()" onclick="iotLoadCustomer(' + c.id + ')" ' +
          'style="padding:10px 12px;border-radius:8px;cursor:pointer;border-bottom:1px solid #F0EBE0;">' +
            '<div style="font-weight:700;color:#1A1F2E;">' + esc(title) + '</div>' +
            (sub ? '<div style="font-size:11px;color:#6E6658;margin-top:2px;">' + esc(sub) + '</div>' : '') +
            (c.address ? '<div style="font-size:11px;color:#8A8478;margin-top:1px;">' + esc(c.address) + '</div>' : '') +
            (c.last_proposal_num
              ? '<div style="font-size:10px;color:#8A6A10;margin-top:3px;font-weight:600;">Last: ' + esc(c.last_proposal_num) + '  ·  $' + money(c.last_total) + '</div>'
              : '') +
          '</div>';
      }).join('');
      results.style.display = 'block';
    } catch (e) {
      if (hint) { hint.textContent = 'Search error — is the server running?'; hint.style.color = '#B84040'; }
    }
  }, 250);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  // Override the inline stub
  window.onCustomerSearch = function (q) { runSearch(q); };

  // ── Load a customer + their latest proposal ───────────────────────────────
  window.iotLoadCustomer = async function (id, projectId) {
    const results = document.getElementById('customerSearchResults');
    if (results) results.style.display = 'none';
    try {
      const res = await fetch('/api/customers/' + id + (projectId ? ('?project=' + encodeURIComponent(projectId)) : ''));
      const c = await res.json();
      if (c.error) { toast('Could not load customer'); return; }

      // Lock the form to this lead + project so further edits update them (no new record)
      currentCustomerId = Number(id);
      currentProjectId = projectId ? Number(projectId) : (c.project_id || null);
      _lastSavedJSON = '';
      recordOpened(Number(id));   // remember as a recently-opened project

      const search = document.getElementById('customerSearch');
      if (search) search.value = c.business || c.name || '';

      if (c.latestState && typeof applyDraftState === 'function') {
        applyDraftState(c.latestState);
        // Backfill contact fields from the customer record if the saved state
        // didn't carry them (e.g. a sparse/legacy proposal state).
        [['clientName', c.name], ['businessName', c.business], ['clientAddr', c.address],
         ['clientPhone', c.phone], ['clientEmail', c.email]].forEach(function (pair) {
          const el = document.getElementById(pair[0]);
          if (el && !el.value && pair[1]) el.value = pair[1];
        });
        if (typeof recalc === 'function') recalc();
        toast('Loaded ' + (c.business || c.name || 'customer'));
      } else {
        // Fall back to just filling the contact fields
        setVal('clientName', c.name);
        setVal('businessName', c.business);
        setVal('clientAddr', c.address);
        setVal('clientPhone', c.phone);
        setVal('clientEmail', c.email);
        if (typeof autoGenProposalNum === 'function') autoGenProposalNum();
        if (typeof recalc === 'function') recalc();
        toast('Loaded contact for ' + (c.business || c.name || 'customer'));
      }
      renderLifecycleStrip(Number(id));   // show where this project stands in the lifecycle
    } catch (e) {
      toast('Could not load customer — server offline?');
    }
  };

  // ── Live lifecycle strip: the calculator is no longer a blind dead-end ───────
  function escLc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]; }); }
  window.renderLifecycleStrip = async function (id) {
    const host = document.getElementById('iotLifecycleStrip');
    if (!host) return;
    if (!id) { host.style.display = 'none'; host.innerHTML = ''; return; }
    const projQ = currentProjectId ? ('?project=' + encodeURIComponent(currentProjectId)) : '';
    try {
      const p = await (await fetch('/api/project/' + id + projQ)).json();
      const lc = p && p.lifecycle;
      if (!lc || !lc.stages || !lc.stages.length) { host.style.display = 'none'; return; }
      const cur = lc.stages[lc.currentIndex] || {};
      const dots = lc.stages.map(function (s) {
        const col = s.status === 'done' ? '#1f8a4d' : (s.status === 'current' ? '#C9A96E' : '#D8CFBF');
        if (s.status === 'current') return '<span title="' + escLc(s.label) + '" style="display:inline-block;padding:2px 9px;border-radius:8px;border:1.5px solid #C9A96E;background:#FFF4DE;font-size:10px;font-weight:800;color:#8A6A10;margin:2px 3px;vertical-align:middle;">' + escLc(s.label) + '</span>';
        return '<span title="' + escLc(s.label) + (s.detail ? ' — ' + escLc(s.detail) : '') + '" style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + col + ';margin:2px 3px;vertical-align:middle;"></span>';
      }).join('');
      host.style.display = 'block';
      host.innerHTML =
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:linear-gradient(180deg,#FFF9EE,#FFFDFB);border:1px solid rgba(201,169,110,0.55);border-radius:12px;padding:11px 15px;margin-bottom:16px;">' +
          '<span style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#8A6A10;">Project status</span>' +
          '<span style="flex:1;min-width:140px;line-height:1.8;">' + dots + '</span>' +
          '<a href="/project.html?customer=' + id + (currentProjectId ? ('&project=' + currentProjectId) : '') + '" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:#8A6A10;text-decoration:none;border:1px solid rgba(201,169,110,0.6);border-radius:8px;padding:6px 11px;white-space:nowrap;">Open full project →</a>' +
        '</div>';
    } catch (e) { host.style.display = 'none'; }
  };

  // ── Collect current form state (applyDraftState-compatible shape) ─────────
  function collectState() {
    const inputs = {};
    document.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!el.id) return;
      if (el.type === 'checkbox' || el.type === 'radio') inputs[el.id] = { kind: 'check', value: el.checked };
      else inputs[el.id] = { kind: 'value', value: el.value };
    });
    return {
      savedAt: Date.now(),
      clientLabel: (document.getElementById('businessName') || {}).value ||
                   (document.getElementById('clientName') || {}).value || 'Untitled',
      SECTIONS:        typeof SECTIONS !== 'undefined' ? SECTIONS : undefined,
      discounts:       typeof discounts !== 'undefined' ? discounts : [],
      upgrades:        typeof upgrades !== 'undefined' ? upgrades : [],
      payments:        typeof payments !== 'undefined' ? payments : [],
      addendums:       typeof addendums !== 'undefined' ? addendums : [],
      customPrices:    typeof customPrices !== 'undefined' ? customPrices : {},
      customGrandTotal: typeof customGrandTotal !== 'undefined' ? customGrandTotal : null,
      paymentStructure: typeof paymentStructure !== 'undefined' ? paymentStructure : '50/50',
      sampleMode:      typeof sampleMode !== 'undefined' ? !!sampleMode : false,
      isDayMode:       typeof isDayMode !== 'undefined' ? !!isDayMode : true,
      inputs: inputs
    };
  }

  // ── Save customer + proposal to the database ──────────────────────────────
  // opts.quiet → no success toast (used by auto-save)
  let currentCustomerId = null;   // the lead currently open in the form (stable id)
  let currentProjectId = null;    // which project of that customer this proposal belongs to (multi-project)
  let _lastSavedJSON = '';        // dedup — skip identical quiet saves
  let _saveInFlight = false;      // guard against overlapping saves

  // Reset the "current lead" so a fresh form starts a new record
  window.iotResetLead = function () { currentCustomerId = null; currentProjectId = null; _lastSavedJSON = ''; if (typeof renderLifecycleStrip === 'function') renderLifecycleStrip(null); };

  window.iotSaveToDatabase = async function (opts) {
    opts = opts || {};
    const state = collectState();
    const payload = {
      customer: {
        id:       currentCustomerId || undefined,
        name:     (document.getElementById('clientName') || {}).value || '',
        business: (document.getElementById('businessName') || {}).value || '',
        phone:    (document.getElementById('clientPhone') || {}).value || '',
        email:    (document.getElementById('clientEmail') || {}).value || '',
        address:  (document.getElementById('clientAddr') || {}).value || ''
      },
      projectId: currentProjectId || undefined,   // target this customer's specific project (else server picks/creates)
      proposal: {
        proposalNum: (document.getElementById('proposalNum') || {}).value || '',
        clientLabel: state.clientLabel,
        grandTotal:  typeof currentGrand !== 'undefined' ? currentGrand : 0,
        status:      'saved',
        state:       state
      }
    };
    if (!payload.customer.name.trim() && !payload.customer.business.trim()) {
      if (!opts.quiet) toast('Add a client or business name before saving');
      return false;
    }
    const jsonSig = JSON.stringify(payload);
    if (opts.quiet && (jsonSig === _lastSavedJSON || _saveInFlight)) return true; // nothing new / busy
    _saveInFlight = true;
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonSig
      });
      const r = await res.json();
      if (r.ok) {
        if (r.customerId) currentCustomerId = r.customerId;   // lock to this lead
        if (r.projectId) currentProjectId = r.projectId;      // lock to the resolved/created project
        payload.customer.id = currentCustomerId;
        _lastSavedJSON = JSON.stringify(payload);             // bake id into dedup sig
        if (opts.quiet) showAutoSaved(); else toast('Saved to database');
        return true;
      }
      if (!opts.quiet) toast('Save failed: ' + (r.error || 'unknown'));
      return false;
    } catch (e) {
      if (!opts.quiet) toast('Save failed — is the server running?');
      return false;
    } finally {
      _saveInFlight = false;
    }
  };

  // ── Auto-save: quietly persist EVERY change once there's a name/business ──
  let autoSaveTimer;
  function scheduleAutoSave() {
    const name = ((document.getElementById('clientName') || {}).value || '').trim();
    const biz  = ((document.getElementById('businessName') || {}).value || '').trim();
    if (name.length < 2 && biz.length < 2) return;   // need at least an identity
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () {
      window.iotSaveToDatabase({ quiet: true });     // dedup handled inside
    }, 1200);
  }

  // Small, non-intrusive "auto-saved" indicator (bottom-left, clear of the toast)
  function showAutoSaved() {
    let el = document.getElementById('iot-autosave');
    if (!el) {
      el = document.createElement('div');
      el.id = 'iot-autosave';
      el.style.cssText = 'position:fixed;bottom:24px;left:24px;background:rgba(35,77,58,0.95);color:#cdebd9;' +
        'border:1px solid #2f7a5b;border-radius:20px;padding:6px 13px;font-size:11px;font-weight:700;' +
        'letter-spacing:0.04em;z-index:9998;opacity:0;transition:opacity 0.25s;pointer-events:none;' +
        'font-family:Inter,system-ui,sans-serif;';
      document.body.appendChild(el);
    }
    const t = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    el.textContent = 'Auto-saved · ' + t;
    el.style.opacity = '1';
    clearTimeout(el._x);
    el._x = setTimeout(function () { el.style.opacity = '0'; }, 1800);
  }

  // ── Wrap the existing Save button so it ALSO persists to the DB ───────────
  const origSaveForLater = window.saveForLater;
  window.saveForLater = function () {
    window.iotSaveToDatabase();
    if (typeof origSaveForLater === 'function') {
      try { return origSaveForLater.apply(this, arguments); } catch (e) { /* keep going */ }
    }
  };

  // Wrap Clear / full reset so a fresh form starts a brand-new lead (new id)
  ['clearAll', 'fullReset'].forEach(function (fn) {
    const orig = window[fn];
    if (typeof orig === 'function') {
      window[fn] = function () {
        const r = orig.apply(this, arguments);
        window.iotResetLead();
        if (window.iotApplyPriceBook) window.iotApplyPriceBook();
        return r;
      };
    }
  });

  // Hide the search dropdown when clicking away
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#customerSearch') && !e.target.closest('#customerSearchResults')) {
      const r = document.getElementById('customerSearchResults');
      if (r) r.style.display = 'none';
    }
  });

  // ── SAVED PROPOSALS LIBRARY ───────────────────────────────────────────────
  // A modal that lists every customer in the database, expandable to their
  // proposals, each with Open (reloads into the form) and Delete actions.

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  async function renderLibraryList(query) {
    const listEl = document.getElementById('iot-lib-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:24px;text-align:center;color:#8A8478;font-style:italic;">Loading…</div>';
    let rows = [];
    try {
      const url = query && query.trim()
        ? '/api/customers/search?q=' + encodeURIComponent(query)
        : '/api/customers';
      rows = await (await fetch(url)).json();
    } catch (e) {
      listEl.innerHTML = '<div style="padding:24px;text-align:center;color:#B84040;">Could not reach the server.</div>';
      return;
    }
    if (!Array.isArray(rows) || !rows.length) {
      listEl.innerHTML = '<div style="padding:32px;text-align:center;color:#8A8478;">' +
        (query ? 'No customers match "' + esc(query) + '".' : 'No saved customers yet. Fill out a proposal and hit Save.') +
        '</div>';
      return;
    }
    listEl.innerHTML = rows.map(function (c) {
      const title = c.business || c.name || '—';
      const sub = [c.name && c.name !== c.business ? c.name : '', c.phone, c.email].filter(Boolean).join('  ·  ');
      const last = c.last_proposal_num
        ? '<span style="font-size:11px;color:#8A6A10;font-weight:700;">' + esc(c.last_proposal_num) + ' · $' + money(c.last_total) + '</span>'
        : '<span style="font-size:11px;color:#9A9488;">no proposal saved</span>';
      return '' +
        '<div class="iot-lib-row" data-id="' + c.id + '" style="border-bottom:1px solid #F0EBE0;">' +
          '<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;" onclick="iotLibToggle(' + c.id + ')">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:700;color:#1A1F2E;">' + esc(title) + '</div>' +
              (sub ? '<div style="font-size:11px;color:#6E6658;margin-top:1px;">' + esc(sub) + '</div>' : '') +
              (c.address ? '<div style="font-size:11px;color:#8A8478;">' + esc(c.address) + '</div>' : '') +
            '</div>' +
            '<div style="text-align:right;">' + last + '</div>' +
            '<button onclick="event.stopPropagation();iotLibOpenLatest(' + c.id + ')" title="Open latest proposal" ' +
              'style="background:#B8952A;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;">OPEN</button>' +
            '<button onclick="event.stopPropagation();iotLibDeleteCustomer(' + c.id + ',\'' + esc(title).replace(/'/g, "\\'") + '\')" title="Delete customer + all proposals" ' +
              'style="background:none;border:none;color:#B84040;font-size:18px;line-height:1;cursor:pointer;padding:4px 6px;">×</button>' +
          '</div>' +
          '<div class="iot-lib-detail" id="iot-lib-detail-' + c.id + '" style="display:none;padding:0 14px 12px 14px;"></div>' +
        '</div>';
    }).join('');
  }

  window.iotLibToggle = async function (id) {
    const detail = document.getElementById('iot-lib-detail-' + id);
    if (!detail) return;
    if (detail.style.display !== 'none') { detail.style.display = 'none'; detail.innerHTML = ''; return; }
    detail.style.display = '';
    detail.innerHTML = '<div style="font-size:11px;color:#8A8478;padding:6px 0;">Loading proposals…</div>';
    try {
      const c = await (await fetch('/api/customers/' + id)).json();
      const props = c.proposals || [];
      if (!props.length) { detail.innerHTML = '<div style="font-size:11px;color:#8A8478;padding:6px 0;">No proposals saved for this customer.</div>'; return; }
      detail.innerHTML = props.map(function (p) {
        return '' +
          '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#FAF7F2;border:1px solid #EDE3CF;border-radius:8px;margin-top:6px;">' +
            '<div style="flex:1;min-width:0;">' +
              '<span style="font-weight:700;color:#1A1F2E;font-size:12px;">' + esc(p.proposal_num || '(no #)') + '</span>' +
              '<span style="font-size:11px;color:#8A6A10;font-weight:700;margin-left:8px;">$' + money(p.grand_total) + '</span>' +
              '<div style="font-size:10px;color:#8A8478;margin-top:1px;">updated ' + fmtDate(p.updated_at) + '</div>' +
            '</div>' +
            '<button onclick="iotLibOpenProposal(' + p.id + ')" style="background:#234D3A;color:#fff;border:none;border-radius:6px;padding:5px 11px;font-size:11px;font-weight:800;cursor:pointer;">OPEN</button>' +
            '<button onclick="iotLibDeleteProposal(' + p.id + ',' + id + ')" title="Delete this proposal" style="background:none;border:none;color:#B84040;font-size:16px;cursor:pointer;padding:4px;">×</button>' +
          '</div>';
      }).join('');
    } catch (e) {
      detail.innerHTML = '<div style="font-size:11px;color:#B84040;padding:6px 0;">Could not load proposals.</div>';
    }
  };

  window.iotLibOpenLatest = async function (id) {
    await window.iotLoadCustomer(id);
    iotCloseLibrary();
  };

  window.iotLibOpenProposal = async function (proposalId) {
    try {
      const p = await (await fetch('/api/proposals/' + proposalId)).json();
      if (p && p.state && typeof applyDraftState === 'function') {
        applyDraftState(p.state);
        iotCloseLibrary();
        toast('Loaded ' + (p.proposal_num || 'proposal'));
      } else { toast('That proposal has no saved state'); }
    } catch (e) { toast('Could not open proposal'); }
  };

  window.iotLibDeleteProposal = async function (proposalId, customerId) {
    if (!confirm('Delete this proposal? This cannot be undone.')) return;
    try {
      await fetch('/api/proposals/' + proposalId, { method: 'DELETE' });
      toast('Proposal deleted');
      // refresh the expanded detail + the row's "last" label
      const detail = document.getElementById('iot-lib-detail-' + customerId);
      if (detail) { detail.style.display = 'none'; }
      iotLibToggle(customerId); // collapse
      renderLibraryList(document.getElementById('iot-lib-search')?.value || '');
    } catch (e) { toast('Delete failed'); }
  };

  window.iotLibDeleteCustomer = async function (id, label) {
    if (!confirm('Delete "' + label + '" and ALL their proposals? This cannot be undone.')) return;
    try {
      await fetch('/api/customers/' + id, { method: 'DELETE' });
      toast('Deleted ' + label);
      renderLibraryList(document.getElementById('iot-lib-search')?.value || '');
    } catch (e) { toast('Delete failed'); }
  };

  window.iotCloseLibrary = function () {
    const m = document.getElementById('iot-library-modal');
    if (m) m.remove();
  };

  window.iotOpenLibrary = function () {
    iotCloseLibrary();
    const modal = document.createElement('div');
    modal.id = 'iot-library-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(11,15,26,0.72);z-index:10000;' +
      'display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto;';
    modal.innerHTML =
      '<div style="background:#FFFDFB;border:2px solid #C9A96E;border-radius:14px;max-width:640px;width:100%;' +
      'box-shadow:0 24px 60px rgba(0,0,0,0.45);overflow:hidden;display:flex;flex-direction:column;max-height:85vh;">' +
        '<div style="background:#0B0F1A;color:#C9A96E;padding:14px 20px;font-weight:800;letter-spacing:0.05em;font-size:13px;' +
        'display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
          '<span>SAVED PROPOSALS <span style="font-size:10px;opacity:0.6;font-weight:500;margin-left:6px;">customer database</span></span>' +
          '<span style="display:flex;align-items:center;gap:10px;">' +
            '<button onclick="iotExportCSV()" title="Export all customers to CSV" ' +
              'style="background:none;border:1px solid #C9A96E;color:#C9A96E;border-radius:6px;padding:5px 11px;font-size:10px;font-weight:800;letter-spacing:0.05em;cursor:pointer;">EXPORT CSV</button>' +
            '<button onclick="iotCloseLibrary()" style="background:none;border:none;color:#C9A96E;font-size:22px;cursor:pointer;line-height:1;">×</button>' +
          '</span>' +
        '</div>' +
        '<div style="padding:12px 16px;flex-shrink:0;border-bottom:1px solid #F0EBE0;">' +
          '<input id="iot-lib-search" type="text" placeholder="Filter by name, business, phone, email, address…" ' +
          'oninput="iotLibSearch(this.value)" ' +
          'style="width:100%;padding:10px 12px;border:1.5px solid rgba(201,169,110,0.4);border-radius:10px;font-size:13px;' +
          'background:#FFFDFB;color:#1A1F2E;outline:none;">' +
        '</div>' +
        '<div id="iot-lib-list" style="overflow-y:auto;flex:1;"></div>' +
      '</div>';
    modal.onclick = function (e) { if (e.target === modal) iotCloseLibrary(); };
    document.body.appendChild(modal);
    renderLibraryList('');
  };

  let libSearchTimer;
  window.iotLibSearch = function (q) {
    clearTimeout(libSearchTimer);
    libSearchTimer = setTimeout(function () { renderLibraryList(q); }, 250);
  };

  // ── Export all customers to a CSV file ────────────────────────────────────
  window.iotExportCSV = async function () {
    let rows = [];
    try { rows = await (await fetch('/api/customers')).json(); }
    catch (e) { toast('Export failed — server offline?'); return; }
    if (!Array.isArray(rows) || !rows.length) { toast('No customers to export'); return; }
    const cols = ['business', 'name', 'phone', 'email', 'address', 'last_proposal_num', 'last_total', 'created_at', 'updated_at'];
    const headers = ['Business', 'Client Name', 'Phone', 'Email', 'Address', 'Last Proposal #', 'Last Total', 'Created', 'Updated'];
    const cell = function (v) {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.join(',')];
    rows.forEach(function (r) { lines.push(cols.map(function (c) { return cell(r[c]); }).join(',')); });
    const csv = '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'IOT-Techs_Customers_' + stamp + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Exported ' + rows.length + ' customer' + (rows.length !== 1 ? 's' : '') + ' to CSV');
  };

  // ── Recently-opened projects (tracked locally, most-recent first) ─────────
  const OPENED_KEY = 'iot_recent_opened';
  function getOpened() { try { return JSON.parse(localStorage.getItem(OPENED_KEY) || '[]'); } catch (e) { return []; } }
  function recordOpened(id) {
    if (!id) return;
    try {
      let list = getOpened().filter(function (x) { return x !== id; });
      list.unshift(id);                       // most-recent first
      localStorage.setItem(OPENED_KEY, JSON.stringify(list.slice(0, 12)));
    } catch (e) { /* storage off */ }
  }

  // Show the most recently-OPENED projects when the search bar is focused but empty
  async function showRecentCustomers() {
    const input = document.getElementById('customerSearch');
    const results = document.getElementById('customerSearchResults');
    const hint = document.getElementById('customerSearchHint');
    if (!input || !results || input.value.trim()) return; // only when empty
    let rows = [];
    try { rows = await (await fetch('/api/customers')).json(); } catch (e) { return; }
    if (!Array.isArray(rows) || !rows.length) return;
    const byId = {}; rows.forEach(function (c) { byId[c.id] = c; });
    // Recently-opened ids first (in open order), then fill with recently-updated
    const opened = getOpened().map(function (id) { return byId[id]; }).filter(Boolean);
    const openedIds = {}; opened.forEach(function (c) { openedIds[c.id] = true; });
    const rest = rows.filter(function (c) { return !openedIds[c.id]; });
    const list = opened.concat(rest).slice(0, 8);
    const label = opened.length ? 'RECENTLY OPENED' : 'RECENT';
    if (hint) { hint.textContent = (opened.length ? 'Recently opened projects' : 'Recent projects') + ' — start typing to search'; hint.style.color = '#234D3A'; }
    results.innerHTML =
      '<div style="font-size:9px;font-weight:800;letter-spacing:0.08em;color:#8A6A10;padding:6px 8px 2px;">' + label + '</div>' +
      list.map(function (c) {
        const title = c.business || c.name || '—';
        const sub = [c.name && c.name !== c.business ? c.name : '', c.phone].filter(Boolean).join('  ·  ');
        return '<div onmousedown="event.preventDefault()" onclick="iotLoadCustomer(' + c.id + ')" ' +
          'style="padding:9px 12px;border-radius:8px;cursor:pointer;border-bottom:1px solid #F0EBE0;">' +
            '<div style="font-weight:700;color:#1A1F2E;">' + esc(title) + '</div>' +
            (sub ? '<div style="font-size:11px;color:#6E6658;margin-top:1px;">' + esc(sub) + '</div>' : '') +
            (c.last_proposal_num ? '<div style="font-size:10px;color:#8A6A10;font-weight:600;margin-top:2px;">' + esc(c.last_proposal_num) + ' · $' + money(c.last_total) + '</div>' : '') +
          '</div>';
      }).join('');
    results.style.display = 'block';
  }

  // Inject a "Saved Proposals" button next to the customer search bar
  function injectLibraryButton() {
    if (document.getElementById('iot-library-btn')) return;
    const search = document.getElementById('customerSearch');
    if (!search) return;
    const wrap = search.closest('div[style*="position:relative"]') || search.parentElement;
    const outer = wrap ? wrap.parentElement : null;
    const btn = document.createElement('button');
    btn.id = 'iot-library-btn';
    btn.type = 'button';
    btn.onclick = window.iotOpenLibrary;
    btn.innerHTML = '<svg style="vertical-align:-2px;margin-right:6px;" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Saved Proposals';
    btn.style.cssText = 'margin-top:8px;margin-right:8px;display:inline-flex;align-items:center;padding:8px 14px;' +
      'background:linear-gradient(135deg,#2C3347,#1A1F2E);color:#C9A96E;border:1px solid #C9A96E;' +
      'border-radius:8px;font-size:12px;font-weight:700;letter-spacing:0.04em;cursor:pointer;';
    if (outer) outer.appendChild(btn);

    // Dashboard link
    const dash = document.createElement('a');
    dash.id = 'iot-dashboard-btn';
    dash.href = '/dashboard.html';
    dash.innerHTML = '<svg style="vertical-align:-2px;margin-right:6px;" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>Dashboard';
    dash.style.cssText = 'margin-top:8px;margin-right:8px;display:inline-flex;align-items:center;padding:8px 14px;text-decoration:none;' +
      'background:linear-gradient(135deg,#C9A96E,#A07840);color:#0B0F1A;border:1px solid #C9A96E;' +
      'border-radius:8px;font-size:12px;font-weight:800;letter-spacing:0.04em;cursor:pointer;';
    if (outer) outer.appendChild(dash);

    // Dispatch link
    const disp = document.createElement('a');
    disp.id = 'iot-dispatch-btn';
    disp.href = '/dispatch.html';
    disp.innerHTML = '<svg style="vertical-align:-2px;margin-right:6px;" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>Dispatch';
    disp.style.cssText = 'margin-top:8px;display:inline-flex;align-items:center;padding:8px 14px;text-decoration:none;' +
      'background:linear-gradient(135deg,#2C3347,#1A1F2E);color:#7FA98C;border:1px solid #7FA98C;' +
      'border-radius:8px;font-size:12px;font-weight:700;letter-spacing:0.04em;cursor:pointer;';
    if (outer) outer.appendChild(disp);
  }

  // If the page was opened as /?customer=ID (from the dashboard), auto-load it
  function autoLoadFromQuery() {
    try {
      const qp = new URLSearchParams(location.search);
      const id = qp.get('customer');
      const proj = qp.get('project');
      if (id && typeof window.iotLoadCustomer === 'function') {
        window.iotLoadCustomer(Number(id), proj ? Number(proj) : undefined);
        // tidy the URL so a refresh doesn't reload again
        history.replaceState(null, '', location.pathname);
      }
    } catch (e) { /* ignore */ }
  }

  // ── Google Maps address autocomplete (proxied through the server) ─────────
  // Overrides the inline searchAddress/selectAddress; falls back to the original
  // OpenStreetMap implementation when no Google key is configured.
  let _googleAddr = false, _gResults = [], _gToken = '', _gActive = false, _gTimer = null;
  const _origSearchAddress = window.searchAddress;
  const _origSelectAddress = window.selectAddress;
  function _newToken() { return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

  window.searchAddress = function (val) {
    if (!_googleAddr) return _origSearchAddress ? _origSearchAddress(val) : undefined;
    const dd = document.getElementById('addrDropdown');
    clearTimeout(_gTimer);
    try { addrSelected = -1; } catch (e) { /* shared nav index */ }
    if (!val || val.trim().length < 3) { if (dd) dd.style.display = 'none'; return; }
    if (!_gToken) _gToken = _newToken();
    if (dd) { dd.style.display = 'block'; dd.innerHTML = '<div class="addr-loading">Searching…</div>'; }
    _gTimer = setTimeout(async function () {
      try {
        const r = await (await fetch('/api/address/autocomplete?q=' + encodeURIComponent(val) + '&token=' + encodeURIComponent(_gToken))).json();
        if (r.error === 'no-key') { _googleAddr = false; if (_origSearchAddress) _origSearchAddress(val); return; }
        _gResults = r.predictions || [];
        _gActive = true;
        if (!dd) return;
        if (!_gResults.length) { dd.innerHTML = '<div class="addr-loading">No results found</div>'; return; }
        dd.innerHTML = _gResults.map(function (p, i) {
          return '<div onclick="selectAddress(' + i + ')">' +
            '<div class="addr-main">' + esc(p.main) + '</div>' +
            (p.secondary ? '<div class="addr-sub">' + esc(p.secondary) + '</div>' : '') +
            '</div>';
        }).join('');
        dd.style.display = 'block';
      } catch (e) {
        if (dd) dd.innerHTML = '<div class="addr-loading">Search unavailable</div>';
      }
    }, 280);
  };

  window.selectAddress = async function (idx) {
    if (!_gActive) return _origSelectAddress ? _origSelectAddress(idx) : undefined;
    const p = _gResults[idx];
    const dd = document.getElementById('addrDropdown');
    if (!p) { if (dd) dd.style.display = 'none'; return; }
    try {
      const d = await (await fetch('/api/address/details?placeId=' + encodeURIComponent(p.placeId) + '&token=' + encodeURIComponent(_gToken))).json();
      if (d && !d.error) {
        const parts = [d.street, d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean);
        setVal('clientAddr', parts.join(', ') || d.formatted || p.description);
        // If the picked place is a named business (a POI — not just a street
        // address), set/REPLACE the Business Name to match, even when one is
        // already filled. Plain street addresses leave Business Name untouched.
        const bizEl = document.getElementById('businessName');
        const nm = (d.name || '').trim();
        const fmt = (d.formatted || '').toLowerCase();
        const street = (d.street || '').toLowerCase();
        const looksLikeStreet = nm && (fmt.indexOf(nm.toLowerCase()) === 0 || nm.toLowerCase() === street);
        if (bizEl && nm && !looksLikeStreet) {
          bizEl.value = nm; // Google already returns proper casing
        }
      } else {
        setVal('clientAddr', p.description);
      }
    } catch (e) {
      setVal('clientAddr', p.description);
    }
    _gToken = ''; _gActive = false; _gResults = [];
    if (dd) dd.style.display = 'none';
    if (typeof autoGenProposalNum === 'function') autoGenProposalNum();
    if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
  };

  function initGoogleAddress() {
    fetch('/api/config').then(function (r) { return r.json(); })
      .then(function (c) { _googleAddr = !!(c && c.googleAddress); })
      .catch(function () { /* keep OSM fallback */ });
  }

  // ── View the document bundle in the browser (instead of downloading) ──────
  // Temporarily redirects jsPDF's save() to open the PDF in a new tab, so the
  // same bundle the Download button builds can be viewed first.
  window.iotViewBundle = async function () {
    if (!(window.jspdf && window.jspdf.jsPDF)) { toast('PDF library not loaded'); return; }
    const w = window.open('', '_blank'); // opened within the click gesture (avoids popup block)
    const proto = window.jspdf.jsPDF.prototype;
    const origSave = proto.save;
    let opened = false;
    proto.save = function () {
      try { const url = this.output('bloburl'); if (w) w.location = url; else window.open(url, '_blank'); opened = true; }
      catch (e) { try { this.output('dataurlnewwindow'); opened = true; } catch (_) {} }
      return this;
    };
    try { await window.downloadProposalBundle(); } catch (e) { /* ignore */ }
    finally { proto.save = origSave; }
    if (!opened && w) { try { w.close(); } catch (e) {} }
  };

  function injectViewButton() {
    const pdfBtn = document.getElementById('pdfBtn');
    if (!pdfBtn || document.getElementById('iot-view-btn')) return;
    const v = document.createElement('button');
    v.id = 'iot-view-btn'; v.type = 'button'; v.className = pdfBtn.className;
    v.title = 'View the document bundle in your browser';
    v.onclick = window.iotViewBundle;
    v.innerHTML = '<svg style="display:inline-block;vertical-align:middle;margin-right:7px;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span style="vertical-align:middle;">View PDF</span>';
    v.style.cssText = 'background:#2C3347;color:#C9A96E;border:1px solid #C9A96E;flex:0 0 auto;min-width:0;';
    pdfBtn.parentNode.insertBefore(v, pdfBtn.nextSibling);
  }

  // ── Submit for Signature: capture the proposal PDF, create a signing link ──
  // Captures ONLY the client-facing proposal as a base64 data URL (no download).
  window.iotCaptureProposalPDF = async function () {
    if (!(window.jspdf && window.jspdf.jsPDF)) { toast('PDF library not loaded'); return null; }
    // Preferred: draw the proposal onto a fresh doc (merged=true => no save())
    if (typeof window.generatePDF === 'function') {
      try {
        const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        await window.generatePDF(doc);
        return doc.output('datauristring');
      } catch (e) { /* fall back to bundle capture */ }
    }
    // Fallback: intercept the bundle button's save()
    const proto = window.jspdf.jsPDF.prototype, origSave = proto.save; let cap = null;
    proto.save = function () { try { cap = this.output('datauristring'); } catch (e) {} return this; };
    try { await window.downloadProposalBundle(); } catch (e) { /* ignore */ } finally { proto.save = origSave; }
    return cap;
  };

  // Save, then open this proposal exactly as the customer sees it (customer project view, via the secure token).
  window.iotOpenCustomerView = async function () {
    const ok = await window.iotSaveToDatabase();
    if (!ok || !currentCustomerId) { toast('Add a client or business name first'); return; }
    const btn = document.getElementById('custViewBtn'); const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span style="vertical-align:middle;">Opening…</span>'; }
    try {
      const pq = currentProjectId ? ('?project=' + currentProjectId) : '';
      const proj = await (await fetch('/api/project/' + currentCustomerId + pq)).json();
      if (!proj || proj.error || !proj.access_token) { toast('Could not open customer view'); return; }
      const cid = proj.customer_id || currentCustomerId, pid = proj.project_id || currentProjectId;
      const url = location.origin + '/project.html?customer=' + cid + (pid ? ('&project=' + pid) : '') +
        '&view=customer&token=' + encodeURIComponent(proj.access_token);
      window.open(url, '_blank');
      toast('Opened the customer view');
    } catch (e) { toast('Could not open customer view'); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
  };

  window.iotSubmitForSignature = async function () {
    const ok = await window.iotSaveToDatabase();
    if (!ok || !currentCustomerId) { toast('Add a client or business name first, then submit'); return; }
    const btn = document.getElementById('signSendBtn') || document.getElementById('iot-sign-btn'); const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span style="vertical-align:middle;">Generating…</span>'; }
    try {
      const data = await window.iotCaptureProposalPDF();
      if (!data) { toast('Could not generate the proposal PDF'); return; }
      const proposalNum = (document.getElementById('proposalNum') || {}).value || '';
      const total = (typeof currentGrand !== 'undefined') ? currentGrand : 0;
      const r = await fetch('/api/project/' + currentCustomerId + '/sign-request' + (currentProjectId ? ('?project=' + currentProjectId) : ''), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: (proposalNum || 'Proposal') + '.pdf', proposal_num: proposalNum, total: total,
          signer_name: (document.getElementById('clientName') || {}).value || '',
          signer_email: (document.getElementById('clientEmail') || {}).value || '', data: data
        })
      }).then(function (r) { return r.json(); });
      if (!r || !r.ok) { toast('Submit failed: ' + (r && r.error || 'unknown')); return; }
      showSignLinkModal(location.origin + r.signUrl);
    } catch (e) { toast('Submit failed — ' + (e.message || 'try again')); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
  };

  function showSignLinkModal(link) {
    const old = document.getElementById('iot-sign-modal'); if (old) old.remove();
    const m = document.createElement('div'); m.id = 'iot-sign-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(5,8,15,.72);z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;';
    m.innerHTML =
      '<div style="background:#FAF8F4;color:#0B0F1A;border-radius:14px;max-width:520px;width:100%;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6);">' +
        '<div style="background:#2C3347;color:#fff;padding:16px 20px;border-left:4px solid #C9A96E;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:14px;">Proposal Sent for Signature</div>' +
        '<div style="padding:20px;">' +
          '<p style="margin:0 0 14px;font-size:14px;color:#3a4258;line-height:1.5;">Here’s the link for the customer to review &amp; sign the proposal. Send it by text or email — they’ll see the PDF, read it, then sign.</p>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<input id="iot-sign-link" readonly value="' + link.replace(/"/g, '&quot;') + '" style="flex:1;min-width:0;font:inherit;font-size:13px;padding:11px 12px;border:1px solid #d9d4ca;border-radius:8px;background:#fff;color:#0B0F1A;">' +
            '<button id="iot-sign-copy" style="font:inherit;font-weight:700;font-size:13px;border:none;border-radius:8px;padding:11px 16px;cursor:pointer;background:#C9A96E;color:#0B0F1A;">Copy</button>' +
          '</div>' +
          '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">' +
            '<a href="' + link + '" target="_blank" rel="noopener" style="font:inherit;font-weight:700;font-size:13px;text-decoration:none;border:1px solid #d9d4ca;border-radius:8px;padding:11px 16px;color:#2C3347;background:#eceae4;">Open link</a>' +
            '<button id="iot-sign-done" style="font:inherit;font-weight:700;font-size:13px;border:none;border-radius:8px;padding:11px 18px;cursor:pointer;background:#1f6b4f;color:#fff;">Done</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.onclick = function (e) { if (e.target === m) m.remove(); };
    document.getElementById('iot-sign-done').onclick = function () { m.remove(); };
    document.getElementById('iot-sign-copy').onclick = function () {
      const inp = document.getElementById('iot-sign-link'); inp.select();
      navigator.clipboard.writeText(link).then(function () { toast('Link copied'); })
        .catch(function () { try { document.execCommand('copy'); toast('Link copied'); } catch (e) {} });
    };
  }

  function injectSignButton() {
    const pdfBtn = document.getElementById('pdfBtn');
    if (!pdfBtn || document.getElementById('iot-sign-btn')) return;
    const v = document.createElement('button');
    v.id = 'iot-sign-btn'; v.type = 'button'; v.className = pdfBtn.className;
    v.title = 'Generate the proposal PDF and create a signing link for the customer';
    v.onclick = window.iotSubmitForSignature;
    v.innerHTML = '<span style="vertical-align:middle;display:inline-flex;align-items:center;gap:6px;"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>Submit for Signature</span>';
    v.style.cssText = 'background:#1f6b4f;color:#fff;border:1px solid #1f6b4f;flex:0 0 auto;min-width:0;';
    const anchor = document.getElementById('iot-view-btn') || pdfBtn;
    anchor.parentNode.insertBefore(v, anchor.nextSibling);
  }

  // ── Replace the "UI preview" hint text on load with the real one ──────────
  // Apply the editable Standard Costs (price book) to the calculator's default item prices.
  // Only used for a FRESH proposal — a loaded/saved proposal keeps its own prices.
  window.iotApplyPriceBook = async function () {
    try {
      const book = await (await fetch('/api/pricebook')).json();
      if (!book || typeof SECTIONS === 'undefined') return;
      const map = {};
      ['camera', 'speaker'].forEach(function (cat) { (book[cat] || []).forEach(function (it) { if (it && it.desc) map[it.desc] = Number(it.price) || 0; }); });
      ['labor', 'equipment', 'conduit'].forEach(function (sec) {
        ((SECTIONS[sec] && SECTIONS[sec].items) || []).forEach(function (it) { if (it.desc in map) it.price = map[it.desc]; });
      });
      if (typeof renderAll === 'function') renderAll();
      if (typeof recalc === 'function') recalc();
    } catch (e) { /* ignore — keep built-in defaults */ }
  };

  function initHint() {
    initGoogleAddress();
    injectViewButton();
    injectSignButton();
    const hint = document.getElementById('customerSearchHint');
    if (hint) hint.textContent = 'Search saved customers by name, business, phone, email, or address';
    injectLibraryButton();
    const input = document.getElementById('customerSearch');
    if (input && !input.dataset.iotFocusWired) {
      input.dataset.iotFocusWired = '1';
      input.addEventListener('focus', showRecentCustomers);
    }
    // Auto-save: listen for any form edit (delegated), debounced inside scheduleAutoSave
    if (!document.body.dataset.iotAutoWired) {
      document.body.dataset.iotAutoWired = '1';
      document.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'customerSearch') return; // ignore the lookup box
        scheduleAutoSave();
      });
      document.addEventListener('change', function () { scheduleAutoSave(); });
    }
    const hasCustomerQuery = !!new URLSearchParams(location.search).get('customer');
    autoLoadFromQuery();
    if (!hasCustomerQuery) window.iotApplyPriceBook();   // fresh proposal → use current standard costs
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHint);
  else initHint();

  console.log('[iot-db] database integration loaded');
})();
