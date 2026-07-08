// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Defined via vi.hoisted so they exist when the hoisted vi.mock() factory runs.
// A real ApiError class so the provider's `instanceof` check works.
const { ApiError, fetchMe, logout } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, body = "") {
      super(`${status} ${body}`);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return { ApiError, fetchMe: vi.fn(), logout: vi.fn(async () => {}) };
});

vi.mock("@/auth/client", () => ({
  ApiError,
  fetchMe,
  logout,
  login: vi.fn(async () => {}),
  register: vi.fn(async () => {}),
}));

import { AuthProvider, useAuth } from "./auth-context";

function Probe() {
  const { user, loading } = useAuth();
  return <span>{loading ? "loading" : user ? user.email : "anon"}</span>;
}
const renderProvider = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

describe("web AuthProvider", () => {
  beforeEach(() => {
    fetchMe.mockReset();
    logout.mockReset();
  });

  it("loads the current user on mount", async () => {
    fetchMe.mockResolvedValueOnce({ id: 1, email: "a@b.com" });
    renderProvider();
    expect(await screen.findByText("a@b.com")).toBeTruthy();
    expect(logout).not.toHaveBeenCalled();
  });

  it("clears a stale token when /me returns 401", async () => {
    fetchMe.mockRejectedValueOnce(new ApiError(401, "expired"));
    renderProvider();
    expect(await screen.findByText("anon")).toBeTruthy();
    expect(logout).toHaveBeenCalledTimes(1); // stale token cleared
  });

  it("keeps the token on a non-401 failure (e.g. server unreachable)", async () => {
    fetchMe.mockRejectedValueOnce(new Error("network down"));
    renderProvider();
    expect(await screen.findByText("anon")).toBeTruthy();
    expect(logout).not.toHaveBeenCalled();
  });
});
