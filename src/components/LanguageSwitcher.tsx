"use client";

import { useTranslation } from "@/lib/i18n/context";
import { languageOptions, SupportedLocale } from "@/lib/i18n/locales";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from "lucide-react";

export default function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useTranslation();
  
  return (
    <Select value={locale} onValueChange={(val) => setLocale(val as SupportedLocale)}>
      <SelectTrigger className={`w-[140px] bg-black/40 border-white/10 text-white backdrop-blur-md hover:border-white/20 transition-all focus:ring-0 focus:ring-offset-0 h-9 ${className}`}>
        <Globe className="h-4 w-4 mr-2 text-purple-400 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-background/95 border-white/10 backdrop-blur-md max-h-[300px] overflow-y-auto custom-scrollbar">
        {languageOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-foreground hover:bg-white/10">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
