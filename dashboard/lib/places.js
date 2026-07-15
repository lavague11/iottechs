// Google Places Autocomplete loader — shared by every address / business-name intake form.
// Loads the Maps JS API (places library) once, using the key served by /api/config, and attaches
// a classic Autocomplete to an <input>. Fails silently if no key is set, so forms keep working as
// plain text inputs. The key must have the "Places API" + "Maps JavaScript API" enabled and be
// referrer-restricted to your domain.

let _loading = null;

export function loadPlaces() {
  if (typeof window === "undefined") return Promise.reject(new Error("no-window"));
  // Only truly "ready" once the Places library (with Autocomplete) is actually present.
  if (window.google?.maps?.places?.Autocomplete) return Promise.resolve(window.google.maps.places);
  if (_loading) return _loading;
  _loading = (async () => {
    const cfg = await fetch("/api/config").then((r) => r.json()).catch(() => ({}));
    const key = cfg?.googleMapsApiKey;
    if (!key) throw new Error("no-maps-key");
    // Inject the Maps JS bootstrap once (fixed id → shared by every form, never double-loads).
    if (!document.getElementById("iot-gmaps-js")) {
      const s = document.createElement("script");
      s.id = "iot-gmaps-js";
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async`;
      s.async = true;
      document.head.appendChild(s);
    }
    // CRITICAL: with `loading=async`, the API finishes initialising ~a tick AFTER the script's load
    // event — at onload neither `google.maps.places` nor `google.maps.importLibrary` exist yet
    // (measured: both appear ~100ms later). The old code returned `google.maps.places` right at
    // onload → it was `undefined`, so `new places.Autocomplete()` threw and autocomplete silently
    // died on any page that hadn't already loaded Maps (i.e. every intake form on the dashboard).
    // Poll until Places is actually ready, then hand back the real library.
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (window.google?.maps?.places?.Autocomplete) return window.google.maps.places;
      if (typeof window.google?.maps?.importLibrary === "function") {
        const lib = await window.google.maps.importLibrary("places");
        if (lib?.Autocomplete) return lib;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("places-not-ready");
  })();
  // On failure, drop the cached promise so a later attempt (transient network, late key) can retry.
  _loading.catch(() => { _loading = null; });
  return _loading;
}

// Attach autocomplete to an input. onPlace receives { name, address } for the selected place.
// types: ["address"] for address fields, ["establishment"] for a business-name field.
// Returns a cleanup function.
export function attachAutocomplete(input, { types = ["address"], onPlace } = {}) {
  let ac = null, cancelled = false;
  loadPlaces().then((places) => {
    if (cancelled || !input || !places?.Autocomplete) return;
    ac = new places.Autocomplete(input, { types, fields: ["formatted_address", "name"] });
    ac.addListener("place_changed", () => {
      const p = ac.getPlace();
      if (p) onPlace?.({ name: p.name || "", address: p.formatted_address || "" });
    });
    // Stop the browser autofill dropdown from fighting the Places dropdown.
    input.setAttribute("autocomplete", "off");
  }).catch(() => { /* no key / offline — input stays a normal text field */ });
  return () => {
    cancelled = true;
    try { if (ac && window.google?.maps?.event) window.google.maps.event.clearInstanceListeners(ac); } catch (_) {}
  };
}
