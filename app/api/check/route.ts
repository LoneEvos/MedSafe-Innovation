import { NextRequest, NextResponse } from "next/server";
import { checkInteractions } from "@/lib/interactions";
import { explainInteractions, analyzeRegimen } from "@/lib/llm";

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

  // Enrich in parallel: all explanations in ONE call + one regimen summary.
  // Batching keeps each check to ~2 API requests, which matters on Gemini's
  // stingy free-tier daily quota.
  const [explanations, regimenSummary] = await Promise.all([
    explainInteractions(result.interactions),
    analyzeRegimen(
      result.recognized.map((r) => r.standardName),
      result.interactions
    ),
  ]);
  const interactions = result.interactions.map((hit, i) => ({
    ...hit,
    explanation: explanations[i],
  }));

  return NextResponse.json({
    ...result,
    interactions,
    regimenSummary,
    disclaimer: DISCLAIMER,
  });
}
