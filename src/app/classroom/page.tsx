"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { Loader2, ShieldCheck, Globe, BookOpen, Video, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
import { useTranslation } from "@/lib/i18n/context";
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

/** Agora Edu classroom events (see AgoraEduClassroomEvent). */
const AGORA_EVT_DESTROYED = 2;
const AGORA_EVT_KICK_OUT = 101;
const AGORA_EVT_CLASS_STATE_CHANGED = 202;

function parseAgoraEvent(
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

  if (code === AGORA_EVT_CLASS_STATE_CHANGED && classState === null) {
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
): string {
  return `${courseId}|${roomUuid}|${userId}`;
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
  const [progress, setProgress] = useState(10);
  const [stageIndex, setStageIndex] = useState(0);

  const stages = [
    { text: t("classroom.verifyingAccess") || "Authenticating session...", icon: ShieldCheck },
    { text: "Detecting local timezone...", icon: Globe },
    { text: "Preparing digital whiteboard...", icon: BookOpen },
    { text: "Establishing secure audio/video channel...", icon: Video },
    { text: t("classroom.initializing") || "Preparing digital classroom...", icon: Loader2 },
  ];

  // Adjust stages text based on language if possible
  const isZh = typeof window !== "undefined" && navigator.language.startsWith("zh");
  const localStages = stages.map((stage, idx) => {
    if (idx === 1) return { ...stage, text: isZh ? "正在检测您的本地时区..." : "Detecting local timezone..." };
    if (idx === 2) return { ...stage, text: isZh ? "正在准备数字白板教具..." : "Preparing digital whiteboard..." };
    if (idx === 3) return { ...stage, text: isZh ? "正在建立音视频安全通道..." : "Establishing secure audio/video channel..." };
    return stage;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 95) {
          const increment = Math.floor(Math.random() * 8) + 2;
          const next = prev + increment;
          const newStage = Math.min(Math.floor(next / 20), localStages.length - 1);
          setStageIndex(newStage);
          return next;
        }
        return prev;
      });
    }, 400);

    return () => clearInterval(interval);
  }, [localStages.length]);

  const CurrentIcon = localStages[stageIndex].icon;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Decorative backdrop gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[300px] h-[300px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500 z-10">
        {/* Animated Icon Ring */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-2 bg-primary/10 rounded-full animate-ping pointer-events-none" />
          <svg className="absolute inset-0 w-24 h-24 -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              className="stroke-muted"
              strokeWidth="4"
              fill="transparent"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              className="stroke-primary transition-all duration-300 ease-out"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - progress / 100)}
            />
          </svg>
          <div className="relative bg-card p-4 rounded-full border border-border/40 shadow-sm flex items-center justify-center">
            <CurrentIcon className={`h-8 w-8 text-primary ${stageIndex === 4 ? "animate-spin" : "animate-pulse"}`} />
          </div>
        </div>

        {/* Room Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Loader2 className="h-3 w-3 animate-spin" />
            {isZh ? "正在进入直播间" : "Entering Classroom"}
          </div>
          {roomName && (
            <h2 className="text-xl font-bold text-foreground truncate max-w-sm mx-auto">
              {roomName}
            </h2>
          )}
        </div>

        {/* Progress Display */}
        <div className="space-y-3">
          <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
            <span className="transition-all duration-300">
              {localStages[stageIndex].text}
            </span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden border border-border/20">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed max-w-xs mx-auto">
          {isZh 
            ? "第一次加载可能需要较长时间，请保持网络畅通并耐心等待。" 
            : "First-time setup might take a moment. Please keep your connection active."}
        </p>
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
    const isEmbed =
      searchParams.get("embed") === "1" || searchParams.get("embed") === "true";
    const classroomDebug = searchParams.get("debug") === "1";
    const classroomDebugRef = useRef(classroomDebug);
    classroomDebugRef.current = classroomDebug;

    userRef.current = user;
    routerRef.current = router;
    courseIdRef.current = courseId;
    launchParamsRef.current = { roomUuid, courseId, roomName, roomTypeParam };

    const userId = user?.userId ?? "";

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
      } = launchParamsRef.current;
      const launchKey = buildLaunchKey(cid, ru, userId);

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
            let verifyRes = await fetch(`/api/courses/${cid}/verify-access`);
            if (cancelled) return;

            if (verifyRes.status === 401 && (await tryOAuthRefresh())) {
              verifyRes = await fetch(`/api/courses/${cid}/verify-access`);
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
          let sdkCoursewareList = [];
          try {
            const cwRes = await fetch(`/api/courses/${cid}/courseware`);
            if (cwRes.ok) {
              const cwData = await cwRes.json();
              sdkCoursewareList = (cwData.courseware || [])
                .filter((cw: any) => cw.taskStatus === "Finished")
                .map((cw: any) => {
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
                const { code, classState } = parseAgoraEvent(evt, args);

                if (
                  code === AGORA_EVT_CLASS_STATE_CHANGED &&
                  classState !== null
                ) {
                  void syncClassStateToServer(classState);
                  return;
                }

                if (
                  code === AGORA_EVT_DESTROYED ||
                  code === AGORA_EVT_KICK_OUT
                ) {
                  if (code === AGORA_EVT_DESTROYED && isTeacherRef.current) {
                    void syncClassStateToServer(3);
                  }
                  leaveClassroom();
                }
              } catch {
                // Swallow errors from Agora event callback — unhandled errors
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
  }, [authLoading, userId, leaveClassroom, syncClassStateToServer]);

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
          <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary mb-4" />
            <p className="text-muted-foreground text-sm font-medium">{t("common.loading") || "Loading..."}</p>
          </div>
        }
      >
        <ClassroomContent />
      </Suspense>
    </>
  );
}
