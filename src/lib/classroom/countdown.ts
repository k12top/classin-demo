export function formatTimeUntilClass(milliseconds: number, locale: string) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainder = minutes % 60;
  const unit = (value: number, name: "day" | "hour" | "minute") => new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short" }).format(value);
  return [days && unit(days, "day"), hours && unit(hours, "hour"), (!days || remainder > 0) && unit(remainder, "minute")].filter(Boolean).join(" ");
}
