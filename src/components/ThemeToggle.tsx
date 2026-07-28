"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClientTheme, setClientTheme, Theme } from "@/lib/theme";

export default function ThemeToggle({ className }: { className?: string }) {
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
      title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5 text-slate-700" />
      ) : (
        <Sun className="h-5 w-5 text-amber-400" />
      )}
    </Button>
  );
}
