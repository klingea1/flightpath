# Flight Path

Your year of birding as a few shareable cards, built from your own eBird data.
Made for the Kent County, Michigan channel on our statewide birding Discord.

Everything runs in the browser. The CSV you load never leaves your device, and
there is no server, account, or database.

## How it works

1. Request your data at [ebird.org/downloadMyData](https://ebird.org/downloadMyData).
   eBird emails a zip containing `MyEBirdData.csv`.
2. Open the site and drop the zip in, or the CSV inside it.
3. Tap through the cards and save the ones you want to post. Cards are
   1080x1350 (4:5), which displays well inline in Discord.

## Cards so far

1. **Cover**: every checklist location connected in date order, drawn as your flight path.
2. **Headline numbers**: species, checklists, hours, miles traveled, lifers (or days
   afield in your first year on eBird), locations, and biggest day.
3. **First checklist of the year**: where, when, and what was on it, plus that
   day's totals. The export doesn't record which bird came first, so this is
   the checklist, not the bird.
4. **Lifers**: new species in the order you found them. Skipped if there were none.
5. **Top patch**: your most-visited location and any species you found only there.
6. **Top birds**: top five species by how many of your checklists they appeared on.
   When #1 is a Kent County staple, the card admits it.
7. **Seen exactly once**: birds that showed up on a single checklist all year.
8. **Months**: checklists per month, with your busiest month called out.
9. **Grind**: your slowest complete checklist of an hour or more, by minutes per species.
10. **Persona**: one of a set of birding personas, with the three stats that
   back it up. Logic is in `js/persona.js`. Thresholds are first guesses to
   tune against real exports. Add `?persona=<id>` to the URL to preview any
   persona's card (for example, `?persona=lakeshore`).
11. **Map**: every place you birded, on an outline map with no streets. Pins
   are snapped to a grid of about 2 km so nobody's yard is identifiable, and
   repeat visits grow a pin instead of adding one. Out-of-state travel is
   named, and when it zooms the map far out, an inset shows home. The map
   loads only when this card is reached.

   The card plays your year one month per second: the map frames wherever
   you birded that month, and all of that month's places bloom at once
   (new places pop in, revisited ones grow). Any year plays in about 12
   seconds, however much someone traveled. Tapping skips to the end,
   Replay runs it again, and saving always captures the final frame. With
   reduced motion turned on, the card shows the final frame directly.
12. **Summary**: the whole year on one card, the one most worth posting.

Each card animates once as it's shown (counts tick up, lists cascade, bars
grow) and then holds still. Saving freezes the finished card first, so the
image is never caught mid-animation. Reduced motion turns entrances off.

## Development

No build step. Serve the folder and open it:

```sh
npm start          # python3 -m http.server 8000
npm test           # node --test
```

`npm install` is only needed to rebuild the map outlines (see `tools/build-map.mjs`). The site itself has no dependencies to install.

`samples/demo.csv` is a simulated export (with a few added checklists to exercise the seen-once and grind cards) used by the "Try the demo data" button and the tests.

## Layout

- `js/parse.js`: CSV parsing and column normalization (handles the header variants eBird has used)
- `js/stats.js`: per-year numbers: species, lifers, effort, streaks, top location
- `js/persona.js`: persona rules
- `js/slides.js`: card markup
- `js/places.js`: grid-snapped pins, home area, and trips for the map card
- `js/mapcard.js`: the map card (Leaflet, drawn from bundled outlines with no tile service)
- `js/unzip.js`: reads the CSV out of eBird's zip using the browser's built-in decompression
- `js/app.js`: upload, navigation, and PNG export
- `data/map.topo.json`: outlines for the map: Natural Earth countries and lakes, Census state lines, Michigan counties (all public domain). Rebuild with `tools/build-map.mjs`.
- `vendor/`: [html-to-image](https://github.com/bubkoo/html-to-image) 1.11.11 (MIT) for saving cards, [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2) and [topojson-client](https://github.com/topojson/topojson-client) 3.1.0 (ISC) for the map

## Privacy

Cards are made to be posted publicly, so:

- Coordinates are stripped from every location name. eBird often names personal
  locations after them, like "Michigan 66 (42.766, -85.074)".
- Map pins are snapped to a ~2 km grid, on a map with no streets.
- The page never uploads the export anywhere.

## Known gaps

- Species filtering uses name patterns (drops "sp.", slashes, hybrids, domestics).
  Bundling the eBird taxonomy file would make it exact.
- The export doesn't flag exotic or escapee species, so species and lifer
  counts can run slightly higher than eBird's own totals.
- "Miles traveled" counts every traveling checklist, on foot or by car. The export has no travel mode, so the two are not split.
