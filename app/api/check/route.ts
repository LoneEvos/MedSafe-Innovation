import { NextRequest, NextResponse } from "next/server";
import { checkInteractions } from "@/lib/interactions";
import { explainInteraction, analyzeRegimen } from "@/lib/llm";

const DISCLAIMER =
  "Educational tool only — not medical advice. Always consult your doctor or pharmacist.";

// POST /api/check  body: { drugs: string[] }
// Returns recognized drugs, unrecognized names, DB-backed interactions (each
// with a plain-language `explanation`), and a top-level `regimenSummary`.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const drugs = (body as { drugs?: unknown })?.drugs;
  if (!Array.isArray(drugs) || !drugs.every((d) => typeof d === "string")) {
    return NextResponse.json(
      { error: "Body must be { drugs: string[] }." },
      { status: 400 }
    );
  }

  const result = await checkInteractions(drugs);

  // Enrich in parallel: per-interaction explanations + one regimen summary.
  const [interactions, regimenSummary] = await Promise.all([
    Promise.all(
      result.interactions.map(async (hit) => ({
        ...hit,
        explanation: await explainInteraction(hit),
      }))
    ),
    analyzeRegimen(
      result.recognized.map((r) => r.standardName),
      result.interactions
    ),
  ]);

  return NextResponse.json({
    ...result,
    interactions,
    regimenSummary,
    disclaimer: DISCLAIMER,
  });
}
