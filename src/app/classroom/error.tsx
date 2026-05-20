"use client";

export default function ClassroomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="classroom-error">
      <h2>课堂运行异常</h2>
      <p>{error.message || "发生了未预期的错误"}</p>
      <button type="button" onClick={reset}>重试</button>
      <a href="/">返回首页</a>
    </div>
  );
}