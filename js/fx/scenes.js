// The sky, particles and ambient sound behind each card, from that card's own data.

const scene = (sky, particles = null, sound = 'wind') => ({ sky, particles, sound });

const NEUTRAL = scene('neutral');
const DAWN = scene('dawn', 'mist', 'chorus');
// Evening: a pair of owl eyes blinks open in the margin now and then.
const GOLDEN = scene('golden', 'eyes', 'owl');
const NIGHT = scene('night', 'stars', 'owl');

const PERSONAS = {
  dawn: DAWN,
  evening: GOLDEN,
  sitspot: scene('dusk', 'fireflies'),
  lakeshore: scene('lake', null, 'gulls'),
};

const peakOf = (values) => values.indexOf(Math.max(...values));

function clockScene(startHours) {
  const h = peakOf(startHours);
  if (h >= 4 && h < 9) return DAWN;
  if (h >= 9 && h < 17) return scene('day');
  if (h >= 17 && h < 20) return GOLDEN;
  return NIGHT;
}

const SEASONS = {
  winter: scene('winter', 'snow'),
  spring: scene('spring', 'blossoms', 'chorus'),
  summer: scene('summer', 'haze'),
  autumn: scene('autumn', 'leaves'),
};

function monthsScene(monthly) {
  if (!Math.max(...monthly)) return NEUTRAL;
  const m = peakOf(monthly);
  if (m === 11 || m < 2) return SEASONS.winter;
  if (m < 5) return SEASONS.spring;
  if (m < 8) return SEASONS.summer;
  return SEASONS.autumn;
}

const PREVIEWS = {
  dawn: DAWN, day: scene('day'), evening: GOLDEN, night: NIGHT, ...SEASONS,
  sunrise: scene('sunrise', null, 'chorus'), dusk: scene('dusk'), fireflies: PERSONAS.sitspot, lake: PERSONAS.lakeshore,
};

/** ?scene=<name> puts every card in one scene, to preview it. Unknown names: null. */
export function previewScene(name) {
  return Object.hasOwn(PREVIEWS, name ?? '') ? PREVIEWS[name] : null;
}

/** kind: the card's class without "card-" (cover, headline, clock, …). */
export function sceneFor(kind, stats, persona) {
  switch (kind) {
    case 'cover': return scene('dusk');
    case 'summary': return scene('sunrise', null, 'chorus');
    case 'clock': return clockScene(stats.startHours);
    case 'months': return monthsScene(stats.monthly);
    case 'persona': return PERSONAS[persona?.id] ?? NEUTRAL;
    default: return NEUTRAL;
  }
}
