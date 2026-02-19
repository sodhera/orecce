import type { NextConfig } from "next";

const defaultApiBaseUrl = "https://api-2ljiuwaa3a-uc.a.run.app";

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

const nextConfig: NextConfig = {
  async rewrites() {
    const apiBaseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl);
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBaseUrl}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
