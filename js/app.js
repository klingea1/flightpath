import { parseEbirdExport } from './parse.js';
import { reportYear, defaultYear } from './years.js';
import { isZip, csvFromZip } from './unzip.js';
import { availableYears, computeYear } from './stats.js';
import { pickPersona, PERSONAS } from './persona.js';
import { buildCards, formatDuration, CARD_W, CARD_H } from './slides.js';
import { buildPlaces } from './places.js';
import { mountMap } from './mapcard.js';

const $ = (id) => document.getElementById(id);
const state = { rows: null, year: null, index: 0, cards: [] };

$('year-label').textContent = reportYear();

function showError(msg) {
  $('error').textContent = msg;
  $('error').hidden = !msg;
}

function load(text) {
  try {
    state.rows = parseEbirdExport(text);
  } catch (e) {
    showError(e.message);
    return;
  }
  showError('');
  const years = availableYears(state.rows);
  $('year').innerHTML = years.map((y) => `<option>${y}</option>`).join('');
  $('year-picker').hidden = years.length < 2;
  state.year = defaultYear(years);
  $('year').value = state.year;
  // Show the deck first so fit() can measure the stage.
  $('upload').hidden = true;
  $('deck').hidden = false;
  render();
}

// ?persona=<id> previews a specific persona card, for design work.
function personaFor(stats) {
  const picked = pickPersona(stats);
  const forced = new URLSearchParams(location.search).get('persona');
  const p = PERSONAS.find((x) => x.id === forced);
  if (!p) return picked;
  return { id: p.id, name: p.name, blurb: p.blurb(stats), evidence: picked.evidence };
}

