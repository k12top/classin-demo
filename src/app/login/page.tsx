"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { languageOptions, SupportedLocale } from "@/lib/i18n/locales";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Globe,
  GraduationCap,
  LoaderCircle,
  LogIn,
  ShieldCheck,
} from "lucide-react";
import { SiteLogo } from "@/components/SiteLogo";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const reason = searchParams.get("reason");
  const loggedOut = searchParams.get("logged_out") === "1";
  const [loading, setLoading] = useState(false);
  const { t, locale, setLocale } = useTranslation();

  const handleLogin = () => {
    setLoading(true);
    window.location.href = "/api/auth/login";
  };

  return (
    <main className="relative isolate flex min-h-[100svh] w-full items-center justify-center overflow-x-hidden px-4 pb-8 pt-24 sm:px-6 sm:py-12 lg:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(145deg,hsl(var(--background))_0%,hsl(var(--muted))_48%,hsl(var(--background))_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-12 -z-10 h-72 w-72 rounded-full bg-primary/15 blur-3xl sm:h-96 sm:w-96"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 bottom-0 -z-10 h-80 w-80 rounded-full bg-blue-400/10 blur-3xl sm:h-[28rem] sm:w-[28rem]"
      />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <Select value={locale} onValueChange={(val) => setLocale(val as SupportedLocale)}>
          <SelectTrigger
            aria-label="Language"
            className="h-11 w-[138px] rounded-xl border-border/70 bg-card/85 text-foreground shadow-sm backdrop-blur-xl transition-colors hover:border-primary/40 focus:ring-primary/30"
          >
            <Globe className="mr-2 h-4 w-4 text-primary" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border/70 bg-popover/95 backdrop-blur-xl">
            {languageOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-[1080px] overflow-hidden rounded-[32px] border border-border/70 bg-card/75 shadow-[0_36px_120px_-44px_rgba(26,20,74,0.38)] backdrop-blur-2xl lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="relative hidden min-h-[650px] overflow-hidden bg-[#15171c] p-12 text-[#f4f6f8] lg:flex lg:flex-col lg:justify-between">
          <div
            aria-hidden="true"
            className="absolute -right-32 -top-28 h-[420px] w-[420px] rounded-full bg-[#7b6ff2]/30 blur-[90px]"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-28 -left-28 h-[360px] w-[360px] rounded-full bg-[#32d49a]/10 blur-[90px]"
          />
          <div className="relative">
            <div className="flex items-center gap-3">
              <SiteLogo
                decorative
                className="h-11 w-11 rounded-[14px] border border-white/10 bg-white/5 p-2"
              />
              <div>
                <strong className="block text-sm tracking-[-0.02em]">
                  {t("common.appName")}
                </strong>
                <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#a7afbd]">
                  Live teaching system
                </span>
              </div>
            </div>
            <p className="mt-20 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8d85ee]">
              {t("login.heroEyebrow")}
            </p>
            <h2 className="mt-5 max-w-[390px] text-[46px] font-semibold leading-[0.98] tracking-[-0.06em]">
              {t("login.heroTitle")}
            </h2>
            <p className="mt-6 max-w-[360px] text-sm leading-7 text-[#a7afbd]">
              {t("login.heroDescription")}
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-2">
            {[
              [ShieldCheck, t("login.unifiedIdentity")],
              [BookOpenCheck, t("login.classroomCollaboration")],
              [Clock3, t("login.completePlayback")],
            ].map(([Icon, label]) => {
              const ItemIcon = Icon as typeof ShieldCheck;
              return (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4"
                >
                  <ItemIcon className="h-4 w-4 text-[#bcb5ff]" />
                  <span className="mt-8 block text-[10px] font-semibold text-[#c9ced7]">
                    {String(label)}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col items-center justify-center p-4 sm:p-8 lg:p-12">
        <section
          aria-labelledby="login-title"
          className="relative w-full max-w-[460px] overflow-hidden rounded-[26px] border border-border/70 bg-card/90 p-5 shadow-[0_24px_70px_-34px_rgba(76,29,149,0.32)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-500 sm:p-8"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
          />

          <header className="text-center">
            <SiteLogo
              decorative
              className="mx-auto mb-5 h-16 w-16 rounded-2xl border border-primary/15 bg-primary/10 p-3 shadow-lg shadow-primary/10 sm:h-[72px] sm:w-[72px]"
            />
            <h1
              id="login-title"
              className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
            >
              {t("login.title")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              {t("login.subtitle")}
            </p>
          </header>

          {(loggedOut || reason === "session_expired" || error) && (
            <div className="mt-6 space-y-3">
              {loggedOut && (
                <div
                  className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm leading-5 text-emerald-700 dark:text-emerald-300"
                  role="status"
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{t("login.loggedOut")}</span>
                </div>
              )}

              {reason === "session_expired" && (
                <div
                  className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-sm leading-5 text-amber-700 dark:text-amber-300"
                  role="status"
                >
                  <Clock3
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{t("login.sessionExpired")}</span>
                </div>
              )}

              {error && (
                <div
                  className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-sm leading-5 text-destructive"
                  role="alert"
                >
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>
                    {error === "no_code" && t("login.errNoCode")}
                    {error === "auth_failed" && t("login.errAuthFailed")}
                    {!["no_code", "auth_failed"].includes(error) && t("login.errGeneric")}
                  </span>
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="mt-6 h-12 w-full rounded-xl px-4 text-base shadow-lg shadow-primary/20 transition-transform active:scale-[0.99]"
            onClick={handleLogin}
            disabled={loading}
            aria-busy={loading}
            aria-describedby="sso-hint"
            id="btn-sso-login"
          >
            {loading ? (
              <>
                <LoaderCircle aria-hidden="true" className="animate-spin" />
                {t("login.redirecting")}
              </>
            ) : (
              <>
                <LogIn aria-hidden="true" />
                {t("login.btnSso")}
                <ArrowRight aria-hidden="true" className="ml-auto" />
              </>
            )}
          </Button>

          <p
            id="sso-hint"
            className="mt-3 text-center text-xs leading-5 text-muted-foreground sm:text-sm"
          >
            {t("login.ssoHint")}
          </p>
        </section>

        <ul className="mt-4 grid w-full max-w-[460px] grid-cols-3 gap-2 sm:mt-5 sm:gap-3 lg:hidden">
          <li className="flex min-w-0 flex-col items-center rounded-2xl border border-border/60 bg-card/70 px-2 py-3 text-center shadow-sm backdrop-blur-md sm:px-3 sm:py-4">
            <ShieldCheck aria-hidden="true" className="h-5 w-5 text-primary" />
            <span className="mt-2 text-[11px] font-medium leading-4 text-muted-foreground sm:text-xs">
              {t("login.featureSso")}
            </span>
          </li>
          <li className="flex min-w-0 flex-col items-center rounded-2xl border border-border/60 bg-card/70 px-2 py-3 text-center shadow-sm backdrop-blur-md sm:px-3 sm:py-4">
            <BookOpenCheck aria-hidden="true" className="h-5 w-5 text-primary" />
            <span className="mt-2 text-[11px] font-medium leading-4 text-muted-foreground sm:text-xs">
              {t("login.featureCourse")}
            </span>
          </li>
          <li className="flex min-w-0 flex-col items-center rounded-2xl border border-border/60 bg-card/70 px-2 py-3 text-center shadow-sm backdrop-blur-md sm:px-3 sm:py-4">
            <GraduationCap aria-hidden="true" className="h-5 w-5 text-primary" />
            <span className="mt-2 text-[11px] font-medium leading-4 text-muted-foreground sm:text-xs">
              {t("login.featureRole")}
            </span>
          </li>
        </ul>

        <footer className="mt-5 text-center text-xs text-muted-foreground">
          {t("common.appName")}
        </footer>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-[100svh] w-full bg-background"
          role="status"
          aria-label="Loading"
        />
      }
    >
      <LoginContent />
    </Suspense>
  );
}
