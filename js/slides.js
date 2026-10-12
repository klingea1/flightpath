// Builds the cards. Each card is a fixed 1080x1350 (4:5) element, the size
// that reads best inline in Discord, and is scaled down to fit the screen.

export const CARD_W = 1080;
export const CARD_H = 1350;

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

const plural = (n, one, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;

function footer(year) {
  return `<footer class="card-foot"><span>Flight Path</span><span>${year}</span></footer>`;
}

// Draws every checklist location in date order as a chain of arcs.
function flightPathSvg(lists, w, h) {
  const pts = lists
    .filter((c) => c.lat !== null && c.lng !== null)
    .sort((a, b) => (a.date + (a.startMin ?? 0)).localeCompare(b.date + (b.startMin ?? 0)))
    .map((c) => [c.lng, c.lat]);
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
    paths += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  }

  const unique = [...new Set(proj.map((p) => p.map((v) => v.toFixed(0)).join(',')))];
  const dots = unique.map((k) => {
    const [x, y] = k.split(',');
    return `<circle cx="${x}" cy="${y}" r="9"/>`;
  }).join('');

  return `<svg class="path-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <g class="arcs">${paths}</g><g class="dots">${dots}</g></svg>`;
}

function coverCard(s) {
  const counties = s.counties === 1 ? (s.lists[0]?.county ? `${s.lists[0].county} County` : '1 county') : `${s.counties} counties`;
  return `
  <section class="card card-cover">
    ${flightPathSvg(s.lists, CARD_W, 820)}
    <div class="cover-text">
      <p class="eyebrow">Your</p>
      <h2><span class="year">${s.year}</span><br>Flight Path</h2>
      <p class="cover-sub">${fmt(s.checklists)} checklists &middot; ${esc(counties)}</p>
    </div>
    ${footer(s.year)}
  </section>`;
}

function headlineCard(s) {
  const tiles = [
    [fmt(s.checklists), 'checklists'],
    [fmt(s.hours), 'hours afield'],
    [fmt(s.miles), 'miles traveled'],
    s.firstYearOnEbird || !s.lifers.length
      ? [fmt(s.daysAfield), 'days afield']
      : [fmt(s.lifers.length), s.lifers.length === 1 ? 'lifer' : 'lifers'],
    [fmt(s.locations), s.locations === 1 ? 'location' : 'locations'],
    s.bigDay ? [fmt(s.bigDay.species), `species on ${formatDate(s.bigDay.date)}, your biggest day`] : null,
  ].filter(Boolean);

  return `
  <section class="card card-headline">
    <p class="eyebrow">In ${s.year} you found</p>
    <div class="big-number">${fmt(s.species)}</div>
    <p class="big-label">species</p>
    <div class="tiles">
      ${tiles.map(([n, l]) => `<div class="tile"><div class="tile-n">${n}</div><div class="tile-l">${esc(l)}</div></div>`).join('')}
    </div>
    ${footer(s.year)}
  </section>`;
}

