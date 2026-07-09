// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, createAuthClient, type TokenStore } from "@app/shared";

// The shared auth client is now the single source (no per-app copy). This
// exercises the real @app/shared implementation with an injected token store and
// a stubbed fetch — one test guards both web and mobile.

// A leftover token is present for every test — the exact condition that produced
// the register-401 bug.
let storedToken: string | null = null;
const tokenStore: TokenStore = {
  get: vi.fn(async () => storedToken),
  set: vi.fn(async () => {}),
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
});
