import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold">Wealth at Your Fingertips</h1>
        <p className="mt-2 text-sm text-gray-600">
          The financial intelligence once reserved for the wealthy — for everyone.
        </p>
        <div className="mt-8 space-y-3">
          <Link
            href="/sign-up"
            className="block w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create account
          </Link>
          <Link
            href="/sign-in"
            className="block w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
