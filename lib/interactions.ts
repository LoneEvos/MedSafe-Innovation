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
  // Collapse different inputs that normalize to the same generic (e.g.
  // "Tylenol" and "acetaminophen") so we don't check a drug against itself.
  const byStandard = new Map<string, RecognizedDrug>();

  for (const input of inputs) {
    const norm = await normalizeDrugName(input);
    if (!norm) {
      unrecognized.push(input);
      continue;
    }
    const standardName = norm.standardName.toLowerCase();
    const entry: RecognizedDrug = {
      input,
      rxcui: norm.rxcui,
      standardName,
    };
    recognized.push(entry);
    if (!byStandard.has(standardName)) byStandard.set(standardName, entry);
  }

  // Build OR conditions for every unique unordered pair, in both orders.
  const uniqueNames = Array.from(byStandard.keys());
  const orConditions: { drugAName: string; drugBName: string }[] = [];
  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      const a = uniqueNames[i];
      const b = uniqueNames[j];
      orConditions.push({ drugAName: a, drugBName: b });
      orConditions.push({ drugAName: b, drugBName: a });
    }
  }

  let interactions: FoundInteraction[] = [];
  if (orConditions.length > 0) {
    interactions = await prisma.interaction.findMany({
      where: { OR: orConditions },
      select: {
        drugAName: true,
        drugBName: true,
        severity: true,
        mechanism: true,
        description: true,
      },
    });

    // Most severe first for easy rendering.
    interactions.sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    );
  }

  return { recognized, unrecognized, interactions };
}
