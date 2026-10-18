// Screenshots every card and checks text contrast, for use after visual
// changes. Serves the site, loads an export into headless Chrome (or Edge)
// over the DevTools protocol, and for each card: waits out the entrance,
// saves a half-size JPEG of the finished frame, then hides the text,
// captures again, and compares each text element's color with the pixels
// actually behind it. Elements under 4.5:1 are listed in contrast.json and
// make the run exit with code 1. No dependencies beyond Node and a browser.
//
//   node tools/check-cards.mjs <outDir> [export.csv]   (default: samples/demo.csv)
//
// Set CHROME to the browser's path if it isn't found.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [out, csvArg] = process.argv.slice(2);
if (!out) {
  console.error('usage: node tools/check-cards.mjs <outDir> [export.csv]');
  process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const csvPath = csvArg || join(root, 'samples', 'demo.csv');
const MIN_RATIO = 4.5;
const ENTRANCE_MS = 2200;
const MAP_PLAYBACK_MS = 14000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const candidates = [
    process.env.CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('No Chrome or Edge found. Set CHROME to its path.');
  return found;
}

async function waitFor(fn, what, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

// The site, on a port of its own.
const port = 8790 + Math.floor(Math.random() * 100);
const server = spawn(process.execPath, [join(root, 'tools', 'serve.mjs'), String(port)], { stdio: 'ignore' });
const url = `http://localhost:${port}/`;
await waitFor(() => fetch(url).then((r) => r.ok), 'the dev server');

// A fresh profile per run. Port 0 lets the browser pick a free debugging
// port, which it writes to DevToolsActivePort.
const profile = mkdtempSync(join(tmpdir(), 'flightpath-check-'));
const browser = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });
const devPort = await waitFor(() => readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0], 'the browser');
const targets = await waitFor(() => fetch(`http://127.0.0.1:${devPort}/json`).then((r) => r.json()), 'browser targets');

const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let nextId = 0;
const pending = new Map();
// Page errors fail the run too, since a card can look fine while one part
// of it (the map, say) silently didn't draw.
const pageErrors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push(m.params.args.map((a) => a.description || a.value).join(' '));
  if (pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
// Runs a function in the page with JSON-able arguments and returns its result.
async function run(fn, ...args) {
  const r = await send('Runtime.evaluate', {
    expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

let failed = false;
try {
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1700, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  // Module scripts have run by the load event, so the upload handler is attached.
  await waitFor(() => run(() => document.readyState === 'complete' && Boolean(document.querySelector('input[type=file]'))), 'the upload page');

  // Load the export through the file input, as a person would.
  await run(async (text) => {
    const input = document.querySelector('input[type=file]');
    const files = new DataTransfer();
    files.items.add(new File([text], 'MyEBirdData.csv', { type: 'text/csv' }));
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, readFileSync(csvPath, 'utf8'));
  const count = await waitFor(() => run(() => document.querySelectorAll('.card').length), 'the deck');

  mkdirSync(out, { recursive: true });
  const report = [];
  for (let i = 0; i < count; i++) {
    // Show card i unscaled at the top left, let it play, then freeze it.
    const box = await run(async (i, entrance, mapPlayback) => {
      // Page with the arrow key, as a person would, so the app shows the card
      // itself (the map only loads and plays when its card is shown).
      if (i > 0) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      const frame = document.querySelectorAll('.card-frame')[i];
      Object.assign(frame.style, { position: 'fixed', top: '0', left: '0', transform: 'none', zIndex: 99999 });
      const card = frame.querySelector('.card');
      await new Promise((r) => setTimeout(r, card.classList.contains('card-map') ? mapPlayback : entrance));
      card.classList.remove('play');
      card.classList.add('still');
      await new Promise((r) => setTimeout(r, 200));
      const r = card.getBoundingClientRect();
      return { name: card.className.split(' ')[1], x: r.x, y: r.y, width: r.width, height: r.height };
    }, i, ENTRANCE_MS, MAP_PLAYBACK_MS);
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 };

    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80, clip: { ...clip, scale: 0.5 } });
    writeFileSync(join(out, `${String(i + 1).padStart(2, '0')}-${box.name}.jpg`), Buffer.from(shot.data, 'base64'));

    await run(() => {
      const style = document.createElement('style');
      style.id = 'check-hide-text';
      style.textContent = '.card, .card * { color: transparent !important; text-shadow: none !important; } .card svg text { fill: transparent !important; }';
      document.head.append(style);
    });
    await sleep(150);
    const behind = await send('Page.captureScreenshot', { format: 'png', clip });

    const low = await run(async (i, png, minRatio) => {
      document.getElementById('check-hide-text').remove();
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const lum = (rgb) => rgb.reduce((sum, v, k) => {
        const c = v / 255;
        return sum + (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][k];
      }, 0);
      const ratio = (a, b) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };

      const card = document.querySelectorAll('.card-frame')[i].querySelector('.card');
      const cardBox = card.getBoundingClientRect();
      const found = [];
      for (const el of card.querySelectorAll('*')) {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const cs = getComputedStyle(el);
        const [r, g, b, a = 1] = (el instanceof SVGElement ? cs.fill : cs.color).match(/[\d.]+/g).map(Number);
        let alpha = a;
        for (let p = el; p && p !== card.parentElement; p = p.parentElement) alpha *= Number(getComputedStyle(p).opacity);

        // Sample an 8x5 grid across the text's own box (not the element's,
        // which for a block spans the card); the worst point counts.
        const range = document.createRange();
        range.selectNodeContents(el);
        const box = el instanceof SVGElement ? el.getBoundingClientRect() : range.getBoundingClientRect();
        let worst = Infinity;
        for (let k = 0; k < 40; k++) {
          const x = Math.round(box.x - cardBox.x + ((k % 8) + 0.5) * (box.width / 8));
          const y = Math.round(box.y - cardBox.y + (Math.floor(k / 8) + 0.5) * (box.height / 5));
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
          const [br, bg, bb] = ctx.getImageData(x, y, 1, 1).data;
          const fg = [r * alpha + br * (1 - alpha), g * alpha + bg * (1 - alpha), b * alpha + bb * (1 - alpha)];
          worst = Math.min(worst, ratio(fg, [br, bg, bb]));
        }
        if (worst < minRatio) {
          const cls = (typeof el.className === 'string' ? el.className : el.className.baseVal) || el.tagName.toLowerCase();
          found.push({ element: cls, text: el.textContent.trim().slice(0, 40), ratio: Number(worst.toFixed(2)) });
        }
      }
      return found;
    }, i, behind.data, MIN_RATIO);

    await run((i) => document.querySelectorAll('.card-frame')[i].removeAttribute('style'), i);
    report.push({ card: box.name, low });
    console.log(`${box.name.padEnd(16)} ${low.length ? low.map((l) => `${l.element} "${l.text}" ${l.ratio}:1`).join('; ') : 'ok'}`);
    if (low.length) failed = true;
  }
  writeFileSync(join(out, 'contrast.json'), JSON.stringify(report, null, 2));
  if (pageErrors.length) {
    failed = true;
    console.log(`\nPage errors:\n${[...new Set(pageErrors)].join('\n')}`);
  }
  console.log(`\nScreenshots and contrast.json are in ${out}`);
} finally {
  ws.close();
  browser.kill();
  server.kill();
  // The browser may hold its profile briefly after exiting.
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.exit(failed ? 1 : 0);
