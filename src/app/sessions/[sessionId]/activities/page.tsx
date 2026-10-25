"use client";
import { use } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { redirectToSsoLogin } from "@/lib/auth-login";
import { useSearchParams } from "next/navigation";
import { ActivityWorkspace } from "@/components/classroom/activity-workspace";
import { useTranslation } from "@/lib/i18n/context";
import styles from "@/components/classroom/activity-workspace.module.css";
export default function ActivityReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const search = useSearchParams();
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  return <main className={styles.reviewPage}><header><Link href="/courses">{t("activities.back")}</Link></header>{loading ? <p>{t("activities.loading")}</p> : !user ? <button type="button" onClick={() => redirectToSsoLogin()}>{t("activities.login")}</button> : <ActivityWorkspace key={sessionId} sessionId={sessionId} shareAccess={search.get("shareAccess")} review />}</main>;
}
