# Makes the covers for the short-form shelf on the Video page.
# Reads work/shorts.json, writes public/assets/shorts/<id>.webp (540x960) and public/data/shorts.json.
# TikTok covers and titles come from TikTok's public oEmbed; Instagram needs a "cover" URL in the manifest.
# Runs in GitHub Actions (.github/workflows/fetch-shorts.yml). Skips covers already made.
import json, os, re, subprocess, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
manifest = json.load(open(os.path.join(ROOT, "work", "shorts.json")))
folder = os.path.join(ROOT, "public", "assets", "shorts")
os.makedirs(folder, exist_ok=True)
old_path = os.path.join(ROOT, "public", "data", "shorts.json")
old = json.load(open(old_path)) if os.path.exists(old_path) else {}
old_by_id = {s["id"]: s for clips in old.values() for s in clips}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

out = {}
for channel, clips in manifest.items():
    if channel.startswith("_"):
        continue
    out[channel] = []
    for c in clips:
        cid = re.sub(r"[^\w-]", "", c["url"].rstrip("/").split("?")[0].split("/")[-1])
        title = c.get("title") or old_by_id.get(cid, {}).get("title", "")
        cover = c.get("cover")
        if c.get("platform") == "tiktok":
            try:
                o = json.loads(get("https://www.tiktok.com/oembed?url=" + urllib.parse.quote(c["url"], safe="")))
                cover = cover or o.get("thumbnail_url")
                title = title or o.get("title", "")
            except Exception as e:
                print("oembed failed", cid, e)
        img = os.path.join(folder, cid + ".webp")
        if not os.path.exists(img) and cover:
            tmp = "/tmp/" + cid
            open(tmp, "wb").write(get(cover))
            subprocess.run(["convert", tmp + "[0]", "-auto-orient", "-strip", "-resize", "540x960^", "-gravity", "center", "-extent", "540x960", "-quality", "80", img], check=True)
            os.remove(tmp)
        title = re.split(r"\s#|\n", title)[0].strip()  # drop hashtags
        out[channel].append({"id": cid, "url": c["url"], "platform": c.get("platform", ""), "account": c.get("account", ""),
                             "title": title, "img": "/assets/shorts/%s.webp" % cid if os.path.exists(img) else ""})
        print("ok", channel, cid, bool(cover))

out["_views"] = manifest.get("_views", {})
json.dump(out, open(old_path, "w"), indent=1, ensure_ascii=False)
print("done")
