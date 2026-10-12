# Flight Path

Your year of birding as a few shareable cards, built from your own eBird data.
Made for the Kent County, Michigan channel on our statewide birding Discord.

Everything runs in the browser. The CSV you load never leaves your device, and
there is no server, account, or database.

## How it works

1. Request your data at [ebird.org/downloadMyData](https://ebird.org/downloadMyData).
   eBird emails a zip containing `MyEBirdData.csv`.
2. Open the site and drop the CSV in.
3. Tap through the cards and save the ones you want to post. Cards are
   1080x1350 (4:5), which displays well inline in Discord.

## Cards so far

- **Cover**: every checklist location connected in date order, drawn as your flight path.
- **Headline numbers**: species, checklists, hours, miles, lifers (or days
  afield in your first year on eBird), locations, and biggest day.
- **Persona**: one of a set of birding personas, with the three stats that
  back it up. Logic is in `js/persona.js`. Thresholds are first guesses to
  tune against real exports. Add `?persona=<id>` to the URL to preview any
  persona's card (for example, `?persona=lakeshore`).

## Development

No build step. Serve the folder and open it:

```sh
npm start          # python3 -m http.server 8000
npm test           # node --test
```

`samples/demo.csv` is a simulated export used by the "Try the demo data" button and the tests.

## Layout

- `js/parse.js`: CSV parsing and column normalization (handles the header variants eBird has used)
- `js/stats.js`: per-year numbers: species, lifers, effort, streaks, top location
- `js/persona.js`: persona rules
- `js/slides.js`: card markup
- `js/app.js`: upload, navigation, and PNG export
- `vendor/`: [html-to-image](https://github.com/bubkoo/html-to-image) 1.11.11 (MIT), used for saving cards

## Known gaps

- Species filtering uses name patterns (drops "sp.", slashes, hybrids, domestics).
  Bundling the eBird taxonomy file would make it exact.
- "Miles walked" includes any traveling count, driving ones included.
