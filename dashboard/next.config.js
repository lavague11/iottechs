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
  // The camera-mockup tool syncs its photo grid (data-URL images) to the server via a server
  // action; the 1MB default rejects any real photo set, silently breaking Submit. localStorage
  // caps the blob near ~5MB, so 8MB gives comfortable headroom.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  async rewrites() {
    return [
      { source: "/", destination: "/home.html" },
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
