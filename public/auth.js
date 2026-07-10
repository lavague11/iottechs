// Page guard. A page sets window.IOT_REQUIRE before loading this:
//   'admin'   — admins only
//   'manager' — admin + manager (operations pages)
//   'staff'   — admin + manager + tech
//   'public'  — no redirect (page decides; e.g. customer token links)
// Enforcement only kicks in once at least one account exists (authEnabled).
(function () {
  var REQUIRE = window.IOT_REQUIRE || 'staff';
  function roleOk(role) {
    if (REQUIRE === 'public') return true;
    if (REQUIRE === 'admin') return role === 'admin';
    if (REQUIRE === 'manager') return role === 'admin' || role === 'manager';
    if (REQUIRE === 'staff') return role === 'admin' || role === 'manager' || role === 'tech';
    return false;
  }
  function homeFor(u) {
    if (!u) return '/login.html';
    if (!u.roles || !u.roles.length) return '/pending.html';
    if (u.role === 'customer' && u.customer_id) return '/project.html?customer=' + u.customer_id + '&view=customer';
    return '/home.html';
  }
  fetch('/api/me').then(function (r) { return r.json(); }).then(function (d) {
    window.IOT_AUTH = d; window.IOT_USER = d.user || null;
    if (d.authEnabled && REQUIRE !== 'public') {
      if (!d.user) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); return; }
      if (!d.user.roles || !d.user.roles.length) { if (location.pathname !== '/pending.html') location.href = '/pending.html'; return; }
      if (!roleOk(d.user.role)) { location.href = homeFor(d.user); return; }
    }
    document.dispatchEvent(new CustomEvent('iot-auth', { detail: d }));
    if (d.user) chip(d.user);
  }).catch(function () { /* server unreachable — leave the page as-is */ });

  function chip(user) {
    function add() {
      if (document.getElementById('iot-userchip')) return;
      var roles = user.roles || [user.role];
      var label = roleName(user.role);
      var switcher = '';
      if (roles.length > 1) {
        switcher = '<select id="iot-roleswitch" title="Switch role" style="background:#0B0F1A;border:1px solid #C9A96E;color:#C9A96E;border-radius:12px;padding:3px 6px;font:inherit;cursor:pointer;">' +
          roles.map(function (r) { return '<option value="' + r + '"' + (r === user.role ? ' selected' : '') + '>' + roleName(r) + '</option>'; }).join('') + '</select>';
        label = '';
      }
      var c = document.createElement('div'); c.id = 'iot-userchip';
      c.style.cssText = 'position:fixed;top:10px;right:12px;z-index:99999;display:flex;align-items:center;gap:8px;background:rgba(11,15,26,.88);border:1px solid #2a3247;border-radius:20px;padding:5px 6px 5px 13px;font:600 11px Helvetica,Arial,sans-serif;color:#cfd5e0;box-shadow:0 6px 20px rgba(0,0,0,.4);';
      c.innerHTML = '<span>' + esc(user.name || user.username) + (label ? ' · ' + label : '') + '</span>' + switcher +
        '<button id="iot-logout" style="background:#2C3347;border:1px solid #C9A96E;color:#C9A96E;border-radius:14px;padding:4px 11px;font:inherit;cursor:pointer;">Logout</button>';
      document.body.appendChild(c);
      document.getElementById('iot-logout').onclick = function () { fetch('/api/logout', { method: 'POST' }).then(function () { location.href = '/login.html'; }); };
      var sw = document.getElementById('iot-roleswitch');
      if (sw) sw.onchange = function () {
        fetch('/api/switch-role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: sw.value }) })
          .then(function (r) { return r.json(); }).then(function (r) { if (r.ok) location.href = homeFor(r.user); });
      };
    }
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  }
  function roleName(r) { return r === 'admin' ? 'Admin' : r === 'manager' ? 'Manager' : r === 'tech' ? 'Tech' : r === 'customer' ? 'Customer' : 'Pending'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }
})();
