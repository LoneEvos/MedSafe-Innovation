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
  { border: string; badge: string; label: string }
> = {
  Major: {
    border: "border-l-sev-major",
    badge: "bg-sev-major-bg text-sev-major",
    label: "text-sev-major",
  },
  Moderate: {
    border: "border-l-sev-moderate",
    badge: "bg-sev-moderate-bg text-sev-moderate",
    label: "text-sev-moderate",
  },
  Minor: {
    border: "border-l-sev-minor",
    badge: "bg-sev-minor-bg text-sev-minor",
    label: "text-sev-minor",
  },
};

function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

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
        `Added from photo: ${found.join(", ")}. Review and edit the list below before checking.`
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

  function loadExample() {
    const example = ["warfarin", "aspirin", "ibuprofen"];
    setMeds(example);
    check(example);
  }

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

  // Show the term the user actually entered (matched by RxCUI), annotating the
  // DB's canonical name when it differs (e.g. "Aspirin (acetylsalicylic acid)").
  function displayDrug(dbName: string, rxcui: string | null): string {
    const input = result?.recognized.find(
      (r) => (rxcui && r.rxcui === rxcui) || r.standardName === dbName.toLowerCase()
    )?.input;
    if (!input) return titleCase(dbName);
    if (input.toLowerCase() === dbName.toLowerCase()) return titleCase(input);
    return `${titleCase(input)} (${dbName})`;
  }

  const btnPrimary =
    "cursor-pointer rounded-md bg-cta px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-cta-strong disabled:cursor-not-allowed disabled:opacity-50";
  const btnGhost =
    "cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-4xl flex-1 px-6 py-10"
    >
      {/* Hero — left-aligned, restrained */}
      <section className="max-w-2xl">
        <h1 className="font-heading text-3xl font-semibold leading-tight text-ink sm:text-4xl">
          Catch dangerous drug interactions before they catch you.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
          Enter your medications to check them against a clinical interaction
          database, read plain-language explanations, and export a summary for
          your doctor.
        </p>
      </section>

      {/* Input area */}
      <section
        aria-labelledby="add-med-heading"
        className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-card"
      >
        <h2 id="add-med-heading" className="sr-only">
          Add medications
        </h2>
        <label
          htmlFor="med-input"
          className="block text-sm font-medium text-ink"
        >
          Add a medication
        </label>
        <form onSubmit={addMed} className="mt-2 flex flex-col gap-2 sm:flex-row">
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
            placeholder="e.g. warfarin, Tylenol, ibuprofen"
            autoComplete="off"
            className="flex-1 rounded-md border border-line bg-surface px-4 py-2.5 text-base text-ink placeholder:text-muted focus:border-primary"
          />
          <button type="submit" disabled={!input.trim()} className={btnGhost}>
            Add
          </button>
        </form>

        {/* Photo scan — a layered enhancement, not the default path */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>or</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            className={btnGhost}
          >
            {scanning ? "Reading label…" : "Upload a label photo"}
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
            className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-body"
          >
            {scanNote}
          </p>
        )}

        {/* Medication list */}
        {meds.length > 0 && (
          <ul
            className="mt-5 flex flex-wrap gap-2"
            aria-label="Your medications"
          >
            {meds.map((med) => (
              <li key={med}>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-primary-tint py-1 pl-3 pr-1 text-sm font-medium text-primary-strong">
                  {med}
                  <button
                    type="button"
                    onClick={() => removeMed(med)}
                    aria-label={`Remove ${med}`}
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-primary-strong/70 transition-colors duration-200 hover:bg-primary/15 hover:text-primary-strong"
                  >
                    <span aria-hidden="true" className="text-base leading-none">
                      ×
                    </span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <button
            type="button"
            onClick={() => check()}
            disabled={meds.length === 0 || loading}
            aria-busy={loading}
            className={`${btnPrimary} w-full py-3 text-base sm:w-auto`}
          >
            {loading ? "Checking…" : "Check my medications"}
          </button>
          {meds.length === 0 && (
            <p className="mt-3 text-sm text-muted">
              Add at least one medication, or{" "}
              <button
                type="button"
                onClick={loadExample}
                className="cursor-pointer font-medium text-primary underline underline-offset-2 hover:text-primary-strong"
              >
                try an example
              </button>{" "}
              (warfarin + aspirin + ibuprofen).
            </p>
          )}
        </div>
      </section>

      {/* Results */}
      <div aria-live="polite" className="mt-10">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-sev-major/40 bg-sev-major-bg px-4 py-3 text-sm font-medium text-sev-major"
          >
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-10">
            {/* Regimen summary — the headline */}
            <section
              aria-labelledby="regimen-heading"
              className="rounded-lg border border-line border-l-4 border-l-primary bg-surface p-6 shadow-card"
            >
              <h2
                id="regimen-heading"
                className="font-heading text-xl font-semibold text-ink"
              >
                Whole-regimen summary
              </h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-body">
                {result.regimenSummary}
              </p>
              {result.recognized.length > 0 && (
                <p className="mt-4 text-sm text-muted">
                  Recognized:{" "}
                  {Array.from(
                    new Set(
                      result.recognized.map((r) => titleCase(r.standardName))
                    )
                  ).join(", ")}
                </p>
              )}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={downloadPdf}
                  className={btnGhost}
                >
                  Export PDF for my doctor
                </button>
              </div>
            </section>

            {/* Interactions grouped by severity */}
            {grouped.length > 0 && (
              <section aria-labelledby="interactions-heading">
                <h2
                  id="interactions-heading"
                  className="font-heading text-xl font-semibold text-ink"
                >
                  Interactions found ({result.interactions.length})
                </h2>
                <div className="mt-5 space-y-6">
                  {grouped.map((group) => {
                    const styles = SEVERITY_STYLES[group.severity];
                    return (
                      <div key={group.severity}>
                        <h3
                          className={`text-sm font-semibold uppercase tracking-wide ${styles.label}`}
                        >
                          {group.severity} · {group.items.length}
                        </h3>
                        <ul className="mt-3 space-y-3">
                          {group.items.map((it, idx) => (
                            <li
                              key={`${it.drugAName}-${it.drugBName}-${idx}`}
                              className={`rounded-md border border-line border-l-4 ${styles.border} bg-surface p-5 shadow-card`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-ink">
                                  {displayDrug(it.drugAName, it.rxcuiA)} +{" "}
                                  {displayDrug(it.drugBName, it.rxcuiB)}
                                </span>
                                <span
                                  className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles.badge}`}
                                >
                                  {it.severity}
                                </span>
                              </div>
                              <p className="mt-2 leading-relaxed text-body">
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
              <section className="rounded-md border border-line border-l-4 border-l-primary bg-surface p-5 text-body shadow-card">
                No known interactions were found between these medications in our
                data source. This does not guarantee they are safe together —
                always confirm with your doctor or pharmacist.
              </section>
            )}

            {/* Unrecognized drugs */}
            {result.unrecognized.length > 0 && (
              <section
                aria-labelledby="unrecognized-heading"
                className="rounded-md border border-line bg-surface p-5 shadow-card"
              >
                <h2
                  id="unrecognized-heading"
                  className="font-medium text-ink"
                >
                  We couldn&apos;t find these
                </h2>
                <p className="mt-1 text-sm text-muted">
                  These weren&apos;t matched to a known medication, so they
                  weren&apos;t checked. Try a different spelling or the generic
                  name.
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {result.unrecognized.map((name) => (
                    <li
                      key={name}
                      className="rounded-md border border-line bg-surface-2 px-3 py-1 text-sm text-body"
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
                  className="font-heading text-xl font-semibold text-ink"
                >
                  Daily schedule
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Illustrative timing only — a rough guide, not a prescription.
                  Follow your doctor&apos;s or pharmacist&apos;s instructions.
                </p>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {TIME_SLOTS.map((slot) => (
                    <div
                      key={slot}
                      className="rounded-md border border-line bg-surface p-4 shadow-card"
                    >
                      <div className="flex items-baseline justify-between border-b border-line pb-2">
                        <h3 className="text-sm font-semibold text-ink">
                          {slot}
                        </h3>
                        <span className="text-xs text-muted">
                          {SLOT_TIMES[slot]}
                        </span>
                      </div>
                      {schedule.bySlot[slot].length > 0 ? (
                        <ul className="mt-3 space-y-1.5">
                          {schedule.bySlot[slot].map((name) => (
                            <li key={name} className="text-sm text-body">
                              {titleCase(name)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-muted">—</p>
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
        className="mt-16 border-t border-line pt-10"
      >
        <h2
          id="how-heading"
          className="font-heading text-xl font-semibold text-ink"
        >
          How it works
        </h2>
        <ol className="mt-6 grid gap-8 sm:grid-cols-3">
          <li>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">
              Step 1
            </div>
            <h3 className="mt-2 font-medium text-ink">Add your medicines</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Type each one, or upload a photo of the label and confirm what we
              read.
            </p>
          </li>
          <li>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">
              Step 2
            </div>
            <h3 className="mt-2 font-medium text-ink">We check every pair</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Names are standardized via RxNorm, then each pair is looked up in a
              real interaction database. We never invent interactions.
            </p>
          </li>
          <li>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">
              Step 3
            </div>
            <h3 className="mt-2 font-medium text-ink">You get a clear summary</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Plain-language explanations, a whole-regimen overview, a daily
              schedule, and a one-page PDF for your doctor.
            </p>
          </li>
        </ol>
      </section>
    </main>
  );
}
