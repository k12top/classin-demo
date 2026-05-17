/**
 * Agora Flexible Classroom mutates documentElement/body and injects global CSS.
 * Reset when leaving /classroom so dashboard/course pages render correctly.
 */

const AGORA_HEAD_ASSET_RE =
  /agora|fcr-|edu-apaas|edu_sdk|edu_widget|flexible-classroom|netless/i;

const AGORA_BODY_PORTAL_RE =
  /(^|\s)(fcr-|agora-|rtc-|flexible-classroom|edu-sdk)/i;

export function markClassroomDocumentActive(): void {
  document.documentElement.classList.add("agora-classroom-active");
  document.body.classList.add("agora-classroom-active");
}

export function resetDocumentAfterClassroom(): void {
  document.documentElement.classList.remove("agora-classroom-active");
  document.body.classList.remove("agora-classroom-active");

  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("style");

  document.documentElement.classList.add("app-shell");
  document.body.classList.add("app-shell");

  const stripProps = [
    "overflow",
    "overflowX",
    "overflowY",
    "position",
    "width",
    "height",
    "top",
    "left",
    "right",
    "bottom",
    "margin",
    "padding",
    "transform",
    "touchAction",
    "overscrollBehavior",
    "background",
    "backgroundColor",
    "color",
    "fontSize",
    "fontFamily",
    "maxWidth",
  ] as const;

  for (const el of [document.documentElement, document.body]) {
    for (const prop of stripProps) {
      el.style.removeProperty(
        prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      );
    }
  }

  removeAgoraHeadAssets();
  removeOrphanAgoraPortals();

  const nextRoot = document.getElementById("__next");
  if (nextRoot instanceof HTMLElement) {
    nextRoot.style.removeProperty("width");
    nextRoot.style.removeProperty("height");
    nextRoot.style.removeProperty("max-width");
    nextRoot.style.removeProperty("transform");
    nextRoot.classList.remove("container");
  }
}

function removeAgoraHeadAssets(): void {
  document
    .querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
      'head link[rel="stylesheet"], head style'
    )
    .forEach((el) => {
      const href = el instanceof HTMLLinkElement ? el.href : "";
      const text = el.textContent ?? "";
      if (AGORA_HEAD_ASSET_RE.test(href) || AGORA_HEAD_ASSET_RE.test(text)) {
        el.remove();
      }
    });
}

function removeOrphanAgoraPortals(): void {
  for (const child of [...document.body.children]) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.id === "agora-classroom-root") continue;
    if (child.id === "__next") continue;
    if (child.hasAttribute("data-nextjs-scroll-focus-boundary")) continue;
    if (child.tagName === "SCRIPT") continue;

    const id = child.id ?? "";
    const cls = typeof child.className === "string" ? child.className : "";
    if (AGORA_BODY_PORTAL_RE.test(id) || AGORA_BODY_PORTAL_RE.test(cls)) {
      child.remove();
    }
  }
}
