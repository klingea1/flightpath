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
