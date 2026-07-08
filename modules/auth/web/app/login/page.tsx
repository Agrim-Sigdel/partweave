"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/auth-context";

export default function LoginPage() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await (mode === "login" ? login : register)({ email, password });
      router.push("/");
    } catch {
      setError(mode === "login" ? "Invalid credentials" : "Registration failed");
    }
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold">
        {mode === "login" ? "Log in" : "Create account"}
      </h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          className="w-full rounded border p-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded border p-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-blue-600 p-2 text-white" type="submit">
          {mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>
      <button
        className="mt-4 text-sm text-blue-600 underline"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
      </button>
    </main>
  );
}
