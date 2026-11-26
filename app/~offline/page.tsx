"use client";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-gray-500">
        Check your internet connection and try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
      >
        Try again
      </button>
    </main>
  );
}
