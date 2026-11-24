// The egg in WebGL (ogl): a lit, speckled shell. The chick pecks three star
// cracks that flake open, then a crack runs round a seeded seam, the cap
// comes off and shards fly (timeline in hatch.js). Same API as egg-flat.js. Throws on
// creation if the shaders don't link; hatch() rejects if the context is lost.
import { Renderer } from '../../vendor/ogl-1.0.11/core/Renderer.js';
import { Camera } from '../../vendor/ogl-1.0.11/core/Camera.js';
import { Transform } from '../../vendor/ogl-1.0.11/core/Transform.js';
import { Program } from '../../vendor/ogl-1.0.11/core/Program.js';
import { Mesh } from '../../vendor/ogl-1.0.11/core/Mesh.js';
import { Geometry } from '../../vendor/ogl-1.0.11/core/Geometry.js';
import { Sphere } from '../../vendor/ogl-1.0.11/extras/Sphere.js';
import { crackSeam, rng } from './seed.js';
import { hatchPhase, hatchEvents, pipPoints, SEAM } from './hatch.js';

const WOBBLE = [
  { amp: 2, period: 4000, hop: 0 },
  { amp: 6, period: 800, hop: 0 },
  { amp: 10, period: 420, hop: 0.06 },
];
const ZOOM_DPR = 2.2; // the page zooms in on the egg: render sharper while it does
const DEG = Math.PI / 180;

const vertex = /* glsl */ `
attribute vec3 position;
attribute float seamY;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
varying float vSeam;
void main() {
  // Unit sphere into an egg: narrower towards the top.
  vec3 p = position;
  float k = 0.78 * (1.0 - 0.12 * p.y);
  vec3 e = vec3(p.x * k, p.y, p.z * k);
  vObj = position;
  vSeam = seamY;
  vNormal = normalize(normalMatrix * normalize(vec3(e.x / (k * k), e.y, e.z / (k * k))));
  vec4 mv = modelViewMatrix * vec4(e, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const fragment = /* glsl */ `
precision highp float;
uniform float uCrack;   // 0..1, how far the seam crack has spread round the egg
uniform vec3 uPipA;     // the three pecks: angle (0 faces the camera)
uniform vec3 uPipY;     // … height as a fraction of the egg
uniform vec3 uPip;      // … how far each star crack has spread, 0..1
uniform vec3 uHole;     // … how far each flake has chipped away, 0..1
uniform float uPart;    // 0 whole, 1 cap (above the seam), -1 bottom
uniform float uSeed;
uniform float uAlpha;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
varying float vSeam;

float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719)) + uSeed) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// One peck: a small star of jagged cracks, and later a dark hole where a
// flake chipped off, with a pale broken rim.
vec3 peck(vec3 col, float a, float y, float grow, float hole, float i) {
  if (grow <= 0.0) return col;
  float py = y * 2.0 - 1.0, pr = sqrt(max(0.0, 1.0 - py * py));
  vec3 P = vec3(sin(a) * pr, py, cos(a) * pr);
  vec3 d = vObj - P;
  float dist = length(d);
  if (dist > 0.4) return col;
  vec3 T = vec3(cos(a), 0.0, -sin(a));
  float th = atan(d.y, dot(d, T));
  float s = th / 6.2832 * 6.0 + i * 0.37 + (noise(vObj * 38.0 + i) - 0.5) * 0.5;
  float rid = floor(s + 0.5);
  float f = abs(fract(s + 0.5) - 0.5) * 1.047 * dist;
  float len = (0.14 + 0.22 * hash(vec3(rid, i, 3.0))) * grow;
  float ray = (1.0 - smoothstep(0.0, 0.006 + 0.01 * (1.0 - dist / 0.4), f)) * (1.0 - smoothstep(len * 0.6, len, dist));
  col = mix(col, vec3(0.16, 0.09, 0.04), ray);
  float hr = 0.085 * hole * (0.7 + 0.6 * noise(vec3(th * 1.6, i, 7.0)));
  if (hole > 0.0 && dist < hr + 0.016) col = vec3(0.98, 0.94, 0.86);
  if (hole > 0.0 && dist < hr) col = vec3(0.07, 0.045, 0.03) + vec3(0.05, 0.03, 0.01) * (dist / hr);
  return col;
}

