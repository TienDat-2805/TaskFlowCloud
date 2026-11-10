import { describe, expect, it } from 'vitest';
import { deadlinePayload, deadlineValues, parseDeadlineDate } from '../lib/workflow';
import type { Task } from '../types';

describe('keyboard deadline input', () => {
  it.each([
    ['25/12/2026', '2026-12-25'],
    ['1/2/2028', '2028-02-01'],
    ['29/02/2028', '2028-02-29'],
  ])('converts %s to the API calendar date', (input, expected) => {
    expect(parseDeadlineDate(input)).toBe(expected);
  });

  it.each(['31/04/2026', '29/02/2027', '00/12/2026', '25/13/2026', '25/12/', ''])(
    'rejects invalid or incomplete date %s',
    (input) => {
      expect(() => parseDeadlineDate(input)).toThrow();
    },
  );

  it('keeps date-only deadlines in the selected timezone', () => {
    expect(
      deadlinePayload({
        ...deadlineValues(),
        mode: 'date',
        date: '29/02/2028',
        timeZone: 'America/New_York',
      }),
    ).toEqual({ mode: 'date', date: '2028-02-29', timeZone: 'America/New_York' });
  });

  it.each(['24:00', '12:60', '17:', '', '03:00 CH'])(
    'rejects invalid or incomplete time %s',
    (time) => {
      expect(() =>
        deadlinePayload({ ...deadlineValues(), mode: 'datetime', date: '25/12/2026', time }),
      ).toThrow(/HH:mm/);
    },
  );

  it.each(['00:00', '23:59', '9:05'])('saves and reopens the local time %s', (time) => {
    const due = deadlinePayload({
      ...deadlineValues(),
      mode: 'datetime',
      date: '29/02/2028',
      time,
    });
    expect(due.mode).toBe('datetime');
    const reopened = deadlineValues({
      dueMode: 'datetime',
      dueAt: due.mode === 'datetime' ? due.at : null,
    } as Task);
    expect(reopened.date).toBe('29/02/2028');
    expect(reopened.time).toBe(time.padStart(5, '0'));
  });
});
