// LLM layer — plain-language interaction explanations + whole-regimen reasoning.
// Uses OpenRouter (OpenAI-compatible) via lib/openrouter.ts.
//
//   explainInteractions(hits)     -> plain-English text for many hits in ONE call
//   explainInteraction(hit)       -> same, for a single hit (used rarely)
//   analyzeRegimen(drugs, dbHits) -> short whole-regimen awareness summary
//
// Everything degrades gracefully to safe static text if the API key is missing,
// out of quota, or the call fails — so /api/check never breaks because of the LLM.

import type { FoundInteraction } from "@/lib/interactions";
import { openrouterChat } from "@/lib/openrouter";

const CTA = "Ask your doctor or pharmacist before changing anything.";
const REGIMEN_CTA =
  "This is general educational information — always review your full medication list with your doctor or pharmacist.";

// Cache explanations across requests so repeated pairs don't re-hit the API.
const explanationCache = new Map<string, string>();

function cacheKey(hit: FoundInteraction): string {
  return `${hit.drugAName}|${hit.drugBName}|${hit.severity}`;
}

function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// Single text-generation call. Returns null on any failure (missing key, quota,
// network, empty) so callers can fall back.
async function generateText(
  prompt: string,
  maxOutputTokens: number
): Promise<string | null> {
  return openrouterChat([{ role: "user", content: prompt }], {
    maxTokens: maxOutputTokens,
  });
}

function parseJsonArray(raw: string): unknown {
  let text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Interaction explanations
// ---------------------------------------------------------------------------

function explanationFallback(hit: FoundInteraction): string {
  return `${titleCase(hit.drugAName)} and ${hit.drugBName} have a ${hit.severity.toLowerCase()} interaction listed in our data source. ${CTA}`;
}

function withCta(text: string): string {
  return text.includes(CTA) ? text : `${text} ${CTA}`;
}

// Explain many interactions in a SINGLE API call. Returns explanations aligned
// to the input order. Cached pairs are reused; only uncached ones are sent.
export async function explainInteractions(
  hits: FoundInteraction[]
): Promise<string[]> {
  const results: (string | null)[] = hits.map(
    (h) => explanationCache.get(cacheKey(h)) ?? null
  );

  const pending = hits
    .map((hit, index) => ({ hit, index }))
    .filter(({ index }) => results[index] === null);

  if (pending.length === 0) return results as string[];

  const list = pending
    .map(({ hit }, i) => {
      // Include curated mechanism/description as grounding when present.
      const extra = [
        hit.mechanism ? `mechanism: ${hit.mechanism}` : "",
        hit.description ? `note: ${hit.description}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      return `${i + 1}. ${hit.drugAName} + ${hit.drugBName} — severity: ${hit.severity}${extra ? ` (${extra})` : ""}`;
    })
    .join("\n");

  const prompt = `You are a helpful pharmacist assistant explaining drug interactions to a patient with no medical background.

Here are ${pending.length} drug interaction(s) from a medical database:
${list}

For EACH interaction, write exactly two short sentences in plain everyday English (no medical jargon, no abbreviations) explaining what taking those two medicines together could mean and how serious it is, based only on the severity given. Do not invent any details.

Return ONLY a JSON array of strings — one string per interaction, in the SAME ORDER and SAME COUNT as the list above. Each string MUST end with this exact sentence: "${CTA}"
No markdown, no commentary — JSON only.`;

  const raw = await generateText(prompt, 220 * pending.length + 200);
  const parsed = raw ? parseJsonArray(raw) : null;
  const arr = Array.isArray(parsed) ? parsed : [];

  pending.forEach(({ hit, index }, i) => {
    const candidate = typeof arr[i] === "string" ? (arr[i] as string).trim() : "";
    const text = candidate ? withCta(candidate) : explanationFallback(hit);
    if (candidate) explanationCache.set(cacheKey(hit), text);
    results[index] = text;
  });

  return results as string[];
}

export async function explainInteraction(
  hit: FoundInteraction
): Promise<string> {
  const [text] = await explainInteractions([hit]);
  return text;
}

// ---------------------------------------------------------------------------
// Whole-regimen awareness summary
// ---------------------------------------------------------------------------

function regimenFallback(): string {
  return `We couldn't generate an AI regimen summary right now. Please review your full medication list — and any flagged interactions above — with your doctor or pharmacist.`;
}

export async function analyzeRegimen(
  drugs: string[],
  dbHits: FoundInteraction[]
): Promise<string> {
  if (drugs.length === 0) return regimenFallback();

  const hitLines =
    dbHits.length > 0
      ? dbHits.map((h) => `- ${h.drugAName} + ${h.drugBName} (${h.severity})`).join("\n")
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

  const text = await generateText(prompt, 600);
  if (!text) return regimenFallback();
  return text.includes(REGIMEN_CTA) ? text : `${text} ${REGIMEN_CTA}`;
}
