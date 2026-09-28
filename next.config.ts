import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }];
  },
};

export default nextConfig;
