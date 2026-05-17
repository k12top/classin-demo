import type { NextConfig } from "next";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Monorepo: parent folder may have another lockfile, so Turbopack/Next can infer
 * the wrong root. Do NOT set `turbopack.root` to only `classroom` — it breaks internal
 * paths like `classroom/src/...` and causes HMR panics ("needs to be on project filesystem").
 *
 * Instead, always load env from this package directory (run dev/build with cwd = classroom).
 */
const packageDir = path.resolve(process.cwd());
loadEnvConfig(packageDir);

const nextConfig: NextConfig = {
  reactCompiler: true,

  env: {
    NEXT_PUBLIC_AGORA_APP_ID: process.env.AGORA_APP_ID,
    NEXT_PUBLIC_CASDOOR_SERVER_URL: process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL,
    NEXT_PUBLIC_CASDOOR_CLIENT_ID: process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID,
    NEXT_PUBLIC_CASDOOR_APP_NAME: process.env.NEXT_PUBLIC_CASDOOR_APP_NAME,
    NEXT_PUBLIC_CASDOOR_ORG_NAME: process.env.NEXT_PUBLIC_CASDOOR_ORG_NAME,
    NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE: process.env.NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE,
  },
};

export default nextConfig;
