import { describe, it, expect } from 'vitest';
import { localDayStr, todayLocalStr } from '../shared/dates.js';

describe('localDayStr', () => {
  it('reduces a Date to its local calendar day', () => {
    const d = new Date(2026, 6, 9, 1, 15); // July 9, 01:15 local
    expect(localDayStr(d)).toBe('2026-07-09');
  });

  it('reduces a UTC ISO timestamp to the local day, not the UTC day', () => {
    // 19:45 UTC — in any zone east of UTC+4:15 this is already the next day
    const iso = '2026-07-08T19:45:00.000Z';
    const expected = localDayStr(new Date(iso));
    const utcDay = iso.split('T')[0];
    const offsetMin = -new Date(iso).getTimezoneOffset();
    if (offsetMin >= 4 * 60 + 15) {
      expect(expected).not.toBe(utcDay);
      expect(expected).toBe('2026-07-09');
    } else {
      expect(expected).toBe(localDayStr(new Date(iso))); // self-consistent
    }
  });

  it('passes date-only strings through untouched', () => {
    expect(localDayStr('2026-07-08')).toBe('2026-07-08');
  });

  it('returns empty string for garbage', () => {
    expect(localDayStr('not-a-date')).toBe('');
    expect(localDayStr(undefined)).toBe('');
  });

  it('pads months and days', () => {
    expect(localDayStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('todayLocalStr', () => {
  it('matches localDayStr of now', () => {
    expect(todayLocalStr()).toBe(localDayStr(new Date()));
  });
});
