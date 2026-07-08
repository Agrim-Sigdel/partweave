/** @jest-environment node */
let mockToken: string | null = null;

jest.mock("@/lib/config", () => ({ API_URL: "http://api.test" }));
jest.mock("@/lib/token-store", () => ({
  tokenStore: {
    get: jest.fn(async () => mockToken),
    set: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  },
}));

import { register, login, fetchMe, logout, ApiError } from "./client";
import { tokenStore } from "@/lib/token-store";

// A minimal Response-shaped object so the test doesn't depend on a global
// Response being present in the test environment.
function fakeRes(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
function callTo(path: string): unknown[] | undefined {
  return (global.fetch as jest.Mock).mock.calls.find((c) => String(c[0]).endsWith(path));
}
function authHeaderOf(call: unknown[] | undefined): unknown {
  const init = call?.[1] as { headers?: Record<string, unknown> } | undefined;
  return init?.headers?.Authorization;
}

describe("mobile auth client", () => {
  beforeEach(() => {
    mockToken = "STALE.TOKEN"; // a leftover token is present
    global.fetch = jest.fn(async () => fakeRes({ access: "a", refresh: "r" })) as unknown as typeof fetch;
  });

  it("register sends NO Authorization even with a stored token (regression: 401 on register)", async () => {
    await register({ email: "a@b.com", password: "supersecret" });
    const call = callTo("/api/auth/register");
    expect(call).toBeTruthy();
    expect(authHeaderOf(call)).toBeUndefined();
  });

  it("login sends NO Authorization", async () => {
    await login({ email: "a@b.com", password: "supersecret" });
    expect(authHeaderOf(callTo("/api/auth/token"))).toBeUndefined();
  });

  it("fetchMe DOES send the stored token", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(fakeRes({ id: 1, email: "a@b.com" }));
    await fetchMe();
    expect(authHeaderOf(callTo("/api/auth/me"))).toBe("Bearer STALE.TOKEN");
  });

  it("throws ApiError carrying the HTTP status on failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(fakeRes({ detail: "no" }, 401));
    await expect(fetchMe()).rejects.toBeInstanceOf(ApiError);
    (global.fetch as jest.Mock).mockResolvedValueOnce(fakeRes({ detail: "no" }, 401));
    await expect(fetchMe()).rejects.toMatchObject({ status: 401 });
  });

  it("logout clears the token store", async () => {
    await logout();
    expect(tokenStore.clear).toHaveBeenCalled();
  });
});
