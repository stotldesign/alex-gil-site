# alex-gil.com

Portfolio site for Alex Gil: video editing, design and photo. Hosted on Cloudflare Pages.

## How it works

- `public/`: the site itself (plain HTML, CSS and JS, no build step)
  - `index.html`: homepage
  - `video/index.html`: every edit, built from the YouTube playlist
  - `assets/style.css`: all styles
  - `assets/app.js`: view counter, credits line and Video page
  - `data/videos.json`: saved snapshot, used only if the live data can't load
- `functions/api/videos.js`: runs on Cloudflare at `/api/videos`. It asks YouTube for every video in the
  "edited" playlist (`PLUp31RSSTci0`), adds up the views, and caches the result for 5 minutes.

To add a new edit, add it to the YouTube playlist. The site picks it up within about 5 minutes.

## Cloudflare settings

- Framework preset: None
- Build command: (leave empty)
- Build output directory: `public`
- Environment variables (Production):
  - `YT_API_KEY`: YouTube Data API v3 key (mark it as a secret)
  - `YT_PLAYLIST_ID`: optional, defaults to `PLUp31RSSTci0`

## Placeholders still to fill in

- `[your@email.com]` in both HTML files
- `[handle]`: Instagram handle in `index.html`
- `[alder-cote-site]`: Alder Cote link in `index.html`
- Design and Photo tiles marked `[project]` / `[photo]`
- More hero photos: add images to `public/assets/` and extra `<img>` tags inside `.hero`. They cycle every 3 seconds.
