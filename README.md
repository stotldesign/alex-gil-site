# alex-gil.com

Portfolio site for Alex Gil: video editing, design and photo. Hosted on Cloudflare Pages.

## How it works

- `public/`: the site itself (plain HTML, CSS and JS, no build step)
  - `index.html`: homepage
  - `video/index.html`: every edit, built from the YouTube playlist
  - `design/index.html`: catalogue plates (index of projects, one piece at a time)
  - `photo/index.html`: salon wall (each set hung at mixed sizes)
  - `assets/work.js`: Design + Photo pages and the full-size viewer
  - `data/work.json` + `assets/work/`: design and photo images (made by `work/fetch.py`)
  - `assets/style.css`: all styles
  - `assets/app.js`: view counter, credits line and Video page
  - `data/videos.json`: saved snapshot, used only if the live data can't load
- `functions/api/videos.js`: runs on Cloudflare at `/api/videos`. It asks YouTube for every video in the
  "edited" playlist (`PLUp31RSSTci0`), adds up the views, and caches the result for 5 minutes.

To add a new edit, add it to the YouTube playlist. The site picks it up within about 5 minutes.

## Cloudflare settings

If the project is a **Worker** (the default for new projects): `wrangler.jsonc` handles everything. Just add the `YT_API_KEY` secret under Settings → Variables and Secrets. The Worker's name must be `alex-gil-site` (or change `name` in `wrangler.jsonc` to match).

If the project is **Pages**:

- Framework preset: None
- Build command: (leave empty)
- Build output directory: `public`
- Environment variables (Production):
  - `YT_API_KEY`: YouTube Data API v3 key (mark it as a secret)
  - `YT_PLAYLIST_ID`: optional, defaults to `PLUp31RSSTci0`

## Placeholders still to fill in

- `[your@email.com]` in both HTML files
- More hero photos: add images to `public/assets/` and extra `<img>` tags inside `.hero`. They cycle every 3 seconds.

## Adding design or photo work

Add entries to `work/manifest.json` (any image URL works) and push. The GitHub Action downloads them, makes web versions and commits them.
