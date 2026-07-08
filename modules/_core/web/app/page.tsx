import { navLinks } from "@/nav";

export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">{{projectName}}</h1>
      <p className="mt-2 text-gray-600">Generated with base — start building.</p>
      {navLinks.length > 0 && (
        <ul className="mt-6 space-y-2">
          {navLinks.map((l) => (
            <li key={l.href}>
              <a className="text-blue-600 underline" href={l.href}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
