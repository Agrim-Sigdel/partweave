"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, createAuthClient, type AuthUser, type Credentials } from "@app/shared";
import { API_URL } from "@/lib/config";
import { tokenStore } from "@/lib/token-store";

// Compose the shared auth client with this app's config + token store. The HTTP
// layer lives once in @app/shared; only the injected dependencies are local.
const auth = createAuthClient({ baseUrl: API_URL, tokenStore });

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
    } catch (err) {
      // A 401 means the stored token is stale/expired — clear it so it isn't
      // re-sent on later requests. Other errors (e.g. server down) keep it.
      if (err instanceof ApiError && err.status === 401) await auth.logout();
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
