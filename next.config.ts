import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tempfile.redpandaai.co",
      },
    ],
  },
};

export default nextConfig;
