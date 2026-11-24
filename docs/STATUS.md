# Status: 2026-11-24

## Where things stand
- `main`: PRs #1–#10 merged. #10 (the egg hatch, flock, murmuration, per-card scenes and sound) is live.
- **In review: `fix/fx-minors`**: the review's deferred items plus one older contrast miss.
  - The egg switches to the painted one when WebGL is lost, so the next hatch still plays.
  - The flock comes back after the Summary sends it off.
  - Each hatch frees the last one's shard buffers, and a reset ends a running hatch.
  - The murmur fade is scoped to effects-on.
  - The gate says "Crack it open" and has a mute button.
  - The Fledgling card's footer passes 4.5:1.
  - 92 tests pass. The card check passes on the demo and the one-checklist fixture.

## Next step
- Merge `fix/fx-minors` (merging deploys, so ask first).
- Try the hatch on a real phone: frame rate, the egg's look, how the scenes feel.

## Waiting on the user
- Six CC0 MP3s for `sounds/` (see `sounds/NOTICE.md`). Until then the effects are silent.
- From `HANDOFF.md`: Muscovy Duck counting, December beta testers.

## Open items
- Design critique P2s (card alignment, shared palette) are still open. axe has no script; run it by hand.

## Left running
- Nothing.
