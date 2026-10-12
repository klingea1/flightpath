// Parses an eBird "Download My Data" CSV into normalized observation rows.
// eBird has shipped a few header variants over the years, so columns are
// matched by alias rather than position.

const COLUMN_ALIASES = {
  submissionId: ['submission id'],
  commonName: ['common name'],
  sciName: ['scientific name'],
  taxonOrder: ['taxonomic order', 'taxonomic sort'],
  count: ['count'],
  state: ['state/province', 'state'],
  county: ['county'],
  location: ['location'],
  locationId: ['location id'],
  lat: ['latitude'],
  lng: ['longitude'],
  date: ['date'],
  time: ['time'],
  protocol: ['protocol'],
  duration: ['duration (min)'],
  allObs: ['all obs reported'],
  distanceKm: ['distance traveled (km)'],
  distanceMi: ['distance traveled (mi)'],
};

const REQUIRED = ['submissionId', 'commonName', 'date'];
const KM_TO_MI = 0.621371;

// RFC 4180 CSV: quoted fields, escaped quotes, CRLF or LF line endings.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

function mapHeaders(header) {
  const normalized = header.map((h) => h.trim().toLowerCase());
  const index = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const i = normalized.findIndex((h) => aliases.includes(h));
    if (i !== -1) index[key] = i;
  }
  const missing = REQUIRED.filter((k) => !(k in index));
  if (missing.length) {
    throw new Error(
      "This doesn't look like an eBird data export. Missing columns: " + missing.join(', ')
    );
  }
  return index;
}

// Accepts "2026-04-07" or "04-07-2026" / "04/07/2026". Returns "YYYY-MM-DD" or null.
export function normalizeDate(s) {
  s = (s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

// Accepts "18:45" or "06:45 PM". Returns minutes after midnight, or null.
export function parseTime(s) {
  const m = (s || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === 'pm';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function normalizeProtocol(s) {
  const p = (s || '').toLowerCase();
  if (p.includes('travel')) return 'traveling';
  if (p.includes('stationary')) return 'stationary';
  if (p.includes('incidental') || p.includes('casual')) return 'incidental';
  if (p.includes('area')) return 'area';
  return 'other';
}

function num(s) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function parseEbirdExport(text) {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error('That file has no observations in it.');
  const idx = mapHeaders(table[0]);
  const get = (r, key) => (key in idx ? (r[idx[key]] ?? '').trim() : '');

  const rows = [];
  for (const r of table.slice(1)) {
    const date = normalizeDate(get(r, 'date'));
    const commonName = get(r, 'commonName');
    if (!date || !commonName) continue;

    let distanceMi = num(get(r, 'distanceMi'));
    if (distanceMi === null) {
      const km = num(get(r, 'distanceKm'));
      distanceMi = km === null ? null : km * KM_TO_MI;
    }
    const countRaw = get(r, 'count');

    rows.push({
      submissionId: get(r, 'submissionId'),
      commonName,
      sciName: get(r, 'sciName'),
      taxonOrder: num(get(r, 'taxonOrder')),
      count: countRaw.toUpperCase() === 'X' ? null : num(countRaw),
      state: get(r, 'state'),
      county: get(r, 'county'),
      location: get(r, 'location'),
      locationId: get(r, 'locationId') || get(r, 'location'),
      lat: num(get(r, 'lat')),
      lng: num(get(r, 'lng')),
      date,
      startMin: parseTime(get(r, 'time')),
      protocol: normalizeProtocol(get(r, 'protocol')),
      durationMin: num(get(r, 'duration')),
      allObs: get(r, 'allObs') === '1',
      distanceMi,
    });
  }
  if (!rows.length) throw new Error('No observations could be read from that file.');
  return rows;
}
