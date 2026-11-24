# The hatch, the flock, and the atmosphere

Date: 2026-11-23 · Status: awaiting owner approval

## Intent

Flight Path should have a moment of delight that people talk about, the way
card-atlas has its pack rip. The owner asked for whimsy, "all out": an egg that
hatches, a flock that is *your* year, scenery that reacts to each card, and
sound (an egg crack, wind, birdsong).

The point is fun and pride, not information. Everything it shows comes from
numbers the cards already show.

## The experience

1. **The egg (upload page).** A speckled egg rests in a small nest above the
   drop zone, lit like a real object, with a slow idle sway. Hovering the drop
   zone, or dragging a file over it, makes the egg shift and wobble.
2. **Reading.** When a file is dropped, the egg wobbles harder while the
   export is read (`readFile` → `load`). Parsing is synchronous and can freeze
   the page for a second or two on big exports; the wobble is allowed to
   stall. The hatch waits until the stats are ready.
3. **The hatch (about 2.5–3.5 s).** Hairline cracks spread along a seeded
   jagged seam, with a crack sound. The top of the shell pops off, shell
   pieces tumble out of frame with simple physics, and a burst of wings
   (sound) releases **the flock: one bird per species seen that year**. The
   flock sweeps up and streams along the Cover card's flight-path arc, and
   the deck appears under it. A tap or a key press during the hatch skips to
   the deck.
4. **The flock stays.** While you tap through the deck, the flock drifts
   loosely in the page's overlay layer, mostly around the card's edges,
   reacting gently to the pointer.
5. **Murmuration (Headline card).** The birds *become* the number. When the
   Headline card enters, its big species number starts hidden. The flock
   flies in and forms the digits at the exact position, size and colour of
   that number on the card (dark birds on the cream card), holds about 1 s,
   then the real number fades in beneath them as they lift off and scatter
   back to drifting. The birds briefly sit over the card at full opacity;
   that is allowed because what they show is the number itself. This
   replaces the count-up for that one number (the other tiles keep theirs).
   **Small years (under about 40 species):** one bird per species can't
   spell a number, so instead the flock circles the number once and settles
   into a ring around it while the real number counts up as today. Still one
   bird per species; no filler birds.
6. **Atmosphere per card.** The page background and an overlay layer take on
   each card's mood, cross-fading over about 1 s as you change cards:
   - **Cover:** continues the cover's dusk sky past the card edges.
   - **Summary:** continues its sunrise sky, and the flock settles into a
     loose V and leaves the screen.
   - **Clock:** driven by the peak hour (`startHours`). Peak 4–9 AM: pale dawn
     light from below and ground mist, dawn chorus audio. 9 AM–5 PM: clear day,
     light wind. 5–8 PM: golden light. 8 PM–4 AM: night blue, stars, a pair of
     owl eyes that blink in a margin, owl hoot.
   - **Persona:** Dawn Chorus Chaser → dawn; Golden Hour Birder → golden
     light; Sit-Spot Sage → slow fireflies at dusk; Lakeshore Pilgrim → gulls
     and lake wind; others get a neutral sky.
   - **Months:** season by the busiest month: snow (Dec–Feb), blossoms or
     fresh green (Mar–May), warm haze (Jun–Aug), falling leaves (Sep–Nov).
   - **Every other card:** a calm neutral sky with the drifting flock and
     soft wind.
7. **Sound.** Recorded CC0 files, supplied by the owner (see below). It starts
   with the drop (a user gesture, so browsers allow it). A mute button sits in
   the deck bar and on the upload page, and the choice is remembered per
   device. Ambient sound (wind, chorus, owl) is quiet, loops or fades, and
   cross-fades with the scene.

Sketch of a night-owl Clock card on a phone:

```
 ·   ✦     ·   (o)(o)  ·        <- page: night blue, stars, owl eyes
 ┌──────────────────────┐
 │  9 PM was your hour  │  ✦     <- a firefly or bird may drift over the
 │     (clock dial)     │           card on screen; never in the image
 └──────────────────────┘
 ~~~ mist ~~~~~~~~~~~~~~~~~
```

## Goals

- The hatch feels physical and expensive: lighting, specular shell, real
  crack propagation, believable tumbling pieces, a flock that moves like
  starlings.
