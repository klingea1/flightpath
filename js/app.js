import { parseEbirdExport } from './parse.js';
import { isZip, csvFromZip } from './unzip.js';
import { availableYears, computeYear } from './stats.js';
import { pickPersona, PERSONAS } from './persona.js';
import { buildCards, CARD_W, CARD_H } from './slides.js';

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
  const html = buildCards(stats, personaFor(stats));
  $('stage').innerHTML = html.map((h) => `<div class="card-frame">${h}</div>`).join('');
  state.cards = [...$('stage').querySelectorAll('.card-frame')];
  $('progress').innerHTML = state.cards.map(() => '<span></span>').join('');
  state.index = 0;
  show();
  fit();
}

function show() {
  state.cards.forEach((c, i) => c.classList.toggle('active', i === state.index));
  [...$('progress').children].forEach((b, i) => b.classList.toggle('done', i <= state.index));
  $('prev').disabled = state.index === 0;
  $('next').disabled = state.index === state.cards.length - 1;
}

function go(delta) {
  state.index = Math.max(0, Math.min(state.cards.length - 1, state.index + delta));
  show();
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
$('stage').addEventListener('click', (e) => {
  const r = $('stage').getBoundingClientRect();
  go(e.clientX - r.left < r.width / 3 ? -1 : 1);
});
document.addEventListener('keydown', (e) => {
  if ($('deck').hidden) return;
  if (e.key === 'ArrowRight') go(1);
  if (e.key === 'ArrowLeft') go(-1);
});
window.addEventListener('resize', fit);