function personaCard(s, persona) {
  return `
  <section class="card card-persona persona-${persona.id}">
    <p class="eyebrow">Your birding persona</p>
    <h2 class="persona-name">${esc(persona.name)}</h2>
    <p class="persona-blurb">${esc(persona.blurb)}</p>
    ${persona.evidence.length ? `<ul class="evidence">${persona.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    ${footer(s.year)}
  </section>`;
}

function firstListCard(s) {
  const f = s.firstList;
  const shown = f.species.slice(0, 8);
  const more = f.species.length - shown.length;
  const when = [formatDate(f.date), formatTime(f.startMin)].filter(Boolean).join(', ');
  return `
  <section class="card card-first">
    <p class="eyebrow">Your ${s.year} started</p>
    <h2 class="card-title">${esc(f.location)}</h2>
    <p class="card-sub">${esc(when)} &middot; ${plural(f.species.length, 'species', 'species')}</p>
    <ul class="name-list">
      ${shown.map((n) => `<li>${esc(n)}</li>`).join('')}
      ${more > 0 ? `<li class="more">and ${more} more</li>` : ''}
    </ul>
    ${footer(s.year)}
  </section>`;
}

function lifersCard(s) {
  const firstYear = s.firstYearOnEbird;
  const list = s.liferList;
  const shown = list.slice(0, 7);
  const more = list.length - shown.length;
  return `
  <section class="card card-lifers">
    <p class="eyebrow">${firstYear ? 'Your life list begins' : `New to your life list in ${s.year}`}</p>
    <div class="big-number">${fmt(list.length)}</div>
    <p class="big-label">${firstYear ? 'species and counting' : list.length === 1 ? 'lifer' : 'lifers'}</p>
    <ul class="dated-list">
      ${shown.map((l) => `<li><span>${esc(l.name)}</span><span>${formatDate(l.date)}</span></li>`).join('')}
      ${more > 0 ? `<li class="more"><span>and ${more} more</span></li>` : ''}
    </ul>
    ${footer(s.year)}
  </section>`;
}

function patchCard(s) {
  const t = s.topLocation;
  const only = t.only.slice(0, 4);
  return `
  <section class="card card-patch">
    <p class="eyebrow">Your top patch</p>
    <h2 class="card-title">${esc(t.name)}</h2>
    <div class="patch-stats">
      <div><div class="tile-n">${fmt(t.checklists)}</div><div class="tile-l">${t.checklists === 1 ? 'visit' : 'visits'}</div></div>
      <div><div class="tile-n">${fmt(t.species)}</div><div class="tile-l">species</div></div>
      <div><div class="tile-n">${Math.round(t.share * 100)}%</div><div class="tile-l">of your checklists</div></div>
    </div>
    ${t.only.length
      ? `<p class="patch-only-label">Only found here this year</p>
         <ul class="name-list">${only.map((n) => `<li>${esc(n)}</li>`).join('')}${t.only.length > only.length ? `<li class="more">and ${t.only.length - only.length} more</li>` : ''}</ul>`
      : `<p class="patch-note">Everything you found here, you found somewhere else too. A true home base.</p>`}
    ${footer(s.year)}
  </section>`;
}

function topBirdsCard(s) {
  const [top, ...rest] = s.topSpeciesList;
  return `
  <section class="card card-birds">
    <p class="eyebrow">Your top birds</p>
    <div class="top-one">
      <span class="rank">No. 1</span>
      <h2 class="card-title">${esc(top.name)}</h2>
      <p class="card-sub">On ${Math.round(top.share * 100)}% of your checklists, ${plural(top.checklists, 'list')} in all</p>
    </div>
    <ol class="rank-list" start="2">
      ${rest.map((b, i) => `<li><span class="rank">${i + 2}</span><span class="rank-name">${esc(b.name)}</span><span class="rank-n">${fmt(b.checklists)}</span></li>`).join('')}
    </ol>
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
    const value = i === peak ? `<text class="m-value" x="${(x + barW / 2).toFixed(1)}" y="${(y - 16).toFixed(1)}">${n}</text>` : '';
    return `<path class="${i === peak ? 'm-bar peak' : 'm-bar'}" d="${d}"/>${value}${label}`;
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

function summaryCard(s, persona) {
  return `
  <section class="card card-summary">
    <div class="sum-head">
      <div>
        <p class="eyebrow">My ${s.year}</p>
        <h2>Flight Path</h2>
      </div>
      ${flightPathSvg(s.lists, 380, 300).replace('class="path-art"', 'class="path-art mini"')}
    </div>
    <div class="sum-hero">
      <div class="sum-big">${fmt(s.species)}</div>
      <div class="sum-big-label">species</div>
    </div>
    <div class="sum-cols">
      <div>
        <p class="sum-label">Top birds</p>
        <ol class="sum-list">${s.topSpeciesList.map((b) => `<li>${esc(b.name)}</li>`).join('')}</ol>
      </div>
      <div>
        <p class="sum-label">Persona</p>
        <p class="sum-value">${esc(persona.name)}</p>
        ${s.topLocation ? `<p class="sum-label">Top patch</p><p class="sum-value">${esc(s.topLocation.name)}</p>` : ''}
      </div>
    </div>
    <div class="sum-stats">
      <div><b>${fmt(s.checklists)}</b> checklists</div>
      <div><b>${fmt(s.hours)}</b> hours</div>
      <div><b>${fmt(s.miles)}</b> miles</div>
    </div>
    ${footer(s.year)}
  </section>`;
}

export function buildCards(stats, persona) {
  const s = stats;
  return [
    coverCard(s),
    headlineCard(s),
    s.firstList && firstListCard(s),
    s.liferList.length && lifersCard(s),
    s.topLocation && s.checklists > 1 && patchCard(s),
    s.topSpeciesList.length && topBirdsCard(s),
    monthsCard(s),
    personaCard(s, persona),
    summaryCard(s, persona),
  ].filter(Boolean);
}
