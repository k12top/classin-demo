"use client";
import { useTranslation } from "@/lib/i18n/context";
import { languageOptions, SupportedLocale } from "@/lib/i18n/locales";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const localeFlags: Record<string, string> = {
  "zh-CN": "🇨🇳",
  "en": "🇺🇸",
  "ja": "🇯🇵",
  "ko": "🇰🇷",
  "th": "🇹🇭",
  "id": "🇮🇩",
  "vi": "🇻🇳",
  "fil": "🇵🇭",
  "ms": "🇲🇾",
  "lo": "🇱🇦",
  "my": "🇲🇲",
  "km": "🇰🇭",
  "ta": "🇮🇳",
  "sw": "🇰🇪",
  "fr": "🇫🇷",
  "ru": "🇷🇺",
};

export default function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useTranslation();
  
  return (
    <Select value={locale} onValueChange={(val) => setLocale(val as SupportedLocale)}>
      <SelectTrigger className={`w-[150px] bg-background border border-border/80 hover:border-primary/40 focus:border-primary text-foreground rounded-xl transition-all focus:ring-2 focus:ring-primary/20 h-9 font-semibold text-xs ${className}`}>
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-sm shrink-0">{localeFlags[locale] || "🌐"}</span>
          <span className="truncate">{languageOptions.find(opt => opt.value === locale)?.label || "Language"}</span>
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover border border-border/80 max-h-[300px] overflow-y-auto rounded-xl shadow-lg">
        {languageOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs hover:bg-muted/50 focus:bg-muted/50 rounded-lg py-2">
            <span className="flex items-center gap-2">
              <span className="text-sm shrink-0">{localeFlags[opt.value] || "🌐"}</span>
              <span>{opt.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
