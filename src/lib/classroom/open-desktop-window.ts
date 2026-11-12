const CLASSROOM_WINDOW_MARKER = "classroom:separate-window";

function windowError(kind:"blocked"|"closed") {
  const locale=typeof document==="undefined"?"en":document.documentElement.lang;
  if(locale==="zh-TW")return kind==="blocked"?"無法開啟課堂視窗，請允許彈出視窗後重試。":"課堂視窗已關閉，請重試。";
  if(locale.startsWith("zh"))return kind==="blocked"?"无法打开课堂窗口，请允许弹出窗口后重试。":"课堂窗口已关闭，请重试。";
  if(locale.startsWith("vi"))return kind==="blocked"?"Không thể mở cửa sổ lớp học. Hãy cho phép cửa sổ bật lên và thử lại.":"Cửa sổ lớp học đã đóng. Vui lòng thử lại.";
  return kind==="blocked"?"Unable to open classroom window. Allow pop-ups and try again.":"The classroom window was closed. Please try again.";
}
/** Use the desktop main process to open a separate classroom window. */
export async function openDesktopClassroom(target: URL): Promise<boolean> {
  const open = window.classroomDesktop?.enterClassroom;
  if (!open) return false;
  if (target.origin !== window.location.origin || target.pathname !== "/classroom") throw new Error("Invalid classroom");
  const result = await open(target.href);
  if (!result?.ok) throw new Error(result?.error || "Unable to open classroom");
  return true;
}

/** Reserve during the click so browsers do not block the window after access verification. */
export function reserveClassroomWindow(): Window | null {
  if (window.classroomDesktop?.isDesktop) return null;
  const child = window.open("about:blank", "_blank", "popup,width=1280,height=800");
  if (!child) throw new Error(windowError("blocked"));
  try {
    const locale = document.documentElement.lang;
    const loading = locale === "zh-TW" ? "正在進入課堂…" : locale.startsWith("zh") ? "正在进入课堂…" : locale.startsWith("vi") ? "Đang vào lớp học…" : "Opening classroom…";
    child.document.title = loading;
    child.document.body.textContent = loading;
    try { child.sessionStorage.setItem(CLASSROOM_WINDOW_MARKER, "1"); } catch { /* Storage may be disabled. */ }
    child.opener = null;
  } catch {
    child.close();
    throw new Error(windowError("blocked"));
  }
  return child;
}

/** Only close browser windows that this application opened for a classroom. */
export function closeBrowserClassroomWindow(): boolean {
  if (window.classroomDesktop?.isDesktop) return false;
  try {
    if (window.sessionStorage.getItem(CLASSROOM_WINDOW_MARKER) !== "1") return false;
    window.close();
    return true;
  } catch { return false; }
}

export async function openClassroomWindow(target: URL, child: Window | null): Promise<boolean> {
  if (target.origin !== window.location.origin || target.pathname !== "/classroom") throw new Error("Invalid classroom");
  if (await openDesktopClassroom(target)) return true;
  if (child) {
    if (child.closed) throw new Error(windowError("closed"));
    child.location.replace(target.href);
    return true;
  }
  return false; // Older desktop clients retain their navigation interception.
}
