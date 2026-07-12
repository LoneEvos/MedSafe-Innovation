"use client";

import { useRef, useState, type FormEvent } from "react";
import { buildSchedule, TIME_SLOTS, SLOT_TIMES } from "@/lib/schedule";
import { exportRegimenPdf } from "@/lib/pdf";

type Severity = "Major" | "Moderate" | "Minor";

type Interaction = {
  drugAName: string;
  drugBName: string;
  severity: Severity;
  mechanism: string | null;
  description: string | null;
  explanation: string;
};

type RecognizedDrug = {
  input: string;
  rxcui: string;
  standardName: string;
};

type CheckResponse = {
  recognized: RecognizedDrug[];
  unrecognized: string[];
  interactions: Interaction[];
  regimenSummary: string;
  disclaimer: string;
};

const SEVERITY_ORDER: Severity[] = ["Major", "Moderate", "Minor"];

const SEVERITY_STYLES: Record<
  Severity,
  { card: string; badge: string; heading: string }
> = {
  Major: {
    card: "border-red-300 bg-red-50",
    badge: "bg-red-600 text-white",
    heading: "text-red-900",
  },
  Moderate: {
    card: "border-amber-300 bg-amber-50",
    badge: "bg-amber-500 text-white",
    heading: "text-amber-900",
  },
  Minor: {
    card: "border-gray-300 bg-gray-100",
    badge: "bg-gray-600 text-white",
    heading: "text-gray-800",
  },
};

