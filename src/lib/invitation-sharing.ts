type CopyEnvironment = {
  navigator?: Pick<Navigator, "clipboard">;
  document?: Document;
};

/** Clipboard permissions and secure-context support vary in embedded browsers. */
export async function copyInvitationText(
  text: string,
  environment: CopyEnvironment = { navigator: globalThis.navigator, document: globalThis.document },
): Promise<boolean> {
  try {
    if (environment.navigator?.clipboard?.writeText) {
      await environment.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // A rejected modern API can still allow copying a selected text field.
  }
  const doc = environment.document;
  if (!doc?.body || typeof doc.execCommand !== "function") return false;
  const focused = doc.activeElement as HTMLElement | null;
  const selection = doc.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const inputSelection = focused?.tagName === "INPUT" || focused?.tagName === "TEXTAREA"
    ? { start: (focused as HTMLInputElement).selectionStart, end: (focused as HTMLInputElement).selectionEnd, direction: (focused as HTMLInputElement).selectionDirection }
    : null;
  const field = doc.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px";
  (focused?.closest('[role="dialog"]') || doc.body).appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return doc.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
    if (inputSelection && inputSelection.start !== null && inputSelection.end !== null) {
      (focused as HTMLInputElement).setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction || undefined);
    } else if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}

const pendingShares = new WeakSet<object>();
export type InvitationShareResult = "shared" | "cancelled" | "busy" | "copied" | "manual";

/** Hold the lock until the native sheet settles, including rapid repeated clicks. */
export async function shareInvitation(
  data: ShareData,
  navigator: Pick<Navigator, "share"> = globalThis.navigator,
  copy = copyInvitationText,
): Promise<InvitationShareResult> {
  if (pendingShares.has(navigator)) return "busy";
  if (typeof navigator.share === "function") {
    pendingShares.add(navigator);
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return "cancelled";
    } finally {
      pendingShares.delete(navigator);
    }
  }
  return await copy(data.text || data.url || "") ? "copied" : "manual";
}
