// Vision layer — read medication name(s) + dose from a photo of a label.
// Uses Google Gemini (multimodal) via @google/generative-ai, same key as lib/llm.ts.
//
// extractMedsFromImage(base64, mimeType) -> ExtractedMed[]
// Degrades gracefully to [] if the key is missing or the call/parse fails, so
// /api/scan never throws because of the model.

import { GoogleGenerativeAI } from "@google/generative-ai";

// "gemini-flash-lite-latest" — multimodal, and has a far more generous free-tier
// daily quota than gemini-flash-latest (which now maps to gemini-3.5-flash, only
// 20 requests/day free). See lib/llm.ts and the "gemini-llm-setup" memory.
const MODEL = "gemini-flash-lite-latest";

export type ExtractedMed = { name: string; dose: string | null };

function getClient(): GoogleGenerativeAI | null {
  const key = process.env.GEMINI_API_KEY ?? process.env.LLM_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

// Pull the first JSON array out of a model response, tolerating code fences or
// stray prose around it.
function parseMedArray(raw: string): unknown {
  let text = raw.trim();
  // Strip ```json ... ``` fences.
  text = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function extractMedsFromImage(
  base64: string,
  mimeType: string
): Promise<ExtractedMed[]> {
  const client = getClient();
  if (!client) return [];

  const prompt = `You are reading a photo of a medication label, box, or packaging.
Extract every distinct medication you can clearly see, with its dose/strength if shown.

Return ONLY valid JSON: an array of objects like
[{"name": "ibuprofen", "dose": "200 mg"}]
Rules:
- "name": the medication name as printed. If both a brand and a generic/active
  ingredient are shown, prefer the generic/active ingredient name.
- "dose": strength such as "500 mg" or "10 mg/mL" if visible, otherwise null.
- Do NOT guess or invent medications you cannot read.
- If you cannot read any medication, return [].
No markdown, no commentary — JSON only.`;

  try {
    const model = client.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });

    const res = await model.generateContent([
      { text: prompt },
      { inlineData: { data: base64, mimeType } },
    ]);

    const parsed = parseMedArray(res.response.text());
    if (!Array.isArray(parsed)) return [];

    const meds: ExtractedMed[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const name =
        item && typeof (item as any).name === "string"
          ? (item as any).name.trim()
          : "";
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const doseRaw = (item as any).dose;
      const dose =
        typeof doseRaw === "string" && doseRaw.trim() ? doseRaw.trim() : null;
      meds.push({ name, dose });
    }
    return meds;
  } catch {
    return [];
  }
}
