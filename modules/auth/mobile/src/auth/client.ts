import type { AuthTokens, AuthUser, Credentials } from "@app/shared";
import { API_URL } from "@/lib/config";
import { tokenStore } from "@/lib/token-store";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await tokenStore.get();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

export async function login(creds: Credentials): Promise<void> {
  const tokens = await req<AuthTokens>("/api/auth/token", {
    method: "POST",
    body: JSON.stringify(creds),
  });
  await tokenStore.set(tokens);
}

export async function register(creds: Credentials): Promise<void> {
  await req("/api/auth/register", { method: "POST", body: JSON.stringify(creds) });
  await login(creds);
}

export async function fetchMe(): Promise<AuthUser> {
  return req<AuthUser>("/api/auth/me");
}

export async function logout(): Promise<void> {
  await tokenStore.clear();
}
