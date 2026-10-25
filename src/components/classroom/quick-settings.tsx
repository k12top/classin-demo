"use client";
import { ClassroomIconButton } from "./icon-button";
import { useEffect, useState } from "react";
import { Settings2, Mic, Video, Languages, Headphones, Sun, Moon, SlidersHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import type { ClassroomMediaProvider } from "@/lib/classroom/types";
import { useTranslation } from "@/lib/i18n/context";
import { languageOptions, type SupportedLocale } from "@/lib/i18n/locales";

export function ClassroomQuickSettings({ provider, dark, onTheme, onCaptions, onAdvanced }: { provider: ClassroomMediaProvider; dark: boolean; onTheme: () => void; onCaptions: () => void; onAdvanced: () => void }) {
  const { t, locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false), [devices, setDevices] = useState<{ microphones: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] }>({ microphones: [], cameras: [] });
  const [selected, setSelected] = useState({ microphone: "", camera: "" }), [error, setError] = useState("");
  useEffect(() => { if (!open) return; let current = true; provider.listDevices().then(value => { if (current) setDevices(value); }).catch(() => { if (current) setError(t("classroomMinimal.devicesUnavailable")); }); return () => { current = false; }; }, [open, provider, t]);
  async function change(kind: "microphone" | "camera", value: string) { setError(""); try { if (kind === "microphone") await provider.setMicrophoneDevice(value); else await provider.setCameraDevice(value); setSelected(previous => ({ ...previous, [kind]: value })); } catch (failure) { setError(failure instanceof Error ? failure.message : t("classroomMinimal.devicesUnavailable")); } }
  return <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger asChild><ClassroomIconButton type="button" className="classroom-minimal-icon classroom-minimal-settings" title={t("classroom.v3.deviceSettings")} aria-label={t("classroom.v3.deviceSettings")}><Settings2 /></ClassroomIconButton></DropdownMenuTrigger>
    <DropdownMenuContent className="classroom-header-menu classroom-quick-settings" align="end" collisionPadding={8}>
      {(["microphone", "camera"] as const).map(kind => <DropdownMenuSub key={kind}><DropdownMenuSubTrigger>{kind === "microphone" ? <Mic /> : <Video />}<span>{t(kind === "microphone" ? "classroom.v3.microphone" : "classroom.v3.camera")}</span></DropdownMenuSubTrigger><DropdownMenuSubContent className="classroom-header-menu" collisionPadding={8}><DropdownMenuRadioGroup value={selected[kind]} onValueChange={value => { void change(kind, value); }}>{(kind === "microphone" ? devices.microphones : devices.cameras).map((device, index) => <DropdownMenuRadioItem key={device.deviceId} value={device.deviceId}>{device.label || `${t(kind === "microphone" ? "classroom.v3.microphone" : "classroom.v3.camera")} ${index + 1}`}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>{!(kind === "microphone" ? devices.microphones : devices.cameras).length && <DropdownMenuItem disabled>{t("classroomMinimal.noDevice")}</DropdownMenuItem>}</DropdownMenuSubContent></DropdownMenuSub>)}
      <DropdownMenuItem onSelect={onCaptions}><Headphones />{t("classroom.v3.captions")}</DropdownMenuItem>
      <DropdownMenuSub><DropdownMenuSubTrigger><Languages />{t("classroom.v3.interfaceLanguage")}</DropdownMenuSubTrigger><DropdownMenuSubContent className="classroom-header-menu" collisionPadding={8}><DropdownMenuRadioGroup value={locale} onValueChange={value => setLocale(value as SupportedLocale)}>{languageOptions.map(language => <DropdownMenuRadioItem key={language.value} value={language.value}>{language.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent></DropdownMenuSub>
      <DropdownMenuItem onSelect={onTheme}>{dark ? <Sun /> : <Moon />}{t(dark ? "common.switchToLightMode" : "common.switchToDarkMode")}</DropdownMenuItem>
      <DropdownMenuItem onSelect={onAdvanced}><SlidersHorizontal />{t("classroomMinimal.advanced")}</DropdownMenuItem>
      {error && <p className="classroom-settings-error" role="alert">{error}</p>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
