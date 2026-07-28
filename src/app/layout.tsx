import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppDocumentGuard } from "@/components/app-document-guard";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n/context";
import {
  isSupportedLocale,
  localeDirection,
  type SupportedLocale,
} from "@/lib/i18n/locales";
import { siteDescription, siteIcon, siteTitle } from "@/lib/site-brand";
import { PortalFeedbackProvider } from "@/components/portal/portal-feedback";
import { getSession } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  icons: {
    icon: siteIcon,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get("NEXT_LOCALE")?.value;
  const initialLocale: SupportedLocale = isSupportedLocale(cookieVal)
    ? cookieVal
    : "en";
  const themeVal = cookieStore.get("NEXT_THEME")?.value || "light";
  const session = await getSession();
  const initialUser = session
    ? {
        userId: session.userId,
        name: session.name,
        displayName: session.displayName,
        avatar: session.avatar,
        role: session.role,
        email: session.email,
      }
    : null;

  return (
    <html
      lang={initialLocale}
      dir={localeDirection(initialLocale)}
      className={themeVal}
    >
      <body className="font-sans antialiased bg-background text-foreground min-h-screen flex flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_84%_-8%,rgba(123,111,242,0.10),transparent_32rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.26))]"
        />
        
        <I18nProvider initialLocale={initialLocale}>
          <PortalFeedbackProvider>
            <AuthProvider initialUser={initialUser}>
              <AppDocumentGuard />
              {children}
            </AuthProvider>
          </PortalFeedbackProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
