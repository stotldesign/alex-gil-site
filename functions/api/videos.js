// GET /api/videos — live stats for every video in the "edited" playlist.
// Runs on Cloudflare. Needs the secret YT_API_KEY (set in Cloudflare → Settings → Variables).
// Results are cached for CACHE_SECONDS so YouTube is asked at most every few minutes.

const DEFAULT_PLAYLIST = "PLUp31RSSTci0";
const CACHE_SECONDS = 300;
const API = "https://www.googleapis.com/youtube/v3/";

export async function onRequestGet(context) {
  const { env, request } = context;
  const playlist = env.YT_PLAYLIST_ID || DEFAULT_PLAYLIST;
  const now = Date.now();

  // With a KV store (binding STATS) we keep the last snapshot there. That also lets us
  // measure views per second between refreshes, which the homepage uses to tick the counter.
  const kv = env.STATS;
  const kvKey = "snap:" + playlist;
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/videos?playlist=" + playlist, request.url).toString());

  let snap = null;
  if (kv) {
    snap = await kv.get(kvKey, "json");
    if (snap && now - Date.parse(snap.updated) < CACHE_SECONDS * 1000) return json(snap, 200, 60);
  } else {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  if (!env.YT_API_KEY) return snap ? json(snap, 200, 60) : json({ error: "YT_API_KEY is not set" }, 503, 0);

  try {
    const videos = await loadPlaylist(env.YT_API_KEY, playlist);
    const total = videos.reduce((s, v) => s + v.views, 0);
    const body = { updated: new Date(now).toISOString(), source: "live", total, rate: 0, videos };

    if (snap) {
      const secs = (now - Date.parse(snap.updated)) / 1000;
      const measured = secs >= 120 && secs <= 6 * 3600 && total >= snap.total ? (total - snap.total) / secs : null;
      // blend with the previous rate so one quiet or busy refresh doesn't jerk the ticker around
      body.rate = measured == null ? snap.rate || 0 : snap.rate ? (snap.rate + measured) / 2 : measured;
      body.rate = Math.round(body.rate * 1000) / 1000;
    }

    if (kv) {
      context.waitUntil(kv.put(kvKey, JSON.stringify(body)));
      return json(body, 200, 60);
    }
    const res = json(body, 200, CACHE_SECONDS);
    context.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (err) {
    if (snap) return json(snap, 200, 60);
    return json({ error: String(err.message || err) }, 502, 0);
  }
}

async function yt(path, params, key) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  const r = await fetch(url, { headers: { Referer: "https://alex-gil.com/" } });
  if (!r.ok) throw new Error("YouTube " + path + " " + r.status);
  return r.json();
}

export async function loadPlaylist(key, playlist) {
  const ids = [];
  let pageToken = "";
  do {
    const params = { part: "contentDetails", maxResults: "50", playlistId: playlist };
    if (pageToken) params.pageToken = pageToken;
    const j = await yt("playlistItems", params, key);
    for (const it of j.items || []) ids.push(it.contentDetails.videoId);
    pageToken = j.nextPageToken || "";
  } while (pageToken);

  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt("videos", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") }, key);
    for (const v of j.items || []) {
      videos.push({
        id: v.id,
        title: v.snippet.title,
        channel: tidyName(v.snippet.channelTitle),
        published: v.snippet.publishedAt,
        views: Number(v.statistics.viewCount || 0),
        len: duration(v.contentDetails.duration)
      });
    }
  }
  videos.sort((a, b) => b.views - a.views);
  return videos;
}

// "MADS LUDVIG" → "Mads Ludvig" so all-caps channel names match the rest of the credits
export function tidyName(name) {
  if (!name || name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  return name.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

export function duration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "") || [];
  const h = +m[1] || 0, mi = +m[2] || 0, s = +m[3] || 0;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(mi).padStart(2, "0")}:${ss}` : `${mi}:${ss}`;
}

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store"
    }
  });
}
