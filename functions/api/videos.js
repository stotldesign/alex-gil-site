// GET /api/videos — live stats for every video in the "edited" playlist.
// Runs on Cloudflare. Needs the secret YT_API_KEY (set in Cloudflare → Settings → Variables).
// Results are cached for CACHE_SECONDS so YouTube is asked at most every few minutes.

const DEFAULT_PLAYLIST = "PLUp31RSSTci0";
const CACHE_SECONDS = 300;
const CATCHUP_HOURS = 56; // pace of the catch-up: ~95% of a jump is shown within a week (3 x 56h)
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
    const channels = await loadChannels(env.YT_API_KEY, videos).catch(() => (snap && snap.channels) || []);
    const total = videos.reduce((s, v) => s + v.views, 0);
    const brands = await loadBrands(env.YT_API_KEY).catch(() => (snap && snap.brands) || []);
    const body = { updated: new Date(now).toISOString(), source: "live", total, rate: 0, brands, channels, videos };

    // Rate = median of the last 12 measurements (~1 hour). A sudden step (a video added, a
    // viral spike) shows up in one reading and is ignored here; the catch-up below spreads it
    // out instead. A sustained surge moves the median within ~30 minutes.
    body.rates = (snap && snap.rates) || [];
    if (snap) {
      const secs = (now - Date.parse(snap.updated)) / 1000;
      if (secs >= 120 && secs <= 6 * 3600 && total >= snap.total) {
        body.rates = body.rates.concat((total - snap.total) / secs).slice(-12);
      }
    }
    body.rate = Math.round(median(body.rates) * 1000) / 1000;

    // Catch-up: the homepage shows `shown`, climbing at `showRate`. When the real total jumps
    // (a new video, a viral day), the shown number doesn't leap; it climbs faster until it catches
    // up (about 1/3 of the remaining gap per CATCHUP_HOURS, so ~95% within a week). Never more than real.
    const prevShown = snap && snap.shown != null
      ? Math.min(snap.shown + (snap.showRate || 0) * ((now - Date.parse(snap.updated)) / 1000), total)
      : total;
    const gap = Math.max(0, total - prevShown);
    body.shown = Math.floor(prevShown);
    body.showRate = Math.round((body.rate + gap / (CATCHUP_HOURS * 3600)) * 1000) / 1000;

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
        channelId: v.snippet.channelId,
        published: v.snippet.publishedAt,
        views: Number(v.statistics.viewCount || 0),
        len: duration(v.contentDetails.duration)
      });
    }
  }
  videos.sort((a, b) => b.views - a.views);
  return videos;
}

// Brands Alex has edited for. They lead the "edited for" line, with the brand's own YouTube
// profile picture, and link to the work. Add more here as { name, username|handle, url }.
export const BRANDS = [
  { name: "Fanta", username: "fanta", url: "https://www.youtube.com/watch?v=JznJvd_G6ps" }
];
export async function loadBrands(key) {
  const out = [];
  for (const b of BRANDS) {
    const q = b.handle ? { forHandle: b.handle } : { forUsername: b.username };
    const j = await yt("channels", Object.assign({ part: "snippet" }, q), key).catch(() => ({}));
    const c = (j.items || [])[0];
    const th = (c && c.snippet.thumbnails) || {};
    out.push({ name: b.name, url: b.url, brand: true, avatar: (th.default || th.medium || {}).url || "" });
  }
  return out;
}

// Channel name, subscriber count and small profile picture for every creator in the playlist.
export async function loadChannels(key, videos) {
  const ids = [...new Set(videos.map((v) => v.channelId).filter(Boolean))];
  const channels = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt("channels", { part: "snippet,statistics", id: ids.slice(i, i + 50).join(",") }, key);
    for (const c of j.items || []) {
      const th = c.snippet.thumbnails || {};
      channels.push({
        id: c.id,
        name: tidyName(c.snippet.title),
        url: c.snippet.customUrl ? "https://www.youtube.com/" + c.snippet.customUrl : "https://www.youtube.com/channel/" + c.id,
        subs: c.statistics.hiddenSubscriberCount ? 0 : Number(c.statistics.subscriberCount || 0),
        avatar: (th.default || th.medium || {}).url || ""
      });
    }
  }
  channels.sort((a, b) => b.subs - a.subs);
  return channels;
}

// "MADS LUDVIG" → "Mads Ludvig" so all-caps channel names match the rest of the credits
export function tidyName(name) {
  if (!name || name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  return name.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

function median(xs) {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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
