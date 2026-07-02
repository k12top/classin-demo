export const DEFAULT_SITE_NAME = "翔宇文淑直播平台";
export const DEFAULT_SITE_TITLE = "翔宇文淑-在线课堂";
export const DEFAULT_SITE_DESCRIPTION =
  "在线互动课堂，支持实时教学、互动课件、课程管理等功能，为师生提供沉浸式教学体验。";
export const DEFAULT_SITE_LOGO = "/site-logo.svg";
export const DEFAULT_SITE_ICON = "/favicon.ico";

const configuredSiteName = process.env.NEXT_PUBLIC_SITE_NAME?.trim();
const configuredSiteTitle = process.env.NEXT_PUBLIC_SITE_TITLE?.trim();
const configuredSiteLogo = process.env.NEXT_PUBLIC_SITE_LOGO?.trim();
const configuredSiteIcon = process.env.NEXT_PUBLIC_SITE_ICON?.trim();

export const siteName = configuredSiteName || DEFAULT_SITE_NAME;
export const siteTitle = configuredSiteTitle || DEFAULT_SITE_TITLE;
export const siteDescription = DEFAULT_SITE_DESCRIPTION;
export const siteLogo = configuredSiteLogo || DEFAULT_SITE_LOGO;
export const siteIcon = configuredSiteIcon || DEFAULT_SITE_ICON;

export function getSiteName(fallback = DEFAULT_SITE_NAME): string {
  const trimmedFallback = fallback.trim();
  return configuredSiteName || trimmedFallback || DEFAULT_SITE_NAME;
}
