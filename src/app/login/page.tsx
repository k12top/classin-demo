"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { languageOptions, SupportedLocale } from "@/lib/i18n/locales";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from "lucide-react";

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
    <>
      <div className="page-bg" />
      
      {/* Language Selector */}
      <div className="absolute top-4 right-4 z-50">
        <Select value={locale} onValueChange={(val) => setLocale(val as SupportedLocale)}>
          <SelectTrigger className="w-[140px] bg-black/40 border-white/10 text-white backdrop-blur-md hover:border-white/20 transition-all focus:ring-0 focus:ring-offset-0">
            <Globe className="h-4 w-4 mr-2 text-purple-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-background/95 border-white/10 backdrop-blur-md">
            {languageOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-foreground hover:bg-white/10">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="auth-container">
        <div className="login-card card animate-in animate-in-delay-1">
          {/* Logo */}
          <div className="login-header">
            <div className="logo-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <h1>{t("login.title")}</h1>
            <p className="login-subtitle">{t("login.subtitle")}</p>
          </div>

          {/* Session / OAuth messages */}
          {loggedOut && (
            <div className="login-notice" role="status">
              <span aria-hidden>✓</span>
              <span>{t("login.loggedOut")}</span>
            </div>
          )}

          {reason === "session_expired" && (
            <div className="login-notice" role="status">
              <span aria-hidden>⏱</span>
              <span>{t("login.sessionExpired")}</span>
            </div>
          )}

          {error && (
            <div className="login-error">
              <span>⚠️</span>
              <span>
                {error === "no_code" && t("login.errNoCode")}
                {error === "auth_failed" && t("login.errAuthFailed")}
                {!["no_code", "auth_failed"].includes(error) && t("login.errGeneric")}
              </span>
            </div>
          )}

          {/* SSO Login Button */}
          <button
            className="btn btn-primary login-btn"
            onClick={handleLogin}
            disabled={loading}
            id="btn-sso-login"
          >
            {loading ? (
              <>
                <span className="spinner" />
                {t("login.redirecting")}
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                {t("login.btnSso")}
              </>
            )}
          </button>

          <p className="login-hint">
            {t("login.ssoHint")}
          </p>
        </div>

        {/* Features */}
        <div className="features animate-in animate-in-delay-2">
          <div className="feature">
            <div className="feature-icon">🔐</div>
            <div className="feature-text">{t("login.featureSso")}</div>
          </div>
          <div className="feature">
            <div className="feature-icon">📚</div>
            <div className="feature-text">{t("login.featureCourse")}</div>
          </div>
          <div className="feature">
            <div className="feature-icon">🎓</div>
            <div className="feature-text">{t("login.featureRole")}</div>
          </div>
        </div>

        <footer className="footer animate-in animate-in-delay-3">
          {t("common.appName")}
        </footer>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="page-bg" />}>
      <LoginContent />
    </Suspense>
  );
}
