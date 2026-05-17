"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function AccessDeniedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") || "您未被分配到此课程";
  const courseName = searchParams.get("course") || "";

  return (
    <>
      <div className="page-bg" />
      <div className="container">
        <div className="card animate-in animate-in-delay-1" style={{ textAlign: "center" }}>
          <div className="access-denied-icon">🚫</div>
          <h2 className="access-denied-title">无法访问此课堂</h2>
          {courseName && (
            <p className="access-denied-course">{courseName}</p>
          )}
          <p className="access-denied-reason">{reason}</p>

          <div className="access-denied-actions">
            <Link href="/" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
              返回课程列表
            </Link>
          </div>

          <div className="access-denied-help">
            <p>如果您认为这是一个错误，请联系课程老师将您加入课程。</p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AccessDeniedPage() {
  return (
    <Suspense fallback={<div className="page-bg" />}>
      <AccessDeniedContent />
    </Suspense>
  );
}
