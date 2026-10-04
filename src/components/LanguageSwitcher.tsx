"use client";
import { useTranslation } from "@/lib/i18n/context";
import { languageOptions, SupportedLocale } from "@/lib/i18n/locales";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export default function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useTranslation();
  const selectedLanguage = languageOptions.find((option) => option.value === locale);
  
  return (
    <Select value={locale} onValueChange={(val) => setLocale(val as SupportedLocale)}>
      <SelectTrigger className={`w-[150px] bg-background border border-border/80 hover:border-primary/40 focus:border-primary text-foreground rounded-xl transition-all focus:ring-2 focus:ring-primary/20 h-9 font-semibold text-xs ${className}`}>
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-sm shrink-0">{selectedLanguage?.flag || "🌐"}</span>
          <span className="truncate">{selectedLanguage?.label || "Language"}</span>
        </div>
      </SelectTrigger>
      <SelectContent
        data-account-language-list="true"
        className="bg-popover border border-border/80 max-h-[300px] overflow-y-auto rounded-xl shadow-lg"
      >
        {languageOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs hover:bg-muted/50 focus:bg-muted/50 rounded-lg py-2">
            <span className="flex items-center gap-2">
              <span className="text-sm shrink-0">{opt.flag}</span>
              <span>{opt.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
