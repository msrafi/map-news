# Map News

A React world-map news app. Region pins show how many reports are in that place. Opening a pin lists items by date and time. Cross-region stories draw a route; USGS-style datelines get a precise pointer on the map. A fixed left column breaks stock-option alerts down by ticker, and US stock headlines open in a drawer over the map.

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

A headline is kept if a place keyword in `src/data/places.json` matches, or if it names a US company from `src/data/companies.json` (or a cashtag). After editing either file, `npm start` (or `npm run sync:places`) copies both into the extension.

Merging also resolves the exact places a headline points at and stores them on the post as `spots`. Two kinds:

- **Datelines** such as `78 KM NORTH-NORTHEAST OF TOBELO, INDONESIA`. The anchor town is geocoded and the distance and bearing applied as a great-circle offset.
- **Named sub-locations** such as `urgent alert for Abha and Jazan`. Mixed-case headlines are mined for places after locative prepositions, then geocoded within the post's own country and kept only if they resolve to a populated place or an administrative boundary. That country-and-class check is what keeps "Congress" or "Lithuanian" out.
- **Named facilities** such as `RUSSIA'S SYZRAN OIL REFINERY`. All-caps wire copy is handled here: possessives (`RUSSIA'S …`), facility endings (`oil refinery`, `airport`, `bridge`, …), and strike verbs (`HIT …`). The country in the possessive is preferred over the post's region country, so a Kyiv-tagged strike still pins the refinery in Russia.

Lookups go through Nominatim and are cached in `scripts/geocache.json`, misses included, so a name is only ever queried once. Each run spends at most 25 new lookups to keep the watcher responsive; the rest are picked up on later runs. Clicking a region pin draws these spots as dotted trails from the pin, alongside any cross-region routes.

Manual pieces, if you need them:

```bash
npm run merge          # one-shot merge
npm run merge:watch    # watcher only
npm run sync:places    # copy places.json and companies.json into the extension
```

Add `--reset` to a merge to rebuild the feed from the drops alone.

Note that X's terms do not permit automated collection, so keep this to light personal use.

## Options column

The app is two columns: a 10% options column and the map. The column lists tickers, most recently traded first, each showing how many calls and puts it has and how long ago the last one landed. Picking a ticker opens its news in a drawer over the map: every post that traded it, with the parsed contracts, the full text, and a link to the original. Below 800px the columns stack, map on top.

Options parsing recognizes compact trade alerts such as `$TDOC 7c @.04`, `$ASTS 95 calls for Feb`, and `$SPY 724P 10/16exp $2.4M`, extracting the ticker, strike, call/put side, expiry, premium, contract quantity, and notional size when present. A post naming several tickers files one trade under each.

**US stocks** — index, futures, equity-move, and named-company headlines (`src/data/companies.json` maps names like `ORACLE` to `ORCL`, and bare cashtags are read directly) — is a second drawer, opened from its tab in the map's top-left corner. Both drawers sit side by side when open, and neither is part of the column. Clicking a stock headline opens a tooltip beside it with the full post, its parsed numbers, and a link to the original; Escape or a click outside closes it.

Option alerts and corporate headlines often contain no place name. The extension still collects them and assigns the shared New York market location required by the feed shape; they are displayed in the market drawers rather than treated as geographic news. Reload the unpacked extension after updates and confirm its popup reports version 1.6.0.

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
