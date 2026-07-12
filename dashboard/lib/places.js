// Google Places Autocomplete loader — shared by every address / business-name intake form.
// Loads the Maps JS API (places library) once, using the key served by /api/config, and attaches
// a classic Autocomplete to an <input>. Fails silently if no key is set, so forms keep working as
// plain text inputs. The key must have the "Places API" + "Maps JavaScript API" enabled and be
// referrer-restricted to your domain.

let _loading = null;

export function loadPlaces() {
  if (typeof window === "undefined") return Promise.reject(new Error("no-window"));
  if (window.google?.maps?.places) return Promise.resolve(window.google.maps.places);
  if (_loading) return _loading;
  _loading = (async () => {
    const cfg = await fetch("/api/config").then((r) => r.json()).catch(() => ({}));
    const key = cfg?.googleMapsApiKey;
    if (!key) throw new Error("no-maps-key");
    if (!window.google?.maps?.places) {
      await new Promise((res, rej) => {
        const existing = document.getElementById("iot-gmaps-js");
        if (existing) { existing.addEventListener("load", res); existing.addEventListener("error", rej); return; }
        const s = document.createElement("script");
        s.id = "iot-gmaps-js";
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async`;
        s.async = true;
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    return window.google.maps.places;
  })();
  return _loading;
}

// Attach autocomplete to an input. onPlace receives { name, address } for the selected place.
// types: ["address"] for address fields, ["establishment"] for a business-name field.
// Returns a cleanup function.
export function attachAutocomplete(input, { types = ["address"], onPlace } = {}) {
  let ac = null, cancelled = false;
  loadPlaces().then((places) => {
    if (cancelled || !input) return;
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
