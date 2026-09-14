# Map News

A React world-map news app. Region pins show how many reports are in that place. Opening a pin lists items by date and time.

The first screen is the world map. Sample posts live in `public/news.json` so the app can stay static and host on GitHub Pages.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Create a GitHub repo named `map-news` (or change `VITE_BASE` in `package.json` `build:pages` to `/your-repo-name/`).
2. Enable Pages: **Settings → Pages → Deploy from GitHub Actions**.
3. Push `main`. The workflow in `.github/workflows/pages.yml` builds and publishes the site.

Or publish from your machine:

```bash
npm run deploy
```

If the repo name is not `map-news`, edit `build:pages` so `VITE_BASE` matches `/{repo}/`.

## Collecting posts with the Chrome extension

`extension/` is an unpacked Chrome extension that reads the posts already rendered on an
X timeline and exports them in this app's JSON shape.

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the `extension/` folder.
2. Open a timeline such as `https://x.com/FirstSquawk` and scroll through the posts you want.
3. Click the extension icon and choose **Download news.json**.
4. Move that file to `public/news.json` and reload the app.

## Running it on a loop

With **Auto-export every minute** ticked in the popup, the extension rescans open X tabs each
minute and downloads only the posts it has not exported before, into `~/Downloads/map-news/`.
Nothing downloads when there is nothing new.

On this machine, merge those drops into the feed:

```bash
npm run merge:watch
```

That polls every 20 seconds, merges by post id into `public/news.json`, keeps the newest 500,
and moves each consumed file to `~/Downloads/map-news/merged/`. Run `npm run merge` for a
one-shot merge, or add `--reset` to rebuild the feed from the drops alone.

Turn off **Ask where to save each file** in Chrome's download settings, or every export will
open a save dialog. The first run of `npm run merge` may block on a macOS prompt asking to let
the terminal read your Downloads folder; allow it once.

A headline is only kept if `extension/places.js` matches a place keyword in its text, since the
map needs coordinates. Add entries to that list to cover more regions.

Merging also resolves precise datelines such as `78 KM NORTH-NORTHEAST OF TOBELO, INDONESIA`:
the anchor town is geocoded once through Nominatim, the distance and bearing are applied as a
great-circle offset, and the result is stored on the post as `spot`. Lookups are cached in
`scripts/geocache.json`, so a merge only hits the network for a town it has never seen. The map
draws that spot as a small marker tied back to the region pin when you click the pin.

Note that X's terms do not permit automated collection, so keep this to light personal use;
heavy scraping risks rate limits or account suspension.

## Feed format

`id`, `regionId`, `region`, `city`, `country`, `lat`, `lng`, `author`, `handle`, `text`, `publishedAt`, `sourceUrl`

Optional `spot` (`label`, `lat`, `lng`, `anchorName`, `anchorLat`, `anchorLng`) is added by the
merge step for headlines that name an exact location.

Anything that writes this shape works: the extension, a script, or a hand-edited file.

## Stack

- Vite + React + TypeScript
- MapLibre GL (`react-map-gl/maplibre`) with OpenFreeMap dark vector tiles
- `date-fns` for time grouping
