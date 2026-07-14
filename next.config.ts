import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this project. Otherwise auto-detection walks up
  // and finds C:\Users\ernie\package-lock.json, mis-roots the build, and
  // every /api/* route 404s (next-auth then crashes on the HTML response).
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      // Multi-document claims allow up to MAX_CLAIM_DOCS (10) files at 5MB each,
      // so the Server Action body must accommodate the full batch + overhead.
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