function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export default function Home() {
  const [meds, setMeds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addMed(e?: FormEvent) {
    e?.preventDefault();
    const name = input.trim();
    if (!name) return;
    // De-duplicate case-insensitively.
    if (meds.some((m) => m.toLowerCase() === name.toLowerCase())) {
      setInput("");
      return;
    }
    setMeds((prev) => [...prev, name]);
    setInput("");
  }

  // Batch-add scanned names, skipping ones already present. Returns the names
  // that were actually added.
  function addManyMeds(names: string[]): string[] {
    const added: string[] = [];
    setMeds((prev) => {
      const lower = new Set(prev.map((m) => m.toLowerCase()));
      const next = [...prev];
      for (const raw of names) {
        const name = raw.trim();
        if (!name || lower.has(name.toLowerCase())) continue;
        lower.add(name.toLowerCase());
        next.push(name);
        added.push(name);
      }
      return next;
    });
    return added;
  }

  function removeMed(name: string) {
    setMeds((prev) => prev.filter((m) => m !== name));
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setScanNote("Please choose an image file.");
      return;
    }
    setScanning(true);
    setScanNote(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/scan", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const data: { meds?: { name: string; dose: string | null }[] } =
        await res.json();
      const found = (data.meds ?? [])
        .map((m) => m.name)
        .filter((n): n is string => Boolean(n && n.trim()));
      if (found.length === 0) {
        setScanNote(
          "We couldn't read any medication from that photo. Try a clearer photo or type the name."
        );
        return;
      }
      addManyMeds(found);
      setScanNote(
        `Added from photo: ${found.join(", ")}. Please review and edit the chips below before checking.`
      );
    } catch {
      setScanNote(
        "Something went wrong reading the photo. Please try again or type the name."
      );
    } finally {
      setScanning(false);
    }
  }

  async function check() {
    if (meds.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drugs: meds }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: CheckResponse = await res.json();
      setResult(data);
    } catch {
      setError(
        "Something went wrong checking your medications. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const grouped = SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    items: result?.interactions.filter((i) => i.severity === sev) ?? [],
  })).filter((g) => g.items.length > 0);

  const hasRecognizedPair = (result?.recognized.length ?? 0) >= 2;
  const noInteractions =
    result !== null && hasRecognizedPair && result.interactions.length === 0;

  // Build the illustrative daily schedule from the recognized (normalized) meds.
  const recognizedNames = result?.recognized.map((r) => r.standardName) ?? [];
  const schedule = buildSchedule(recognizedNames);

  function downloadPdf() {
    if (!result) return;
    exportRegimenPdf({
      meds,
      recognized: Array.from(new Set(recognizedNames)),
      unrecognized: result.unrecognized,
      interactions: result.interactions.map((i) => ({
        drugAName: i.drugAName,
        drugBName: i.drugBName,
        severity: i.severity,
        explanation: i.explanation,
      })),
      regimenSummary: result.regimenSummary,
      schedule,
    });
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Persistent disclaimer banner */}
      <div
        role="note"
        className="sticky top-0 z-10 bg-amber-100 px-4 py-3 text-center text-sm font-semibold text-amber-950 shadow-sm sm:text-base"
      >
        ⚕️ Educational tool only — not medical advice. Always consult your doctor
        or pharmacist.
      </div>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            MedSafe
          </h1>
          <p className="mt-3 text-lg text-gray-600 sm:text-xl">
            Add your medications to check for known drug–drug interactions.
          </p>
        </header>

        {/* Input form */}
        <section
          aria-labelledby="add-med-heading"
          className="rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6"
        >
          <h2 id="add-med-heading" className="sr-only">
            Add medications
          </h2>
          <form onSubmit={addMed} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="med-input" className="sr-only">
              Add a medication
            </label>
            <input
              id="med-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMed();
                }
              }}
              placeholder="e.g. warfarin, Tylenol, ibuprofen…"
              autoComplete="off"
              className="flex-1 rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-lg text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              Add
            </button>
          </form>

          {/* Photo scan — enhancement layered on top of the text input */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500">or</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-blue-300 bg-white px-4 py-2.5 text-base font-semibold text-blue-800 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scanning ? "Reading label…" : "📷 Scan a label photo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFileSelected}
              aria-label="Upload a photo of a medication label"
              className="sr-only"
            />
          </div>
          {scanNote && (
            <p
              role="status"
              className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900"
            >
              {scanNote}
            </p>
          )}

          {/* Med chips */}
          {meds.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your medications">
              {meds.map((med) => (
                <li key={med}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 py-1.5 pl-4 pr-1.5 text-base font-medium text-blue-900">
                    {med}
                    <button
                      type="button"
                      onClick={() => removeMed(med)}
                      aria-label={`Remove ${med}`}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-blue-700 transition hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <span aria-hidden="true" className="text-lg leading-none">
                        ×
                      </span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={check}
            disabled={meds.length === 0 || loading}
            aria-busy={loading}
            className="mt-5 w-full rounded-xl bg-emerald-600 px-6 py-4 text-xl font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {loading ? "Checking…" : "Check my medications"}
          </button>
          {meds.length === 0 && (
            <p className="mt-3 text-center text-sm text-gray-500">
              Add at least one medication to get started.
            </p>
          )}
        </section>

        {/* Results */}
        <div aria-live="polite" className="mt-8">
          {error && (
            <div
              role="alert"
              className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-lg font-medium text-red-900"
            >
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-8">
              {/* Regimen summary — the headline */}
              <section
                aria-labelledby="regimen-heading"
                className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 sm:p-6"
              >
                <h2
                  id="regimen-heading"
                  className="mb-2 text-2xl font-bold text-blue-950"
                >
                  Whole-regimen risk summary
                </h2>
                <p className="whitespace-pre-line text-lg leading-relaxed text-blue-950">
                  {result.regimenSummary}
                </p>
                {result.recognized.length > 0 && (
                  <p className="mt-4 text-sm text-blue-800">
                    Recognized:{" "}
                    {Array.from(
                      new Set(
                        result.recognized.map((r) => titleCase(r.standardName))
                      )
                    ).join(", ")}
                  </p>
                )}
              </section>

              {/* Export PDF for the doctor */}
              <button
                type="button"
                onClick={downloadPdf}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-indigo-300 bg-white px-6 py-3.5 text-lg font-semibold text-indigo-800 transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                📄 Export PDF for my doctor
              </button>

              {/* Interaction cards grouped by severity */}
              {grouped.length > 0 && (
                <section aria-labelledby="interactions-heading">
                  <h2
                    id="interactions-heading"
                    className="mb-4 text-2xl font-bold"
                  >
                    Interactions found ({result.interactions.length})
                  </h2>
                  <div className="space-y-6">
                    {grouped.map((group) => {
                      const styles = SEVERITY_STYLES[group.severity];
                      return (
                        <div key={group.severity}>
                          <h3
                            className={`mb-3 text-xl font-bold ${styles.heading}`}
                          >
                            {group.severity} ({group.items.length})
                          </h3>
                          <ul className="space-y-3">
                            {group.items.map((it, idx) => (
                              <li
                                key={`${it.drugAName}-${it.drugBName}-${idx}`}
                                className={`rounded-2xl border-2 p-4 sm:p-5 ${styles.card}`}
                              >
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span className="text-lg font-bold text-gray-900">
                                    {titleCase(it.drugAName)} +{" "}
                                    {titleCase(it.drugBName)}
                                  </span>
                                  <span
                                    className={`rounded-full px-3 py-0.5 text-sm font-semibold ${styles.badge}`}
                                  >
                                    {it.severity}
                                  </span>
                                </div>
                                <p className="text-lg leading-relaxed text-gray-800">
                                  {it.explanation}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* No interactions found */}
              {noInteractions && (
                <section className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-lg text-emerald-900">
                  No known interactions were found between these medications in
                  our data source. This does not guarantee they are safe
                  together — always confirm with your doctor or pharmacist.
                </section>
              )}

              {/* Unrecognized drugs */}
              {result.unrecognized.length > 0 && (
                <section
                  aria-labelledby="unrecognized-heading"
                  className="rounded-2xl border border-gray-300 bg-gray-50 p-5"
                >
                  <h2
                    id="unrecognized-heading"
                    className="mb-2 text-xl font-bold text-gray-800"
                  >
                    We couldn&apos;t find these
                  </h2>
                  <p className="mb-3 text-base text-gray-600">
                    We couldn&apos;t match the following to a known medication, so
                    they weren&apos;t checked. Try a different spelling or the
                    generic name.
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {result.unrecognized.map((name) => (
                      <li
                        key={name}
                        className="rounded-full border border-gray-300 bg-white px-4 py-1.5 text-base font-medium text-gray-700"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Illustrative daily schedule */}
              {recognizedNames.length > 0 && (
                <section aria-labelledby="schedule-heading">
                  <h2
                    id="schedule-heading"
                    className="mb-1 text-2xl font-bold"
                  >
                    Daily schedule
                  </h2>
                  <p className="mb-4 text-sm text-gray-500">
                    Illustrative timing only — this is a rough guide, not a
                    prescription. Follow your doctor&apos;s or pharmacist&apos;s
                    instructions.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {TIME_SLOTS.map((slot) => (
                      <div
                        key={slot}
                        className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="mb-2 flex items-baseline justify-between">
                          <h3 className="text-lg font-bold text-gray-800">
                            {slot}
                          </h3>
                          <span className="text-xs text-gray-500">
                            {SLOT_TIMES[slot]}
                          </span>
                        </div>
                        {schedule.bySlot[slot].length > 0 ? (
                          <ul className="space-y-1.5">
                            {schedule.bySlot[slot].map((name) => (
                              <li
                                key={name}
                                className="rounded-lg bg-white px-3 py-1.5 text-base font-medium text-gray-800 shadow-sm"
                              >
                                {titleCase(name)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-base text-gray-400">—</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
