import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AuthUser, Credentials } from "@app/shared";
import * as auth from "@/auth/client";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (creds: Credentials) => Promise<void>;
  register: (creds: Credentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setUser(await auth.fetchMe());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const value: AuthState = {
    user,
    loading,
    login: async (creds) => {
      await auth.login(creds);
      await load();
    },
    register: async (creds) => {
      await auth.register(creds);
      await load();
    },
    logout: async () => {
      await auth.logout();
      setUser(null);
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
