// The page's sky behind the deck: two stacked layers that cross-fade, so any
// gradient can follow any other (CSS can't animate between gradients).
export function createSky(el) {
  const [a, b] = el.children;
  let front = a;
  let current = null;
  return {
    set(sky) {
      if (sky === current) return;
      current = sky;
      const back = front === a ? b : a;
      back.className = `sky-${sky}`;
      back.style.opacity = '1';
      front.style.opacity = '0';
      front = back;
    },
    get current() { return current; },
  };
}
