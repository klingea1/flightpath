// The sky, particles and ambient sound behind each card, from that card's own data.

const scene = (sky, particles = null, sound = 'wind') => ({ sky, particles, sound });

const NEUTRAL = scene('neutral');
const DAWN = scene('dawn', 'mist', 'chorus');
const GOLDEN = scene('golden');

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
  return scene('night', 'stars', 'owl');
}

function monthsScene(monthly) {
  if (!Math.max(...monthly)) return NEUTRAL;
  const m = peakOf(monthly);
  if (m === 11 || m < 2) return scene('winter', 'snow');
  if (m < 5) return scene('spring', 'blossoms', 'chorus');
  if (m < 8) return scene('summer', 'haze');
  return scene('autumn', 'leaves');
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
