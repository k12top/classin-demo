"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Script from "next/script";

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

function ClassroomContent() {
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const unmountRef = useRef<(() => void) | null>(null);
  const launchedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [errorMsg, setErrorMsg] = useState("");

  // Extract params from URL
  const roomUuid = searchParams.get("roomUuid") || "";
  const userUuid = searchParams.get("userUuid") || "";
  const userName = searchParams.get("userName") || "";
  const roleType = Number(searchParams.get("roleType") || "2");
  const roomType = Number(searchParams.get("roomType") || "0");
  const roomName = searchParams.get("roomName") || roomUuid;

  useEffect(() => {
    if (!roomUuid || !userUuid || !userName) {
      setStatus("error");
      setErrorMsg("缺少必要参数：roomUuid、userUuid 或 userName");
      return;
    }

    if (launchedRef.current) return;
    launchedRef.current = true;

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

    async function launchClassroom() {
      try {
        // 1. Wait for SDK to be available from CDN
        await waitForSDK();

        // 2. Fetch token from our server API
        const tokenRes = await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomUuid, userUuid, role: roleType }),
        });

        if (!tokenRes.ok) {
          const err = await tokenRes.json();
          throw new Error(err.error || "Token 获取失败");
        }

        const { token, appId } = await tokenRes.json();

        // 3. Configure SDK
        window.AgoraEduSDK.config({
          appId,
          region: "CN",
        });

        // 4. Collect available widgets
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

        // 5. Launch classroom
        if (!containerRef.current) {
          throw new Error("课堂容器未就绪");
        }

        setStatus("ready");

        const unmount = window.AgoraEduSDK.launch(containerRef.current, {
          userUuid,
          userName,
          roomUuid,
          roleType,
          roomType,
          roomName,
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
            console.log("[灵动课堂事件]", evt, args);
          },
        });

        unmountRef.current = unmount;
      } catch (err) {
        console.error("启动课堂失败:", err);
        setStatus("error");
        setErrorMsg(
          err instanceof Error ? err.message : "课堂启动失败，请检查配置"
        );
      }
    }

    launchClassroom();

    // Cleanup on unmount
    return () => {
      if (unmountRef.current) {
        try {
          unmountRef.current();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [roomUuid, userUuid, userName, roleType, roomType, roomName]);

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
      {/* Loading overlay */}
      {status === "loading" && (
        <div className="classroom-loading">
          <div className="loader" />
          <p>正在初始化课堂…</p>
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
