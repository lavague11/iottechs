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
};

module.exports = nextConfig;
