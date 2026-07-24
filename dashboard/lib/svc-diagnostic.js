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

export const SVC_ROUTE_LABEL = {
  solved: "Resolved", service: "Book a service call",
  field: "Field fix", replace: "Replace hardware", escalate: "Escalate · senior tech",
};

// ---- TECHNICIAN mode — full diagnostic, ported from cctv-diagnostic.html (camera / dropout /
// nvr trees). Opens the box: channel status, playback, cable tester, jumper, resets, escalation.
// Cross-tree `goto` lets a flow hand off mid-diagnosis (e.g. dropout cable faults -> camera.tester_nvr).
export const SVC_TECH_ENTRIES = [
  { key: "camera", title: "Camera issue", hint: "One or more cameras" },
  { key: "dropout", title: "Camera cutting out", hint: "Drops in and out" },
  { key: "nvr", title: "NVR issue", hint: "Recording, display or phone" },
  { key: "nvr", start: "nvron", title: "Everything down", hint: "All cameras offline at once" },
];

export const SVC_TECH_TREES = {
  camera: {
    label: "Camera issue", root: "oneall",
    nodes: {
      oneall: { q: "How many cameras are down?", options: [
        { label: "Just 1 camera", next: "status" },
        { label: "A few (2–3)", next: "group" },
        { label: "All of them", next: "fix_all" }] },
      fix_all: { type: "fix", route: "escalate", title: "All down = NVR problem",
        detail: "If every camera is offline at once, it isn't the cameras — it's the NVR. Run the NVR checks.", goto: { tree: "nvr", node: "nvron" } },
      group: { q: "Are those cameras together, or separate?", options: [
        { label: "Separate / spread out", next: "status" },
        { label: "Together in one spot", next: "fix_grouparea" }] },
      fix_grouparea: { type: "fix", route: "field", title: "Shared cause in that spot",
        detail: "Cameras down together usually share a cause — a damaged bundle, a pulled run, or local power. Check that spot's cabling and connections, then work each camera one at a time from here." },
      status: { q: "Start at the NVR monitor. What does that camera's channel say?", options: [
        { label: "No signal / black", next: "playback" },
        { label: "Password incorrect", next: "fix_pass" },
        { label: "Network error", next: "fix_neterror" },
        { label: "Detecting… (stuck)", next: "fix_detecting" }] },
      fix_pass: { type: "fix", route: "field", title: "Password mismatch",
        detail: "The NVR and camera passwords don't match. Re-enter the camera password on that channel, or factory reset the camera so it takes the NVR's default. Common after a firmware update." },
      fix_neterror: { type: "fix", route: "field", title: "Factory reset the camera",
        detail: "A network error is the camera's IP settings. Hold the camera's reset button to factory-reset it, let the NVR re-detect it, then re-activate the channel." },
      fix_detecting: { type: "fix", route: "field", title: "Stuck detecting",
        detail: "Re-seat the camera at the NVR port and give it a minute, then delete and re-add the channel. Still stuck → factory reset the camera." },
      playback: { q: "Still at the NVR — check playback. Is there footage from before it went offline?", options: [
        { label: "Yes, it recorded before", next: "tester_nvr" },
        { label: "No footage — never worked", next: "fix_never" }] },
      fix_never: { type: "fix", route: "field", title: "It never came up",
        detail: "No footage at all means it was never set up right, not that it failed. Re-add and activate the channel and make the passwords match. If it still won't come up, run the cable test.", goto: { tree: "camera", node: "tester_nvr" } },
      tester_nvr: { q: "It worked before, so something failed since. Plug the tester in at the NVR side, then walk out to the camera.", options: [
        { label: "At the camera — next", next: "inspect" }] },
      inspect: { q: "Inspect the connection at the camera. How does it look?", options: [
        { label: "Looks clean", next: "tester_read" },
        { label: "Burnt or damaged", next: "fix_burns" },
        { label: "Wet or knocked loose", next: "fix_weather" }] },
      fix_burns: { type: "fix", route: "replace", title: "Burnt — patch or replace",
        detail: "Take a photo for the record. The cable's damaged — patch or replace it and re-terminate both ends before it goes back in service." },
      fix_weather: { type: "fix", route: "field", title: "Weather or loose connection",
        detail: "Dry it out and re-seat the connector firmly, then reseal with a weatherproof cap and grease. Re-check the channel. If it keeps dropping, re-terminate that end." },
      tester_read: { q: "Plug the tester remote in at the camera — does the run pass?", options: [
        { label: "Passes clean", next: "fix_camera" },
        { label: "Fails", next: "fix_cable" }] },
      fix_cable: { type: "fix", route: "replace", title: "Cable is bad",
        detail: "The tester failed — the run is the fault. Patch or replace the cable and re-terminate both ends, then re-test." },
      fix_camera: { type: "fix", route: "escalate", title: "It's the camera",
        detail: "Cable tests good end to end. Confirm with a jumper at the NVR — if it comes up on the jumper, it's the run after all. Dead on the jumper too → factory reset the camera, and if it still won't come up, contact your supervisor to replace it." },
    },
  },
  dropout: {
    label: "Camera cutting out", root: "on_now",
    nodes: {
      on_now: { q: "Is that camera on right now, or offline?", options: [
        { label: "It's on right now", next: "tl_gaps" },
        { label: "It's offline right now", next: "tl_last" }] },
      tl_gaps: { q: "Open playback and scroll the last 7 days. On the 24-hour timeline, when are the gaps?", options: [
        { label: "Only after dark", next: "fix_night" },
        { label: "Same time every day", next: "fix_sched" },
        { label: "Random, no pattern", next: "fix_random" },
        { label: "No gaps — only live view drops", next: "fix_livedrop" }] },
      tl_last: { q: "Scroll playback back to the last footage from that camera. When did it stop?", options: [
        { label: "Normal time / no pattern", next: "tl_before" },
        { label: "It cut off after dark", next: "fix_night" },
        { label: "Never had any footage", next: "fix_neverworked" }] },
      tl_before: { q: "Before it stopped for good — was it dropping in and out on the timeline, or solid right up until it died?", options: [
        { label: "It was dropping in and out first", next: "fix_degrade" },
        { label: "Solid, then stopped dead", next: "fix_sudden" }] },
      fix_night: { type: "fix", route: "field", title: "IR load — it's the power",
        detail: "Dropping after dark means the IR LEDs kick in and the draw spikes. That's a marginal run: check the length (near 100m is too far), re-terminate both ends, and move it to another NVR port. If it holds all day and only fails at night, the cable is the suspect, not the camera.", goto: { tree: "camera", node: "tester_nvr" } },
      fix_sched: { type: "fix", route: "field", title: "Something scheduled",
        detail: "Same time every day is never a coincidence. Check the NVR's reboot schedule and any reboot timer on the camera, then find out what else is on that circuit — a timer, a light, or equipment that kicks on at that hour." },
      fix_random: { type: "fix", route: "field", title: "Physical — run the cable test",
        detail: "Random gaps with no pattern are almost always physical: water in a connector, a marginal termination, or a damaged run. Go test it.", goto: { tree: "camera", node: "tester_nvr" } },
      fix_livedrop: { type: "fix", route: "field", title: "Bandwidth, not the camera",
        detail: "Playback is complete but live view drops — that's the stream, not the camera. Lower the bitrate or view the sub-stream, and check the NVR isn't over its throughput with every channel running." },
      fix_degrade: { type: "fix", route: "replace", title: "The run is failing",
        detail: "Dropping in and out before it died is a run going bad — water working into a connector or a damaged cable. Test it, then patch or replace and re-terminate both ends.", goto: { tree: "camera", node: "tester_nvr" } },
      fix_sudden: { type: "fix", route: "field", title: "Something happened",
        detail: "Solid then dead means an event, not wear — a pulled cable, a dead port, or work done nearby. Move it to another NVR port first, then run the cable test.", goto: { tree: "camera", node: "tester_nvr" } },
      fix_neverworked: { type: "fix", route: "field", title: "It never came up",
        detail: "No footage at all means it was never set up right, not that it failed. Start at the NVR channel and work forward.", goto: { tree: "camera", node: "status" } },
    },
  },
  nvr: {
    label: "NVR issue", root: "what",
    nodes: {
      what: { q: "What's the NVR doing?", options: [
        { label: "Not recording", next: "rec" },
        { label: "Playback is black / won't play", next: "pb" },
        { label: "Not on the phone at all", next: "nvron" },
        { label: "Was on the phone, now offline", next: "nvron" }] },
      pb: { q: "Live view works, but playback comes up black?", options: [
        { label: "Yes — live's fine, playback's black", next: "fix_pbstream" },
        { label: "No footage found for that time", next: "fix_pbnone" }] },
      fix_pbstream: { type: "fix", route: "field", title: "Playback stream or disk",
        detail: "Play the main stream (not the sub-stream), and play it on the NVR's own monitor to rule out the app. Still black → run a disk check in the NVR — bad sectors corrupt playback, and the drive may need replacing." },
      fix_pbnone: { type: "fix", route: "field", title: "Nothing was recorded",
        detail: "No footage for that window means it wasn't recording then. Run the recording checks — schedule armed, overwrite on, healthy drive.", goto: { tree: "nvr", node: "rec" } },
      rec: { q: "Storage — is a healthy drive showing in the NVR?", options: [
        { label: "No drive / disk error", next: "fix_hdd" },
        { label: "Drive looks fine", next: "fix_recsched" }] },
      fix_hdd: { type: "fix", route: "replace", title: "Replace the drive",
        detail: "Swap in a surveillance-rated HDD and re-initialize / format it in the NVR so it starts recording." },
      fix_recsched: { type: "fix", route: "field", title: "Check the recording setup",
        detail: "Confirm the schedule is armed and overwrite is on for that channel, and the channel is actually set to record — not just live view." },
      nvron: { q: "Is the NVR powered on? (lights on the box)", options: [
        { label: "Yes, it's on", next: "display" },
        { label: "No — no lights / dead", next: "fix_power" }] },
      fix_power: { type: "fix", route: "escalate", title: "NVR has no power",
        detail: "Check the outlet, power brick, and surge strip, and reseat the power connector. If it still won't power on, contact your supervisor." },
      display: { q: "NVR's powered on — is there a picture on the monitor?", options: [
        { label: "Yes, picture's up", next: "net" },
        { label: "No picture / black screen", next: "disp_hdmi" }] },
      disp_hdmi: { q: "Swap in another HDMI cable — picture now?", options: [
        { label: "Still nothing", next: "disp_vga" },
        { label: "Yes, works now", next: "fix_hdmibad" }] },
      fix_hdmibad: { type: "fix", route: "replace", title: "HDMI cable was bad",
        detail: "The old HDMI cable was the problem. Replace it and you're good." },
      disp_vga: { q: "Try a VGA cable instead — picture now?", options: [
        { label: "Still nothing", next: "disp_alt" },
        { label: "Yes, VGA works", next: "fix_vgaworks" }] },
      fix_vgaworks: { type: "fix", route: "field", title: "NVR's HDMI output is bad",
        detail: "VGA works, so the NVR's HDMI port has failed. Run on VGA for now and flag the HDMI output for service." },
      disp_alt: { q: "Try a different monitor entirely — any picture?", options: [
        { label: "Yes, other monitor works", next: "fix_screenport" },
        { label: "Still nothing on any display", next: "fix_nvrvideo" }] },
      fix_screenport: { type: "fix", route: "replace", title: "The monitor was bad",
        detail: "A different display works → the original monitor's input port is damaged. Swap the monitor." },
      fix_nvrvideo: { type: "fix", route: "escalate", title: "It's the NVR",
        detail: "No picture on any cable or any display — the NVR's video output is dead. Contact your supervisor." },
      net: { q: "Is the internet online? (router up, other devices working)", options: [
        { label: "Internet is fine", next: "netgood" },
        { label: "Internet is down", next: "fix_net" }] },
      fix_net: { type: "fix", route: "field", title: "Internet is down",
        detail: "The NVR can't reach the phone app without internet. Reboot the router and restore the connection. If it's an ISP outage, it'll come back on its own." },
      netgood: { q: "Is the network good? (router on, other devices online, NVR pulling an IP)", widget: "speed", options: [
        { label: "Network is fine", next: "cabletest" },
        { label: "Network looks bad", next: "fix_network" }] },
      fix_network: { type: "fix", route: "field", title: "Fix the network first",
        detail: "Reboot the router / gateway and confirm other devices are online. Make sure the NVR is pulling an IP on the same network. Restore the network, then re-check the app." },
      cabletest: { q: "Run a cable test on the NVR-to-router line — does it pass?", options: [
        { label: "Passes clean", next: "simple" },
        { label: "Fails / bad wire map", next: "fix_cabletest" }] },
      fix_cabletest: { type: "fix", route: "field", title: "Re-terminate or replace the cable",
        detail: "The run failed the tester — a bad pair or termination. Re-terminate both ends or re-pull the line, confirm all pairs and the link light, then re-test before moving on." },
      simple: { q: "Power-cycle the NVR (simple reset). Back on the phone now?", options: [
        { label: "Still not there", next: "factory" },
        { label: "Yes, it's back", next: "fix_simpledone" }] },
      fix_simpledone: { type: "fix", route: "field", title: "Simple reset did it",
        detail: "A power-cycle cleared it. If it drops again soon, move on to a factory reset." },
      factory: { q: "Factory reset the NVR and re-add it in the phone app. Working now?", options: [
        { label: "Yes, working", next: "fix_factorydone" },
        { label: "Still not working", next: "fix_super" }] },
      fix_factorydone: { type: "fix", route: "field", title: "Factory reset fixed it",
        detail: "Re-add complete. Note that it needed a full reset in case it recurs." },
      fix_super: { type: "fix", route: "escalate", title: "Contact your supervisor",
        detail: "You've run the full ladder — power, internet, cable, simple reset, factory reset. Escalate to your supervisor with everything you've tried." },
    },
  },
};