void main() {
  float h = (vObj.y + 1.0) * 0.5;               // height fraction, 0 bottom .. 1 top
  float side = h - vSeam;
  if (uPart > 0.5 && side < 0.0) discard;
  if (uPart < -0.5 && side > 0.0) discard;

  vec3 base = vec3(0.95, 0.90, 0.80);
  // Speckles: big soft blotches and fine dots, more towards the wide end.
  float big = smoothstep(0.72, 0.78, noise(vObj * 5.0));
  float fine = smoothstep(0.83, 0.86, noise(vObj * 17.0));
  float spots = max(big * 0.55, fine * 0.8) * (0.6 + 0.4 * (1.0 - h));
  base = mix(base, vec3(0.42, 0.27, 0.16), spots);

  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  if (!gl_FrontFacing) {
    // The inside of the shell, seen once the cap is off.
    gl_FragColor = vec4(vec3(0.86, 0.80, 0.70) * (0.55 + 0.25 * h), uAlpha);
    return;
  }
  vec3 l = normalize(vec3(-0.5, 0.8, 0.9));
  float diff = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 40.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 col = base * (0.32 + 0.78 * diff) + vec3(1.0, 0.96, 0.9) * spec * 0.35 + vec3(1.0, 0.75, 0.5) * rim * 0.18;

  // The crack: spreads both ways from the front (angle 0 faces the camera).
  float a = atan(vObj.x, vObj.z);                // -pi..pi, 0 at the front
  float reach = uCrack * 3.1416;
  float on = step(abs(a), reach);
  float zig = (fract(a * 9.0) - 0.5) * 0.012;
  float line = 1.0 - smoothstep(0.0, 0.006 + 0.004 * uCrack, abs(side + zig));
  col = mix(col, vec3(0.22, 0.13, 0.07), line * on * (uPart == 0.0 ? 1.0 : 0.6));
  col = peck(col, uPipA.x, uPipY.x, uPip.x, uHole.x, 0.0);
  col = peck(col, uPipA.y, uPipY.y, uPip.y, uHole.y, 1.0);
  col = peck(col, uPipA.z, uPipY.z, uPip.z, uHole.z, 2.0);
  gl_FragColor = vec4(col, uAlpha);
}`;

const shardFragment = /* glsl */ `
precision highp float;
uniform float uAlpha;
varying vec3 vNormal;
void main() {
  float d = 0.45 + 0.55 * abs(normalize(vNormal).z);
  gl_FragColor = vec4(vec3(0.93, 0.87, 0.76) * d, uAlpha);
}`;
const shardVertex = /* glsl */ `
attribute vec3 position;
attribute vec3 normal;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
varying vec3 vNormal;
void main() {
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

function seamAttribute(geometry, seam) {
  const pos = geometry.attributes.position.data;
  const out = new Float32Array(pos.length / 3);
  for (let i = 0; i < out.length; i++) {
    const a = (Math.atan2(pos[3 * i], pos[3 * i + 2]) + 2 * Math.PI) % (2 * Math.PI); // 0 at the front
    const f = (a / (2 * Math.PI)) * (seam.length - 1);
    const j = Math.floor(f), t = f - j;
    out[i] = seam[j].y + (seam[Math.min(seam.length - 1, j + 1)].y - seam[j].y) * t;
  }
  return out;
}

export function createEgg(canvas, { seed, onLost: lostCallback }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const renderer = new Renderer({ canvas, dpr, alpha: true, antialias: true, premultipliedAlpha: false });
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);
  const camera = new Camera(gl, { fov: 28 });
  camera.position.set(0, 0, 6.2);
  const scene = new Transform();

  const uniforms = {
    uCrack: { value: 0 }, uSeed: { value: (seed % 1000) / 10 }, uAlpha: { value: 1 },
    uPipA: { value: [0, 0, 0] }, uPipY: { value: [0, 0, 0] }, uPip: { value: [0, 0, 0] }, uHole: { value: [0, 0, 0] },
  };
  const makeProgram = (part) => {
    const p = new Program(gl, { vertex, fragment, cullFace: null, transparent: true, uniforms: { ...uniforms, uPart: { value: part }, uAlpha: { value: 1 } } });
    if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) throw new Error('Egg shader failed to link');
    p.uniforms.uCrack = uniforms.uCrack;
    p.uniforms.uSeed = uniforms.uSeed;
    for (const k of ['uPipA', 'uPipY', 'uPip', 'uHole']) p.uniforms[k] = uniforms[k];
    return p;
  };
  const sphere = new Sphere(gl, { radius: 1, widthSegments: 96, heightSegments: 64 });
  let seam = crackSeam(seed);
  sphere.addAttribute('seamY', { size: 1, data: seamAttribute(sphere, seam) });
  function placePips() {
    const p = pipPoints(seed, seam);
    uniforms.uPipA.value = p.map((q) => q.a);
    uniforms.uPipY.value = p.map((q) => q.y);
    return p;
  }
  let pips = placePips();

  const pivot = new Transform();             // wobble rocks the egg on its base
  pivot.position.y = -1.0;
  pivot.setParent(scene);
  const egg = new Transform();
  egg.position.y = 1.0;
  egg.setParent(pivot);
  const bottom = new Mesh(gl, { geometry: sphere, program: makeProgram(-1) });
  const cap = new Mesh(gl, { geometry: sphere, program: makeProgram(1) });
  bottom.setParent(egg);
  cap.setParent(egg);

  const shardProgram = new Program(gl, { vertex: shardVertex, fragment: shardFragment, cullFace: null, transparent: true, uniforms: { uAlpha: { value: 1 } } });
  let shards = [];  // the burst's pieces, in the scene
  let flakes = [];  // chips off the pecks, in the egg's own frame
  let jolt = 0;     // each peck knocks the egg

  let level = 0, raf = 0, hatch = null, lost = false;
  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    if (hatch) { const r = hatch.reject; hatch = null; r(new Error('WebGL context lost')); }
    lostCallback?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  // The canvas overflows its host (the nest box) so pieces can fly. The egg is
  // sized to the host: the host's height spans 3.1 world units, whatever the
  // canvas size, and the scene shifts so the egg sits in the host.
  function resize() {
    canvas.style.width = ''; canvas.style.height = ''; // measure the CSS size, not ogl's inline one
    const host = (canvas.parentElement ?? canvas).getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const cw = box.width || 1, ch = box.height || 1;
    renderer.setSize(cw, ch);
    canvas.style.width = ''; canvas.style.height = '';
    const perPx = 3.1 / (host.height || 1);
    camera.perspective({ aspect: cw / ch, fov: (2 * Math.atan((ch * perPx) / 2 / 6.2) * 180) / Math.PI });
    scene.position.x = (host.left + host.width / 2 - (box.left + cw / 2)) * perPx;
    scene.position.y = -(host.top + host.height / 2 - (box.top + ch / 2)) * perPx - 0.3;
  }

  // A triangle of shell. Each piece fades on its own (mesh.alpha), sharing one program.
  function shardMesh(r) {
    const geometry = new Geometry(gl, {
      position: { size: 3, data: new Float32Array([-r, -r * 0.6, 0, r, 0, 0, -r * 0.4, r * 0.8, 0]) },
      normal: { size: 3, data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) },
    });
    const mesh = new Mesh(gl, { geometry, program: shardProgram });
    mesh.alpha = 1;
    mesh.onBeforeRender(() => { shardProgram.uniforms.uAlpha.value = mesh.alpha; });
    return mesh;
  }

  // A peck's flake chips off: three small pieces pop out of the hole and drop.
  function chip(i) {
    const random = rng(seed ^ (0xf1a + i));
    const p = pips[i];
    const py = p.y * 2 - 1, pr = Math.sqrt(1 - py * py), k = 0.78 * (1 - 0.12 * py);
    const at = [Math.sin(p.a) * pr * k, py, Math.cos(p.a) * pr * k];
    for (let j = 0; j < 3; j++) {
      const mesh = shardMesh(0.035 + random() * 0.035);
      mesh.setParent(egg);
      const out = 0.9 + random() * 0.8;
      flakes.push({
        mesh, born: performance.now(),
        at: at.map((c, n) => c * 1.02 + (n === 1 ? 0 : (random() - 0.5) * 0.03)),
        v: [at[0] * out + (random() - 0.5) * 0.6, 0.6 + random() * 0.9, at[2] * out + 0.4],
        spin: [(random() - 0.5) * 18, (random() - 0.5) * 18, (random() - 0.5) * 18],
      });
    }
  }

  function moveFlakes(now) {
    for (const f of flakes) {
      const k = (now - f.born) / 1000;
      f.mesh.position.set(f.at[0] + f.v[0] * k, f.at[1] + f.v[1] * k - 4.9 * k * k, f.at[2] + f.v[2] * k);
      f.mesh.rotation.set(f.spin[0] * k, f.spin[1] * k, f.spin[2] * k);
      f.mesh.alpha = Math.max(0, 1 - k / 0.7);
    }
  }

  function makeShards() {
    const random = rng(seed ^ 0x51ab);
    dropShards();
    shards = Array.from({ length: 12 }, () => {
      const r = 0.08 + random() * 0.12;
      const mesh = shardMesh(r);
      const a = random() * Math.PI * 2;
      const at = [Math.sin(a) * 0.7, 0.45 + random() * 0.3, Math.cos(a) * 0.7];
      return { mesh, at, v: [at[0] * 3.2, 2.2 + random() * 2.2, at[2] * 2 + 1.2], spin: [(random() - 0.5) * 14, (random() - 0.5) * 14, (random() - 0.5) * 14] };
    });
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (lost) return;
    const wb = WOBBLE[level];
    const t = hatch ? now - hatch.start : -1;
    const calm = t >= 0 ? 0.3 : 1;
    jolt *= 0.9;
    pivot.rotation.z = calm * wb.amp * DEG * Math.sin((now / wb.period) * 2 * Math.PI) + jolt * 5 * DEG * Math.sin(now * 0.07);
    pivot.position.y = -1.0 + (t >= 0 ? jolt * 0.04 : wb.hop * Math.abs(Math.sin((now / wb.period) * 2 * Math.PI)));
    moveFlakes(now);
    if (t >= 0) {
      for (const e of hatchEvents(hatch.prev, t)) {
        if (e.type === 'pip') { jolt = 1; hatch.onCrack?.(e); }
        if (e.type === 'flake') chip(e.i);
        if (e.type === 'seam') { jolt = 0.7; hatch.onCrack?.(e); }
        if (e.type === 'burst') {
          hatch.burst = true;
          makeShards();
          shards.forEach((s) => s.mesh.setParent(scene));
          const host = (canvas.parentElement ?? canvas).getBoundingClientRect();
          hatch.onBurst?.({ x: host.left + host.width / 2, y: host.top + host.height * 0.35 });
        }
      }
      hatch.prev = t;
      const ph = hatchPhase(t);
      uniforms.uPip.value = ph.pips;
      uniforms.uHole.value = ph.holes;
      uniforms.uCrack.value = ph.seam;
      if (hatch.burst) {
        const k = (t - SEAM[1]) / 1000;
        const open = ph.open;
        cap.position.set(open * 0.9, open * 2.4, open * 0.6);
        cap.rotation.set(open * 0.8, 0, -open * 1.4);
        bottom.position.y = -open * 0.4;
        const fade = 1 - Math.max(0, (open - 0.4) / 0.6);
        cap.program.uniforms.uAlpha.value = fade;
        bottom.program.uniforms.uAlpha.value = fade;
        for (const s of shards) {
          s.mesh.position.set(s.at[0] + s.v[0] * k, s.at[1] + s.v[1] * k - 4.9 * k * k, s.at[2] + s.v[2] * k);
          s.mesh.rotation.set(s.spin[0] * k, s.spin[1] * k, s.spin[2] * k);
          s.mesh.alpha = fade;
        }
      }
      if (ph.done) {
        const done = hatch.resolve;
        hatch = null;
        cancelAnimationFrame(raf); raf = 0;
        gl.clear(gl.COLOR_BUFFER_BIT);
        done();
        return;
      }
    }
    renderer.render({ scene, camera });
  }

  // Each hatch makes new shards; free the old ones' GPU buffers.
  function dropShards() {
    for (const s of [...shards, ...flakes]) { s.mesh.setParent(null); s.mesh.geometry.remove(); }
    shards = [];
    flakes = [];
  }

  function restore() {
    uniforms.uCrack.value = 0;
    uniforms.uPip.value = [0, 0, 0];
    uniforms.uHole.value = [0, 0, 0];
    jolt = 0;
    renderer.dpr = dpr;
    for (const m of [cap, bottom]) { m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.program.uniforms.uAlpha.value = 1; }
    dropShards();
  }

  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    wobble(l) { level = Math.max(0, Math.min(2, l)); },
    hatch({ onCrack, onBurst } = {}) {
      if (lost) return Promise.reject(new Error('WebGL context lost'));
      return new Promise((resolve, reject) => {
        hatch = { start: performance.now(), prev: -1, resolve, reject, onCrack, onBurst, burst: false };
        renderer.dpr = Math.min(3, dpr * ZOOM_DPR);
        resize();
        if (!raf) raf = requestAnimationFrame(frame);
      });
    },
    reset(s = seed) {
      seed = s;
      seam = crackSeam(seed);
      sphere.attributes.seamY.data = seamAttribute(sphere, seam);
      sphere.attributes.seamY.needsUpdate = true;
      pips = placePips();
      uniforms.uSeed.value = (seed % 1000) / 10;
      // A hatch still running (the deck was already revealed by a skip) ends here.
      hatch?.resolve();
      hatch = null;
      level = 0;
      restore();
      resize();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },
    dispose() {
      cancelAnimationFrame(raf); raf = 0;
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
