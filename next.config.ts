import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Expose AGORA_APP_ID to the client (but NOT the certificate)
  env: {
    NEXT_PUBLIC_AGORA_APP_ID: process.env.AGORA_APP_ID,
  },

  // Use Turbopack (Next.js 16 default) with no special config needed
  // since we load the Agora SDK via CDN <script> tags instead of npm import
  turbopack: {},
};

export default nextConfig;
