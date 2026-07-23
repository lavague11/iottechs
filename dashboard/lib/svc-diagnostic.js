// TRACE — customer self-diagnostic decision tree, ported from cctv-diagnostic.html (the `cust`
// tree + HOME_CUSTOMER cards). Customer mode only: safe checks from outside the recorder — look at
// the camera, check the internet, restart the recorder. Every path ends in `solved` (Resolved) or
// `service` (Book a service call). Rules preserved: first option continues, second option is the
// answer; easy checks before hard; the flow reads the monitor at the recorder first.
//
// Topology assumption (do not reintroduce switch/injector logic): Cat6 PoE cameras wired direct
// into the NVR PoE ports. See TRACE-handoff.md.

export const SVC_DIAG_ENTRIES = [
  { start: "m_other", title: "On the monitor", hint: "The screen at the recorder" },
  { start: "p_net",   title: "On my phone",    hint: "The app won't show them" },
  { start: "b_count", title: "Both",           hint: "Monitor and phone" },
];

export const SVC_DIAG_NODES = {
  /* --- entry: on the monitor --- */
  m_other: { q: "On the monitor at the recorder, are the other cameras showing normally?", options: [
    { label: "Yes — just one or two are missing", next: "c_look" },
    { label: "No — the whole screen is black or blank", next: "m_screen" }] },
  m_screen: { q: "Check the monitor itself — is it switched on, and is the cable pushed all the way in at both ends?", options: [
    { label: "Still nothing on the screen", next: "m_reboot" },
    { label: "That fixed it", next: "c_solved" }] },
  m_reboot: { q: "Unplug the recorder's power for 30 seconds, plug it back in, and give it 2 minutes. Anything on screen now?", options: [
    { label: "Still nothing", next: "c_service" },
    { label: "It's back", next: "c_solved" }] },

  /* --- entry: on my phone --- */
  p_net: { q: "Is your internet working right now? (other things online at the property)", widget: "speed", options: [
    { label: "Internet is working", next: "p_app" },
    { label: "Internet is down", next: "c_internet" }] },
  p_app: { q: "Close the app all the way and open it again. Working now?", options: [
    { label: "Still not working", next: "p_reboot" },
    { label: "Yes, it's working", next: "c_solved" }] },
  p_reboot: { q: "Unplug the recorder's power for 30 seconds, plug it back in, and give it 2 minutes. Working now?", options: [
    { label: "Still not working", next: "c_service" },
    { label: "Yes, it's working", next: "c_solved" }] },

  /* --- entry: both --- */
  b_count: { q: "How many cameras aren't working?", options: [
    { label: "Just one", next: "c_look" },
    { label: "A few or all of them", next: "b_net" }] },
  b_net: { q: "Is your internet working right now? (other things online at the property)", widget: "speed", options: [
    { label: "Internet is working", next: "c_reboot" },
    { label: "Internet is down", next: "c_internet" }] },

  /* --- shared --- */
  c_look: { q: "Look at that camera — is anything covering it, or has it been hit or knocked loose?", options: [
    { label: "It looks normal", next: "c_reboot" },
    { label: "Something looks wrong with it", next: "c_damage" }] },
  c_reboot: { q: "Unplug the recorder's power for 30 seconds, plug it back in, and give it 2 minutes. Any change?", options: [
    { label: "Still not working", next: "c_service" },
    { label: "It's back", next: "c_solved" }] },

  c_damage: { type: "fix", route: "service", title: "The camera needs a visit",
    detail: "If a camera is damaged, hanging, or has been hit, we'll need to come out and look at it. Send us a photo if you can — it helps us bring the right parts." },
  c_internet: { type: "fix", route: "solved", title: "Get the internet back first",
    detail: "The cameras need the internet to reach your phone. Restart your router and give it a few minutes. Once other things are back online, check the cameras again." },
  c_solved: { type: "fix", route: "solved", title: "You're all set",
    detail: "That cleared it. If it happens again, let us know — it may need a proper look." },
  c_service: { type: "fix", route: "service", title: "We'll send a technician",
    detail: "You've done everything worth trying from your end. Send this report over and we'll schedule a service call." },
};

export const SVC_ROUTE_LABEL = { solved: "Resolved", service: "Book a service call" };
