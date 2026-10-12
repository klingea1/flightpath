// Picks the summary card's four highlights: the home-state year list, the
// bird of the year when there is one, then the most impressive of a few
// personal achievements. Like personas, each candidate scores how notable it
// is. Modest fallbacks fill in for lighter years, so every card has four.

import { regionName } from './places.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');

function regionsLabel(codes) {
  const countries = new Set(codes.map((c) => c.split('-')[0]));
  if (countries.size > 2 || ![...countries].every((c) => c === 'US' || c === 'CA')) {
    return { label: 'Places birded', value: `${codes.length} regions, ${countries.size} countries` };
  }
  return { label: countries.has('CA') ? 'States and provinces' : 'States', value: fmt(codes.length) };
}

export function pickHighlights(s) {
  // Skipped when it would just repeat the year's total (all one state).
  const lead = s.homeRegion && s.homeRegion.species < s.species && {
    label: `${regionName(s.homeRegion.code)} year list`,
    value: `${fmt(s.homeRegion.species)} species`,
  };

  const bird = s.birdOfYear && { label: 'Bird of the year', value: s.birdOfYear };

  const notable = [
    s.previousYearSpecies >= 20 && s.species > s.previousYearSpecies && {
      score: 1 + ((s.species - s.previousYearSpecies) / s.previousYearSpecies) * 4,
      label: `Versus ${s.year - 1}`,
      value: `+${fmt(s.species - s.previousYearSpecies)} species`,
    },
    s.bigDay && s.bigDay.species >= 20 && {
      score: s.bigDay.species / 50, label: 'Biggest day', value: `${fmt(s.bigDay.species)} species`,
    },
    s.longestStreak >= 7 && {
      score: s.longestStreak / 30, label: 'Longest streak', value: `${fmt(s.longestStreak)} days`,
    },
    !s.firstYearOnEbird && s.lifers.length >= 5 && {
      score: s.lifers.length / 40, label: 'Lifers', value: fmt(s.lifers.length),
    },
    s.regions.length >= 2 && { score: s.regions.length / 4, ...regionsLabel(s.regions) },
  ].filter(Boolean).sort((a, b) => b.score - a.score);

  const fallbacks = [
    s.bigDay && { label: 'Biggest day', value: `${fmt(s.bigDay.species)} species` },
    { label: 'Days afield', value: fmt(s.daysAfield) },
    { label: 'Places birded', value: fmt(s.locations) },
    { label: 'Counties birded', value: fmt(s.counties) },
    s.longestStreak >= 2 && { label: 'Longest streak', value: `${fmt(s.longestStreak)} days` },
  ].filter(Boolean);

  const picked = [lead, bird].filter(Boolean);
  for (const h of [...notable, ...fallbacks]) {
    if (picked.length >= 4) break;
    if (!picked.some((p) => p.label === h.label)) picked.push({ label: h.label, value: h.value });
  }
  return picked;
}
