/** Auth contracts shared by web and mobile. Concrete impls live per-platform. */

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthUser {
  id: number;
  email: string;
}

/**
 * Where access/refresh tokens are persisted. Web implements this over
 * localStorage/cookies; mobile over expo-secure-store. Consumers depend on this
 * interface, never on a concrete store.
 */
export interface TokenStore {
  /** the current access token */
  get(): Promise<string | null>;
  /** the current refresh token (used to mint a new access token) */
  getRefresh(): Promise<string | null>;
  /** persist a fresh access+refresh pair (after login/register) */
  set(tokens: AuthTokens): Promise<void>;
  /** replace only the access token (after a silent refresh) */
  setAccess(access: string): Promise<void>;
  clear(): Promise<void>;
}

/** Error carrying the HTTP status, so callers can react to e.g. a 401. */
export class ApiError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`${status} ${body}`);
    this.name = "ApiError";
  }
}

export interface AuthClientOptions {
  /** API server base URL, e.g. "http://localhost:8000". */
  baseUrl: string;
  /** Platform token persistence (localStorage on web, secure-store on mobile). */
  tokenStore: TokenStore;
}

export interface AuthClient {
  login(creds: Credentials): Promise<void>;
  register(creds: Credentials): Promise<void>;
  fetchMe(): Promise<AuthUser>;
  logout(): Promise<void>;
}

/**
 * The auth HTTP layer, defined once and shared by web and mobile. Its two
 * dependencies — the API base URL and the token store — are **injected**, so
 * this function has no app-local (`@/…`) imports and can be lifted into a
 * versioned package unchanged. Each app builds its own instance from its own
 * config + platform token store (see `auth-context`).
 */
export function createAuthClient({ baseUrl, tokenStore }: AuthClientOptions): AuthClient {
  // Exchange the stored refresh token for a new access token (F30). Returns true
  // if a fresh access token was persisted. Never throws — a failed/absent refresh
  // just means the caller's original 401 stands (and the user re-authenticates).
  async function tryRefresh(): Promise<boolean> {
    const refresh = await tokenStore.getRefresh();
    if (!refresh) return false;
    const res = await fetch(`${baseUrl}/api/auth/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access?: string };
    if (!data.access) return false;
    await tokenStore.setAccess(data.access);
    return true;
  }

  // `auth` defaults to true — the stored token is attached. Public endpoints
  // (register/login/refresh) MUST pass `auth: false`: sending a stale/expired
  // token to them makes the server's JWTAuthentication reject the request with a
  // 401 before it ever reaches the AllowAny permission.
  //
  // On a 401 for an authed request we transparently refresh the access token
  // once and retry, so a short-lived access token doesn't log the user out while
  // their refresh token is still valid. `allowRefresh` guards against a loop.
  async function request<T>(
    path: string,
    init: RequestInit & { auth?: boolean },
    allowRefresh: boolean,
  ): Promise<T> {
    const { auth = true, headers, ...rest } = init;
    const token = auth ? await tokenStore.get() : null;
    const res = await fetch(`${baseUrl}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers ?? {}),
      },
    });
    if (res.status === 401 && auth && allowRefresh && (await tryRefresh())) {
      return request<T>(path, init, false); // retry once with the new access token
    }
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (res.status === 204 ? null : await res.json()) as T;
  }

  function req<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
    return request<T>(path, init, true);
  }

  async function login(creds: Credentials): Promise<void> {
    const tokens = await req<AuthTokens>("/api/auth/token", {
      method: "POST",
      body: JSON.stringify(creds),
      auth: false,
    });
    await tokenStore.set(tokens);
  }

  async function register(creds: Credentials): Promise<void> {
    await req("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(creds),
      auth: false,
    });
    await login(creds);
  }

  async function fetchMe(): Promise<AuthUser> {
    return req<AuthUser>("/api/auth/me");
  }

  async function logout(): Promise<void> {
    await tokenStore.clear();
  }

  return { login, register, fetchMe, logout };
}
