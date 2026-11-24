# Notes for editing this site

- Plain static site in `public/`, deployed by Cloudflare (as a Worker via `wrangler.jsonc` + `src/worker.js`, or as Pages) on every push to `main`. There is no build step, so keep it dependency-free.
- Look: cream `#f7f5ee`, ink `#1c1c1a`, one red accent `#d7301f` for hover only. Inter Tight for type, JetBrains Mono for numbers and small labels. Rounded frame, 1.5px rules, halftone images. Keep it calm: Alex prefers less on the page, not more.
- The view count, edit count and "edited for" line come from `/api/videos` (`functions/api/videos.js`). Never hard-code new numbers as the source of truth; `public/data/videos.json` is only a fallback.
- Never add anything that looks AI-generated (images, illustrations, effects).
