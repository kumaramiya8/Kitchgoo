// Shared attendance helpers — used by the Attendance page, the Reports
// Attendance tab, and the Dashboard calendar so they all agree on how
// raw IN/OUT punches turn into sessions, hours, and per-day presence.

// ── Geofence distance (metres) ──────────────────────────────
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Date helpers (local business day) ───────────────────────
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
}
export function recordDay(a) {
  return a.date || (a.timestamp || a.time || '').slice(0, 10);
}
export function recordTs(a) {
  return a.timestamp || a.time || a.createdAt;
}

// ── Formatting ──────────────────────────────────────────────
export function fmtTime(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Sessions ────────────────────────────────────────────────
// Pair a chronological list of punches into { in, out } sessions.
export function pairSessions(logs) {
  const sorted = [...logs].sort((a, b) => new Date(recordTs(a)) - new Date(recordTs(b)));
  const sessions = [];
  let openIn = null;
  sorted.forEach(log => {
    if (log.type === 'IN') {
      if (openIn) sessions.push({ in: openIn, out: null }); // consecutive INs
      openIn = log;
    } else if (log.type === 'OUT') {
      sessions.push({ in: openIn, out: log });
      openIn = null;
    }
  });
  if (openIn) sessions.push({ in: openIn, out: null });
  return sessions;
}

// Total worked hours for a set of punches (only closed sessions count).
export function totalHours(logs) {
  let ms = 0;
  pairSessions(logs).forEach(s => {
    if (s.in && s.out) ms += new Date(recordTs(s.out)) - new Date(recordTs(s.in));
  });
  return ms / 36e5;
}

// Is the staff currently clocked in (last punch is an IN)?
export function isClockedIn(logs) {
  if (!logs.length) return false;
  const sorted = [...logs].sort((a, b) => new Date(recordTs(a)) - new Date(recordTs(b)));
  return sorted[sorted.length - 1].type === 'IN';
}

// Set of yyyy-mm-dd strings on which any punch happened.
export function activeDays(logs) {
  const set = new Set();
  logs.forEach(l => { const d = recordDay(l); if (d) set.add(d); });
  return set;
}

// Build a month grid (array of weeks; each week is 7 cells, null = padding).
export function monthGrid(year, month /* 0-indexed */) {
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
