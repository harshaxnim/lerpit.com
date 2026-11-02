# Analytics

`/analytics/` shows who reads Lerpit: visits over the last 30 days, the most-read pages,
where readers come from, where in the world they are, and what they read on. It is public,
like the site. The README's Analytics section covers the setup and the redeploy; this note
covers the design.

## Parts

| Part | File | What it does |
| --- | --- | --- |
| Beacon | `website/src/layouts/BaseLayout.astro` | Cloudflare's `beacon.min.js` on every built page (not the dev server). |
| Stats Worker | `stats-worker/worker.js` | One GraphQL query to Cloudflare Web Analytics, returned as public JSON from `https://stats.lerpit.com/`, cached at the edge for 10 minutes. |
| Page | `website/src/pages/analytics.astro` | Fetches the JSON in the browser and draws it. |
| Styles | `website/src/styles/global.css`, the `.analytics` block | Site tokens only. |
| Map | `website/src/assets/world-map.svg`, made by `scripts/world-map.mjs` | 176 country outlines. |

## The JSON

```ts
{
  updated: string;                            // ISO time the Worker asked Cloudflare
  day, week: { visits, views };               // last 24 hours, last 7 days
  month: { visits, views };                   // last 30 days
  daily: { date, visits, views }[];           // UTC dates; days with no visits are absent
  pages: { path, visits, views }[];           // top 10 by page views
  referrers, countries, devices, browsers: { name, visits }[];
}
```

- Countries are ISO 3166-1 alpha-2 codes, plus `T1` (Tor) and `XX` (unknown). The page
  names them with the browser's `Intl.DisplayNames`, so no country list ships.
- A visit is counted only on the page where a reader arrives from elsewhere, so pages are
  ranked by page views; a page reached by a link inside the site has views but no visits.
- Cloudflare answers a query spanning more than about 8 days from a summary that misses
  at least the newest half-day (13 hours after a visit it was still missing). So the Worker
  never asks for 30 days at once: it asks for the last 7 days and the 23 before them, and
  adds the two. Lists ask each window for more rows than they return, so the sums hold for
  rows near the cut.
- Fields are only ever added. The page treats `pages` as optional, so either side can be
  deployed first.

## The page

- **Visits per day:** an SVG path stretched to the figure (`preserveAspectRatio="none"`,
  strokes with `vector-effect: non-scaling-stroke`). Thirty points always, with missing days
  as zero, so one day of data still draws a line. Hover or tap shows the day's visits and
  page views.
- **Map:** inlined at build time (`?raw`), so it costs no request. Each `<path data-c="US">`
  read by someone gets `is-read` and a `--shade` of 0.2 + 0.8·√(share of the top country),
  so a country with a tenth of the top country's readers still shows. Small countries
  (Singapore, Hong Kong) are invisible at this scale, so the ranked list beside the map
  carries them; the list is also the map's text version for screen readers.
- **Most-read pages:** paths are named at build time from the content (lerpette and
  collection titles), with the path in the hover title. An unknown path shows as itself.
- **Devices:** one share bar and a legend. Shares are rounded per row, so they need not sum
  to 100; a share under 1% says so.
- **States:** "Counting…" while loading, one message if the Worker cannot be reached, and
  "No visits recorded yet." in each list on a new site.

Weight: the whole page is about 30 KB compressed, the map about 26 KB of it. No library and
no service other than Cloudflare.

## The map file

Natural Earth's 1:110m countries (public domain) from the `world-atlas` package, in the
Equal Earth projection, 960 wide, whole-pixel coordinates, Antarctica left out. Kosovo is
`XK`; Northern Cyprus and Somaliland share Cyprus's and Somalia's codes. To regenerate it:

```bash
npm i --no-save world-atlas@2 d3-geo@3 topojson-client@3 i18n-iso-countries@7
node scripts/world-map.mjs
```

## Verified

Headless Chrome against the dev server, with sample JSON served in place of the Worker:

- Desktop (1280 px), phone (390 px, emulated), no data, and the Worker unreachable.
- Hovering the chart and a country shows the right tip.
- Phone width has no sideways scroll; a long path is cut with an ellipsis.
- The Worker's query was run against the live GraphQL API before deploying.

## Known limits

- Cloudflare does not count readers whose browser blocks the beacon, and records no visit
  duration.
- The tips follow the pointer; there is no keyboard path through the chart's days or the
  map's countries. The chart's label and the country list carry the same numbers.

## Possible next steps

- A range switch (7, 30, 90 days): the Worker would take `?days=` and cache per range.
- Visits per page over time: a `daily` grouped by `requestPath`.
