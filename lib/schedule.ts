// Daily dosing schedule — ILLUSTRATIVE ONLY, not prescriptive.
//
// buildSchedule(drugNames) buckets each medication into Morning / Noon / Evening
// / Night using typical dosing patterns for common drugs, with a sensible
// once-daily-morning default for anything unknown. This is a rough visual aid to
// discuss with a doctor/pharmacist — real timing depends on the actual
// prescription, formulation, and the individual patient.

export type TimeSlot = "Morning" | "Noon" | "Evening" | "Night";

export const TIME_SLOTS: TimeSlot[] = ["Morning", "Noon", "Evening", "Night"];

// Human-friendly example clock times for each slot (display only).
export const SLOT_TIMES: Record<TimeSlot, string> = {
  Morning: "~8 AM",
  Noon: "~1 PM",
  Evening: "~6 PM",
  Night: "~10 PM",
};

// Common dosing patterns.
const M: TimeSlot[] = ["Morning"]; // once daily, morning
const E: TimeSlot[] = ["Evening"]; // once daily, evening
const N: TimeSlot[] = ["Night"]; // once daily, bedtime
const ME: TimeSlot[] = ["Morning", "Evening"]; // twice daily
const MNE: TimeSlot[] = ["Morning", "Noon", "Evening"]; // three times daily

// Typical timing for well-known generics (keyed lowercase). Illustrative.
const KNOWN: Record<string, TimeSlot[]> = {
  warfarin: E,
  ibuprofen: MNE,
  naproxen: ME,
  aspirin: M,
  acetaminophen: MNE,
  ranitidine: ME,
  famotidine: ME,
  omeprazole: M,
  esomeprazole: M,
  pantoprazole: M,
  metformin: ME,
  atorvastatin: E,
  simvastatin: E,
  rosuvastatin: E,
  lisinopril: M,
  amlodipine: M,
  losartan: M,
  metoprolol: ME,
  hydrochlorothiazide: M,
  furosemide: M,
  levothyroxine: M,
  amoxicillin: MNE,
  azithromycin: M,
  ciprofloxacin: ME,
  sertraline: M,
  fluoxetine: M,
  citalopram: M,
  gabapentin: MNE,
  pregabalin: ME,
  prednisone: M,
  albuterol: M,
  montelukast: N,
  melatonin: N,
  diphenhydramine: N,
  zolpidem: N,
  alprazolam: N,
  clonazepam: N,
};

// Once daily in the morning unless we know better.
const DEFAULT_SLOTS: TimeSlot[] = M;

export type ScheduleEntry = { name: string; slots: TimeSlot[] };

export type Schedule = {
  entries: ScheduleEntry[];
  bySlot: Record<TimeSlot, string[]>;
};

export function buildSchedule(drugNames: string[]): Schedule {
  const bySlot: Record<TimeSlot, string[]> = {
    Morning: [],
    Noon: [],
    Evening: [],
    Night: [],
  };
  const entries: ScheduleEntry[] = [];
  const seen = new Set<string>();

  for (const raw of drugNames) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const slots = KNOWN[key] ?? DEFAULT_SLOTS;
    entries.push({ name, slots });
    for (const slot of slots) bySlot[slot].push(name);
  }

  return { entries, bySlot };
}
