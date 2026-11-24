// One hatch: runs the animation and reveals the deck exactly once, whether the
// animation finishes, fails (say the WebGL context is lost) or is skipped.
export function createSequence({ run, reveal }) {
  let promise = null;
  let revealed = false;
  const once = () => {
    if (revealed) return;
    revealed = true;
    reveal();
  };
  const seq = {
    running: false,
    start() {
      if (promise) return promise;
      seq.running = true;
      promise = (async () => {
        try { await run(); } catch (e) { console.warn('Hatch skipped:', e); }
        seq.running = false;
        once();
      })();
      return promise;
    },
    skip() { once(); },
  };
  return seq;
}
