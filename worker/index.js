// Cloudflare Worker entry point for craniocalc.
// Static files in ./public are served directly by Workers static assets
// (including _headers and the 404 page). Only /api/* requests reach this code.

import { onRequestPost as collaborate } from "../functions/api/collaborate.js";
import { onRequestPost as subscribe } from "../functions/api/subscribe.js";
import { onRequestGet as exportSubmissions } from "../functions/api/admin/export.js";

const ROUTES = {
  "/api/collaborate": { POST: collaborate },
  "/api/subscribe": { POST: subscribe },
  "/api/admin/export": { GET: exportSubmissions },
};

const json = (data, status) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const route = ROUTES[url.pathname.replace(/\/$/, "")];
      if (!route) return json({ error: "Not found." }, 404);
      const handler = route[request.method];
      if (!handler) return json({ error: "Method not allowed." }, 405);
      // Handlers use the Pages Functions context shape: { request, env, waitUntil }.
      return handler({ request, env, waitUntil: (p) => ctx.waitUntil(p) });
    }

    return env.ASSETS.fetch(request);
  },
};
