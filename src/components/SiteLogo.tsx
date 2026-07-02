/* eslint-disable @next/next/no-img-element */
import { siteLogo, siteName } from "@/lib/site-brand";
import { cn } from "@/lib/utils";

interface SiteLogoProps {
  alt?: string;
  className?: string;
  decorative?: boolean;
  imageClassName?: string;
}

export function SiteLogo({
  alt = siteName,
  className,
  decorative = false,
  imageClassName,
}: SiteLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        className
      )}
    >
      <img
        src={siteLogo}
        alt={decorative ? "" : alt}
        aria-hidden={decorative || undefined}
        className={cn("h-full w-full object-contain", imageClassName)}
      />
    </span>
  );
}
