"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { buildSchedule, TIME_SLOTS, SLOT_TIMES } from "@/lib/schedule";
import { exportRegimenPdf } from "@/lib/pdf";
import { displayName, titleCase } from "@/lib/displayName";

type Severity = "Major" | "Moderate" | "Minor";

type Interaction = {
  drugAName: string;
  drugBName: string;
  severity: Severity;
  mechanism: string | null;
  description: string | null;
  explanation: string;
  rxcuiA: string | null;
  rxcuiB: string | null;
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

// Downscale a label photo before upload. Phone photos can be several MB, which
// exceeds Vercel's serverless request-body limit (~4.5 MB) and slows the scan.
// Caps the longest edge at 1600px and re-encodes as JPEG. Falls back to the
// original file if anything goes wrong.
async function downscaleImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1600;
    let { width, height } = bitmap;
    if (Math.max(width, height) > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export default function Home() {
  const [meds, setMeds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  // Two native file inputs feeding the same scan flow: one opens the rear
  // camera on mobile (capture="environment"), one opens the file picker.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Remember the medications and results across navigation (e.g. visiting the
  // About page and coming back) using sessionStorage, so the user doesn't lose
  // their work. Restore once on mount; then persist on every change.
  const persistReady = useRef(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("medsafe:state");
      if (saved) {
        const parsed = JSON.parse(saved) as {
          meds?: string[];
          result?: CheckResponse | null;
        };
        if (Array.isArray(parsed.meds)) setMeds(parsed.meds);
        if (parsed.result) setResult(parsed.result);
      }
    } catch {
      // Ignore malformed/unavailable storage — just start fresh.
    }
  }, []);
  useEffect(() => {
    // Skip the very first run so restoring doesn't get clobbered by empty state.
    if (!persistReady.current) {
      persistReady.current = true;
      return;
    }
    try {
      sessionStorage.setItem("medsafe:state", JSON.stringify({ meds, result }));
    } catch {
      // Storage full or unavailable — non-fatal.
    }
  }, [meds, result]);

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
      const upload = await downscaleImage(file);
      const fd = new FormData();
      fd.append("image", upload, "label.jpg");
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

  async function check(drugs: string[] = meds) {
    if (drugs.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drugs }),
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

  // Canonical (lowercase) name -> "Entered (canonical)" display string. Used to
  // render entered names on the schedule (which is keyed by canonical name) and
  // to pass the mapping to the PDF.
  const displayByName: Record<string, string> = {};
  for (const r of result?.recognized ?? []) {
    displayByName[r.standardName.toLowerCase()] = displayName(
      r.input,
      r.standardName
    );
  }

  function loadExample() {
    const example = ["warfarin", "aspirin", "ibuprofen"];
    setMeds(example);
    check(example);
  }

  function downloadPdf() {
    if (!result) return;
    exportRegimenPdf({
      meds,
      recognized: Array.from(
        new Set(
          result.recognized.map((r) => displayName(r.input, r.standardName))
        )
      ),
      unrecognized: result.unrecognized,
      interactions: result.interactions.map((i) => ({
        drugA: displayDrug(i.drugAName, i.rxcuiA),
        drugB: displayDrug(i.drugBName, i.rxcuiB),
        severity: i.severity,
        explanation: i.explanation,
      })),
      regimenSummary: result.regimenSummary,
      schedule,
      displayByName,
    });
  }

  // Show the term the user actually entered (matched by RxCUI, falling back to
  // the canonical name), annotating the DB's canonical name when it differs
  // (e.g. "Aspirin (acetylsalicylic acid)"). Delegates formatting to displayName.
  function displayDrug(dbName: string, rxcui: string | null): string {
    const input = result?.recognized.find(
      (r) => (rxcui && r.rxcui === rxcui) || r.standardName === dbName.toLowerCase()
    )?.input;
    return displayName(input, dbName);
  }

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10"
    >
      <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            MedSafe
          </h1>
          <p className="mt-3 text-base font-semibold text-gray-800 sm:text-lg">
            Catch dangerous drug interactions before they catch you.
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
              className="min-h-[44px] rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              Add
            </button>
          </form>

          {/* Photo scan — enhancement layered on top of the text input.
              Two native inputs, same /api/scan flow: camera capture vs file pick. */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <span className="text-sm text-gray-500">or</span>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={scanning}
              className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-blue-300 bg-white px-4 py-2.5 text-base font-semibold text-blue-800 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:justify-start"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              {scanning ? "Reading label…" : "Take a photo"}
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={scanning}
              className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-blue-300 bg-white px-4 py-2.5 text-base font-semibold text-blue-800 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:justify-start"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              {scanning ? "Reading label…" : "Upload a photo"}
            </button>
            {/* Rear camera on mobile */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFileSelected}
              aria-label="Take a photo of a medication label with your camera"
              className="sr-only"
            />
            {/* Existing image / desktop file picker — no capture attribute */}
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              onChange={onFileSelected}
              aria-label="Upload an existing photo of a medication label"
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
            <ul
              className="mt-4 flex flex-wrap gap-2.5"
              aria-label="Your medications"
            >
              {meds.map((med) => (
                <li key={med}>
                  <span className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-1 pl-4 pr-1 text-base font-medium text-blue-900">
                    <span className="break-words">{med}</span>
                    <button
                      type="button"
                      onClick={() => removeMed(med)}
                      aria-label={`Remove ${med}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none text-blue-700 transition hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => check()}
            disabled={meds.length === 0 || loading}
            aria-busy={loading}
            className="mt-5 w-full rounded-xl bg-emerald-600 px-6 py-4 text-xl font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {loading ? "Checking…" : "Check my medications"}
          </button>
          {meds.length === 0 && (
            <p className="mt-3 text-center text-sm text-gray-500">
              Add at least one medication, or{" "}
              <button
                type="button"
                onClick={loadExample}
                className="font-semibold text-blue-700 underline hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                try an example (warfarin + aspirin + ibuprofen)
              </button>
              .
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
                  className="mb-2 text-xl font-bold text-blue-950 sm:text-2xl"
                >
                  Whole-regimen risk summary
                </h2>
                <p className="whitespace-pre-line text-base leading-relaxed text-blue-950 sm:text-lg">
                  {result.regimenSummary}
                </p>
                {result.recognized.length > 0 && (
                  <p className="mt-4 text-sm text-blue-800">
                    Recognized:{" "}
                    {Array.from(
                      new Set(
                        result.recognized.map((r) =>
                          displayName(r.input, r.standardName)
                        )
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
                    className="mb-4 text-xl font-bold sm:text-2xl"
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
                                  <span className="break-words text-base font-bold text-gray-900 sm:text-lg">
                                    {displayDrug(it.drugAName, it.rxcuiA)} +{" "}
                                    {displayDrug(it.drugBName, it.rxcuiB)}
                                  </span>
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${styles.badge}`}
                                  >
                                    {it.severity}
                                  </span>
                                </div>
                                <p className="text-base leading-relaxed text-gray-800 sm:text-lg">
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
                    className="mb-1 text-xl font-bold sm:text-2xl"
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
                                {displayByName[name.toLowerCase()] ??
                                  titleCase(name)}
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

        {/* How it works */}
        <section
          aria-labelledby="how-heading"
          className="mt-12 rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6"
        >
          <h2 id="how-heading" className="mb-4 text-xl font-bold sm:text-2xl">
            How it works
          </h2>
          <ol className="grid gap-5 sm:grid-cols-3 sm:gap-6">
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-blue-600 font-bold text-white"
              >
                1
              </span>
              <p className="text-base text-gray-700">
                <span className="font-semibold">Add your medicines</span> — type
                each one, or snap a photo of the label and we&apos;ll read the
                name for you to confirm.
              </p>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-blue-600 font-bold text-white"
              >
                2
              </span>
              <p className="text-base text-gray-700">
                <span className="font-semibold">We check every pair</span> — drug
                names are standardized via RxNorm, then each pair is looked up in
                a real interaction database (DDInter 2.0). We never invent
                interactions.
              </p>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-blue-600 font-bold text-white"
              >
                3
              </span>
              <p className="text-base text-gray-700">
                <span className="font-semibold">You get a clear summary</span> —
                plain-language explanations, a whole-regimen overview, an
                illustrative daily schedule, and a one-page PDF to share with your
                doctor.
              </p>
            </li>
          </ol>
        </section>
      </main>
  );
}
