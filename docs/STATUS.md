# Status: 2026-11-24

## Where things stand
- `main`: PRs #1–#14 merged and deployed: the hatch, flock, scenes, sounds, and the Summary thud (PR #13).
- `feat/connect-the-dots` (PR open, waiting for the owner's OK to merge):
  - reverts the thud;
  - the Summary connects the dots: map pins fly onto its dots, then a bird flies the path as it draws;
  - the top-birds quip names no place;
  - the dawn chorus plays only at dawn.
  - Tests 106/106. Regression scripts pass. r1 is timing-flaky on a loaded machine (3 of 4 passes, also flaky without these changes).

## Next step
- The owner reviews the PR, merges it, then flips through on the phone again.

## Waiting on the user
- From `HANDOFF.md`: Muscovy Duck counting, December beta testers.

## Open items
- Design critique P2s (card alignment, shared palette) are still open. axe has no script; run it by hand.

## Left running
- Nothing.
