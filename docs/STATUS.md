# Status: 2026-11-24

## Where things stand
- `main`: PRs #1–#9 merged (homepage eyebrow is "For the birders").
- **In review: `feat/hatch`**: the egg hatch, flock, Headline murmuration, per-card skies and sound. Spec and plan are in `docs/superpowers/`.
  - All 9 plan tasks are done; the final whole-branch review is done and its Important findings are fixed and re-verified in headless Chrome.
  - 92 tests pass. `tools/check-cards.mjs` passes on the demo (effects off). `--fx` saves full-window effect screenshots for review by eye.
  - `main` is merged in.

## Next step
- Try the PR in a real browser and on a phone (a headless check can't judge frame rate or the egg's look). Then merge, which deploys, so ask first.

## Waiting on the user
- Six CC0 MP3s for `sounds/` (see `sounds/NOTICE.md`). Until then the effects are silent.
- From `HANDOFF.md`: Muscovy Duck counting, December beta testers.

## Open items
- Pre-existing on `main`: the one-checklist fixture fails the card check. The Fledgling persona card's footer "2026" is 4.44:1, just under 4.5:1.
- Deferred minors from the review:
  - no recovery after a lost WebGL context;
  - the flock stays off-screen after going back from the Summary;
  - the flat egg doesn't handle resizes;
  - the `[data-murmur]` transition isn't scoped under `.fx-on`;
  - shard geometry leaks per hatch;
  - `egg.reset` mid-hatch leaves a pending promise;
  - the gate says "Tap" to keyboard users and has no mute button.
- Design critique P2s (card alignment, shared palette) are still open. axe has no script; run it by hand.

## Left running
- Nothing.
