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
  get(): Promise<string | null>;
  set(tokens: AuthTokens): Promise<void>;
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
  // `auth` defaults to true — the stored token is attached. Public endpoints
  // (register/login/refresh) MUST pass `auth: false`: sending a stale/expired
  // token to them makes the server's JWTAuthentication reject the request with a
  // 401 before it ever reaches the AllowAny permission.
  async function req<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
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
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (res.status === 204 ? null : await res.json()) as T;
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
