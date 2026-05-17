"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const reason = searchParams.get("reason");
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    window.location.href = "/api/auth/login";
  };

  return (
    <>
      <div className="page-bg" />
      <div className="container">
        <div className="login-card card animate-in animate-in-delay-1">
          {/* Logo */}
          <div className="login-header">
            <div className="logo-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <h1>灵动课堂</h1>
            <p className="login-subtitle">在线互动教学平台</p>
          </div>

          {/* Session / OAuth messages */}
          {reason === "session_expired" && (
            <div className="login-notice" role="status">
              <span aria-hidden>⏱</span>
              <span>登录状态已过期，请重新登录以继续使用。</span>
            </div>
          )}

          {error && (
            <div className="login-error">
              <span>⚠️</span>
              <span>
                {error === "no_code" && "授权码缺失，请重新登录"}
                {error === "auth_failed" && "认证失败，请重试"}
                {!["no_code", "auth_failed"].includes(error) && "登录出错，请重试"}
              </span>
            </div>
          )}

          {/* SSO Login Button */}
          <button
            className="btn btn-primary login-btn"
            onClick={handleLogin}
            disabled={loading}
            id="btn-sso-login"
          >
            {loading ? (
              <>
                <span className="spinner" />
                正在跳转…
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                使用 SSO 登录
              </>
            )}
          </button>

          <p className="login-hint">
            通过统一身份认证系统登录，系统将自动识别您的教师或学生角色
          </p>
        </div>

        {/* Features */}
        <div className="features animate-in animate-in-delay-2">
          <div className="feature">
            <div className="feature-icon">🔐</div>
            <div className="feature-text">SSO 认证</div>
          </div>
          <div className="feature">
            <div className="feature-icon">📚</div>
            <div className="feature-text">课程管理</div>
          </div>
          <div className="feature">
            <div className="feature-icon">🎓</div>
            <div className="feature-text">角色权限</div>
          </div>
        </div>

        <footer className="footer animate-in animate-in-delay-3">
          Powered by{" "}
          <a href="https://www.shengwang.cn/" target="_blank" rel="noopener noreferrer">
            声网 Agora
          </a>{" "}
          · 灵动课堂 SDK
        </footer>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="page-bg" />}>
      <LoginContent />
    </Suspense>
  );
}
