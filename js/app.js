import { parseEbirdExport } from './parse.js';
import { isZip, csvFromZip } from './unzip.js';
import { availableYears, computeYear } from './stats.js';
import { pickPersona, PERSONAS } from './persona.js';
import { buildCards, formatDuration, CARD_W, CARD_H } from './slides.js';
import { buildPlaces } from './places.js';
import { mountMap } from './mapcard.js';

const $ = (id) => document.getElementById(id);
const state = { rows: null, year: null, index: 0, cards: [] };

const thisYear = new Date().getFullYear();
$('year-label').textContent = thisYear;

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
  state.year = years.includes(thisYear) ? thisYear : years[0];
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
}

// Jumps a card to its finished state, for saving.
function settle(card) {
  card.classList.add('still');
  card.countToken = null;
  for (const el of card.querySelectorAll('[data-final]')) el.textContent = el.dataset.final;
}

function show(direction = null) {
  // Leaving the map mid-flight lands it; Leaflet can't draw while hidden.
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

// Leaflet needs a visible container to measure, so the map draws the first
// time its card is shown. frame.mapReady lets saving wait for it.
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

async function saveCard() {
  const card = state.cards[state.index].querySelector('.card');
  const btn = $('save');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const ctl = await state.cards[state.index].mapReady;
    if (ctl?.running) await ctl.skip();
    settle(card);
    const url = await window.htmlToImage.toPng(card, { width: CARD_W, height: CARD_H, pixelRatio: 1 });
    const a = document.createElement('a');
    a.href = url;
    a.download = `flight-path-${state.year}-${state.index + 1}.png`;
    a.click();
  } catch (e) {
    alert("Sorry, that card couldn't be saved as an image. A screenshot works too.");
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save this card';
  }
}

// Accepts the zip eBird emails or the CSV inside it.
async function readFile(file) {
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = isZip(bytes) ? await csvFromZip(bytes) : new TextDecoder('utf-8').decode(bytes);
    load(text);
  } catch (e) {
    showError(e.message || "That file couldn't be read.");
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
$('save').addEventListener('click', saveCard);
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
