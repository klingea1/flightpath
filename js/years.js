// Which year the deck opens on. A year-in-review gets made in January and
// February, when the export already holds a few days of the new year, so
// until March the default is the year that just ended.

export function reportYear(now = new Date()) {
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
}

// The year to open, given the years present in an export (newest first).
export function defaultYear(years, now = new Date()) {
  const target = reportYear(now);
  return years.includes(target) ? target : years.find((y) => y <= target) ?? years[0];
}
