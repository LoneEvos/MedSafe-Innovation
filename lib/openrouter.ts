// Thin OpenRouter client (OpenAI-compatible chat completions).
// Used by lib/llm.ts (text) and lib/vision.ts (image). Returns the message
// content string, or null on any failure so callers can fall back gracefully.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 30000;

// Model is configurable via env; default to a capable multimodal model so the
// same one works for both text and image (label) reads.
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "openai/gpt-4o";

// OpenAI-style message content: a plain string, or parts (for vision).
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export async function openrouterChat(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number; model?: string }
): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY ?? process.env.LLM_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Optional attribution headers used by OpenRouter for ranking.
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://medsafe.app",
        "X-Title": "MedSafe",
      },
      body: JSON.stringify({
        model: opts?.model ?? OPENROUTER_MODEL,
        temperature: opts?.temperature ?? 0.4,
        max_tokens: opts?.maxTokens ?? 800,
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
