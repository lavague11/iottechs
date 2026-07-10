/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/home.html" },
    ];
  },
};

module.exports = nextConfig;
