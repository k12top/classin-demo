"use client";

import { useEffect } from "react";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { useTranslation } from "@/lib/i18n/context";

/** Legacy URL — immediately continue to Casdoor SSO. */
export default function SessionExpiredPage() {
  const { t } = useTranslation();

  useEffect(() => {
    redirectToSsoLogin();
  }, []);

  return (
    <>
      <div className="page-bg" />
      <div className="dashboard-loading">
        <div className="loader" />
        <p>{t("login.redirecting")}</p>
      </div>
    </>
  );
}
