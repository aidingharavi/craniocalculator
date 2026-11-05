// Minimal Claude API client (Messages API) shared by functions and scripts.

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_FAST_MODEL = "claude-haiku-5-5";

export async function askClaude(env, { system, prompt, model, maxTokens = 1500, temperature = 0 }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || env.CLAUDE_MODEL || DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API error (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Pull the first JSON object out of a model reply (tolerates code fences). */
export function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model reply");
  return JSON.parse(text.slice(start, end + 1));
}
