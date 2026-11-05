// POST /api/subscribe { email } — weekly digest email list, stored in KV (SUBMISSIONS).

import { json, error, readJson, checkRateLimit, str, EMAIL_RE, HttpError } from "../_lib/http.js";

export async function onRequestPost(context) {
  const { env } = context;
  try {
    const b = await readJson(context.request, 2000);
    if (str(b.website, 200)) return json({ ok: true }); // honeypot
    const email = str(b.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) return error("Enter a valid email address.");

    const limit = await checkRateLimit(context, "forms", 10);
    if (!limit.ok) return error("Too many sign-ups from this network today.", 429);
    if (!env.SUBMISSIONS) return error("Email sign-up isn't connected yet. Use the RSS feed for now.", 503);

    await env.SUBMISSIONS.put(`subscriber:${email}`, JSON.stringify({ email, subscribedAt: new Date().toISOString() }));
    return json({ ok: true });
  } catch (e) {
    if (e instanceof HttpError) return error(e.message, e.status);
    console.error(e);
    return error("Sign-up failed. Try again in a minute.", 500);
  }
}
