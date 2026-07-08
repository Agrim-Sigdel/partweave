import type { AuthTokens, AuthUser, Credentials } from "@app/shared";
import { API_URL } from "@/lib/config";
import { tokenStore } from "@/lib/token-store";

// `auth` defaults to true — the stored token is attached. Public endpoints
// (register/login/refresh) MUST pass `auth: false`: sending a stale/expired
// token to them makes the server's JWTAuthentication reject the request with a
// 401 before it ever reaches the AllowAny permission.
async function req<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const token = auth ? await tokenStore.get() : null;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

export async function login(creds: Credentials): Promise<void> {
  const tokens = await req<AuthTokens>("/api/auth/token", {
    method: "POST",
    body: JSON.stringify(creds),
    auth: false,
  });
  await tokenStore.set(tokens);
}

export async function register(creds: Credentials): Promise<void> {
  await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(creds),
    auth: false,
  });
  await login(creds);
}

export async function fetchMe(): Promise<AuthUser> {
  return req<AuthUser>("/api/auth/me");
}

export async function logout(): Promise<void> {
  await tokenStore.clear();
}
