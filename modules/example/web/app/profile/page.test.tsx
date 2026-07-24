// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/auth/auth-context", () => ({ useAuth }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import ProfilePage from "./page";

describe("example ProfilePage", () => {
  beforeEach(() => useAuth.mockReset());

  it("shows a loading state", () => {
    useAuth.mockReturnValue({ user: null, loading: true, logout: vi.fn() });
    render(<ProfilePage />);
    expect(screen.getByText(/Loading/)).toBeTruthy();
  });

  it("prompts to log in when there is no user", () => {
    useAuth.mockReturnValue({ user: null, loading: false, logout: vi.fn() });
    render(<ProfilePage />);
    // the "Log in" link is a leaf element with the login href
    expect(screen.getByText("Log in").getAttribute("href")).toBe("/login");
  });

  it("shows the signed-in user's details", () => {
    useAuth.mockReturnValue({
      user: { id: 7, email: "me@x.com" },
      loading: false,
      logout: vi.fn(),
    });
    render(<ProfilePage />);
    expect(screen.getByText("Signed in")).toBeTruthy();
    expect(screen.getByText(/me@x\.com/)).toBeTruthy();
    expect(screen.getByText(/ID: 7/)).toBeTruthy();
  });
});
