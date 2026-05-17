"use client";

import { useEffect } from "react";
import { redirectToSsoLogin } from "@/lib/auth-login";

/** Legacy URL — immediately continue to Casdoor SSO. */
export default function SessionExpiredPage() {
  useEffect(() => {
    redirectToSsoLogin();
  }, []);

  return (
    <>
      <div className="page-bg" />
      <div className="dashboard-loading">
        <div className="loader" />
        <p>正在跳转登录…</p>
      </div>
    </>
  );
}
