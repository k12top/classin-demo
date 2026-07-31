"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClientTheme, setClientTheme, Theme } from "@/lib/theme";
import { useTranslation } from "@/lib/i18n/context";

export default function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const theme = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("app-theme-change", onStoreChange);
      return () =>
        window.removeEventListener("app-theme-change", onStoreChange);
    },
    getClientTheme,
    () => "light" as Theme,
  );

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setClientTheme(nextTheme);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={`rounded-full hover:bg-muted active:scale-95 transition-all ${className}`}
      title={
        theme === "light"
          ? t("common.switchToDarkMode")
          : t("common.switchToLightMode")
      }
      aria-label={
        theme === "light"
          ? t("common.switchToDarkMode")
          : t("common.switchToLightMode")
      }
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5 text-slate-700" />
      ) : (
        <Sun className="h-5 w-5 text-amber-400" />
      )}
    </Button>
  );
}
