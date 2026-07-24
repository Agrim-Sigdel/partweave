import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react-native";
import { useAuth } from "@/auth/auth-context";

// Create the mock inside the factory (no out-of-scope refs), then import it back
// — jest hoists jest.mock above the imports, so `useAuth` is the mocked fn here.
jest.mock("@/auth/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return { Link: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});

import Profile from "./profile";

const mockUseAuth = useAuth as jest.Mock;

describe("example Profile screen", () => {
  beforeEach(() => mockUseAuth.mockReset());

  it("shows a loading state", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, logout: jest.fn() });
    render(<Profile />);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("prompts to log in when there is no user", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, logout: jest.fn() });
    render(<Profile />);
    expect(screen.getByText("Not logged in.")).toBeTruthy();
    expect(screen.getByText("Log in")).toBeTruthy();
  });

  it("shows the signed-in user's details", () => {
    mockUseAuth.mockReturnValue({
      user: { id: 7, email: "me@x.com" },
      loading: false,
      logout: jest.fn(),
    });
    render(<Profile />);
    expect(screen.getByText("Signed in")).toBeTruthy();
    expect(screen.getByText("Email: me@x.com")).toBeTruthy();
    expect(screen.getByText("ID: 7")).toBeTruthy();
  });
});
