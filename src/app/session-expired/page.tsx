"use client";

import { useEffect } from "react";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { useTranslation } from "@/lib/i18n/context";
import { PageLoadingState } from "@/components/ui/page-loading-state";

/** Legacy URL — immediately continue to SSO login. */
export default function SessionExpiredPage() {
  const { t } = useTranslation();

  useEffect(() => {
    redirectToSsoLogin();
  }, []);

  return <PageLoadingState message={t("login.redirecting")} variant="dashboard" />;
}
