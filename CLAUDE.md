# flightpath

Flight Path: your year of birding as shareable cards, built in the browser from your own eBird export. Made for the Kent County, Michigan channel on the statewide birding Discord.

## Stack
- Plain HTML + ES modules, no build step, no runtime dependencies · JavaScript · npm (dev tooling only)
- Hosting: GitHub Pages, published straight from `main` at `/` — https://klingea1.github.io/flightpath/
- Repo: https://github.com/klingea1/flightpath

## Commands
- Dev: `npm start` (serves the folder at http://localhost:8000/ via `tools/serve.mjs`)
- Test: `npm test` (`node --test`; CI runs it on Node 22 for PRs and pushes to `main`)
- Install: not needed to run or test. `npm ci` only to rebuild map outlines with `tools/build-map.mjs`.
- Deploy: merging or pushing to `main` deploys immediately. Always ask first, and go through a PR.

## Structure
- `README.md` documents every card, the module layout, and privacy rules. Read it before changing cards.
- Card order and when each card appears: `buildCards` in `js/slides.js`.
- `HANDOFF.md`: state as of 2026-10-14, open items (Muscovy Duck counting, December beta, design critique findings).
- `vendor/` holds pinned copies of html-to-image 1.11.11 and topojson-client 3.1.0, loaded directly by the page.

## Rules
- Never commit anyone's real eBird export. Test data: `samples/demo.csv`, `test/fixtures/edge/`, or `node tools/make-big-export.mjs <out.csv>`.
- Keep it client-side, with as few dependencies and outside data sources as possible. The export must never leave the device.
- Keep the privacy guarantees in the README: coordinates stripped from location names, map pins snapped to a ~2 km grid.
- After visual changes, check text contrast (4.5:1 minimum) and run axe on every card. Wait about 1.9 s per card for entrance animations before checking.

## Gotchas
- Paths must stay relative (`js/app.js`, `data/map.topo.json`): Pages serves the site from `/flightpath/`.
- Line endings are LF via `.gitattributes`. The zip fixtures contain LF CSVs, so a CRLF checkout of `test/fixtures/small.csv` fails the unzip test.
- In January and February the deck defaults to the previous year (`js/years.js`).
