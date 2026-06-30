"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { ShieldCheck, BookOpen, Video, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
import { useTranslation } from "@/lib/i18n/context";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import {
  markClassroomDocumentActive,
  resetDocumentAfterClassroom,
} from "@/lib/classroom-document";

// Type declarations for the CDN-loaded globals
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    AgoraEduSDK: any;
    AgoraSelector: any;
    AgoraCountdown: any;
    AgoraHXChatWidget: any;
    FcrStreamMediaPlayerWidget: any;
    AgoraPolling: any;
    FcrWatermarkWidget: any;
    FcrWebviewWidget: any;
    FcrBoardWidget: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** External classroom events. */
const CLASSROOM_EVT_DESTROYED = 2;
const CLASSROOM_EVT_KICK_OUT = 101;
const CLASSROOM_EVT_CLASS_STATE_CHANGED = 202;

function parseClassroomEvent(
  evt: unknown,
  args: unknown[],
): { code: number | null; classState: number | null } {
  let code: number | null = null;
  let classState: number | null = null;

  if (typeof evt === "number") {
    code = evt;
  } else if (typeof evt === "object" && evt !== null) {
    const o = evt as Record<string, unknown>;
    if (typeof o.type === "number") code = o.type;
    if (typeof o.classState === "number") classState = o.classState;
    if (typeof o.state === "number") classState = o.state;
  }

  if (code === CLASSROOM_EVT_CLASS_STATE_CHANGED && classState === null) {
    const first = args[0];
    if (typeof first === "number") {
      classState = first;
    } else if (typeof first === "object" && first !== null) {
      const a = first as Record<string, unknown>;
      if (typeof a.classState === "number") classState = a.classState;
      if (typeof a.state === "number") classState = a.state;
    }
  }

  return { code, classState };
}

function waitForSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50; // 10 seconds max
    const check = () => {
      if (window.AgoraEduSDK) {
        resolve();
      } else if (attempts >= maxAttempts) {
        reject(new Error("classroom.sdkTimeout"));
      } else {
        attempts++;
        setTimeout(check, 200);
      }
    };
    check();
  });
}

function buildLaunchKey(
  courseId: string,
  roomUuid: string,
  userId: string,
  shareAccess: string,
): string {
  return `${courseId}|${roomUuid}|${userId}|${shareAccess}`;
}

interface ClassroomCourseware {
  id: string;
  name: string;
  ext: string;
  url: string;
  size?: number | null;
  updatedAt: string;
  taskStatus?: string | null;
  taskUuid?: string | null;
  type: string;
  conversion?: unknown;
}

interface ClassroomCoursewareResponse {
  courseware?: ClassroomCourseware[];
}

