/** @type {import('next').NextConfig} */
const nextConfig = {
  // Reverse-proxied under the portal at /cep-embed (see portal's next.config.ts
  // rewrites + src/app/dashboards/sms/cep). basePath makes CEP's own internal
  // links and /_next/* asset URLs resolve correctly through that proxy prefix.
  // When running this app standalone for CEP-only dev, routes are now under
  // http://localhost:3010/cep-embed/... instead of the bare path.
  basePath: "/cep-embed",
  experimental: {
    // Enables ./instrumentation.ts — used to boot the auto-blast scheduler.
    // (Becomes default in Next.js 15; explicit here for Next 14.2.)
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        stream: false,
        net: false,
        tls: false,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;