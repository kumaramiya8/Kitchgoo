import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthGrid, recordDay, recordTs, localDay, totalHours } from '../lib/attendance';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Month calendar highlighting days with attendance activity.
 *
 * props:
 *  - attendance: raw punch records [{ staffId, type, timestamp, date }]
 *  - staffId: optional — scope to a single staff member; omit for all staff
 *  - compact: smaller cells (dashboard)
 */
const AttendanceCalendar = ({ attendance = [], staffId = null, compact = false }) => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const today = localDay(now);

  const scoped = useMemo(
    () => (staffId ? attendance.filter(a => a.staffId === staffId) : attendance),
    [attendance, staffId],
  );

  // Per-day summary for the visible month: distinct staff present + hours.
  const byDay = useMemo(() => {
    const map = {};
    scoped.forEach(a => {
      const d = recordDay(a);
      if (!d || !d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) return;
      if (!map[d]) map[d] = { punches: [], staff: new Set() };
      map[d].punches.push(a);
      map[d].staff.add(a.staffId);
    });
    Object.values(map).forEach(v => { v.hours = totalHours(v.punches); });
    return map;
  }, [scoped, year, month]);

  const weeks = useMemo(() => monthGrid(year, month), [year, month]);

  const prev = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const next = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const cell = compact ? 30 : 38;
  const gap = compact ? 3 : 5;

  const activeDaysCount = Object.keys(byDay).length;

  return (
    <div>
      {/* Month switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prev} className="icon-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 8, display: 'inline-flex' }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {MONTHS[month]} {year}
        </div>
        <button onClick={next} className="icon-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 8, display: 'inline-flex' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap, marginBottom: gap }}>
        {DOW.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>

      {/* Weeks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap }}>
            {week.map((day, di) => {
              if (day === null) return <div key={di} style={{ height: cell }} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const info = byDay[dateStr];
              const isToday = dateStr === today;
              const has = !!info;
              const count = info ? info.staff.size : 0;
              // Intensity by number present (single-staff view: just presence)
              const intensity = !has ? 0 : staffId ? 1 : Math.min(count / 5, 1);
              const bg = has
                ? `rgba(30,94,74,${0.15 + intensity * 0.55})`
                : 'var(--border-subtle)';
              const color = has && intensity > 0.4 ? 'white' : 'var(--text-secondary)';
              return (
                <div
                  key={di}
                  title={has ? `${count} present · ${info.hours.toFixed(1)}h` : 'No attendance'}
                  style={{
                    height: cell, borderRadius: 8, background: bg, color,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    fontSize: compact ? '0.7rem' : '0.78rem', fontWeight: isToday ? 800 : 500,
                    border: isToday ? '2px solid var(--primary)' : '1px solid transparent',
                    position: 'relative', cursor: has ? 'default' : 'default',
                  }}
                >
                  {day}
                  {has && !staffId && (
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, lineHeight: 1 }}>{count}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        <span>{activeDaysCount} active {activeDaysCount === 1 ? 'day' : 'days'} this month</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          Less
          {[0.15, 0.35, 0.55, 0.75].map((o, i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: 3, background: `rgba(30,94,74,${o})`, display: 'inline-block' }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
};

export default AttendanceCalendar;
