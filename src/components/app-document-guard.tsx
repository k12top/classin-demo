"use client";

import { useEffect } from "react";

/** Keep the application document classes stable across client navigation. */
export function AppDocumentGuard() {
  useEffect(() => {
    document.documentElement.classList.add("app-shell");
    document.body.classList.add("app-shell");
  }, []);

  return null;
}
