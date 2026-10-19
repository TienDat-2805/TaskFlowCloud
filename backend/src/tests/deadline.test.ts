import { describe, expect, it } from 'vitest';
import { dayBounds, dueBucket, dueSchema, normalizeDue } from '../modules/tasks/deadline.js';

describe('calendar deadlines and timezone boundaries', () => {
  it.each([
    ['2026-10-25', 'Asia/Ho_Chi_Minh', '2026-10-25T16:59:59.999Z'],
    ['2026-03-08', 'America/New_York', '2026-03-09T03:59:59.999Z'],
    ['2026-11-01', 'America/New_York', '2026-11-02T04:59:59.999Z'],
    ['2026-10-25', 'UTC', '2026-10-25T23:59:59.999Z'],
  ])('normalizes %s in %s to the actual end of that day', (date, timeZone, iso) => {
    const result = normalizeDue(dueSchema.parse({ mode: 'date', date, timeZone }));
    expect(result.dueAt?.toISOString()).toBe(iso);
    expect(result).toMatchObject({ dueMode: 'date', dueDate: date, dueTimeZone: timeZone });
  });

  it('rejects invalid zones, invalid dates and a calendar day skipped by a timezone', () => {
    for (const [date, timeZone] of [
      ['2026-02-30', 'UTC'],
      ['2026-10-25', 'Invalid/Zone'],
      ['2011-12-30', 'Pacific/Apia'],
    ])
      expect(dueSchema.safeParse({ mode: 'date', date, timeZone }).success).toBe(false);
  });

  it('preserves an explicit instant and requires a timezone offset', () => {
    const due = normalizeDue(
      dueSchema.parse({ mode: 'datetime', at: '2026-10-25T15:00:00+07:00' }),
    );
    expect(due.dueAt?.toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(dueSchema.safeParse({ mode: 'datetime', at: '2026-10-25T15:00:00' }).success).toBe(
      false,
    );
  });

  it('uses calendar days across DST rather than adding 24-hour durations', () => {
    const spring = dayBounds(new Date('2026-03-08T05:00:00Z'), 'America/New_York');
    const fall = dayBounds(new Date('2026-11-01T04:00:00Z'), 'America/New_York');
    expect(spring.tomorrow.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(fall.tomorrow.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(spring.upcomingEnd.toISOString()).toBe('2026-03-16T04:00:00.000Z');
  });

  it('assigns each boundary instant exactly one bucket', () => {
    const now = new Date('2026-10-25T05:00:00Z');
    const bucket = (iso: string | null, status = 'pending') =>
      dueBucket({ status, dueAt: iso ? new Date(iso) : null }, now, 'Asia/Ho_Chi_Minh');
    expect(bucket('2026-10-25T04:59:59.999Z')).toBe('overdue');
    expect(bucket(now.toISOString())).toBe('today');
    expect(bucket('2026-10-25T16:59:59.999Z')).toBe('today');
    expect(bucket('2026-10-25T17:00:00.000Z')).toBe('upcoming');
    expect(bucket('2026-11-01T16:59:59.999Z')).toBe('upcoming');
    expect(bucket('2026-11-01T17:00:00.000Z')).toBe('later');
    expect(bucket(null)).toBe('no_due');
    expect(bucket('2020-01-01T00:00:00Z', 'completed')).toBe('completed');
  });
});
