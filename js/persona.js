// Picks a birding persona from a year's stats.
// Each persona scores how far past its threshold the birder is (1 = just
// qualifies). The highest score wins; if nothing reaches 1, the birder is a
// Generalist. Thresholds are first guesses, meant to be tuned on real exports.

const pct = (x) => `${Math.round(x * 100)}%`;

export const PERSONAS = [
  {
    id: 'patch',
    name: 'Patch Loyalist',
    score: (s) => (s.topLocation ? s.topLocation.share / 0.5 : 0),
    blurb: (s) => `You know every bush at ${s.topLocation.name} by name.`,
    evidence: (s) => `${pct(s.topLocation.share)} of your checklists came from one spot`,
  },
  {
    id: 'lakeshore',
    name: 'Lakeshore Pilgrim',
    score: (s) => s.shares.lakeshore / 0.15,
    blurb: () => 'When the winds turn, you point the car west toward Lake Michigan.',
    evidence: (s) => `${pct(s.shares.lakeshore)} of your checklists were on the big lake`,
  },
  {
    id: 'dawn',
    name: 'Dawn Chorus Chaser',
    score: (s) => s.shares.dawn / 0.4,
    blurb: () => 'Coffee in one hand, binoculars in the other, before the sun clears the trees.',
    evidence: (s) => `${pct(s.shares.dawn)} of your checklists started before 8 AM`,
  },
  {
    id: 'evening',
    name: 'Golden Hour Birder',
    score: (s) => s.shares.evening / 0.35,
    blurb: () => 'You bird the long light, when the woodcocks start to peent.',
    evidence: (s) => `${pct(s.shares.evening)} of your checklists started after 5 PM`,
  },
  {
    id: 'lunch',
    name: 'Lunch Break Birder',
    score: (s) => s.shares.midday / 0.4,
    blurb: () => 'Forty-five minutes, one sandwich, and whatever is singing.',
    evidence: (s) => `${pct(s.shares.midday)} of your checklists started between 11 and 2`,
  },
  {
    id: 'sitspot',
    name: 'Sit-Spot Sage',
    score: (s) => s.shares.stationary / 0.6,
    blurb: () => 'You let the birds come to you.',
    evidence: (s) => `${pct(s.shares.stationary)} of your checklists were stationary counts`,
  },
  {
    id: 'trail',
    name: 'Trail Pounder',
    score: (s) => (s.shares.traveling >= 0.3 ? s.avgTravelMiles / 2.5 : 0),
    blurb: (s) => `${Math.round(s.miles)} miles of trail, one checklist at a time.`,
    evidence: (s) => `Your average walk covered ${s.avgTravelMiles.toFixed(1)} miles`,
  },
  {
    id: 'hopper',
    name: 'Hotspot Hopper',
    score: (s) => (s.locations >= 10 ? s.shares.singleVisit / 0.5 : 0),
    blurb: () => 'Why bird one place when there are a hundred more on the map?',
    evidence: (s) => `${s.locations} different locations this year`,
  },
  {
    id: 'streak',
    name: 'Daily Devotee',
    score: (s) => s.longestStreak / 7,
    blurb: () => "Rain, wind, or Monday, you didn't skip a day.",
    evidence: (s) => `A ${s.longestStreak}-day checklist streak`,
  },
];

const GENERALIST = {
  id: 'generalist',
  name: 'The Generalist',
  blurb: () => 'Any hour, any habitat. You bird however the day allows.',
};

const FLEDGLING = {
  id: 'fledgling',
  name: 'Fledgling',
  blurb: () => 'A few checklists in and already hooked. Next year is yours.',
};

export function pickPersona(stats) {
  if (stats.checklists < 5) {
    return { ...FLEDGLING, blurb: FLEDGLING.blurb(stats), evidence: [] };
  }
  const ranked = PERSONAS.map((p) => ({ p, score: p.score(stats) }))
    .filter((x) => Number.isFinite(x.score) && x.score > 0)
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0] && ranked[0].score >= 1 ? ranked[0].p : null;
  // The strongest traits back up the label, even for a Generalist.
  const evidence = ranked.slice(0, 3).map((x) => x.p.evidence(stats));
  const base = winner || GENERALIST;
  return { id: base.id, name: base.name, blurb: base.blurb(stats), evidence };
}
