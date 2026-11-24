// The egg in WebGL (ogl): a lit, speckled shell that cracks along a seeded
// seam, loses its cap and throws shards. Same API as egg-flat.js. Throws on
// creation if the shaders don't link; hatch() rejects if the context is lost.
import { Renderer } from '../../vendor/ogl-1.0.11/core/Renderer.js';
import { Camera } from '../../vendor/ogl-1.0.11/core/Camera.js';
import { Transform } from '../../vendor/ogl-1.0.11/core/Transform.js';
import { Program } from '../../vendor/ogl-1.0.11/core/Program.js';
import { Mesh } from '../../vendor/ogl-1.0.11/core/Mesh.js';
import { Geometry } from '../../vendor/ogl-1.0.11/core/Geometry.js';
import { Sphere } from '../../vendor/ogl-1.0.11/extras/Sphere.js';
import { crackSeam, rng } from './seed.js';

const WOBBLE = [
  { amp: 2, period: 4000, hop: 0 },
  { amp: 6, period: 800, hop: 0 },
  { amp: 10, period: 420, hop: 0.06 },
];
const CRACK_MS = 900, OPEN_MS = 800;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
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
uniform float uCrack;   // 0..1, how far the crack has spread round the egg
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

  const uniforms = { uCrack: { value: 0 }, uSeed: { value: (seed % 1000) / 10 }, uAlpha: { value: 1 } };
  const makeProgram = (part) => {
    const p = new Program(gl, { vertex, fragment, cullFace: null, transparent: true, uniforms: { ...uniforms, uPart: { value: part }, uAlpha: { value: 1 } } });
    if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) throw new Error('Egg shader failed to link');
    p.uniforms.uCrack = uniforms.uCrack;
    p.uniforms.uSeed = uniforms.uSeed;
    return p;
  };
  const sphere = new Sphere(gl, { radius: 1, widthSegments: 96, heightSegments: 64 });
  let seam = crackSeam(seed);
  sphere.addAttribute('seamY', { size: 1, data: seamAttribute(sphere, seam) });

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
  let shards = [];

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

  function makeShards() {
    const random = rng(seed ^ 0x51ab);
    dropShards();
    shards = Array.from({ length: 12 }, () => {
      const r = 0.08 + random() * 0.12;
      const geometry = new Geometry(gl, {
        position: { size: 3, data: new Float32Array([-r, -r * 0.6, 0, r, 0, 0, -r * 0.4, r * 0.8, 0]) },
        normal: { size: 3, data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) },
      });
      const mesh = new Mesh(gl, { geometry, program: shardProgram });
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
    pivot.rotation.z = calm * wb.amp * DEG * Math.sin((now / wb.period) * 2 * Math.PI);
    pivot.position.y = -1.0 + (t >= 0 ? 0 : wb.hop * Math.abs(Math.sin((now / wb.period) * 2 * Math.PI)));
    if (t >= 0) {
      uniforms.uCrack.value = easeOut(Math.min(1, t / CRACK_MS));
      if (t >= CRACK_MS) {
        const k = (t - CRACK_MS) / 1000;
        const open = easeOut(Math.min(1, (t - CRACK_MS) / OPEN_MS));
        if (!hatch.burst) {
          hatch.burst = true;
          makeShards();
          shards.forEach((s) => s.mesh.setParent(scene));
          const host = (canvas.parentElement ?? canvas).getBoundingClientRect();
          hatch.onBurst?.({ x: host.left + host.width / 2, y: host.top + host.height * 0.35 });
        }
        cap.position.set(open * 0.9, open * 2.4, open * 0.6);
        cap.rotation.set(open * 0.8, 0, -open * 1.4);
        bottom.position.y = -open * 0.4;
        const fade = 1 - Math.max(0, (t - CRACK_MS - OPEN_MS * 0.4) / (OPEN_MS * 0.6));
        cap.program.uniforms.uAlpha.value = fade;
        bottom.program.uniforms.uAlpha.value = fade;
        shardProgram.uniforms.uAlpha.value = fade;
        for (const s of shards) {
          s.mesh.position.set(s.at[0] + s.v[0] * k, s.at[1] + s.v[1] * k - 4.9 * k * k, s.at[2] + s.v[2] * k);
          s.mesh.rotation.set(s.spin[0] * k, s.spin[1] * k, s.spin[2] * k);
        }
      }
      if (t >= CRACK_MS + OPEN_MS) {
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
    for (const s of shards) { s.mesh.setParent(null); s.mesh.geometry.remove(); }
    shards = [];
  }

  function restore() {
    uniforms.uCrack.value = 0;
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
        hatch = { start: performance.now(), resolve, reject, onBurst, burst: false };
        onCrack?.();
        if (!raf) raf = requestAnimationFrame(frame);
      });
    },
    reset(s = seed) {
      seed = s;
      seam = crackSeam(seed);
      sphere.attributes.seamY.data = seamAttribute(sphere, seam);
      sphere.attributes.seamY.needsUpdate = true;
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