- Each run differs a little (seeded from the stats, like the cover's path),
  but the same deck hatches the same way.
- Shared deck links get the full experience too: everything it needs
  (species count, `startHours`, `monthly`, persona id) is already in the
  packed deck, so **no change to `pack`/`unpack` and no `VERSION` bump**.

## Non-goals

- No change to the card images. Effects live on the page, never inside
  `.card`, which is what `htmlToImage` captures.
- No new card content, stats, or copy.
- No effects on the map card's own animation; it keeps its tour.

## Anti-goals (failure even if it works)

- Effects that make a card harder to read on screen: anything drifting over a
  card stays sparse, small, and below about 25% opacity over text.
- Slowing down a phone so taps lag. Keep it at 60 fps on a mid-range Android
  phone; degrade (fewer birds, no mist) before dropping frames.
- Sound that surprises: never before a user gesture, never loud, always
  mutable.
- Breaking the privacy rules: nothing fetched from outside the site; the
  export still never leaves the device.
- Getting in the way of returning users: the hatch is skippable and short.

## Constraints

- Plain ES modules, no build step. Relative paths only (served from
  `/flightpath/`).
- **ogl**, pinned and vendored in `vendor/` with its license, like
  html-to-image and topojson-client. Approved by the owner 2026-11-23.
- A 2D-canvas fallback when WebGL isn't available or fails to start: a flat
  painted egg that cracks and splits, and a 2D flock.
- **Reduced motion:** no hatch animation, no flock movement. The egg cracks
  open in one simple cross-fade and the deck appears; atmospheres are a
  static gradient with no particles. Sound still follows the mute setting.
- Contrast: `tools/check-cards.mjs` screenshots the on-screen card, so
  overlay particles would land in its pixels. The tool turns effects off
  (emulated reduced motion plus a `?fx=off` URL flag that skips the hatch,
  flock and overlay), so card contrast results stay stable. The overlay's own
  readability is checked by hand: screenshots of the Clock night scene, the
  Months winter scene and the Headline murmuration, reviewed for text legibility.
- Tests: `npm test` covers the pure parts (seeded seam, scene choice per card
  from stats, flock size, mute storage, digit shapes).

## Approaches considered

- **Graphics.** (A) vendored ogl, (B) raw WebGL, (C) 2D canvas only. **Picked
  A**: it handles WebGL setup so the work goes into the visuals, it matches
  card-atlas, and it costs one ~30 KB pinned file. B means 300–500 lines of
  setup code to maintain. C can't do lighting or a big flock, so it isn't
  "all out"; it survives only as the fallback.
- **Sound.** Recorded CC0 files vs synthesized in the browser. **Picked
  recorded**: synthesized birdsong sounds cartoonish. Synthesis was fine for
  the crack and wind, but one approach is simpler.
- **Where the murmuration lives.** On the upload page vs on the Headline
  card. **Owner picked the Headline card**, with the egg's flock as the same
  birds.

## Sound files (owner supplies, CC0)

Put in `sounds/` with sources listed in `sounds/NOTICE.md`. A missing file
just stays silent (as in card-atlas `src/lib/ripped/sound.js`).

| File | Use | Length |
|---|---|---|
| `crack` | shell cracking | under 1 s |
| `flutter` | burst of wings at the hatch | 1–2 s |
| `wind` | default ambience, loops | 10–30 s loop |
| `chorus` | dawn scenes, loops | 10–30 s loop |
| `owl` | night scene, played once or twice | 2–4 s |
| `gulls` | Lakeshore Pilgrim | 5–15 s |

Ogg or MP3 (both decode in Chrome, Safari needs MP3 or AAC: **use MP3**),
kept small (aim under 1.5 MB total).

## Decided by the owner

- Egg hatch at the upload-to-deck moment; ogl; recorded sounds; murmuration
  on the Headline card; atmospheric scenes driven by the cards; sound
  including crack, wind and birdsong; "go all out".
- Murmuration: the birds become the number over the card's own figure;
  small years (under ~40 species) get a ring around the number instead.

## Calls I made (correct any)

- **Flock size is exact species count,** capped at 600 for performance.
- **Shared-link recipients** see the egg on a small "A Flight Path, shared
  with you. Tap the egg" screen. The tap hatches it and also unlocks sound.
- **Year picker** changes rebuild the deck without another hatch; the flock
  resizes in place.
- **Start over** returns to a whole new egg.
- **Sound starts muted?** No: on, at a gentle volume, because the drop is an
  explicit action. Mute is one tap and remembered.
- The overlay sits above the stage with `pointer-events: none`, so taps still
  reach the card and the buttons.

## Left to the builder

- Module layout (suggested: `js/hatch/` with scene, fallback, flock, seam,
  and `js/atmosphere.js`, `js/sound.js`), shader details, exact timings,
  palettes per scene within the existing card colors.
- How the flock is simulated (GPU vs CPU boids), as long as it holds 60 fps.
- How the digit shape is sampled for the murmuration.
- Which version of ogl to pin.
- The README section describing all this, and a `decisions.md` entry.
