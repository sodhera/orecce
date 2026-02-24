import type { NextConfig } from "next";
import path from "path";

const localApiBaseUrl = "http://localhost:8080";

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "..", ".."),
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
