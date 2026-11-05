// GET /api/admin/export?type=collaboration|subscriber
// Header: Authorization: Bearer <ADMIN_TOKEN>
// Returns stored form submissions as JSON (or CSV with &format=csv).

import { json, error, sha256 } from "../../_lib/http.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.ADMIN_TOKEN || !env.SUBMISSIONS) return error("Not configured.", 404);

  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // Compare hashes so the check takes the same time regardless of where strings differ.
  if ((await sha256(supplied)) !== (await sha256(env.ADMIN_TOKEN))) return error("Unauthorized.", 401);

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "subscriber" ? "subscriber" : "collaboration";
  const rows = [];
  let cursor;
  do {
    const page = await env.SUBMISSIONS.list({ prefix: `${type}:`, cursor });
    for (const k of page.keys) {
      const v = await env.SUBMISSIONS.get(k.name, "json");
      if (v) rows.push(v);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  if (url.searchParams.get("format") === "csv") {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${type}.csv"` },
    });
  }
  return json({ type, count: rows.length, rows });
}
