"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { resetDocumentAfterClassroom } from "@/lib/classroom-document";

/** Keep app theme on body; reset Agora leaks when leaving /classroom. */
export function AppDocumentGuard() {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.classList.add("app-shell");
    document.body.classList.add("app-shell");

    if (!pathname.startsWith("/classroom")) {
      resetDocumentAfterClassroom();
    }
  }, [pathname]);

  return null;
}
