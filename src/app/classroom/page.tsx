"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
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
        reject(new Error("SDK 加载超时，请检查网络连接"));
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
        setErrorMsg("缺少必要参数：roomUuid 或 courseId，请从课程详情进入课堂");
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
            setErrorMsg("权限验证请求失败，请稍后重试");
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
          const resolvedRoomType =
            typeof verifyData.courseInfo?.roomType === "number"
              ? verifyData.courseInfo.roomType
              : rtp;
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
            language: "zh",
            duration: 60 * 30, // 30 minutes
            courseWareList: [],
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
            err instanceof Error ? err.message : "课堂启动失败，请检查配置",
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
      <div className="classroom-error">
        <h2>⚠️ 无法启动课堂</h2>
        <p>{errorMsg}</p>
        <Link href="/">返回首页</Link>
      </div>
    );
  }

  return (
    <div className="classroom-container">
            {status === "ready" && isEmbed && courseId && (
        <button
          type="button"
          className="classroom-back-btn classroom-back-btn-embed"
          onClick={leaveClassroom}
          title="退出直播"
        >
          退出
        </button>
      )}

      {(status === "loading" || status === "verifying") && (
        <div className="classroom-loading">
          <div className="loader" />
          <p>
            {status === "verifying" ? "正在验证访问权限…" : "正在初始化课堂…"}
          </p>
        </div>
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
          <div className="classroom-loading">
            <div className="loader" />
            <p>加载中…</p>
          </div>
        }
      >
        <ClassroomContent />
      </Suspense>
    </>
  );
}
