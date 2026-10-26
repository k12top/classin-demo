import { timeZoneCountries } from "./time-zone-countries";
import { validTimeZone } from "./time-zone";

// Common city labels are localized; uncommon cities retain their recognizable IANA city name.
const cities: Record<string, [string, string, string?]> = {
  "Asia/Shanghai": ["上海", "上海", "北京 广州 深圳 Beijing Guangzhou Shenzhen China 中国"],
  "America/New_York": ["纽约", "紐約", "美国 美國 USA United States 东部 東部"],
  "America/Chicago": ["芝加哥", "芝加哥", "美国 美國 USA United States 中部"],
  "America/Los_Angeles": ["洛杉矶", "洛杉磯", "美国 美國 USA United States 西部"],
  "Asia/Jakarta": ["雅加达", "雅加達", "印尼 Indonesia 印度尼西亚 印度尼西亞"],
  "Asia/Makassar": ["巴厘岛", "峇里島", "Bali 印尼 Indonesia 印度尼西亚 印度尼西亞"],
  "Asia/Jayapura": ["查亚普拉", "查亞普拉", "印尼 Indonesia 印度尼西亚 印度尼西亞"],
  "Asia/Bangkok": ["曼谷", "曼谷"],
  "Asia/Singapore": ["新加坡", "新加坡"],
  "Asia/Tokyo": ["东京", "東京"],
  "Asia/Seoul": ["首尔", "首爾"],
  "Asia/Hong_Kong": ["香港", "香港"],
  "Asia/Taipei": ["台北", "臺北"],
  "Asia/Kolkata": ["加尔各答", "加爾各答", "India 印度"],
  "Asia/Calcutta": ["加尔各答", "加爾各答", "India 印度"],
  "Asia/Dubai": ["迪拜", "杜拜"],
  "Asia/Ho_Chi_Minh": ["胡志明市", "胡志明市"],
  "Asia/Saigon": ["胡志明市", "胡志明市"],
  "Asia/Manila": ["马尼拉", "馬尼拉"],
  "Asia/Kuala_Lumpur": ["吉隆坡", "吉隆坡"],
  "Europe/London": ["伦敦", "倫敦", "英国 英國 UK United Kingdom"],
  "Europe/Paris": ["巴黎", "巴黎"],
  "Europe/Berlin": ["柏林", "柏林"],
  "Europe/Moscow": ["莫斯科", "莫斯科"],
  "Australia/Sydney": ["悉尼", "雪梨", "澳洲"],
  "Australia/Perth": ["珀斯", "伯斯", "澳洲"],
  "Australia/Adelaide": ["阿德莱德", "阿德雷德", "澳洲"],
  "Pacific/Auckland": ["奥克兰", "奧克蘭"],
  "America/Toronto": ["多伦多", "多倫多"],
  "America/Vancouver": ["温哥华", "溫哥華"],
  "America/Sao_Paulo": ["圣保罗", "聖保羅"],
  "Africa/Cairo": ["开罗", "開羅"],
  "UTC": ["UTC", "UTC", "协调世界时 協調世界時 Coordinated Universal Time"],
};
const common = ["Asia/Shanghai", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Paris", "Australia/Sydney", "UTC"];
export const allTimeZones = Array.from(new Set([
  ...common, ...Object.keys(timeZoneCountries),
  ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []),
])).filter(validTimeZone);
export function timeZoneCity(zone: string, locale: string) {
  const label = cities[zone];
  if (label && locale.startsWith("zh")) return label[locale === "zh-TW" ? 1 : 0];
  return zone === "UTC" ? "UTC" : zone.split("/").slice(1).join(" / ").replaceAll("_", " ") || zone;
}
// ICU versions disagree between GMT and GMT+00:00 for the zero offset.
// Canonicalize both before SSR so the first browser render has identical text.
export function compactOffsetName(value: string) {
  const label = value.replace("GMT", "UTC").replace(/:00$/, "").replace(/([+-])0(\d)/, "$1$2");
  return /^UTC(?:[+-]0)?$/.test(label) ? "UTC" : label;
}
export function timeZoneOffset(zone: string, date = new Date()) {
  const name = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(date).find(part => part.type === "timeZoneName")!.value;
  return compactOffsetName(name);
}
function regionNames(zone: string, locale: string) {
  const regions = timeZoneCountries[zone] || [];
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return regions.map(region => names.of(region) || region).join(" / ");
}
export function searchTimeZones(query: string, locale: string, includeAll = false, extraZones: string[] = []) {
  const needle = query.toLocaleLowerCase().trim();
  const pool = needle || includeAll ? allTimeZones : Array.from(new Set([...extraZones.filter(validTimeZone), ...common]));
  return pool.map(zone => ({
    zone, city: timeZoneCity(zone, locale), country: regionNames(zone, locale),
  })).filter(row => !needle || [row.zone, row.city, row.country, regionNames(row.zone, "en"), ...(cities[row.zone] || [])]
    .join(" ").toLocaleLowerCase().includes(needle));
}