function ClassroomWelcomeLoader({
  status,
  roomName,
  t,
}: {
  status: "verifying" | "loading";
  roomName: string;
  t: (key: string) => string;
}) {
  const [progress, setProgress] = useState(status === "verifying" ? 18 : 48);
  const isZh = typeof window !== "undefined" && navigator.language.startsWith("zh");
  const activeIndex = status === "verifying" ? 0 : 2;
  const steps = [
    {
      label: isZh ? "身份校验" : "Access check",
      detail: t("classroom.verifyingAccess") || (isZh ? "正在校验课堂权限" : "Checking classroom access"),
      icon: ShieldCheck,
    },
    {
      label: isZh ? "课堂资源" : "Class assets",
      detail: isZh ? "正在准备白板和课件" : "Preparing whiteboard and courseware",
      icon: BookOpen,
    },
    {
      label: isZh ? "音视频通道" : "Media channel",
      detail: isZh ? "正在建立音视频连接" : "Opening audio/video channel",
      icon: Video,
    },
  ];
  const ActiveIcon = steps[activeIndex].icon;
  const targetProgress = status === "verifying" ? 48 : 92;

  useEffect(() => {
    const interval = setInterval(() => {
      const floor = status === "verifying" ? 18 : 48;
      setProgress((prev) => Math.min(Math.max(prev, floor) + 4, targetProgress));
    }, 300);

    return () => clearInterval(interval);
  }, [status, targetProgress]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 px-5 py-8"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="app-loading-progress" aria-hidden="true" />
      <div className="w-full max-w-xl rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="flex items-start gap-4">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="app-loading-sheen absolute inset-0 rounded-xl" aria-hidden="true" />
            <ActiveIcon className="relative h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {status === "verifying"
                ? t("classroom.verifyingAccess") || (isZh ? "正在校验课堂权限" : "Checking classroom access")
                : t("classroom.initializing") || (isZh ? "正在进入课堂" : "Entering classroom")}
            </p>
            {roomName && (
              <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">
                {roomName}
              </h2>
            )}
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {steps[activeIndex].detail}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === activeIndex;
              const isDone = index < activeIndex;

              return (
                <div
                  key={step.label}
                  className={`rounded-xl border px-3 py-2 transition-colors duration-200 ${
                    isActive || isDone
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/60 bg-background/70 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <StepIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{step.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          {isZh
            ? "首次进入会加载课堂和课件资源，完成后会自动切换到课堂。"
            : "First entry loads classroom and course assets, then switches into the classroom automatically."}
        </p>
        <span className="sr-only">{steps[activeIndex].detail}</span>
      </div>
    </div>
  );
}

function ClassroomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const unmountRef = useRef<(() => void) | null>(null);
  const leftClassroomRef = useRef(false);
  const launchKeyRef = useRef<string | null>(null);
  const launchingRef = useRef(false);
  const userRef = useRef(user);
  const routerRef = useRef(router);
  const courseIdRef = useRef("");
  const isTeacherRef = useRef(false);
  const lastSyncedClassStateRef = useRef<number | null>(null);
  const launchParamsRef = useRef({
    roomUuid: "",
    courseId: "",
    roomName: "",
    roomTypeParam: 0,
    shareAccess: "",
  });

    const { t, locale } = useTranslation();
    const [status, setStatus] = useState<
      "verifying" | "loading" | "ready" | "error"
    >("verifying");
    const [errorMsg, setErrorMsg] = useState("");

    const roomUuid = searchParams.get("roomUuid") || "";
    const roomTypeParam = Number(searchParams.get("roomType") || "0");
    const roomName = searchParams.get("roomName") || roomUuid;
    const courseId = searchParams.get("courseId") || "";
    const shareAccess = searchParams.get("shareAccess") || "";
    const isEmbed =
      searchParams.get("embed") === "1" || searchParams.get("embed") === "true";
    const classroomDebug = searchParams.get("debug") === "1";
    const classroomDebugRef = useRef(classroomDebug);

    const userId = user?.userId ?? "";

    useEffect(() => {
      classroomDebugRef.current = classroomDebug;
      userRef.current = user;
      routerRef.current = router;
      courseIdRef.current = courseId;
      launchParamsRef.current = {
        roomUuid,
        courseId,
        roomName,
        roomTypeParam,
        shareAccess,
      };
    }, [
      classroomDebug,
      courseId,
      roomName,
      roomTypeParam,
      roomUuid,
      router,
      shareAccess,
      user,
    ]);

    const logClassroomDebug = (...args: unknown[]) => {
      if (classroomDebugRef.current) {
        console.debug("[classroom]", ...args);
      }
    };

    const syncClassStateToServer = useCallback(async (classState: number) => {
      const cid = courseIdRef.current;
      if (!cid || !isTeacherRef.current) return;
      if (lastSyncedClassStateRef.current === classState) return;
      lastSyncedClassStateRef.current = classState;

      logClassroomDebug("sync class-state", { classState, courseId: cid });

      try {
        const res = await fetch(`/api/courses/${cid}/class-state`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classState }),
        });
        if (!res.ok) {
          lastSyncedClassStateRef.current = null;
        }
      } catch {
        lastSyncedClassStateRef.current = null;
      }
    }, []);

    const leaveClassroom = useCallback(() => {
      if (leftClassroomRef.current) return;
      leftClassroomRef.current = true;

      logClassroomDebug("leaveClassroom");

      if (unmountRef.current) {
        try {
          unmountRef.current();
        } catch {
          // ignore cleanup errors
        }
        unmountRef.current = null;
      }
      launchKeyRef.current = null;
      launchingRef.current = false;

      resetDocumentAfterClassroom();

      const target = courseIdRef.current
        ? `/courses/${encodeURIComponent(courseIdRef.current)}`
        : "/";

      // Full navigation reloads CSS — avoids Agora global styles breaking layout
      window.location.replace(target);
    }, []);

    useEffect(() => {
      markClassroomDocumentActive();
      return () => {
        resetDocumentAfterClassroom();
      };
    }, []);

    useEffect(() => {
      if (!classroomDebugRef.current) return;

      const onPageShow = (event: PageTransitionEvent) => {
        logClassroomDebug("pageshow", {
          persisted: event.persisted,
          visibility: document.visibilityState,
          launchKey: launchKeyRef.current,
        });
      };

      window.addEventListener("pageshow", onPageShow);
      return () => window.removeEventListener("pageshow", onPageShow);
    }, [classroomDebug]);

    useEffect(() => {
      if (authLoading || leftClassroomRef.current || !userId) {
        return;
      }

      const {
        roomUuid: ru,
        courseId: cid,
        roomName: rn,
        roomTypeParam: rtp,
        shareAccess: grant,
      } = launchParamsRef.current;
      const launchKey = buildLaunchKey(cid, ru, userId, grant);

      if (launchKeyRef.current === launchKey && unmountRef.current) {
        logClassroomDebug("launch skipped — already active", { launchKey });
        return;
      }

      if (launchingRef.current && launchKeyRef.current === launchKey) {
        logClassroomDebug("launch skipped — in progress", { launchKey });
        return;
      }

      let cancelled = false;
      const effectLaunchKey = launchKey;
      launchingRef.current = true;

      logClassroomDebug("launch effect start", {
        launchKey: effectLaunchKey,
        visibility: document.visibilityState,
      });

      queueMicrotask(() => {
        const currentUser = userRef.current;
        if (!currentUser) {
          launchingRef.current = false;
          redirectToSsoLogin();
          return;
        }

        if (!ru || !cid) {
          launchingRef.current = false;
          setStatus("error");
          setErrorMsg("classroom.missingParams");
          return;
        }

        void (async () => {
          let verifyRoomLabel = rn;

          try {
            const verifyPath = grant
              ? `/api/courses/${cid}/verify-access?${new URLSearchParams({
                  shareAccess: grant,
                }).toString()}`
              : `/api/courses/${cid}/verify-access`;
            let verifyRes = await fetch(verifyPath);
            if (cancelled) return;

            if (verifyRes.status === 401 && (await tryOAuthRefresh())) {
              verifyRes = await fetch(verifyPath);
            }
            if (verifyRes.status === 401) {
              launchingRef.current = false;
              redirectToSsoLogin();
              return;
            }

            if (!verifyRes.ok) {
              launchingRef.current = false;
              setStatus("error");
              setErrorMsg("classroom.verifyFailed");
              return;
            }

            const verifyData = await verifyRes.json();

          if (!verifyData.allowed) {
            launchingRef.current = false;
            routerRef.current.replace(
              buildAccessDeniedUrl({
                code: verifyData.code,
                reason: verifyData.reason || "无权访问",
                course: verifyRoomLabel,
                courseId: cid,
              }),
            );
            return;
          }

          const resolvedRole: number = verifyData.role === "teacher" ? 1 : 2;
          isTeacherRef.current = resolvedRole === 1;
          lastSyncedClassStateRef.current = null;
          let resolvedRoomType =
            typeof verifyData.courseInfo?.roomType === "number"
              ? verifyData.courseInfo.roomType
              : rtp;
          if (resolvedRoomType === 10) {
            resolvedRoomType = 2; // Map public class to Large Class (2) in Agora
          }
          if (verifyData.courseInfo?.name) {
            verifyRoomLabel = verifyData.courseInfo.name;
          }

          setStatus("loading");

          await waitForSDK();
          if (cancelled) return;

          let tokenRes = await fetch("/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomUuid: ru,
              courseId: cid,
              userUuid: currentUser.userId,
              ...(grant && { shareAccess: grant }),
            }),
          });

          if (cancelled) return;

          if (
            !tokenRes.ok &&
            tokenRes.status === 401 &&
            (await tryOAuthRefresh())
          ) {
            tokenRes = await fetch("/api/token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomUuid: ru,
                courseId: cid,
                userUuid: currentUser.userId,
                ...(grant && { shareAccess: grant }),
              }),
            });
          }

          if (!tokenRes.ok) {
            launchingRef.current = false;
            if (tokenRes.status === 401) {
              redirectToSsoLogin();
              return;
            }
            const err = await tokenRes.json();
            throw new Error(err.error || "Token 获取失败");
          }

          const { token, appId } = await tokenRes.json();

          // Fetch and map courseware for classroom whiteboard public slides
          let sdkCoursewareList: Array<Record<string, unknown>> = [];
          try {
            const cwRes = await fetch(`/api/courses/${cid}/courseware`);
            if (cwRes.ok) {
              const cwData = (await cwRes.json()) as ClassroomCoursewareResponse;
              sdkCoursewareList = (cwData.courseware || [])
                .filter((cw) => cw.taskStatus === "Finished")
                .map((cw) => {
                  const scenes = Array.isArray(cw.conversion) ? cw.conversion : [];
                  return {
                    resourceName: cw.name,
                    resourceUuid: cw.id,
                    ext: cw.ext,
                    url: cw.url,
                    size: cw.size || 0,
                    updateTime: new Date(cw.updatedAt).getTime(),
                    taskUuid: cw.taskUuid || undefined,
                    taskProgress: {
                      status: "Finished",
                      totalPageSize: scenes.length,
                      convertedPageSize: scenes.length,
                      convertedPercentage: 100,
                      currentStep: "Finished",
                    },
                    conversion: {
                      outputFormat: cw.type,
                      canvasVersion: true,
                      preview: true,
                      scale: 1.2,
                      type: cw.type,
                      scenes: scenes,
                    },
                  };
                });
            }
          } catch (e) {
            console.error("Failed to load courseware into classroom:", e);
          }

          window.AgoraEduSDK.config({
            appId,
            region: "CN",
          });

          const widgets: Record<string, unknown> = {};
          if (window.AgoraSelector) widgets.popupQuiz = window.AgoraSelector;
          if (window.AgoraCountdown)
            widgets.countdownTimer = window.AgoraCountdown;
          if (window.AgoraHXChatWidget)
            widgets.easemobIM = window.AgoraHXChatWidget;
          if (window.FcrStreamMediaPlayerWidget)
            widgets.mediaPlayer = window.FcrStreamMediaPlayerWidget;
          if (window.AgoraPolling) widgets.poll = window.AgoraPolling;
          if (window.FcrWatermarkWidget)
            widgets.watermark = window.FcrWatermarkWidget;
          if (window.FcrWebviewWidget)
            widgets.webView = window.FcrWebviewWidget;
          if (window.FcrBoardWidget)
            widgets.netlessBoard = window.FcrBoardWidget;

          if (!containerRef.current) {
            throw new Error("课堂容器未就绪");
          }

          if (cancelled) return;

          setStatus("ready");

          const unmount = window.AgoraEduSDK.launch(containerRef.current, {
            userUuid: currentUser.userId,
            userName: currentUser.displayName || currentUser.name,
            roomUuid: ru,
            roleType: resolvedRole,
            roomType: resolvedRoomType,
            roomName: verifyRoomLabel,
            pretest: true,
            rtmToken: token,
            language: locale === "zh-CN" ? "zh" : "en",
            duration: 60 * 30, // 30 minutes
            courseWareList: sdkCoursewareList,
            recordUrl: "https://solutions-apaas.agora.io/static/record_page_prod.html",
            virtualBackgroundImages: [],
            webrtcExtensionBaseUrl: "https://solutions-apaas.agora.io/static",
            uiMode: "dark",
            widgets,
            listener: (evt: unknown, ...args: unknown[]) => {
              try {
                const { code, classState } = parseClassroomEvent(evt, args);

                if (
                  code === CLASSROOM_EVT_CLASS_STATE_CHANGED &&
                  classState !== null
                ) {
                  void syncClassStateToServer(classState);
                  return;
                }

                if (
                  code === CLASSROOM_EVT_DESTROYED ||
                  code === CLASSROOM_EVT_KICK_OUT
                ) {
                  leaveClassroom();
                }
              } catch {
                // Swallow errors from classroom event callback — unhandled errors
                // here crash the React tree and cause Next.js to reload the
                // entire page (especially when DevTools is closed).
              }
            },
          });

          if (cancelled) {
            try {
              unmount();
            } catch {
              // ignore
            }
            launchingRef.current = false;
            return;
          }

          unmountRef.current = unmount;
          launchKeyRef.current = effectLaunchKey;
          launchingRef.current = false;

          logClassroomDebug("launch complete", {
            launchKey: effectLaunchKey,
            visibility: document.visibilityState,
          });
        } catch (err) {
          launchingRef.current = false;
          if (cancelled) return;
          console.error("启动课堂失败:", err);
          setStatus("error");
          setErrorMsg(
            err instanceof Error ? err.message : "classroom.launchError",
          );
        }
      })();
    });

    return () => {
      cancelled = true;

      if (launchKeyRef.current !== effectLaunchKey) {
        logClassroomDebug("effect cleanup skipped — key mismatch", {
          effectLaunchKey,
          activeKey: launchKeyRef.current,
        });
        launchingRef.current = false;
        return;
      }

      logClassroomDebug("effect cleanup teardown", {
        launchKey: effectLaunchKey,
        visibility: document.visibilityState,
      });

      if (unmountRef.current) {
        try {
          unmountRef.current();
        } catch {
          // ignore cleanup errors
        }
        unmountRef.current = null;
      }
      launchKeyRef.current = null;
      launchingRef.current = false;
    };
  }, [authLoading, userId, leaveClassroom, locale, syncClassStateToServer]);

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">{t("classroom.launchError")}</h2>
            <p className="text-sm text-muted-foreground">
              {errorMsg.includes(".") ? t(errorMsg) : errorMsg}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-sm font-semibold rounded-xl text-primary-foreground bg-primary hover:bg-primary/90 transition-all duration-200 shadow-sm"
          >
            {t("common.backToHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="classroom-container">
      {(status === "verifying" || status === "loading") && (
        <ClassroomWelcomeLoader
          status={status}
          roomName={roomName}
          t={t}
        />
      )}

      {status === "ready" && isEmbed && courseId && (
        <button
          type="button"
          className="classroom-back-btn classroom-back-btn-embed"
          onClick={leaveClassroom}
          title={t("classroom.exit")}
        >
          {t("classroom.exit")}
        </button>
      )}

      <div
        ref={containerRef}
        id="agora-classroom-root"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

export default function ClassroomPage() {
  const { t } = useTranslation();
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if (typeof window !== 'undefined' && !window.require) {
              window.require = function(moduleName) {
                if (moduleName === 'agora-electron-sdk' ||
                     moduleName.indexOf('agora_node_ext') !== -1) {
                  return {};
                }
                return {};
              };
            }
          `,
        }}
      />
      <Script
        src="https://download.agora.io/edu-apaas/release/edu_sdk@2.9.40.bundle.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://download.agora.io/edu-apaas/release/edu_widget@2.9.40.bundle.js"
        strategy="afterInteractive"
      />
      <Suspense
        fallback={
          <PageLoadingState
            message={t("classroom.initializing") || t("common.loading") || "Loading..."}
            variant="classroom"
          />
        }
      >
        <ClassroomContent />
      </Suspense>
    </>
  );
}
