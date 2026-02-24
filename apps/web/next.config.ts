import type { NextConfig } from "next";

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

const localApiBaseUrl = "http://localhost:8080";

const nextConfig: NextConfig = {
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

