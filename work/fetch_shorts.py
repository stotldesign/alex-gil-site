# Makes the covers and data for the Shorts view on the Video page.
# Reads work/shorts.json, writes public/assets/shorts/<id>.webp (540x960) and public/data/shorts.json.
# TikTok covers can come from TikTok's public oEmbed; Instagram needs a "cover" URL in the manifest.
# Runs in GitHub Actions (.github/workflows/fetch-shorts.yml). Skips covers already made.
import json, os, re, subprocess, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
manifest = json.load(open(os.path.join(ROOT, "work", "shorts.json")))
folder = os.path.join(ROOT, "public", "assets", "shorts")
os.makedirs(folder, exist_ok=True)

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def clip_id(url):
    return re.sub(r"[^\w-]", "", url.rstrip("/").split("?")[0].split("/")[-1])

clips, total = [], 0
for c in manifest["clips"]:
    cid = clip_id(c["url"])
    cover, title = c.get("cover"), c.get("title", "")
    if c.get("platform") == "tiktok" and not cover:
        try:
            o = json.loads(get("https://www.tiktok.com/oembed?url=" + urllib.parse.quote(c["url"], safe="")))
            cover, title = o.get("thumbnail_url"), title or o.get("title", "")
        except Exception as e:
            print("oembed failed", cid, e)
    img = os.path.join(folder, cid + ".webp")
    if not os.path.exists(img) and cover:
        try:
            tmp = "/tmp/" + cid
            open(tmp, "wb").write(get(cover))
            subprocess.run(["convert", tmp + "[0]", "-auto-orient", "-strip", "-resize", "540x960^", "-gravity", "center", "-extent", "540x960", "-quality", "80", img], check=True)
            os.remove(tmp)
        except Exception as e:
            print("cover failed", cid, e)
    views = c.get("views", 0) + sum(a.get("views", 0) for a in c.get("also", []))
    total += views
    clips.append({"id": cid, "url": c["url"], "platform": c.get("platform", ""), "account": c.get("account", ""),
                  "creator": c.get("creator", ""), "title": re.split(r"\s#|\n", title)[0].strip(), "views": views,
                  "also": [a.get("platform", "") for a in c.get("also", [])],
                  "img": "/assets/shorts/%s.webp" % cid if os.path.exists(img) else ""})
    print("ok", cid, views, os.path.exists(img))

out = {"checked": manifest.get("views_checked", ""), "total": total, "clips": clips}
json.dump(out, open(os.path.join(ROOT, "public", "data", "shorts.json"), "w"), indent=1, ensure_ascii=False)
print("done", total)
