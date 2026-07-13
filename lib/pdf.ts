// Client-side one-page PDF summary for the patient's doctor, via jsPDF.
// Contains: medication list, flagged interactions with severity, the regimen
// summary, the illustrative daily schedule, a timestamp, and the disclaimer.

import { jsPDF } from "jspdf";
import { TIME_SLOTS, SLOT_TIMES, type Schedule } from "@/lib/schedule";

export type PdfSeverity = "Major" | "Moderate" | "Minor";

export type PdfInput = {
  meds: string[]; // raw entered medications
  recognized: string[]; // normalized standard names
  unrecognized: string[];
  interactions: {
    drugAName: string;
    drugBName: string;
    severity: PdfSeverity;
    explanation: string;
  }[];
  regimenSummary: string;
  schedule: Schedule;
};

const SEVERITY_COLOR: Record<PdfSeverity, [number, number, number]> = {
  Major: [185, 28, 28],
  Moderate: [180, 83, 9],
  Minor: [75, 85, 99],
};

const DISCLAIMER =
  "This summary is an educational aid generated from a public interaction database (DDInter 2.0) and is NOT a diagnosis or medical advice. Please review it with your doctor or pharmacist before making any changes.";

function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function exportRegimenPdf(input: PdfInput): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensure = (space: number) => {
    if (y + space > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const heading = (text: string) => {
    ensure(28);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(17, 24, 39);
    doc.text(text, margin, y);
    y += 16;
  };

  const body = (
    text: string,
    opts?: { size?: number; color?: [number, number, number]; bold?: boolean }
  ) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size ?? 10.5);
    doc.setTextColor(...(opts?.color ?? [40, 40, 40]));
    const lineH = (opts?.size ?? 10.5) * 1.35;
    for (const line of doc.splitTextToSize(text, maxW)) {
      ensure(lineH);
      doc.text(line, margin, y);
      y += lineH;
    }
  };

  // Title + timestamp
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39);
  doc.text("MedSafe — Medication Summary", margin, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
  y += 18;

  // Disclaimer up top
  body(DISCLAIMER, { size: 9.5, color: [120, 53, 15] });
  y += 4;

  // Medications
  heading("Medications");
  if (input.meds.length > 0) {
    body(input.meds.map(titleCase).join(", "));
  } else {
    body("None entered.");
  }
  if (input.recognized.length > 0) {
    body(`Recognized as: ${input.recognized.map(titleCase).join(", ")}`, {
      size: 9.5,
      color: [90, 90, 90],
    });
  }
  if (input.unrecognized.length > 0) {
    body(`Not recognized (not checked): ${input.unrecognized.join(", ")}`, {
      size: 9.5,
      color: [90, 90, 90],
    });
  }

  // Interactions
  heading(`Flagged interactions (${input.interactions.length})`);
  if (input.interactions.length === 0) {
    body(
      "No known interactions were found in the database. This does not guarantee safety."
    );
  } else {
    for (const it of input.interactions) {
      ensure(16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...SEVERITY_COLOR[it.severity]);
      doc.text(
        `[${it.severity}] ${titleCase(it.drugAName)} + ${titleCase(
          it.drugBName
        )}`,
        margin,
        y
      );
      y += 14;
      body(it.explanation, { size: 10 });
      y += 2;
    }
  }

  // Regimen summary
  heading("Whole-regimen summary");
  body(input.regimenSummary || "Not available.");

  // Schedule
  heading("Illustrative daily schedule");
  body("Rough timing only — follow your doctor's or pharmacist's instructions.", {
    size: 9,
    color: [110, 110, 110],
  });
  y += 2;
  let anySlot = false;
  for (const slot of TIME_SLOTS) {
    const meds = input.schedule.bySlot[slot];
    if (meds.length === 0) continue;
    anySlot = true;
    body(`${slot} (${SLOT_TIMES[slot]}): ${meds.map(titleCase).join(", ")}`, {
      size: 10.5,
    });
  }
  if (!anySlot) body("No medications to schedule.");

  // Footer disclaimer
  y += 8;
  body(
    "MedSafe is an educational awareness tool, not a diagnostic device. Always consult your doctor or pharmacist.",
    { size: 8.5, color: [130, 130, 130] }
  );

  // Open the PDF in a new tab so the user gets the browser's built-in viewer
  // (read / print / save). Fall back to the same tab if the popup is blocked
  // (common on mobile). Revoke the URL after a delay so the tab has time to load.
  const url = URL.createObjectURL(doc.output("blob"));
  const win = window.open(url, "_blank");
  if (!win) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
