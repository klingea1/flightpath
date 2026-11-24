# Status: 2026-11-23

## Where things stand
- `main` has PR #9 merged (homepage eyebrow now "For the birders").
- **Branch `feat/hatch` (not yet a PR):** egg hatch, flock, murmuration, per-card skies and sound. All 9 plan tasks done and committed. 92 tests pass; `tools/check-cards.mjs` passes (it runs with `?fx=off`).
  - Spec: `docs/superpowers/specs/2026-11-23-hatch-and-atmosphere-design.md`
  - Plan: `docs/superpowers/plans/2026-11-23-hatch-and-atmosphere.md`
  - Build ledger with every ruling: `.superpowers/sdd/2026-11-23-hatch-and-atmosphere/progress.md` (git-ignored, local only)
- Final whole-branch review is done. **Fix pass not started**: the session hit its usage limit.

## Next step: fix these before opening the PR (each reproduced in headless Chrome)
1. `js/fx/index.js` `afterReveal`: the 1 s `overlay.release()` timer isn't cleared. Skip the hatch and press → within 1 s, and the murmuration scatters. Keep the handle and clear it in `onCard` and `resetForUpload`.
2. Skipping before the shell breaks: `onBurst` still fires after the reveal, measures the hidden host as (0,0), and bursts the flock from the top-left corner. Ignore `onCrack`/`onBurst` once revealed; in `afterReveal` burst from `burstAt` if no burst happened yet.
3. During the hatch the upload controls are invisible but live. Enter-to-skip on `#drop` reopens the file picker, and a second file swaps `state.rows` and the year picker. Make the screen `inert` while hatching, register the skip keydown in the capture phase with `preventDefault`, and have `load()`/`readFile()`/demo do nothing while a hatch runs. Also move the `sequence?.running` check above the `seed`/`birds` assignments.
4. Capture race (not reproduced yet): mark `frame.capturing` around `cardImage`, and have `murmuration()` skip while it's set.
5. `hatch()`: if the egg can't start at all (no canvas context), the deck never appears. Wrap the body in try/catch and `reveal()` in the catch.
6. Mute buttons: use an action label ("Turn sound off" / "Turn sound on") with no `aria-pressed`.
- Deferred minors: WebGL `webglcontextrestored`; leaked skip listeners on an instant reject; `egg.reset` mid-hatch leaves a pending promise; flock gone after returning from Summary (release in `onCard`); flat egg has no resize handling; scope `[data-murmur]` transition under `.fx-on`; shard geometry leak per hatch; gate copy says "Tap" to keyboard users and has no mute button.

## Waiting on the user
- Six CC0 MP3s for `sounds/` (see `sounds/NOTICE.md`). Until then the effects are silent.
- From `HANDOFF.md`: Muscovy Duck counting, December beta testers.

## Left running
- Nothing. Headless browsers and test servers were closed.
