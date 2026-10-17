// Builds the cards. Each card is a fixed 1080x1350 (4:5) element, the size
// that reads best inline in Discord, and is scaled down to fit the screen.

import { mapCardHtml } from './mapcard.js';
import { pickHighlights } from './highlights.js';

export const CARD_W = 1080;
export const CARD_H = 1350;

// How many entries each list card shows. A shared deck link carries only these.
export const LIMITS = { firstSpecies: 8, lifers: 7, spotOnly: 4, seenOnce: 5 };

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmt = (n) => Math.round(n).toLocaleString('en-US');

function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function formatTime(min) {
  if (min === null || min === undefined) return '';
  const h = Math.floor(min / 60);
  const m = String(min % 60).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// Long location names step down in size so they fit in two or three lines.
const titleSize = (name) => (name.length > 34 ? ' title-long' : name.length > 22 ? ' title-mid' : '');

// The unit word for a number as it's displayed (so 0.6 hours shows as "1 hour").
const word = (n, one, many = one + 's') => (Math.round(n) === 1 ? one : many);

const plural = (n, one, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;

// Entrance animation hooks. Each marked element plays its effect once when
// its card is shown, after a delay in ms. See the "Entrances" section of the CSS.
const fx = (kind, delay = 0) => ` data-fx="${kind}" style="--d:${Math.round(delay)}ms"`;

// Numbers that count up from zero as the card appears.
const count = ' data-count';

function footer(year) {
  return `<footer class="card-foot"><span>Flight Path</span><span>${year}</span></footer>`;
}

// Every checklist's place in date order, as [lng, lat]. Places are the map's
// grid-snapped pins, so the drawing never carries exact coordinates.
function flightPoints(places) {
  return places ? places.sequence.map((v) => [places.pins[v.pin].lng, places.pins[v.pin].lat]) : [];
}

// Draws every checklist location in date order as a chain of arcs.
function flightPathSvg(pts, w, h) {
  if (!pts.length) return '';

  const midLat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * kx);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.min(70, w * 0.08);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = Math.min(w - pad * 2, h - pad * 2) / span;
  const ox = (w - (maxX - minX) * scale) / 2;
  const oy = (h - (maxY - minY) * scale) / 2;
  const proj = pts.map((p, i) => [ox + (xs[i] - minX) * scale, oy + (maxY - ys[i]) * scale]);

  let paths = '';
  for (let i = 1; i < proj.length; i++) {
    const [x1, y1] = proj[i - 1];
    const [x2, y2] = proj[i];
    if (x1 === x2 && y1 === y2) continue;
    const dx = x2 - x1, dy = y2 - y1;
    const bend = (i % 2 ? 0.25 : -0.25) * (1 + (i % 5) / 5);
    const cx = (x1 + x2) / 2 - dy * bend;
    const cy = (y1 + y2) / 2 + dx * bend;
    const delay = 120 + (900 * i) / proj.length;
    paths += `<path pathLength="1"${fx('draw', delay)} d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  }

  const unique = [...new Set(proj.map((p) => p.map((v) => v.toFixed(0)).join(',')))];
  const dots = unique.map((k) => {
    const [x, y] = k.split(',');
    return `<circle${fx('dot', 900)} cx="${x}" cy="${y}" r="9"/>`;
  }).join('');

  return `<svg class="path-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <g class="arcs">${paths}</g><g class="dots">${dots}</g></svg>`;
}

function coverCard(s, path) {
  // "Kent County" reads right in the US; elsewhere the county is just its name.
  const only = s.soleCounty;
  const counties = s.counties !== 1 ? `${s.counties} counties`
    : !only?.county ? '1 county'
    : only.state?.startsWith('US-') ? `${only.county} County` : only.county;
  // The art stops above the title, so no arc crosses it.
  return `
  <section class="card card-cover">
    ${flightPathSvg(path, CARD_W, 720)}
    <div class="cover-text"${fx('rise', 500)}>
      <p class="eyebrow">Your</p>
      <h2><span class="year">${s.year}</span><br>Flight Path</h2>
      <p class="cover-sub">${plural(s.checklists, 'checklist')} &middot; ${esc(counties)}</p>
    </div>
    ${footer(s.year)}
  </section>`;
}

function headlineCard(s) {
  const tiles = [
    [fmt(s.checklists), word(s.checklists, 'checklist')],
    [fmt(s.hours), `${word(s.hours, 'hour')} afield`],
    [fmt(s.miles), `${word(s.miles, 'mile')} traveled`],
    s.firstYearOnEbird || !s.lifers.length
      ? [fmt(s.daysAfield), `${word(s.daysAfield, 'day')} afield`]
      : [fmt(s.lifers.length), s.lifers.length === 1 ? 'lifer' : 'lifers'],
    [fmt(s.locations), s.locations === 1 ? 'location' : 'locations'],
    s.bigDay ? [fmt(s.bigDay.species), `species on ${formatDate(s.bigDay.date)}, your biggest day`] : null,
  ].filter(Boolean);

  return `
  <section class="card card-headline">
    <p class="eyebrow">In ${s.year} you found</p>
    <div class="big-number"${count}>${fmt(s.species)}</div>
    <p class="big-label"${fx('rise', 150)}>species</p>
    <div class="tiles">
      ${tiles.map(([n, l], i) => `<div class="tile"${fx('pop', 300 + i * 90)}><div class="tile-n">${n}</div><div class="tile-l">${esc(l)}</div></div>`).join('')}
    </div>
    ${footer(s.year)}
  </section>`;
}

function personaCard(s, persona) {
  return `
  <section class="card card-persona persona-${persona.id}">
    <p class="eyebrow">Your birding persona</p>
    <h2 class="persona-name"${fx('focus', 100)}>${esc(persona.name)}</h2>
    <p class="persona-blurb"${fx('rise', 550)}>${esc(persona.blurb)}</p>
    ${persona.evidence.length ? `<ul class="evidence">${persona.evidence.map((e, i) => `<li${fx('slide', 800 + i * 140)}>${esc(e)}</li>`).join('')}</ul>` : ''}
    ${footer(s.year)}
  </section>`;
}

function firstListCard(s) {
  const f = s.firstList;
  const shown = f.species.slice(0, LIMITS.firstSpecies);
  const more = f.species.length - shown.length;
  const when = [formatDate(f.date), formatTime(f.startMin)].filter(Boolean).join(', ');
  return `
  <section class="card card-first">
    <p class="eyebrow">Your ${s.year} started</p>
    <h2 class="card-title${titleSize(f.location)}">${esc(f.location)}</h2>
    <p class="card-sub">${esc(when)} &middot; ${plural(f.species.length, 'species', 'species')}</p>
    <ul class="name-list">
      ${shown.map((n, i) => `<li${fx('rise', 250 + i * 110)}>${esc(n)}</li>`).join('')}
      ${more > 0 ? `<li class="more"${fx('rise', 250 + shown.length * 110)}>and ${more} more</li>` : ''}
    </ul>
    ${f.dayChecklists > 1 ? `<p class="first-day"${fx('rise', 450 + shown.length * 110)}>By the end of ${formatDate(f.date)}: ${plural(f.dayChecklists, 'checklist')}, ${plural(f.daySpecies, 'species', 'species')}.</p>` : ''}
    ${footer(s.year)}
  </section>`;
}

function lifersCard(s) {
  const list = s.liferList;
  const shown = list.slice(0, LIMITS.lifers);
  const more = list.length - shown.length;
  return `
  <section class="card card-lifers">
    <p class="eyebrow">New to your life list in ${s.year}</p>
    <div class="big-number"${count}>${fmt(list.length)}</div>
    <p class="big-label"${fx('rise', 150)}>${list.length === 1 ? 'lifer' : 'lifers'}</p>
    <ul class="dated-list">
      ${shown.map((l, i) => `<li${fx('slide', 300 + i * 90)}><span>${esc(l.name)}</span><span>${formatDate(l.date)}</span></li>`).join('')}
      ${more > 0 ? `<li class="more"${fx('slide', 300 + shown.length * 90)}><span>and ${more} more</span></li>` : ''}
    </ul>
    ${footer(s.year)}
  </section>`;
}

function spotCard(s) {
  const t = s.topLocation;
  const only = t.only.slice(0, LIMITS.spotOnly);
  return `
  <section class="card card-spot">
    <p class="eyebrow">Your top spot</p>
    <h2 class="card-title${titleSize(t.name)}">${esc(t.name)}</h2>
    <div class="spot-stats">
      <div${fx('pop', 250)}><div class="tile-n">${fmt(t.checklists)}</div><div class="tile-l">${t.checklists === 1 ? 'visit' : 'visits'}</div></div>
      <div${fx('pop', 380)}><div class="tile-n">${fmt(t.species)}</div><div class="tile-l">species</div></div>
      <div${fx('pop', 510)}><div class="tile-n">${Math.round(t.share * 100)}%</div><div class="tile-l">of your checklists</div></div>
    </div>
    ${t.only.length
      ? `<p class="spot-only-label"${fx('rise', 750)}>Only found here this year</p>
         <ul class="name-list">${only.map((n, i) => `<li${fx('rise', 850 + i * 100)}>${esc(n)}</li>`).join('')}${t.only.length > only.length ? `<li class="more">and ${t.only.length - only.length} more</li>` : ''}</ul>`
      : `<p class="spot-note"${fx('rise', 800)}>Everything you found here, you found somewhere else too. A true home base.</p>`}
    ${footer(s.year)}
  </section>`;
}

// Birds nearly every Kent County birder logs constantly. If one tops your
// list, the card says so.
const KENT_STAPLES = new Set([
  'Canada Goose', 'Mallard', 'American Robin', 'Northern Cardinal', 'Blue Jay',
  'Black-capped Chickadee', 'American Crow', 'Mourning Dove', 'European Starling',
  'House Sparrow', 'Song Sparrow', 'Red-winged Blackbird', 'American Goldfinch',
  'Downy Woodpecker', 'Red-bellied Woodpecker', 'Ring-billed Gull',
]);

// The quip is a Kent County joke, so it only goes to Kent County birders with
// enough checklists for "basically everyone" to mean something.
function birdsInKent(s) {
  return s.checklists >= 10 && s.kentShare >= 0.5;
}

function topBirdsCard(s) {
  const [top, ...rest] = s.topSpeciesList;
  // Competition ranking, so a tie shares its number.
  const rank = (b) => 1 + s.topSpeciesList.filter((o) => o.checklists > b.checklists).length;
  const tied = rest.filter((b) => b.checklists === top.checklists);
  const tie = !tied.length ? ''
    : tied.length === 1 ? `, tied with ${esc(tied[0].name)}`
    : `, tied with ${tied.length} others`;
  return `
  <section class="card card-birds">
    <p class="eyebrow">Your top birds</p>
    <div class="top-one"${fx('rise', 200 + rest.length * 170)}>
      <span class="rank">No. 1</span>
      <h2 class="card-title">${esc(top.name)}</h2>
      <p class="card-sub">On ${Math.round(top.share * 100)}% of your checklists, ${plural(top.checklists, 'list')} in all${tie}</p>
      ${KENT_STAPLES.has(top.name) && birdsInKent(s) ? `<p class="quip"${fx('rise', 700 + rest.length * 170)}>Same as basically everyone in Kent County.</p>` : ''}
    </div>
    <ol class="rank-list" start="2">
      ${rest.map((b, i) => `<li${fx('slide', 200 + (rest.length - 1 - i) * 170)}><span class="rank">${rank(b)}</span><span class="rank-name">${esc(b.name)}</span><span class="rank-n">${fmt(b.checklists)}</span></li>`).join('')}
    </ol>
    ${footer(s.year)}
  </section>`;
}

export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} hr${m ? ` ${m} min` : ''}` : `${m} min`;
}

function seenOnceCard(s) {
  const list = s.seenOnce;
  const shown = list.slice(0, LIMITS.seenOnce);
  const more = list.length - shown.length;
  return `
  <section class="card card-once">
    <p class="eyebrow">Seen exactly once</p>
    <div class="big-number"${count}>${fmt(list.length)}</div>
    <p class="big-label"${fx('rise', 150)}>${list.length === 1 ? 'bird showed up on just one checklist' : 'birds showed up on just one checklist'}</p>
    <ul class="once-list">
      ${shown.map((b, i) => `<li${fx('slide', 300 + i * 100)}><span class="once-name">${esc(b.name)}</span><span class="once-where">${formatDate(b.date)} &middot; ${esc(b.location)}</span></li>`).join('')}
      ${more > 0 ? `<li class="more"${fx('slide', 300 + shown.length * 100)}>and ${more} more</li>` : ''}
    </ul>
    ${footer(s.year)}
  </section>`;
}

function grindCard(s) {
  const g = s.grind;
  return `
  <section class="card card-grind">
    <p class="eyebrow">Your grind</p>
    <div class="grind-time" data-count-minutes="${g.durationMin}">${formatDuration(g.durationMin)}</div>
    <p class="grind-sub">at ${esc(g.location)} on ${formatDate(g.date)}, for ${plural(g.species.length, 'species', 'species')}</p>
    <p class="grind-list">${g.species.map(esc).join(', ')}</p>
    <p class="grind-close"${fx('fade', 1600)}>Not every outing is a big day. You stayed out anyway.</p>
    ${footer(s.year)}
  </section>`;
}

function monthYear(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function shortDate(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Returning migrants' first-of-year dates at home, against last year's.
function arrivalsCard(s) {
  const list = s.arrivals;
  const avg = list.reduce((n, a) => n + a.shift, 0) / list.length;
  const title = avg <= -2 ? 'They came early' : avg >= 2 ? 'Fashionably late' : 'Right on schedule';
  const shiftText = (d) => (d === 0 ? 'same day' : `${Math.abs(d)} ${Math.abs(d) === 1 ? 'day' : 'days'} ${d < 0 ? 'earlier' : 'later'}`);
  return `
  <section class="card card-arrivals">
    <p class="eyebrow">Spring arrivals</p>
    <h2 class="card-title">${title}</h2>
    <p class="card-sub">Your first of the year in ${esc(s.homeRegionName)}, against ${s.year - 1}</p>
    <ul class="arrival-list">
      ${list.map((a, i) => `<li${fx('slide', 300 + i * 110)}>
        <span class="arr-name">${esc(a.name)}</span>
        <span class="arr-date">${shortDate(a.date)}</span>
        <span class="arr-shift ${a.shift < 0 ? 'early' : a.shift > 0 ? 'late' : ''}">${shiftText(a.shift)}</span>
      </li>`).join('')}
    </ul>
    ${footer(s.year)}
  </section>`;
}

// Birds seen again after missing at least a whole year.
function welcomeBackCard(s) {
  const list = s.welcomeBack;
  return `
  <section class="card card-welcome">
    <p class="eyebrow">Welcome back</p>
    <h2 class="card-title">${list.length === 1 ? 'An old friend returned' : `${fmt(list.length)} old friends returned`}</h2>
    <p class="card-sub">Birds you saw again after a year or more away</p>
    <ul class="welcome-list">
      ${list.map((b, i) => `<li${fx('slide', 300 + i * 110)}><span class="wb-name">${esc(b.name)}</span><span class="wb-since">first since ${monthYear(b.since)}</span></li>`).join('')}
    </ul>
    ${footer(s.year)}
  </section>`;
}

// When in the day you bird: checklist start times on a 24-hour dial, with
// midnight at the top. Single color; the busiest hour gets the accent and
// the only value label. The bars sweep in clockwise, like a clock hand.
function clockCard(s) {
  const hours = s.startHours;
  const timed = hours.reduce((a, b) => a + b, 0);
  const max = Math.max(...hours);
  const peak = hours.indexOf(max);
  const size = 860, cx = size / 2, cy = size / 2, r0 = 150, r1 = 380;
  const label = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
  const morning = hours.slice(0, 12).reduce((a, b) => a + b, 0) / timed;
  const bars = hours.map((n, h) => {
    if (!n) return '';
    const len = r0 + ((r1 - r0) * n) / max;
    const a0 = ((h + 0.12) / 24) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((h + 0.88) / 24) * 2 * Math.PI - Math.PI / 2;
    const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    const d = `M${pt(r0, a0)} L${pt(len, a0)} A${len} ${len} 0 0 1 ${pt(len, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 0 0 ${pt(r0, a0)} Z`;
    return `<path class="${h === peak ? 'c-bar peak' : 'c-bar'}"${fx(h === peak ? 'sweep-peak' : 'sweep', 150 + h * 45)} d="${d}"/>`;
  }).join('');
  const peakAngle = ((peak + 0.5) / 24) * 2 * Math.PI - Math.PI / 2;
  // Further out when the label sits sideways, so its width clears the bar.
  const peakR = r1 + 34 + Math.abs(Math.cos(peakAngle)) * 34;
  // A tick label next to the peak would collide with its value. The title
  // already names the peak hour, so that tick steps aside.
  const nearPeak = (h) => Math.min(Math.abs(peak + 0.5 - h), 24 - Math.abs(peak + 0.5 - h)) < 1.5;
  const ticks = [[0, 'Midnight'], [6, '6 AM'], [12, 'Noon'], [18, '6 PM']].filter(([h]) => !nearPeak(h)).map(([h, t]) => {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
    const r = r1 + 52;
    return `<text class="c-tick" x="${(cx + r * Math.cos(a)).toFixed(1)}" y="${(cy + r * Math.sin(a) + 10).toFixed(1)}">${t}</text>`;
  }).join('');
  return `
  <section class="card card-clock">
    <p class="eyebrow">Your birding day</p>
    <h2 class="card-title">${label(peak)} was your hour</h2>
    <p class="card-sub">${Math.round(morning * 100)}% of your checklists started before noon</p>
    <svg class="clock-chart" viewBox="0 0 ${size} ${size}" width="700" height="700" role="img"
         aria-label="Checklists by starting hour: ${hours.map((n, h) => `${label(h)} ${n}`).join(', ')}">
      <circle class="c-face" cx="${cx}" cy="${cy}" r="${r1 + 16}"/>
      <circle class="c-hub" cx="${cx}" cy="${cy}" r="${r0 - 14}"/>
      ${bars}
      ${ticks}
      <text class="c-peak"${fx('fade', 1350)} x="${(cx + peakR * Math.cos(peakAngle)).toFixed(1)}" y="${(cy + peakR * Math.sin(peakAngle) + 12).toFixed(1)}">${max}</text>
      <text class="c-center" x="${cx}" y="${cy - 2}">${fmt(timed)}</text>
      <text class="c-center-label" x="${cx}" y="${cy + 50}">checklists</text>
    </svg>
    ${footer(s.year)}
  </section>`;
}

// Checklists per month as a single-series bar chart. One accent marks the
// busiest month, which is also the only bar with a value label.
function monthsCard(s) {
  const w = 904, h = 560, base = 500, top = 60;
  const max = Math.max(...s.monthly);
  const peak = s.monthly.indexOf(max);
  const slot = w / 12;
  const barW = slot - 18;
  const bars = s.monthly.map((n, i) => {
    const x = i * slot + 9;
    const bh = max ? (n / max) * (base - top) : 0;
    const label = `<text class="m-label" x="${(x + barW / 2).toFixed(1)}" y="${base + 44}">${MONTHS[i][0]}</text>`;
    if (!n) return label;
    const y = base - bh;
    const r = Math.min(8, bh);
    // Rounded top, square base.
    const d = `M${x} ${base} V${(y + r).toFixed(1)} Q${x} ${y.toFixed(1)} ${x + r} ${y.toFixed(1)} H${x + barW - r} Q${x + barW} ${y.toFixed(1)} ${x + barW} ${(y + r).toFixed(1)} V${base} Z`;
    const value = i === peak ? `<text class="m-value"${fx('fade', 1150)} x="${(x + barW / 2).toFixed(1)}" y="${(y - 16).toFixed(1)}">${n}</text>` : '';
    const grow = fx(i === peak ? 'grow-peak' : 'grow', 150 + i * 70);
    return `<path class="${i === peak ? 'm-bar peak' : 'm-bar'}"${grow} d="${d}"/>${value}${label}`;
  }).join('');

  return `
  <section class="card card-months">
    <p class="eyebrow">Your year, month by month</p>
    <h2 class="card-title">${max ? `${MONTHS[peak]} was your month` : 'A quiet year'}</h2>
    <p class="card-sub">${plural(max, 'checklist')} in ${MONTHS[peak]}</p>
    <svg class="months-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"
         aria-label="Checklists per month: ${s.monthly.map((n, i) => `${MONTHS[i]} ${n}`).join(', ')}">
      <line class="m-base" x1="0" x2="${w}" y1="${base}" y2="${base}"/>
      ${bars}
    </svg>
    ${footer(s.year)}
  </section>`;
}

// The ending, and the card most worth posting. It bookends the cover: the
// same sky, now at sunrise, with the year's flight path drawn large. One big
// number, three highlights, and the effort line where the cover's footer sits.
function summaryCard(s, path) {
  return `
  <section class="card card-summary">
    <h2 class="sum-title">My <span class="year">${s.year}</span> Flight Path</h2>
    ${flightPathSvg(path, CARD_W, 500).replace('class="path-art"', 'class="path-art sum-art"')}
    <div class="sum-hero"${fx('rise', 700)}>
      <span class="sum-big"${count}>${fmt(s.species)}</span>
      <span class="sum-big-label">species</span>
    </div>
    <ul class="sum-list">
      ${pickHighlights(s).map((h, i) => `<li${fx('slide', 950 + i * 140)}><span class="sum-label">${esc(h.label)}</span><span class="sum-value">${esc(h.value)}</span></li>`).join('')}
    </ul>
    <p class="sum-effort"${fx('fade', 1400)}><b>${fmt(s.checklists)}</b> ${word(s.checklists, 'checklist')} &middot; <b>${fmt(s.hours)}</b> ${word(s.hours, 'hour')} &middot; <b>${fmt(s.miles)}</b> ${word(s.miles, 'mile')}</p>
  </section>`;
}

export function buildCards(stats, persona, places) {
  const s = stats;
  const path = flightPoints(places);
  return [
    coverCard(s, path),
    headlineCard(s),
    s.firstList && firstListCard(s),
    // In a first year every species is a lifer, which Headline already says.
    s.liferList.length && !s.firstYearOnEbird && lifersCard(s),
    s.welcomeBack.length >= 2 && welcomeBackCard(s),
    s.topLocation && s.checklists > 1 && spotCard(s),
    s.topSpeciesList.length && topBirdsCard(s),
    s.seenOnce.length && s.checklists >= 10 && seenOnceCard(s),
    monthsCard(s),
    s.arrivals.length >= 3 && arrivalsCard(s),
    s.startHours.reduce((a, b) => a + b, 0) >= 10 && clockCard(s),
    s.grind && s.checklists >= 10 && grindCard(s),
    personaCard(s, persona),
    places && mapCardHtml(s, places),
    summaryCard(s, path),
  ].filter(Boolean);
}
