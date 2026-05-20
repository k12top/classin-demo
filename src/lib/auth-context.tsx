"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { tryOAuthRefresh } from "@/lib/auth-refresh-client";
import { redirectToSsoLogin } from "@/lib/auth-login";

export interface AuthUser {
  userId: string;
  name: string;
  displayName: string;
  avatar: string;
  role: "teacher" | "student";
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
});

async function fetchMeWithRefresh(): Promise<AuthUser | null> {
  let res = await fetch("/api/auth/me", { cache: "no-store" });
  if (res.status === 401 && (await tryOAuthRefresh())) {
    res = await fetch("/api/auth/me", { cache: "no-store" });
  }
  if (!res.ok) return null;
  const data = await res.json();
  return data.user ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const u = await fetchMeWithRefresh();
        setUser(u);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (loading) return;
      if (typeof window !== "undefined" && window.location.pathname === "/login") {
        return;
      }

      void (async () => {
        try {
          const u = await fetchMeWithRefresh();
          if (u) {
            // Only update state when user data actually changed — a new object
            // reference with identical data still triggers consumer re-renders
            // and re-runs their useEffects (e.g. Agora classroom re-launch).
            if (
              !user ||
              u.userId !== user.userId ||
              u.displayName !== user.displayName ||
              u.role !== user.role
            ) {
              setUser(u);
            }
            return;
          }
          if (user !== null) {
            setUser(null);
            redirectToSsoLogin();
          }
        } catch {
          // Network error during tab-switch re-validation — don't crash the app
        }
      })();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [loading, user]);

  // Proactive refresh while user is logged in (keeps Casdoor access + rolling session cookie).
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      void tryOAuthRefresh();
    }, 25 * 60 * 1000);
    return () => clearInterval(id);
  }, [user]);

  const login = useCallback(() => {
    window.location.href = "/api/auth/login";
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      setUser(null);
      window.location.href = "/login?logged_out=1";
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
