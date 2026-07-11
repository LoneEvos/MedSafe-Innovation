export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">MedSafe</h1>
      <p className="text-lg text-gray-600">
        Educational web app that checks a medication list for drug–drug
        interactions, builds a daily dosing schedule, and exports a PDF summary
        for your doctor.
      </p>
      <p
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
      >
        Educational tool only — not medical advice. Always consult your doctor or
        pharmacist.
      </p>
      <p className="text-sm text-gray-400">
        Scaffold ready. Health check:{" "}
        <a className="underline" href="/api/ping">
          /api/ping
        </a>
      </p>
    </main>
  );
}
