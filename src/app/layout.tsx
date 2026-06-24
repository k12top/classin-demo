import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppDocumentGuard } from "@/components/app-document-guard";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n/context";
import { SupportedLocale } from "@/lib/i18n/locales";
import "./globals.css";

export const metadata: Metadata = {
  title: "翔宇文淑-在线课堂",
  description:
    "基于声网技术打造 of 在线互动课堂，支持实时音视频、互动白板、即时消息等功能，为师生提供沉浸式教学体验。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get("NEXT_LOCALE")?.value;
  const initialLocale = (cookieVal || "en") as SupportedLocale;
  const themeVal = cookieStore.get("NEXT_THEME")?.value || "light";

  return (
    <html lang={initialLocale} className={themeVal}>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen flex flex-col">
        {/* Dynamic Background */}
        <div className="fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_at_20%_50%,rgba(59,130,246,0.08)_0%,transparent_50%),radial-gradient(ellipse_at_80%_20%,rgba(139,92,246,0.06)_0%,transparent_50%),radial-gradient(ellipse_at_50%_80%,rgba(6,182,212,0.05)_0%,transparent_50%)] pointer-events-none">
           <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[repeating-conic-gradient(rgba(255,255,255,0.01)_0%,transparent_2%)] animate-bg-rotate pointer-events-none" />
        </div>
        
        <I18nProvider initialLocale={initialLocale}>
          <AuthProvider>
            <AppDocumentGuard />
            {children}
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
