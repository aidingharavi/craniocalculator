// POST /api/collaborate — collaboration and validation requests.
// Stores the submission in KV (SUBMISSIONS) and optionally emails the site owner via Resend.

import { json, error, readJson, checkRateLimit, str, EMAIL_RE, HttpError } from "../_lib/http.js";

const TYPES = {
  validation: "Validate a model",
  calculator: "Suggest a calculator",
  research: "Research collaboration",
  other: "Other",
};

export async function onRequestPost(context) {
  const { env } = context;
  try {
    const b = await readJson(context.request);
    if (str(b.website, 200)) return json({ ok: true }); // honeypot: bots fill hidden fields

    const type = TYPES[b.type] ? b.type : "other";
    const entry = {
      type,
      name: str(b.name, 120),
      email: str(b.email, 200),
      institution: str(b.institution, 200),
      role: str(b.role, 80),
      model: type === "validation" ? str(b.model, 80) : "",
      cohortSize: type === "validation" ? str(b.cohortSize, 40) : "",
      irb: type === "validation" ? str(b.irb, 40) : "",
      message: str(b.message, 3000),
      submittedAt: new Date().toISOString(),
    };
    if (!entry.name || !entry.institution) return error("Add your name and institution.");
    if (!EMAIL_RE.test(entry.email)) return error("Enter a valid email address.");
    if (type !== "validation" && !entry.message) return error("Add a short message.");

    const limit = await checkRateLimit(context, "forms", 10);
    if (!limit.ok) return error("Too many messages from this network today. Email us instead.", 429);

    if (!env.SUBMISSIONS) return error("The form isn't connected to storage yet. Email us instead.", 503);
    await env.SUBMISSIONS.put(`collaboration:${entry.submittedAt}:${crypto.randomUUID()}`, JSON.stringify(entry));

    if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
      context.waitUntil(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: env.NOTIFY_FROM || "craniocalc <noreply@craniocalc.com>",
            to: [env.NOTIFY_EMAIL],
            reply_to: entry.email,
            subject: `${TYPES[type]}: ${entry.name}, ${entry.institution}`,
            text: Object.entries(entry).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n"),
          }),
        }).catch((e) => console.error("Notification email failed:", e.message))
      );
    }
    return json({ ok: true });
  } catch (e) {
    if (e instanceof HttpError) return error(e.message, e.status);
    console.error(e);
    return error("Your message couldn't be saved. Try again, or email us instead.", 500);
  }
}
