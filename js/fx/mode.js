// How much of the hatch, flock and scenery a visit gets.
//   off:  ?fx=off in the URL. The page behaves as if none of it existed
//         (the card check tool uses this).
//   calm: reduced motion. No hatch motion, no flock, still skies.
//   flat: no WebGL. The egg is painted in 2D; everything else is the same.
//   full: everything.
export function effectsMode({ search, reduceMotion, webgl }) {
  if (new URLSearchParams(search).get('fx') === 'off') return 'off';
  if (reduceMotion) return 'calm';
  return webgl ? 'full' : 'flat';
}

// A shared deck opens on "tap the egg", which also lets the browser play sound.
export function needsGate(mode) {
  return mode !== 'off';
}

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
