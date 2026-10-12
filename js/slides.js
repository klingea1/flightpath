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
  const pad = 70;
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
    [fmt(s.miles), 'miles walked'],
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
    ${s.topLocation ? `<p class="headline-note">Most visited: <strong>${esc(s.topLocation.name)}</strong>, ${fmt(s.topLocation.checklists)} checklists</p>` : ''}
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

export function buildCards(stats, persona) {
  return [coverCard(stats), headlineCard(stats), personaCard(stats, persona)];
}
