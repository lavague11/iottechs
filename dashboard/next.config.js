// Which commit is this build? Render sets RENDER_GIT_COMMIT; Hostinger's Git deploy sets nothing, so
// read the repo at build time. Inlined through `env` so the running server (which may sit in a copied
// hbuilds/versions/<hash> folder without .git) still knows. /api/health echoes it.
function gitCommit() {
  try { return require("child_process").execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}
const GIT_COMMIT = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || gitCommit();

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { GIT_COMMIT, BUILT_AT: new Date().toISOString() },
  // Hide the dev-only on-screen build indicator (bottom-right). It floats above everything (z-index
  // ~99999) and sat on top of the full-screen signer's Finish button, making it hard to click while
  // testing. Dev-only — production never renders it; this just keeps full-screen overlays usable in dev.
  devIndicators: false,
  // The camera-mockup tool syncs its photo grid (data-URL images) to the server via a server
  // action; the 1MB default rejects any real photo set, silently breaking Submit. localStorage
  // caps the blob near ~5MB, so 8MB gives comfortable headroom.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  async rewrites() {
    return [
      { source: "/", destination: "/home.html" },
      // BYS "Build Your System" — one shell, many verticals. /build = cameras (default); /build/<vertical>
      // (e.g. /build/pos) serves the same shell, which loads /widgets/bys/<vertical>-spec.js by the path.
      { source: "/build", destination: "/widgets/cctv-quote-calculator.html" },
      { source: "/build/:vertical", destination: "/widgets/cctv-quote-calculator.html" },
      { source: "/quote", destination: "/widgets/cctv-quote-calculator.html" },
      // BYS picker — one page that lists every "Build Your <X> System" builder.
      { source: "/systems", destination: "/bys-index.html" },
    ];
  },
  // Tell browsers to forget any advertised HTTP/3 (QUIC) endpoint. LiteSpeed advertises
  // `alt-svc: h3=":443"`, and QUIC to it flakes for some networks → "This page couldn't load"
  // (notably on the logout → home navigation). `Alt-Svc: clear` forces browsers back to HTTP/2.
  async headers() {
    return [
      { source: "/:path*", headers: [{ key: "Alt-Svc", value: "clear" }] },
    ];
  },
};

module.exports = nextConfig;