function render() {
  const stats = computeYear(state.rows, state.year);
  const places = buildPlaces(stats.lists);
  state.stats = stats;
  state.places = places;
  const html = buildCards(stats, personaFor(stats), places);
  $('stage').innerHTML = html.map((h) => `<div class="card-frame">${h}</div>`).join('');
  state.cards = [...$('stage').querySelectorAll('.card-frame')];
  $('progress').innerHTML = state.cards.map(() => '<span></span>').join('');
  state.index = 0;
  show();
  fit();
}

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Counts marked numbers up from zero. Each run gets a token, so a newer run
// or a save (which clears the token) stops the old one.
function countUp(card) {
  const token = {};
  card.countToken = token;
  const targets = [
    ...[...card.querySelectorAll('[data-count]')].map((el) => {
      el.dataset.final ??= el.textContent;
      const n = Number(el.dataset.final.replace(/,/g, ''));
      return { el, ms: 1000, text: (t) => Math.round(n * t).toLocaleString('en-US') };
    }),
    ...[...card.querySelectorAll('[data-count-minutes]')].map((el) => {
      el.dataset.final ??= el.textContent;
      const n = Number(el.dataset.countMinutes);
      return { el, ms: 1500, text: (t) => formatDuration(Math.round(n * t)) };
    }),
  ];
  if (!targets.length) return;
  const start = performance.now();
  const tick = (now) => {
    if (card.countToken !== token) return;
    let running = false;
    for (const x of targets) {
      const t = Math.min(1, (now - start) / x.ms);
      x.el.textContent = t < 1 ? x.text(easeOut(t)) : x.el.dataset.final;
      running ||= t < 1;
    }
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Plays a card's entrance from the top.
function enter(frame, direction) {
  const card = frame.querySelector('.card');
  frame.classList.remove('enter-next', 'enter-prev');
  card.classList.remove('play', 'still');
  void card.offsetWidth; // restart CSS animations
  if (direction) frame.classList.add(direction);
  card.classList.add('play');
  if (!reduceMotion) countUp(card);
  prepareImage(frame);
}

// Jumps a card to its finished state, for saving.
function settle(card) {
  card.classList.add('still');
  card.countToken = null;
  for (const el of card.querySelectorAll('[data-final]')) el.textContent = el.dataset.final;
}

function show(direction = null) {
  // Leaving the map mid-tour lands it, so it's on its final frame when you return.
  state.cards.forEach((c, i) => { if (i !== state.index && c.mapCtl?.running) c.mapCtl.skip(); });
  state.cards.forEach((c, i) => c.classList.toggle('active', i === state.index));
  enter(state.cards[state.index], direction);
  state.cards[state.index].mapCtl?.refresh();
  [...$('progress').children].forEach((b, i) => b.classList.toggle('done', i <= state.index));
  $('prev').disabled = state.index === 0;
  $('next').disabled = state.index === state.cards.length - 1;
  mountActiveMap();
  updateReplay();
}

// The map loads its outlines the first time its card is shown, then plays.
// frame.mapReady lets sharing wait for it.
function mountActiveMap() {
  const frame = state.cards[state.index];
  const card = frame.querySelector('.card-map');
  if (!card || frame.mapReady) return;
  frame.mapReady = mountMap(card, state.places, state.stats)
    .then((ctl) => {
      frame.mapCtl = ctl;
      playMap(ctl);
      return ctl;
    })
    .catch((e) => {
      console.error(e);
      card.querySelector('.map-host').textContent = "The map couldn't load.";
    });
}

function playMap(ctl) {
  $('replay').hidden = true;
  ctl.play().then(() => updateReplay());
}

// Replay shows on the map card once its flight has finished.
function updateReplay() {
  const ctl = state.cards[state.index]?.mapCtl;
  $('replay').hidden = !ctl || ctl.running;
}

function go(delta) {
  const next = Math.max(0, Math.min(state.cards.length - 1, state.index + delta));
  if (next === state.index) return;
  state.index = next;
  show(delta > 0 ? 'enter-next' : 'enter-prev');
}

// Scales the fixed-size cards to fit the stage.
function fit() {
  const stage = $('stage');
  const scale = Math.min(stage.clientWidth / CARD_W, stage.clientHeight / CARD_H);
  stage.style.setProperty('--scale', scale);
}

// Sharing. Phones get the share sheet, where Discord shows up. Desktop share
// sheets rarely offer Discord, so desktop copies the image for pasting
// instead. Download is always there as a fallback.
const SAMPLE_FILE = new File([''], 'card.png', { type: 'image/png' });
const canShareFiles = Boolean(navigator.canShare?.({ files: [SAMPLE_FILE] }));
const canCopyImage = typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);
const touchFirst = window.matchMedia?.('(pointer: coarse)').matches;
const shareMode = canShareFiles && (touchFirst || !canCopyImage) ? 'share' : canCopyImage ? 'copy' : 'download';
const SHARE_LABEL = { share: 'Share', copy: 'Copy image', download: 'Save image' }[shareMode];

// Renders a card's finished state to a PNG once, and reuses it. Browsers
// only allow sharing right after a tap, so images are made ahead of time
// (see prepareImage) and the tap shares one that's ready.
let fontCss = null;
function cardImage(frame) {
  frame.png ??= (async () => {
    const ctl = await frame.mapReady;
    if (ctl?.running) await ctl.skip();
    const card = frame.querySelector('.card');
    settle(card);
    // Embedding the web fonts is the slow part of a render; do it once.
    fontCss ??= window.htmlToImage.getFontEmbedCSS(card);
    const fontEmbedCSS = await fontCss;
    return window.htmlToImage.toBlob(card, { width: CARD_W, height: CARD_H, pixelRatio: 1, fontEmbedCSS });
  })();
  frame.png.catch(() => { frame.png = null; });
  return frame.png;
}

// Once a card's entrance (or the map's flight) has finished, render its image
// in the background so Share is instant.
function prepareImage(frame) {
  // The map card waits for its flight to land. mapReady is set later in the
  // same show(), hence the microtask.
  const ready = frame.querySelector('.card-map')
    ? Promise.resolve().then(() => frame.mapReady).then((ctl) => ctl?.done)
    : new Promise((r) => setTimeout(r, 1800));
  ready.then(() => {
    if (state.cards[state.index] === frame) cardImage(frame).catch(() => {});
  });
}

function fileName() {
  return `flight-path-${state.year}-${state.index + 1}.png`;
}

function flash(text) {
  const btn = $('share');
  btn.textContent = text;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { btn.textContent = SHARE_LABEL; }, 2400);
}

