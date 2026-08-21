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
  serverExternalPackages: ["agora-token", "ali-oss"],
  webpack(config, { webpack }) {
    // White Web SDK optionally probes Agora Foundation for local diagnostic
    // logging. That package is not browser-safe (it imports Node `fs`), so
    // resolve the optional probes to empty modules and let the SDK use Argus.
    config.resolve.alias = {
      ...config.resolve.alias,
      "agora-foundation/lib/logger/common": false,
      "agora-foundation/lib/logger": false,
      "agora-foundation/package.json": false,
    };
    // white-web-sdk still renders a small internal input overlay with the
    // React 16 render API. Next 16 aliases package React imports to React 19,
    // where `react-dom.render` no longer exists. Keep the SDK's own compatible
    // React pair scoped to Netless issuers without changing the application.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^(react|react-dom)$/,
        (resource: { context: string; request: string }) => {
          const context = resource.context.replaceAll("\\", "/");
          const dependencyRoot = context.includes("/white-web-sdk")
            ? path.join(packageDir, "node_modules/white-web-sdk/node_modules")
            : context.includes("/@netless/appliance-plugin")
              ? path.join(
                  packageDir,
                  "node_modules/@netless/appliance-plugin/node_modules",
                )
              : null;
          if (dependencyRoot) {
            resource.request = path.join(dependencyRoot, resource.request);
          }
        },
      ),
    );
    return config;
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },

  env: {
    NEXT_PUBLIC_CASDOOR_SERVER_URL: process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL,
    NEXT_PUBLIC_CASDOOR_CLIENT_ID: process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID,
    NEXT_PUBLIC_CASDOOR_APP_NAME: process.env.NEXT_PUBLIC_CASDOOR_APP_NAME,
    NEXT_PUBLIC_CASDOOR_ORG_NAME: process.env.NEXT_PUBLIC_CASDOOR_ORG_NAME,
    NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE: process.env.NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE,
  },
};

export default nextConfig;
