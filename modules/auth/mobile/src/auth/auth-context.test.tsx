import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

jest.mock("@/lib/config", () => ({ API_URL: "http://api.test" }));
jest.mock("@/lib/token-store", () => ({
  tokenStore: { get: jest.fn(), set: jest.fn(), clear: jest.fn() },
}));

// Self-contained factory (no out-of-scope refs) so it's safe under jest's mock
// hoisting: `import "./auth-context"` requires this module before top-level code
// runs. A real ApiError class makes the provider's `instanceof` 401 check work;
// the spies are shared via the createAuthClient closure, so the provider and the
// test below see the same instances. Mocking @app/shared also keeps jest from
// having to transform the real workspace package.
jest.mock("@app/shared", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, body = "") {
      super(`${status} ${body}`);
      this.name = "ApiError";
      this.status = status;
    }
  }
  const fetchMe = jest.fn();
  const logout = jest.fn(async () => {});
  return {
    ApiError,
    createAuthClient: () => ({
      fetchMe,
      logout,
      login: jest.fn(async () => {}),
      register: jest.fn(async () => {}),
    }),
  };
});

import { AuthProvider, useAuth } from "./auth-context";

const mock = jest.requireMock("@app/shared") as {
  ApiError: new (status: number, body?: string) => Error;
  createAuthClient: () => { fetchMe: jest.Mock; logout: jest.Mock };
};
// Same spy instances the provider captured (shared through the closure).
const { fetchMe, logout } = mock.createAuthClient();

function Probe() {
  const { user, loading } = useAuth();
  return <Text>{loading ? "loading" : user ? user.email : "anon"}</Text>;
}
const renderProvider = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

describe("mobile AuthProvider", () => {
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
    fetchMe.mockRejectedValueOnce(new mock.ApiError(401, "expired"));
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
