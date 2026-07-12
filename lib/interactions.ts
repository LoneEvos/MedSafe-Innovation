// Interaction-check engine — DB truth only.
//
// checkInteractions(drugNames):
//   1. Normalize every input name via RxNorm (brand -> generic).
//   2. For each unique pair of recognized drugs, look up the Interaction table
//      in either order (A-B or B-A).
//   3. Return the found interactions plus any names we couldn't recognize.
//
// We NEVER fabricate interactions — only rows that exist in the seeded DB are
// returned. "No interaction found" means no DB row, not "safe".

import { prisma } from "@/lib/prisma";
import { normalizeDrugName } from "@/lib/rxnorm";
import type { Severity } from "@prisma/client";

export type FoundInteraction = {
  drugAName: string;
  drugBName: string;
  severity: Severity;
  mechanism: string | null;
  description: string | null;
};

export type RecognizedDrug = {
  input: string;
  rxcui: string;
  standardName: string;
};

export type CheckResult = {
  recognized: RecognizedDrug[];
  unrecognized: string[];
  interactions: FoundInteraction[];
};

const SEVERITY_RANK: Record<Severity, number> = {
  Major: 3,
  Moderate: 2,
  Minor: 1,
};

export async function checkInteractions(
  drugNames: string[]
): Promise<CheckResult> {
  // De-duplicate raw inputs case-insensitively and drop blanks.
  const seenInput = new Set<string>();
  const inputs: string[] = [];
  for (const raw of drugNames) {
    const name = (raw ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenInput.has(key)) continue;
    seenInput.add(key);
    inputs.push(name);
  }

  const recognized: RecognizedDrug[] = [];
  const unrecognized: string[] = [];
  // Collapse inputs that resolve to the same drug (same RxCUI, or same name if
  // it didn't resolve) so we don't check a drug against itself.
  const byDrug = new Map<string, RecognizedDrug>();

  for (const input of inputs) {
    const norm = await normalizeDrugName(input);
    if (!norm) {
      unrecognized.push(input);
      continue;
    }
    const standardName = norm.standardName.toLowerCase();
    const entry: RecognizedDrug = { input, rxcui: norm.rxcui, standardName };
    recognized.push(entry);
    const dedupKey = norm.rxcui || standardName;
    if (!byDrug.has(dedupKey)) byDrug.set(dedupKey, entry);
  }

  // For each unique unordered pair, match on RxCUI (robust across name forms,
  // e.g. "aspirin" == "acetylsalicylic acid" == 1191) and also on name as a
  // fallback for drugs the DB seed couldn't resolve to an RxCUI.
  const drugs = Array.from(byDrug.values());
  const orConditions: Record<string, string>[] = [];
  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const x = drugs[i];
      const y = drugs[j];
      if (x.rxcui && y.rxcui) {
        orConditions.push({ rxcuiA: x.rxcui, rxcuiB: y.rxcui });
        orConditions.push({ rxcuiA: y.rxcui, rxcuiB: x.rxcui });
      }
      orConditions.push({ drugAName: x.standardName, drugBName: y.standardName });
      orConditions.push({ drugAName: y.standardName, drugBName: x.standardName });
    }
  }

  let interactions: FoundInteraction[] = [];
  if (orConditions.length > 0) {
    const rows = await prisma.interaction.findMany({
      where: { OR: orConditions },
      select: {
        id: true,
        drugAName: true,
        drugBName: true,
        severity: true,
        mechanism: true,
        description: true,
      },
    });
    // A pair can match by both RxCUI and name — dedupe rows by id.
    interactions = Array.from(
      new Map(rows.map((r) => [r.id, r])).values()
    ).map(({ id, ...rest }) => rest);

    // Most severe first for easy rendering.
    interactions.sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    );
  }

  return { recognized, unrecognized, interactions };
}
