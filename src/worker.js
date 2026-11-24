// Entry point when the site runs as a Cloudflare Worker.
// /api/videos uses the same code as the Pages function; everything else is a static file.
import { onRequestGet } from "../functions/api/videos.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/videos" && request.method === "GET") {
      return onRequestGet({ request, env, waitUntil: (p) => ctx.waitUntil(p) });
    }
    return env.ASSETS.fetch(request);
  }
};
