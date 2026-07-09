// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, createAuthClient, type TokenStore } from "@app/shared";

// The shared auth client is now the single source (no per-app copy). This
// exercises the real @app/shared implementation with an injected token store and
// a stubbed fetch — one test guards both web and mobile.

// A leftover token is present for every test — the exact condition that produced
// the register-401 bug.
let storedToken: string | null = null;
let storedRefresh: string | null = null;
const tokenStore: TokenStore = {
  get: vi.fn(async () => storedToken),
  getRefresh: vi.fn(async () => storedRefresh),
  set: vi.fn(async () => {}),
  setAccess: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
};
const auth = createAuthClient({ baseUrl: "http://api.test", tokenStore });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function callTo(fetchMock: ReturnType<typeof vi.fn>, path: string) {
  return fetchMock.mock.calls.find((c) => String(c[0]).endsWith(path));
}
function authHeaderOf(call: unknown[] | undefined): unknown {
  const init = call?.[1] as { headers?: Record<string, unknown> } | undefined;
  return init?.headers?.Authorization;
}

describe("shared auth client (createAuthClient)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storedToken = "STALE.TOKEN";
    storedRefresh = null; // refresh-specific tests opt in
    fetchMock = vi.fn(async () => jsonResponse({ access: "a", refresh: "r" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("injects the baseUrl into request URLs", async () => {
    await auth.login({ email: "a@b.com", password: "supersecret" });
    expect(callTo(fetchMock, "/api/auth/token")?.[0]).toBe("http://api.test/api/auth/token");
  });

  it("register sends NO Authorization even with a stored token (regression: 401 on register)", async () => {
    await auth.register({ email: "a@b.com", password: "supersecret" });
    const call = callTo(fetchMock, "/api/auth/register");
    expect(call, "register endpoint was called").toBeTruthy();
    expect(authHeaderOf(call)).toBeUndefined();
  });

  it("login sends NO Authorization", async () => {
    await auth.login({ email: "a@b.com", password: "supersecret" });
    expect(authHeaderOf(callTo(fetchMock, "/api/auth/token"))).toBeUndefined();
  });

  it("fetchMe DOES send the stored token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, email: "a@b.com" }));
    await auth.fetchMe();
    expect(authHeaderOf(callTo(fetchMock, "/api/auth/me"))).toBe("Bearer STALE.TOKEN");
  });

  it("throws ApiError carrying the HTTP status on failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "no" }, 401));
    await expect(auth.fetchMe()).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "no" }, 401));
    await expect(auth.fetchMe()).rejects.toMatchObject({ status: 401 });
  });

  it("logout clears the token store", async () => {
    await auth.logout();
    expect(tokenStore.clear).toHaveBeenCalled();
  });

  it("refreshes the access token once on a 401 and retries the request (F30)", async () => {
    storedRefresh = "REFRESH.TOKEN";
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401)) // /me → 401
      .mockResolvedValueOnce(jsonResponse({ access: "NEW.ACCESS" })) // /token/refresh
      .mockResolvedValueOnce(jsonResponse({ id: 1, email: "a@b.com" })); // /me retry
    const me = await auth.fetchMe();
    expect(me).toMatchObject({ id: 1, email: "a@b.com" });
    expect(callTo(fetchMock, "/api/auth/token/refresh")).toBeTruthy();
    expect(tokenStore.setAccess).toHaveBeenCalledWith("NEW.ACCESS");
  });

  it("does not attempt refresh when there is no refresh token (surfaces the 401)", async () => {
    storedRefresh = null;
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "no" }, 401));
    await expect(auth.fetchMe()).rejects.toMatchObject({ status: 401 });
    expect(callTo(fetchMock, "/api/auth/token/refresh")).toBeFalsy();
  });

  it("surfaces the 401 (no infinite loop) when the refresh itself fails", async () => {
    storedRefresh = "EXPIRED.REFRESH";
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401)) // /me → 401
      .mockResolvedValueOnce(jsonResponse({ detail: "invalid" }, 401)); // /token/refresh → 401
    await expect(auth.fetchMe()).rejects.toMatchObject({ status: 401 });
    // exactly one refresh attempt, then it gives up
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/api/auth/token/refresh"))).toHaveLength(1);
  });
});
