/** @type {import('next').NextConfig} */
const nextConfig = {
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
