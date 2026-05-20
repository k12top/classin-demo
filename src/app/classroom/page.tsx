"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { useAuth } from "@/lib/auth-context";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";
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

function ClassroomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const unmountRef = useRef<(() => void) | null>(null);
  const leftClassroomRef = useRef(false);

  const [status, setStatus] = useState<"verifying" | "loading" | "ready" | "error">(
    "verifying"
  );
  const [errorMsg, setErrorMsg] = useState("");

  // Extract params from URL
  const roomUuid = searchParams.get("roomUuid") || "";
  const roomTypeParam = Number(searchParams.get("roomType") || "0");
  const roomName = searchParams.get("roomName") || roomUuid;
  const courseId = searchParams.get("courseId") || "";
  const isEmbed =
    searchParams.get("embed") === "1" || searchParams.get("embed") === "true";

  const leaveClassroom = useCallback(() => {
    if (leftClassroomRef.current) return;
    leftClassroomRef.current = true;

    if (unmountRef.current) {
      try {
        unmountRef.current();
      } catch {
        // ignore cleanup errors
      }
      unmountRef.current = null;
    }

    resetDocumentAfterClassroom();

    const target = courseId
      ? `/courses/${encodeURIComponent(courseId)}`
      : "/";

    // Full navigation reloads CSS — avoids Agora global styles breaking layout
    window.location.replace(target);
  }, [courseId]);

  useEffect(() => {
    markClassroomDocumentActive();
    return () => {
      resetDocumentAfterClassroom();
    };
  }, []);

  useEffect(() => {
    if (authLoading || leftClassroomRef.current) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (!user) {
        redirectToSsoLogin();
        return;
      }

      if (!roomUuid || !courseId) {
        setStatus("error");
        setErrorMsg("缺少必要参数：roomUuid 或 courseId，请从课程详情进入课堂");
        return;
      }

      void (async () => {
        let verifyRoomLabel = roomName;

        try {
          let verifyRes = await fetch(`/api/courses/${courseId}/verify-access`);
          if (cancelled) return;

          if (verifyRes.status === 401 && (await tryOAuthRefresh())) {
            verifyRes = await fetch(`/api/courses/${courseId}/verify-access`);
          }
          if (verifyRes.status === 401) {
            redirectToSsoLogin();
            return;
          }

          if (!verifyRes.ok) {
            setStatus("error");
            setErrorMsg("权限验证请求失败，请稍后重试");
            return;
          }

          const verifyData = await verifyRes.json();

          if (!verifyData.allowed) {
            router.replace(
              `/access-denied?reason=${encodeURIComponent(verifyData.reason || "无权访问")}&course=${encodeURIComponent(verifyRoomLabel)}`
            );
            return;
          }

          const resolvedRole: number =
            verifyData.role === "teacher" ? 1 : 2;
          const resolvedRoomType =
            typeof verifyData.courseInfo?.roomType === "number"
              ? verifyData.courseInfo.roomType
              : roomTypeParam;
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
              roomUuid,
              courseId,
              userUuid: user.userId,
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
                roomUuid,
                courseId,
                userUuid: user.userId,
              }),
            });
          }

          if (!tokenRes.ok) {
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

          const displayName = user.displayName || user.name;

          const unmount = window.AgoraEduSDK.launch(containerRef.current, {
            userUuid: user.userId,
            userName: displayName,
            roomUuid,
            roleType: resolvedRole,
            roomType: resolvedRoomType,
            roomName: verifyRoomLabel,
            pretest: true,
            rtmToken: token,
            language: "zh",
            duration: 60 * 30, // 30 minutes
            courseWareList: [],
            virtualBackgroundImages: [],
            webrtcExtensionBaseUrl:
              "https://solutions-apaas.agora.io/static",
            uiMode: "dark",
            widgets,
            listener: (evt: unknown, ...args: unknown[]) => {
              try {
                const code =
                  typeof evt === "number"
                    ? evt
                    : typeof evt === "object" &&
                        evt !== null &&
                        "type" in evt &&
                        typeof (evt as { type: unknown }).type === "number"
                      ? (evt as { type: number }).type
                      : null;
                if (code === AGORA_EVT_DESTROYED || code === AGORA_EVT_KICK_OUT) {
                  leaveClassroom();
                }
              } catch {
                // Swallow errors from Agora event callback — unhandled errors
                // here crash the React tree and cause Next.js to reload the
                // entire page (especially when DevTools is closed).
              }
            },
          });

          unmountRef.current = unmount;
        } catch (err) {
          if (cancelled) return;
          console.error("启动课堂失败:", err);
          setStatus("error");
          setErrorMsg(
            err instanceof Error ? err.message : "课堂启动失败，请检查配置"
          );
        }
      })();
    });

    return () => {
      cancelled = true;
      if (unmountRef.current) {
        try {
          unmountRef.current();
        } catch {
          // ignore cleanup errors
        }
        unmountRef.current = null;
      }
    };
  }, [
    authLoading,
    user,
    roomUuid,
    roomTypeParam,
    roomName,
    courseId,
    router,
    leaveClassroom,
  ]);

  // Wait for the CDN scripts to load
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

  // Error state
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
      {status === "ready" && !isEmbed && (
        <button
          type="button"
          className="classroom-back-btn"
          onClick={leaveClassroom}
          title="返回课程详情"
        >
          ← 返回课程
        </button>
      )}
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

      {/* Loading overlay */}
      {(status === "loading" || status === "verifying") && (
        <div className="classroom-loading">
          <div className="loader" />
          <p>{status === "verifying" ? "正在验证访问权限…" : "正在初始化课堂…"}</p>
        </div>
      )}

      {/* SDK renders into this div */}
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
