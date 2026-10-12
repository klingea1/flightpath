// Camera math for the map card: Web Mercator projection, fitting a view to
// bounds, and smooth zoom-and-pan flights between views.
//
// World coordinates span 0..WORLD on both axes. A camera is { x, y, s }:
// the world point at the canvas center and the scale in pixels per world unit.

export const WORLD = 4096;

const MAX_LAT = 85.05;

export function project(lat, lng) {
  const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return [
    ((lng + 180) / 360) * WORLD,
    ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * WORLD,
  ];
}

// Pixels per world unit at a web-map zoom level (256 px tiles).
export const scaleForZoom = (zoom) => (256 * 2 ** zoom) / WORLD;

// Fits [[south, west], [north, east]] into a width x height canvas, leaving
// padding [top, right, bottom, left] clear, without zooming past maxScale.
export function fitBounds(bounds, width, height, padding, maxScale) {
  const [[s, w], [n, e]] = bounds;
  const [x0, y1] = project(s, w);
  const [x1, y0] = project(n, e);
  const [pt, pr, pb, pl] = padding;
  const availW = width - pl - pr;
  const availH = height - pt - pb;
  const scale = Math.min(availW / Math.max(x1 - x0, 1e-9), availH / Math.max(y1 - y0, 1e-9), maxScale);
  // Center the bounds in the padded area, then find the canvas-center point.
  const offsetX = pl + availW / 2 - width / 2;
  const offsetY = pt + availH / 2 - height / 2;
  return { x: (x0 + x1) / 2 - offsetX / scale, y: (y0 + y1) / 2 - offsetY / scale, s: scale };
}

// van Wijk and Nuij's smooth zoom: zooms out while panning, then back in,
// so long flights stay readable. Returns t (0..1) -> camera, and a relative
// length for pacing. Same formulation as d3-interpolate's interpolateZoom.
export function flight(from, to, width) {
  const RHO = Math.SQRT2;
  const RHO2 = 2;
  const RHO4 = 4;
  const w0 = width / from.s;
  const w1 = width / to.s;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d2 = dx * dx + dy * dy;
  const at = (x, y, w) => ({ x, y, s: width / w });

  if (d2 < 1e-12) {
    const S = Math.log(w1 / w0) / RHO;
    return { length: Math.abs(S), at: (t) => at(from.x + t * dx, from.y + t * dy, w0 * Math.exp(RHO * t * S)) };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + RHO4 * d2) / (2 * w0 * RHO2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - RHO4 * d2) / (2 * w1 * RHO2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / RHO;
  return {
    length: S,
    at: (t) => {
      const s = t * S;
      const u = (w0 / (RHO2 * d1)) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0));
      return at(from.x + u * dx, from.y + u * dy, (w0 * Math.cosh(r0)) / Math.cosh(RHO * s + r0));
    },
  };
}

// Canvas pixel position of a world point under a camera.
export function toScreen(cam, wx, wy, width, height) {
  return [width / 2 + (wx - cam.x) * cam.s, height / 2 + (wy - cam.y) * cam.s];
}
