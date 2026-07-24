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
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        Signed in
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-green-600"
          aria-hidden="true"
        >
          <path d="M4 10.5 8 14.5 16 6" />
        </svg>
      </h1>
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
