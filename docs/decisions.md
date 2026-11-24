# Decisions

Append-only. One entry per decision someone might later question or reverse.

## 2026-10-17 · Deck links live in the URL fragment, with no server

**Decision:** "Share deck" makes a link whose `#deck=…` fragment holds the compressed deck. Opening it rebuilds the cards in the browser.
**Why:** Liz wanted friends to tap through her deck, not just see images. The fragment is never sent to a server, so this keeps the project's no-server, export-never-leaves-the-device rules.
**Rejected:**
- Short links stored online (Firebase, gists): these need a server or database and an outside service.
- A downloadable HTML file of the deck: Discord and phones don't open it inline.
- A video of the deck: doesn't let friends tap through.
**Cost if wrong:** links can't be revoked, and old links must keep opening forever, so the packed format is a long-lived contract (`VERSION` in `js/share.js`).

## 2026-10-17 · Facts travel exactly; visuals are regenerated from a seed, on a 10 km grid

**Decision:** links carry the cards' numbers, names, and dates exactly, but places only as ~10 km cells with visit counts and month bits. The visit order (the cover's flight path and the map's monthly tour) and each place's spot inside its cell are regenerated from a seed: the year and checklist count.
**Why:** sending each checklist's place in order made a heavy year's link about 3,500 characters, over Discord's 2,000-character message limit. A seed can't recreate data the friend doesn't have, but the arc order and exact pin spots are decoration nobody reads. Measured on a synthetic 1,000-checklist year: 1,580 characters at 10 km, against 1,955 at 5 km and 2,443 at 2 km.
**Rejected:**
- Exact deck with a warning when the link is too long: works in texts and email, but not in Discord for heavy years.
- A binary packing of the exact order: still about 3,450 characters.
- 5 km cells: too close to the limit.
**Cost if wrong:** the map is coarser for everyone, the cover no longer follows the literal checklist order, and the map's privacy grid went from ~2 km to ~10 km. Going back to finer places means a new `VERSION` and longer links.

## 2026-10-17 · Every deck is built from its packed form

**Decision:** the owner's own deck is rendered from `unpack(pack(...))`, the same data a link carries, not from the full stats.
**Why:** this guarantees a link shows exactly what its owner saw, and that a link holds nothing beyond what the cards show.
**Rejected:** rendering the owner's deck from the full stats and packing only for links. That's simpler, but the two decks could drift apart and leak extra fields.
**Cost if wrong:** every new card field has to go through `pack`/`unpack`, and the cards changed slightly for everyone: the cover path is seeded and pins are coarser.

## 2026-11-23 · Page effects: an egg hatch, a flock and per-card scenes, with ogl and recorded sound

**Decision:** the deck opens with a WebGL egg (a vendored subset of ogl 1.0.11) that hatches a flock of one bird per species; the flock and each card's particles are drawn on one Canvas 2D overlay; sound is recorded CC0 MP3s. Design: `docs/superpowers/specs/2026-11-23-hatch-and-atmosphere-design.md`.
**Why:** the owner wanted a card-atlas-style moment of delight, "all out". ogl handles WebGL setup so the work goes into the look, and matches card-atlas. Canvas 2D for the overlay because up to 600 birds is cheap on the CPU and one renderer then serves every mode (WebGL draws only the egg). Recorded sound because synthesized birdsong sounds cartoonish.
**Rejected:**
- Raw WebGL: 300–500 more lines of setup to maintain.
- 2D canvas only: no lighting or real 3D shell, not "all out". It stays as the no-WebGL fallback.
- Synthesized sound: fine for crack and wind, poor for birdsong.
- Filler birds so small years can spell their number: breaks "one bird per species"; small years get a ring instead.
**Cost if wrong:** about 210 KB of vendored ogl and a new module tree to maintain; effects can slow low-end phones (a frame-time watchdog sheds particles). Turning it all off is `?fx=off`, or removing the `initEffects` call in `js/app.js`.

## 2026-11-23 · Saving a card ends the murmuration first

**Decision:** the Headline's number is hidden during the murmuration by a class on its `.card-frame`, and every save calls `fx.settleForSave(frame)` first, which ends the murmuration and snaps the number to full opacity with no fade running.
**Why:** html-to-image copies each element's computed style into the image, so a class outside the card still affects the capture. Without this, a save during the murmuration (or the background render 1.8 s after the card appears) baked in a hidden or 93%-faded number.
**Rejected:** relying on the class sitting outside `.card`: it doesn't protect computed styles.
**Cost if wrong:** a shared image with a missing or faint species count.

## 2026-11-24 · A May-peak year still gets blossoms, not snow

**Decision:** the owner saw the spring particles on a May-peak Months card as "snowfall ovals". They stay spring blossoms but are redrawn as unmistakable five-petal pink blossoms. Winter peaks get real six-armed snowflakes.
**Why:** the scene follows the busiest season, and snow in May would contradict the card it sits behind.
**Rejected:** snowflakes for every Months card.
**Cost if wrong:** one line in `js/fx/scenes.js` (`SEASONS.spring`) to swap.

## 2026-11-24 · Owl eyes at evening, not only at night

**Decision:** the evening clock scene (peak 5–8 pm) and the evening persona show blinking owl eyes and play the owl, like the night scene. The eyes sit in the widest margin round the card, or below it on phones.
**Why:** the owner expected owls for an evening birder. Before this, only a peak hour from 8 pm to 4 am had them, so most people never saw them.
**Cost if wrong:** evening loses its plain golden-hour calm. Revert `GOLDEN` in `js/fx/scenes.js`.
