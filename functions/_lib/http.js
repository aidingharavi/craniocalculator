// Small HTTP helpers for Cloudflare Pages Functions.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request, maxBytes = 20_000) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > maxBytes) throw new HttpError("Request is too large.", 413);
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError("Request is too large.", 413);
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError("Request body must be JSON.", 400);
  }
}

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Per-visitor daily limit using a KV namespace bound as RATE_LIMIT.
 * IPs are hashed with a salt, never stored raw. If no KV is bound, the limit is skipped.
 */
export async function checkRateLimit(context, bucket, limit) {
  const kv = context.env.RATE_LIMIT;
  if (!kv) return { ok: true };
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = `${bucket}:${day}:${await sha256((context.env.RATE_SALT || "cfai") + ip)}`;
  const used = Number((await kv.get(key)) || 0);
  if (used >= limit) return { ok: false, used, limit };
  await kv.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return { ok: true, used: used + 1, limit };
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
