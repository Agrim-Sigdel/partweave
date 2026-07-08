"use client";

import Link from "next/link";
import { useAuth } from "@/auth/auth-context";

export default function ProfilePage() {
  const { user, loading, logout } = useAuth();

  if (loading) return <main className="p-8">Loading…</main>;

  if (!user)
    return (
      <main className="p-8">
        Not logged in.{" "}
        <Link href="/login" className="text-blue-600 underline">
          Log in
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Signed in ✓</h1>
      <p className="mt-2">ID: {user.id}</p>
      <p>Email: {user.email}</p>
      <button
        className="mt-4 rounded bg-gray-800 px-3 py-1 text-white"
        onClick={() => logout()}
      >
        Log out
      </button>
    </main>
  );
}
