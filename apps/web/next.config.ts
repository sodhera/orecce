import type { NextConfig } from "next";
import path from "path";

const localApiBaseUrl = "http://localhost:8080";

// Monorepo root (two levels up from apps/web)
const monorepoRoot = path.join(__dirname, "..", "..");
const apiSrc = path.join(monorepoRoot, "services", "api", "functions", "src");

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

const nextConfig: NextConfig = {
  turbopack: {
    root: monorepoRoot,
  },

  webpack(config) {
    // Mirror the @api tsconfig path alias for webpack (used in prod builds).
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
