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
  observers: ['number of observers'],
};

const REQUIRED = ['submissionId', 'commonName', 'date'];
const KM_TO_MI = 0.621371;

// RFC 4180 CSV: quoted fields, escaped quotes, CRLF or LF line endings.
// Calls onRecord(fields) for each record. The fields array is reused between
// calls, so copy it to keep it. Fields are sliced out whole rather than
// built a character at a time, which matters for 50+ MB exports.
export function eachRecord(text, onRecord) {
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const fields = [];
  while (i < n) {
    fields.length = 0;
    for (;;) {
      if (text.charCodeAt(i) === 34) {
        // Quoted field: runs to the next lone quote; "" is an escaped quote.
        let value = '';
        let j = i + 1;
        for (;;) {
          const q = text.indexOf('"', j);
          if (q === -1) { value += text.slice(j); i = n; break; }
          if (text.charCodeAt(q + 1) === 34) { value += text.slice(j, q + 1); j = q + 2; continue; }
          value += text.slice(j, q);
          i = q + 1;
          break;
        }
        fields.push(value);
      } else {
        let j = i;
        while (j < n) {
          const c = text.charCodeAt(j);
          if (c === 44 || c === 10 || c === 13) break;
          j++;
        }
        fields.push(text.slice(i, j));
        i = j;
      }
      if (text.charCodeAt(i) === 44) { i++; continue; }
      if (text.charCodeAt(i) === 13) i++;
      if (text.charCodeAt(i) === 10) i++;
      break;
    }
    if (fields.length > 1 || fields[0] !== '') onRecord(fields);
  }
}

export function parseCsv(text) {
  const rows = [];
  eachRecord(text, (fields) => rows.push([...fields]));
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

// Values that repeat across rows (names, places, dates) are stored once, and
// per-checklist conversions are cached, which keeps big exports small in memory.
function memo(fn) {
  const cache = new Map();
  return (key) => {
    let v = cache.get(key);
    if (v === undefined) { v = fn(key); cache.set(key, v); }
    return v;
  };
}

export function parseEbirdExport(text) {
  const intern = memo((s) => s);
  const toDate = memo(normalizeDate);
  const toTime = memo(parseTime);
  const toProtocol = memo(normalizeProtocol);
  let idx = null;
  const rows = [];

  eachRecord(text, (r) => {
    if (!idx) { idx = mapHeaders(r); return; }
    const get = (key) => {
      const j = idx[key];
      return j === undefined ? '' : (r[j] ?? '').trim();
    };
    const date = toDate(get('date'));
    const commonName = get('commonName');
    if (!date || !commonName) return;

    let distanceMi = num(get('distanceMi'));
    if (distanceMi === null) {
      const km = num(get('distanceKm'));
      distanceMi = km === null ? null : km * KM_TO_MI;
    }
    const countRaw = get('count');
    const location = intern(get('location'));

    rows.push({
      submissionId: intern(get('submissionId')),
      commonName: intern(commonName),
      sciName: intern(get('sciName')),
      taxonOrder: num(get('taxonOrder')),
      count: countRaw.toUpperCase() === 'X' ? null : num(countRaw),
      state: intern(get('state')),
      county: intern(get('county')),
      location,
      locationId: intern(get('locationId')) || location,
      lat: num(get('lat')),
      lng: num(get('lng')),
      date: intern(date),
      startMin: toTime(get('time')),
      protocol: toProtocol(get('protocol')),
      durationMin: num(get('duration')),
      allObs: get('allObs') === '1',
      distanceMi,
      observers: num(get('observers')),
    });
  });
  if (!idx) throw new Error('That file has no observations in it.');
  if (!rows.length) throw new Error('No observations could be read from that file.');
  return rows;
}
