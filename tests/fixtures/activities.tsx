import React from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../src/lib/i18n/context";
import { ActivityWorkspace, ActivityStagePresentation } from "../../src/components/classroom/activity-workspace";
const sessionId = new URLSearchParams(location.search).get("sessionId")!;
const review = location.pathname.includes("review");
createRoot(document.getElementById("root")!).render(<I18nProvider initialLocale="zh-CN"><main style={{ display: "grid", gridTemplateColumns: review ? "1fr" : "minmax(0,1fr) 320px", height: "100vh", background: "#151c2a", color: "#f2f1f8", fontFamily: "system-ui", padding: 18, gap: 18 }}>
  {!review && <section className="classroom-v3-stage" style={{ position: "relative", minWidth: 0, borderRadius: 16, background: "#151c2a" }}><h1 style={{ padding: 20, fontSize: 20 }}>课堂活动验证 · PostgreSQL</h1><ActivityStagePresentation sessionId={sessionId} /></section>}
  <aside className={review ? "review-fixture" : "classroom-v3-drawer"} style={{ width: review ? "min(920px,100%)" : 320, minWidth: 0, height: "100%", overflow: "hidden", margin: review ? "0 auto" : 0 }}><ActivityWorkspace sessionId={sessionId} review={review} /></aside>
</main></I18nProvider>);
