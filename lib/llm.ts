// LLM layer — plain-language interaction explanations + whole-regimen reasoning.
// Uses Google Gemini (gemini-2.5-flash) via @google/generative-ai.
//
// Two functions:
//   explainInteraction(hit)      -> 2 patient-friendly sentences for one DB hit
//   analyzeRegimen(drugs, dbHits)-> short whole-regimen awareness summary
//
// Both degrade gracefully to safe static text if the API key is missing or the
// call fails, so /api/check never breaks because of the LLM.

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { FoundInteraction } from "@/lib/interactions";

// The plan specified "gemini-2.5-flash", but Google has retired the 2.x flash
// models for new API keys (they now 404 with "no longer available to new users").
// "gemini-flash-latest" is a stable alias that always resolves to the current
// flash model, so it keeps working as models roll over.
const MODEL = "gemini-flash-latest";
const CTA = "Ask your doctor or pharmacist before changing anything.";
const REGIMEN_CTA =
  "This is general educational information — always review your full medication list with your doctor or pharmacist.";

// Cache explanations across requests so repeated pairs don't re-hit the API.
const explanationCache = new Map<string, string>();

function getClient(): GoogleGenerativeAI | null {
  // Plan uses GEMINI_API_KEY; fall back to LLM_API_KEY for existing setups.
  const key = process.env.GEMINI_API_KEY ?? process.env.LLM_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// 1. Single interaction -> plain English
// ---------------------------------------------------------------------------

function explanationFallback(hit: FoundInteraction): string {
  return `${titleCase(hit.drugAName)} and ${hit.drugBName} have a ${hit.severity.toLowerCase()} interaction listed in our data source. ${CTA}`;
}

export async function explainInteraction(
  hit: FoundInteraction
): Promise<string> {
  const cacheKey = `${hit.drugAName}|${hit.drugBName}|${hit.severity}`;
  const cached = explanationCache.get(cacheKey);
  if (cached) return cached;

  const client = getClient();
  if (!client) return explanationFallback(hit);

  const prompt = `You are a helpful pharmacist assistant explaining a drug interaction to a patient with no medical background.

Interaction from a medical database:
- Drug A: ${hit.drugAName}
- Drug B: ${hit.drugBName}
- Severity: ${hit.severity}
${hit.mechanism ? `- Mechanism: ${hit.mechanism}` : ""}
${hit.description ? `- Description: ${hit.description}` : ""}

Write EXACTLY two short sentences in plain, everyday English (no medical jargon, no abbreviations) explaining what taking these two medicines together could mean and how serious it is. Do not invent any details beyond what is given above. End with this exact sentence: "${CTA}"`;

  try {
    const model = client.getGenerativeModel({
      model: MODEL,
      // thinkingBudget:0 disables the model's internal "thinking" tokens, which
      // otherwise eat the output budget and truncate the reply. Cast because the
      // SDK's GenerationConfig type predates thinking models.
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 300,
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });
    const res = await model.generateContent(prompt);
    let text = res.response.text().trim();
    if (!text) return explanationFallback(hit);
    if (!text.includes(CTA)) text = `${text} ${CTA}`;
    explanationCache.set(cacheKey, text);
    return text;
  } catch {
    return explanationFallback(hit);
  }
}

// ---------------------------------------------------------------------------
// 2. Whole-regimen awareness summary
// ---------------------------------------------------------------------------

function regimenFallback(): string {
  return `We couldn't generate an AI regimen summary right now. Please review your full medication list — and any flagged interactions above — with your doctor or pharmacist.`;
}

export async function analyzeRegimen(
  drugs: string[],
  dbHits: FoundInteraction[]
): Promise<string> {
  if (drugs.length === 0) return regimenFallback();

  const client = getClient();
  if (!client) return regimenFallback();

  const hitLines =
    dbHits.length > 0
      ? dbHits
          .map(
            (h) => `- ${h.drugAName} + ${h.drugBName} (${h.severity})`
          )
          .join("\n")
      : "None.";

  const prompt = `You are a clinical-pharmacy educational assistant. A patient is taking these medications:
${drugs.map((d) => `- ${d}`).join("\n")}

A medical interaction database found these CONFIRMED pairwise interactions:
${hitLines}

Write a short "whole-regimen awareness summary" (3 to 5 sentences, plain English, no jargon) covering, only where relevant:
- cumulative or overlapping effects (for example combined drowsiness, or serotonergic / anticholinergic burden)
- possible duplicate drug classes
- general timing considerations

STRICT RULES:
- Treat ONLY the confirmed database interactions listed above as established drug-drug interactions.
- For anything else, frame it as GENERAL EDUCATIONAL AWARENESS using cautious language ("may", "can sometimes", "worth asking about"). Do NOT assert new specific interactions and do NOT diagnose.
- This is not medical advice.
End with this exact sentence: "${REGIMEN_CTA}"`;

  try {
    const model = client.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 600,
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });
    const res = await model.generateContent(prompt);
    let text = res.response.text().trim();
    if (!text) return regimenFallback();
    if (!text.includes(REGIMEN_CTA)) text = `${text} ${REGIMEN_CTA}`;
    return text;
  } catch {
    return regimenFallback();
  }
}
