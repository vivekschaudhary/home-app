export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Wealth at Your Fingertips</h1>
        <p className="mt-2 text-sm text-gray-600">
          Foundational scaffold is live. Health check at{" "}
          <code>/api/health</code>.
        </p>
      </div>
    </main>
  );
}
