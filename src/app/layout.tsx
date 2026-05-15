import type { Metadata } from "next";
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
      </body>
    </html>
  );
}
