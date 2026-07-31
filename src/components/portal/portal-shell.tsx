"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  CalendarDays,
  LogOut,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { SiteLogo } from "@/components/SiteLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { useTranslation } from "@/lib/i18n/context";
import styles from "./portal-shell.module.css";

export type PortalRole = "teacher" | "student";
export type TeacherPortalPage = "schedule" | "courses" | "students" | "settings";
export type StudentPortalPage = "learning" | "courses" | "settings";
export type PortalPage = TeacherPortalPage | StudentPortalPage;

type PortalUser = {
  name?: string;
  displayName?: string;
  avatar?: string;
  email?: string;
};

type PortalShellProps = {
  role: PortalRole;
  user: PortalUser;
  activePage: PortalPage;
  onPageChange: (page: PortalPage) => void;
  onLogout: () => void;
  children: ReactNode;
};

function portalCopy(t: ReturnType<typeof useTranslation>["t"]) {
  return {
    workspace: t("portal.workspace"),
    navigation: t("portal.navigation"),
    today: t("portal.today"),
    courses: t("portal.courses"),
    students: t("portal.students"),
    settings: t("portal.settings"),
    teacher: t("portal.teacherPortal"),
    student: t("portal.studentPortal"),
    liveSystem: t("portal.liveSystem"),
    logout: t("portal.logout"),
    account: t("portal.account"),
    language: t("portal.language"),
    appearance: t("portal.appearance"),
  };
}

export function PortalShell({
  role,
  user,
  activePage,
  onPageChange,
  onLogout,
  children,
}: PortalShellProps) {
  const { t, locale } = useTranslation();
  const copy = portalCopy(t);
  const [now, setNow] = useState(() => new Date());
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const navItems = useMemo(() => {
    const common = [
      {
        id: role === "teacher" ? "schedule" : "learning",
        label: copy.today,
        icon: CalendarDays,
        hint: "⌘1",
      },
      { id: "courses", label: copy.courses, icon: BookOpen, hint: "⌘2" },
    ];
    if (role === "teacher") {
      common.push({
        id: "students",
        label: copy.students,
        icon: Users,
        hint: "⌘3",
      });
    }
    return common;
  }, [copy.courses, copy.students, copy.today, role]);

  useEffect(() => {
    if (!accountOpen) return;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target;
      const isLanguageList =
        target instanceof Element &&
        Boolean(target.closest('[data-account-language-list="true"]'));
      if (!accountRef.current?.contains(target as Node) && !isLanguageList) {
        setAccountOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const index = Number(event.key) - 1;
      const target = navItems[index];
      if (!target) return;
      event.preventDefault();
      onPageChange(target.id as PortalPage);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navItems, onPageChange]);

  const title =
    activePage === "settings"
      ? copy.settings
      : navItems.find((item) => item.id === activePage)?.label || copy.today;
  const displayName = user.displayName || user.name || user.email || "User";

  const openSettings = () => {
    setAccountOpen(false);
    onPageChange("settings");
  };

  const nav = (
    <>
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={styles.navButton}
            data-active={activePage === item.id}
            onClick={() => onPageChange(item.id as PortalPage)}
            aria-current={activePage === item.id ? "page" : undefined}
          >
            <span className={styles.navIcon}>
              <Icon aria-hidden="true" />
            </span>
            <span className={styles.navText}>{item.label}</span>
            <span className={styles.navHint}>{item.hint}</span>
          </button>
        );
      })}
    </>
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <button
          type="button"
          className={styles.brand}
          onClick={() =>
            onPageChange(role === "teacher" ? "schedule" : "learning")
          }
        >
          <span className={styles.brandMark}>
            <SiteLogo decorative className="h-7 w-7" />
          </span>
          <span className={styles.brandCopy}>
            <strong>{t("common.appName")}</strong>
            <small>{copy.liveSystem}</small>
          </span>
        </button>

        <nav className={styles.nav} aria-label={copy.navigation}>
          <p className={styles.navLabel}>{copy.navigation}</p>
          {nav}
        </nav>

      </aside>

      <div className={styles.surface}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}>
            <span className={styles.brandMark}>
              <SiteLogo decorative className="h-6 w-6" />
            </span>
            <strong>{t("common.appName")}</strong>
          </div>
          <div className={styles.pageIdentity}>
            <small>
              <Sparkles className="mr-1 inline h-3 w-3" aria-hidden="true" />
              {copy.workspace}
            </small>
            <h1>{title}</h1>
          </div>
          <div className={styles.utility}>
            <span className={styles.clock}>
              <strong>
                {new Intl.DateTimeFormat(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(now)}
              </strong>
              <small>
                {new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                  weekday: "short",
                }).format(now)}
              </small>
            </span>
            <div className={styles.account} ref={accountRef}>
              <button
                type="button"
                className={styles.accountTrigger}
                onClick={() => setAccountOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label={copy.account}
                title={copy.account}
              >
                <Avatar className="h-9 w-9 border border-border/70">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                    {displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className={styles.accountPresence} />
              </button>
              {accountOpen && (
                <section className={styles.accountMenu} role="menu">
                  <header className={styles.accountIdentity}>
                    <Avatar className="h-11 w-11 border border-border/70">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                        {displayName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>
                      <small>{copy.account}</small>
                      <strong>{displayName}</strong>
                      {user.email && <em>{user.email}</em>}
                    </span>
                  </header>
                  <button
                    type="button"
                    className={styles.accountSettings}
                    onClick={openSettings}
                    role="menuitem"
                  >
                    <span><Settings aria-hidden="true" /></span>
                    <div>
                      <strong>{copy.settings}</strong>
                      <small>
                        {role === "teacher" ? copy.teacher : copy.student}
                      </small>
                    </div>
                  </button>
                  <div className={styles.accountPreference}>
                    <span>{copy.language}</span>
                    <LanguageSwitcher className="w-[136px]" />
                  </div>
                  <div className={styles.accountPreference}>
                    <span>{copy.appearance}</span>
                    <ThemeToggle className="h-9 w-9" />
                  </div>
                  <button
                    type="button"
                    className={styles.accountLogout}
                    onClick={onLogout}
                    role="menuitem"
                  >
                    <LogOut aria-hidden="true" />
                    {copy.logout}
                  </button>
                </section>
              )}
            </div>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>

      <nav className={styles.mobileNav} aria-label={copy.navigation}>
        {nav}
      </nav>
    </div>
  );
}
