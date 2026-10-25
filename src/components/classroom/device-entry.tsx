"use client";

import { ArrowLeft, ArrowRightLeft, Laptop, MonitorSmartphone, Users } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import type { ClassroomDeviceEntryMode } from "@/lib/classroom/device-admission";
import styles from "./device-entry.module.css";

export function ClassroomDeviceEntry({ replaced = false, devices = [], onChoose, onBack, onRejoin }: {
  replaced?: boolean; devices?: string[];
  onChoose: (mode: ClassroomDeviceEntryMode) => void; onBack: () => void; onRejoin: () => void;
}) {
  const { t } = useTranslation();
  return <main className={styles.page}>
    <section className={styles.content} aria-labelledby="device-entry-title">
      <MonitorSmartphone className={styles.symbol} aria-hidden="true" />
      <h1 id="device-entry-title">{t(replaced ? "classroomDeviceEntry.replacedTitle" : "classroomDeviceEntry.title")}</h1>
      <p>{t(replaced ? "classroomDeviceEntry.replacedHint" : "classroomDeviceEntry.hint")}</p>
      {!replaced && devices.some(Boolean) && <div className={styles.devices}><Laptop aria-hidden="true" /><span>{devices.filter(Boolean).join("、")}</span></div>}
      {replaced ? <button className={styles.rejoin} onClick={onRejoin}>{t("classroomDeviceEntry.rejoin")}</button> : <div className={styles.choices}>
        <button onClick={() => onChoose("together")}><Users aria-hidden="true" /><span><strong>{t("classroomDeviceEntry.together")}</strong><small>{t("classroomDeviceEntry.togetherHint")}</small></span></button>
        <button onClick={() => onChoose("replace")}><ArrowRightLeft aria-hidden="true" /><span><strong>{t("classroomDeviceEntry.replace")}</strong><small>{t("classroomDeviceEntry.replaceHint")}</small></span></button>
      </div>}
      <button className={styles.back} onClick={onBack}><ArrowLeft aria-hidden="true" />{t("classroomDeviceEntry.back")}</button>
    </section>
  </main>;
}
