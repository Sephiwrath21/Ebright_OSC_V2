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
  // Server-only deps of the task-manager engine — never bundle these.
  serverExternalPackages: ["bullmq", "ioredis"],
  experimental: {
    serverActions: {
      // Multi-document claims allow up to MAX_CLAIM_DOCS (10) files at 5MB each,
      // so the Server Action body must accommodate the full batch + overhead.
      bodySizeLimit: "55mb",
    },
  },
  async rewrites() {
    // CEP (apps/cep) runs as its own fully isolated Next.js 14/React 18/Prisma 6
    // process on its own SQLite DB — see AGENTS.md merge notes. This rewrite
    // makes its pages reachable same-origin under /cep-embed/* so the SMS > CEP
    // iframe (src/app/dashboards/sms/cep) can embed it without cross-origin
    // issues. CEP_APP_ORIGIN lets prod point at wherever that process is deployed.
    const cepOrigin = process.env.CEP_APP_ORIGIN ?? "http://localhost:3010";
    return [
      {
        source: "/cep-embed/:path*",
        destination: `${cepOrigin}/cep-embed/:path*`,
      },
    ];
  },
};

export default nextConfig;