async function downloadCard() {
  try {
    const blob = await cardImage(state.cards[state.index]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    console.error(e);
    alert("Sorry, that card couldn't be saved as an image. A screenshot works too.");
  }
}

async function shareCard() {
  const frame = state.cards[state.index];
  if (shareMode === 'share') {
    try {
      const blob = await cardImage(frame);
      await navigator.share({ files: [new File([blob], fileName(), { type: 'image/png' })], title: `My ${state.year} Flight Path` });
    } catch (e) {
      if (e.name === 'AbortError') return; // closed the share sheet
      // The tap "expired" while the image was still being made. It's ready now.
      if (e.name === 'NotAllowedError') return flash('Ready, tap again');
      console.error(e);
      downloadCard();
    }
  } else if (shareMode === 'copy') {
    try {
      // Handing ClipboardItem the pending image keeps the click's permission.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardImage(frame) })]);
      flash('Copied! Paste in Discord');
    } catch (e) {
      console.error(e);
      downloadCard();
    }
  } else {
    downloadCard();
  }
}

// Accepts the zip eBird emails or the CSV inside it.
// Big exports take a few seconds on a phone, so the drop zone says so.
function setBusy(busy) {
  $('drop').classList.toggle('busy', busy);
  $('drop').querySelector('strong').textContent = busy ? 'Reading your checklists\u2026' : 'Drop your eBird zip here';
  $('drop').querySelector('span').textContent = busy ? 'Big exports can take a few seconds.' : 'or tap to choose it. The CSV inside works too.';
}

async function readFile(file) {
  if (!file) return;
  showError('');
  setBusy(true);
  // Let the busy message paint before the heavy work starts.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = isZip(bytes) ? await csvFromZip(bytes) : new TextDecoder('utf-8').decode(bytes);
    load(text);
  } catch (e) {
    showError(e.message || "That file couldn't be read.");
  } finally {
    setBusy(false);
  }
}

$('file').addEventListener('change', (e) => readFile(e.target.files[0]));
$('drop').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); }
});
$('drop').addEventListener('dragover', (e) => { e.preventDefault(); $('drop').classList.add('over'); });
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('over'));
$('drop').addEventListener('drop', (e) => {
  e.preventDefault();
  $('drop').classList.remove('over');
  readFile(e.dataTransfer.files[0]);
});
$('demo').addEventListener('click', async () => {
  const res = await fetch('samples/demo.csv');
  load(await res.text());
});
$('back').addEventListener('click', () => {
  $('deck').hidden = true;
  $('upload').hidden = false;
  $('file').value = '';
});
$('year').addEventListener('change', (e) => { state.year = Number(e.target.value); render(); });
$('prev').addEventListener('click', () => go(-1));
$('next').addEventListener('click', () => go(1));
$('share').textContent = SHARE_LABEL;
$('download').hidden = shareMode === 'download';
$('share').addEventListener('click', shareCard);
$('download').addEventListener('click', downloadCard);
$('replay').addEventListener('click', () => {
  const ctl = state.cards[state.index].mapCtl;
  if (ctl) playMap(ctl);
});
$('stage').addEventListener('click', (e) => {
  // A tap during the flight skips to its end instead of leaving the card.
  const ctl = state.cards[state.index].mapCtl;
  if (ctl?.running) { ctl.skip(); return; }
  const r = $('stage').getBoundingClientRect();
  go(e.clientX - r.left < r.width / 3 ? -1 : 1);
});
document.addEventListener('keydown', (e) => {
  if ($('deck').hidden) return;
  if (e.key === 'ArrowRight') go(1);
  if (e.key === 'ArrowLeft') go(-1);
});
window.addEventListener('resize', fit);
