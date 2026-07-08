// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// A leftover token is present in storage for every test — the exact condition
// that produced the register-401 bug.
let storedToken: string | null = null;

vi.mock("@/lib/config", () => ({ API_URL: "http://api.test" }));
vi.mock("@/lib/token-store", () => ({
  tokenStore: {
    get: vi.fn(async () => storedToken),
    set: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  },
}));

import { register, login, fetchMe, logout, ApiError } from "./client";
import { tokenStore } from "@/lib/token-store";

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

describe("web auth client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storedToken = "STALE.TOKEN";
    fetchMock = vi.fn(async () => jsonResponse({ access: "a", refresh: "r" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("register sends NO Authorization even with a stored token (regression: 401 on register)", async () => {
    await register({ email: "a@b.com", password: "supersecret" });
    const call = callTo(fetchMock, "/api/auth/register");
    expect(call, "register endpoint was called").toBeTruthy();
    expect(authHeaderOf(call)).toBeUndefined();
  });

  it("login sends NO Authorization", async () => {
    await login({ email: "a@b.com", password: "supersecret" });
    expect(authHeaderOf(callTo(fetchMock, "/api/auth/token"))).toBeUndefined();
  });

  it("fetchMe DOES send the stored token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, email: "a@b.com" }));
    await fetchMe();
    expect(authHeaderOf(callTo(fetchMock, "/api/auth/me"))).toBe("Bearer STALE.TOKEN");
  });

  it("throws ApiError carrying the HTTP status on failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "no" }, 401));
    await expect(fetchMe()).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "no" }, 401));
    await expect(fetchMe()).rejects.toMatchObject({ status: 401 });
  });

  it("logout clears the token store", async () => {
    await logout();
    expect(tokenStore.clear).toHaveBeenCalled();
  });
});
