# Map News

A React world-map news app. Region pins show how many reports are in that place. Opening a pin lists items by date and time. Cross-region stories draw a route; USGS-style datelines get a precise pointer on the map. US stock headlines sit in a left-hand drawer.

The first screen is the world map. Posts live in `public/news.json` so the app can stay static and host on GitHub Pages.

## Run locally

One command. It installs packages if needed, syncs the place list, merges any news files already in Downloads, then starts the map and the feed watcher together.

```bash
npm start
```

Then open [http://localhost:5173](http://localhost:5173). Ctrl+C stops both processes.

If you only want the map against the current `public/news.json`, without watching Downloads:

```bash
npm install
npm run dev
```

## Keep the feed updating

The map reads `public/news.json`. New posts come from the Chrome extension in `extension/`, which copies headlines already on an X timeline.

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the `extension/` folder.
2. Open `https://x.com/FirstSquawk` and leave that tab open.
3. Click the extension icon, turn on **Auto-export every minute**.
4. In Chrome, turn off **Ask where to save each file**, or every export opens a save dialog.

With `npm start` running, drops land in `~/Downloads/map-news/`, get merged into `public/news.json` every 10 seconds (newest 500 posts), and consumed files move to `~/Downloads/map-news/merged/`. The first merge on macOS may ask the terminal to read Downloads; allow it once.

Leave the X tab open. X holds new posts behind a "show new posts" pill rather than inserting them, so a tab left alone can look frozen. The content script clicks that pill every 15 seconds, and with auto-export on the extension reloads every open X tab every 2 minutes so the newest posts actually render.

Run only one merge watcher. `npm start` already includes one, so a separate `npm run merge:watch` in another terminal will race it for the same files.

A headline is only kept if a place keyword in `src/data/places.json` matches. After editing that file, `npm start` (or `npm run sync:places`) copies it into the extension.

Merging also resolves the exact places a headline points at and stores them on the post as `spots`. Two kinds:

- **Datelines** such as `78 KM NORTH-NORTHEAST OF TOBELO, INDONESIA`. The anchor town is geocoded and the distance and bearing applied as a great-circle offset.
- **Named sub-locations** such as `urgent alert for Abha and Jazan`. Only mixed-case headlines are mined, since every word in an all-caps wire headline looks like a proper noun. Candidates must follow a locative preposition, and each is geocoded within the post's own country and kept only if it resolves to a populated place or an administrative boundary. That country-and-class check is what keeps "Congress" or "Lithuanian" out.

Lookups go through Nominatim and are cached in `scripts/geocache.json`, misses included, so a name is only ever queried once. Each run spends at most 25 new lookups to keep the watcher responsive; the rest are picked up on later runs. Clicking a region pin (not a stock-drawer row) draws these spots as dotted trails from the pin, alongside any cross-region routes.

Manual pieces, if you need them:

```bash
npm run merge          # one-shot merge
npm run merge:watch    # watcher only
npm run sync:places    # copy places.json into the extension
```

Add `--reset` to a merge to rebuild the feed from the drops alone.

Note that X's terms do not permit automated collection, so keep this to light personal use.

## Deploy to GitHub Pages

1. Create a GitHub repo named `map-news` (or change `VITE_BASE` in `package.json` `build:pages` to `/your-repo-name/`).
2. Enable Pages: **Settings → Pages → Deploy from GitHub Actions**.
3. Push `main`. The workflow in `.github/workflows/pages.yml` builds and publishes the site.

Or publish from your machine:

```bash
npm run deploy
```

If the repo name is not `map-news`, edit `build:pages` so `VITE_BASE` matches `/{repo}/`.

## Feed format

`id`, `regionId`, `region`, `city`, `country`, `lat`, `lng`, `author`, `handle`, `text`, `publishedAt`, `sourceUrl`

Optional `spot` (`label`, `lat`, `lng`, `anchorName`, `anchorLat`, `anchorLng`) is added by the merge step for headlines that name an exact location.

Anything that writes this shape works: the extension, a script, or a hand-edited file.

## Stack

- Vite + React + TypeScript
- MapLibre GL (`react-map-gl/maplibre`) with OpenFreeMap dark vector tiles
- `date-fns` for time grouping
