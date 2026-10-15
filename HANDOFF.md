# Handoff

State of Flight Path as of 2026-10-14, for picking work up locally.

## Where things stand

- `main` holds everything merged: PRs #1 (edge cases and CI), #2 (accessibility), #3 (favicon), #4 (Welcome back, Spring arrivals, Clock cards, Share all).
- GitHub Pages publishes from `main`. CI (`.github/workflows/test.yml`) runs `npm test` on PRs and pushes to `main`.
- A real 2026 export currently builds a 15-card deck: cover, headline, first, lifers, welcome back, spot, birds, once, months, arrivals, clock, grind, persona, map, summary. Card order and gating live in `buildCards` in `js/slides.js`.

## Run it locally

```sh
npm test                                  # node --test, 50 tests, no dependencies
python3 -m http.server 8765               # then open http://localhost:8765/
```

No build step. Plain ES modules; `vendor/` holds html-to-image 1.11.11 and topojson-client 3.1.0. `README.md` documents every card and the module layout.

Ground rules carried over:

- Never commit anyone's real eBird export. Use `samples/demo.csv`, `test/fixtures/edge/`, or `tools/make-big-export.mjs` for test data.
- Keep it client-side with as few dependencies and outside data sources as possible.
- After visual changes, check text contrast (4.5:1 minimum) and run axe on every card. The contrast check is now `tools/check-cards.mjs` (screenshots every card, hides the text, and samples the pixels behind each element). The axe script from the cloud session is gone and hasn't been replaced.

## Open items

### Waiting on Liz: Muscovy Duck

Liz's eBird totals are 422 species and 133 lifers, while Flight Path shows 421 and 132. The likely cause is "Muscovy Duck (Domestic type)", which has 7 sightings in Florida and Hawaii in 2026. `speciesKey` in `js/stats.js` drops all "(Domestic type)" entries. If she confirms Muscovy Duck counts on her eBird list, make "(Domestic type)" count toward its parent species (at least for Muscovy) and add a test in `test/stats.test.js`.

### Beta testers in December

The owner's call on who and when. In January, `js/years.js` defaults to the previous year until March, so December testers will see the in-progress year.

### Design critique (Impeccable, 2026-10-14)

The scope is a critique-and-refine pass only, not a redesign. Score 27/40 (Acceptable). axe was clean and card contrast passed. No priorities or scope were chosen yet. Findings, most important first:

1. **[P1] Bottom control row breaks on phones.** On the map card at 390px, Replay is clipped under Share. At 360px the page scrolls sideways, and at 320px the arrows touch the edges. At 200% zoom, the back arrow and Share are off-screen. Fix: move Replay out of `.deck-controls` (an overlay on the card or the `.share-all-row`), and let `#share` drop its 140px `min-width` on narrow screens (`css/style.css`, the `#share` rule near line 152).
2. **[P1] Last-card share moment is overloaded.** "Share all N cards" and Share use identical accent pills. Discord allows at most 10 attachments per message, so 15 can't go in one post. Fix: make sharing the summary card the single primary action, and demote Share all to a secondary style that shares in batches of 10 or fewer. See `updateShareAll` and `shareAll` in `js/app.js`.
3. **[P2] No back-navigation safety.** The phone back gesture leaves the site and loses the deck, and Start over has no confirmation. Fix: `history.pushState` when the deck opens and handle `popstate`, confirm Start over or keep the parsed data, and show a one-time "Tap to continue" hint on the cover.
4. **[P2] Upload page.** The privacy line is last and small (`index.html` line 38), so move it under the drop zone at full contrast. `#error` shows below the demo link, 60px from the drop zone, so move it next to the drop zone. Step 1 says eBird emails a zip, but it emails a download link. Optionally, show a small cover-card preview.
5. **[P2] Card text too small in Discord's inline view.** Tile labels (25px), clock hour labels (26px), card footers (26px) and top-birds counts (30px) render at about 7 to 9px on a phone. Set a minimum of about 30px for card text.

Minor findings:

- The grind card's "Not every outing is a big day" landed on a pelagic trip that was a highlight.
- Persona evidence can be unrelated to the persona ("Daily Devotee" backed by a big-lake share, `js/persona.js` around line 111).
- html-to-image re-fetches the Inter font 3 times during capture.
- The demo fetch has no error handling (`js/app.js` around line 395).
- Share failures use `alert()`.
- A failed map writes its error text into the card, so it would end up in the shared image.
- On the last card, keyboard focus goes Share all, then the back arrow, then Share.
- The live region reads the whole card on every page turn.
- The Year select is 27px tall.

Open questions from the critique:

- Should a mid-year deck say "so far", or stop the months chart at the current month?
- Should the upload page show a real card before asking for data?

To rerun it: Impeccable (github.com/pbakaus/impeccable) installs as a skill under `.claude/skills/impeccable/`. Its `critique` and `polish` commands are the relevant ones. In the cloud session its engine binary was blocked, so the deterministic `impeccable detect` scan has not been run yet. It should work locally.
