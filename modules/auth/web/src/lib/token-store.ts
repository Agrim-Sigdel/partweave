import type { AuthTokens, TokenStore } from "@app/shared";

const ACCESS = "access_token";
const REFRESH = "refresh_token";

/**
 * Web TokenStore over localStorage. For production, prefer httpOnly cookies set
 * by a Next.js route handler — swap this impl without touching callers.
 */
export const tokenStore: TokenStore = {
  async get() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACCESS);
  },
  async getRefresh() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(REFRESH);
  },
  async set(tokens: AuthTokens) {
    window.localStorage.setItem(ACCESS, tokens.access);
    window.localStorage.setItem(REFRESH, tokens.refresh);
  },
  async setAccess(access: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACCESS, access);
  },
  async clear() {
    window.localStorage.removeItem(ACCESS);
    window.localStorage.removeItem(REFRESH);
  },
};
