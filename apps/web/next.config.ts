import type { NextConfig } from "next";
import path from "path";

const localApiBaseUrl = "http://localhost:8080";

// Absolute path to the shared API services source, resolved from this file's
// location (apps/web/next.config.ts ➜ ../../services/api/functions/src).
const apiSrc = path.join(__dirname, "..", "..", "services", "api", "functions", "src");

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

const nextConfig: NextConfig = {
  // Turbopack alias — used for both dev and production Turbopack builds.
  turbopack: {
    resolveAlias: {
      "@api": apiSrc,
    },
  },

  // Webpack alias — fallback for any non-Turbopack builds.
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      "@api": apiSrc,
    };
    return config;
  },

  async rewrites() {
    const configuredApiBaseUrl =
      process.env.API_BACKEND_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

    const apiBaseUrl =
      normalizeBaseUrl(configuredApiBaseUrl ?? localApiBaseUrl);
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBaseUrl}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
