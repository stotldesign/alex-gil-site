# Downloads every image listed in work/manifest.json from the old Cargo site and makes:
#   public/assets/work/<section>/<id>-full.webp  (long edge up to 3200px, for the full-size view)
#   public/assets/work/<section>/<id>.webp       (long edge up to 1600px, for the page)
# and writes public/data/work.json with sizes, so pages can lay images out without guessing.
# Runs in GitHub Actions (see .github/workflows/fetch-work.yml). Skips files already made.
import json, os, subprocess, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
manifest = json.load(open(os.path.join(ROOT, "work", "manifest.json")))
out = {}

def run(*args):
    subprocess.run(args, check=True)

for section, projects in manifest.items():
    folder = os.path.join(ROOT, "public", "assets", "work", section)
    os.makedirs(folder, exist_ok=True)
    out[section] = []
    for p in projects:
        items = []
        for it in p["items"]:
            full = os.path.join(folder, it["id"] + "-full.webp")
            web = os.path.join(folder, it["id"] + ".webp")
            if not (os.path.exists(full) and os.path.exists(web)):
                tmp = "/tmp/" + it["id"]
                req = urllib.request.Request(it["src"], headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
                    f.write(r.read())
                run("convert", tmp + "[0]", "-auto-orient", "-strip", "-resize", "3200x3200>", "-quality", "86", full)
                run("convert", tmp + "[0]", "-auto-orient", "-strip", "-resize", "1600x1600>", "-quality", "80", web)
                os.remove(tmp)
            w, h = subprocess.run(["identify", "-format", "%w %h", web], capture_output=True, text=True, check=True).stdout.split()
            rel = "/assets/work/%s/%s" % (section, it["id"])
            items.append({"id": it["id"], "src": rel + ".webp", "full": rel + "-full.webp", "w": int(w), "h": int(h)})
            print("ok", it["id"], w, h)
        out[section].append({"slug": p["slug"], "title": p["title"], "items": items})

json.dump(out, open(os.path.join(ROOT, "public", "data", "work.json"), "w"), indent=1)
print("done")
