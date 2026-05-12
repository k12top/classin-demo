import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "灵动课堂 — 在线互动教学平台",
  description:
    "基于声网技术打造的在线互动课堂，支持实时音视频、互动白板、即时消息等功能，为师生提供沉浸式教学体验。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}

        {/* Shim window.require before the Agora SDK loads.
            The SDK bundle internally calls window.require('agora-electron-sdk')
            to detect Electron. In a pure browser this throws because
            window.require doesn't exist. This shim intercepts the call
            and returns an empty stub, letting the SDK fall back to WebRTC. */}
        <Script
          id="agora-require-shim"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && !window.require) {
                window.require = function(moduleName) {
                  if (moduleName === 'agora-electron-sdk' ||
                      moduleName.indexOf('agora_node_ext') !== -1) {
                    return {};
                  }
                  // For any other module, return empty to avoid breaking
                  return {};
                };
              }
            `,
          }}
        />

        {/* Load Agora Classroom SDK & Widgets via CDN (v2.9.40) */}
        <Script
          src="https://download.agora.io/edu-apaas/release/edu_sdk@2.9.40.bundle.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://download.agora.io/edu-apaas/release/edu_widget@2.9.40.bundle.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
