# Status: 2026-10-17

## Where things stand
- `main` has PRs #1–#7 merged: edge cases, accessibility, favicon, the new cards, Windows setup, Discord readability and the Summary rebuild, and the card check tool.
- **In review: `feat/share-link` (PR #8, deck links).** "Share deck" makes a `#deck=…` link that opens the same tap-through deck for anyone, with no server. See README "Deck links" and `docs/decisions.md`.
  - Tests: 63 pass. `tools/check-cards.mjs` is clean on the demo and a synthetic heavy year.
  - A demo link is about 1,000 characters. A 1,000-checklist year is about 1,600, under Discord's 2,000.
  - It also fixes `tools/check-cards.mjs`, which never mounted the map card before, so it now really checks the map and reports page errors.

## Next step
- Have Liz (or the owner) try a link from her real export: check its length, and how her map looks at 10 km. Then merge PR #8. Merging deploys, so ask first.

## Waiting on the user
- Merge approval for PR #8.
- From `HANDOFF.md`: whether Muscovy Duck (Domestic type) counts (ask Liz), and December beta testers.

## Open items
- Design critique P2s not yet done: card layouts don't line up from card to card, and the cards have no shared palette. The snapshot is in `.impeccable/critique/` (local only).
- axe has no script; run it by hand.
- On a shared deck, card copy still says "Your …". The top bar says "Shared with you".

## Left running
- Nothing. No dev servers, and the headless browsers were closed.
