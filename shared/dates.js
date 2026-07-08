/**
 * Local-calendar date helpers.
 *
 * Timestamps are stored as UTC ISO strings (toISOString), but a restaurant's
 * "today" is its LOCAL day. Comparing a UTC date-prefix against "today"
 * shifts every report by the timezone offset (in IST, "Today" would cover
 * yesterday 05:30 → today 05:30). Always reduce timestamps to local days
 * with these helpers before comparing.
 */

export function localDayStr(input) {
  // Date-only strings (e.g. reservation dates) are already calendar days
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocalStr() {
  return localDayStr(new Date());
}
