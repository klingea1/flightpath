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
3. **First checklist of the year**: where, when, and what was on it. The export
   doesn't record which bird came first, so this is the checklist, not the bird.
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
11. **Summary**: the whole year on one card, the one most worth posting.

## Development

No build step. Serve the folder and open it:

```sh
npm start          # python3 -m http.server 8000
npm test           # node --test
```

`samples/demo.csv` is a simulated export (with a few added checklists to exercise the seen-once and grind cards) used by the "Try the demo data" button and the tests.

## Layout

- `js/parse.js`: CSV parsing and column normalization (handles the header variants eBird has used)
- `js/stats.js`: per-year numbers: species, lifers, effort, streaks, top location
- `js/persona.js`: persona rules
- `js/slides.js`: card markup
- `js/unzip.js`: reads the CSV out of eBird's zip using the browser's built-in decompression
- `js/app.js`: upload, navigation, and PNG export
- `vendor/`: [html-to-image](https://github.com/bubkoo/html-to-image) 1.11.11 (MIT), used for saving cards

## Known gaps

- Species filtering uses name patterns (drops "sp.", slashes, hybrids, domestics).
  Bundling the eBird taxonomy file would make it exact.
- "Miles traveled" counts every traveling checklist, on foot or by car. The export has no travel mode, so the two are not split.
