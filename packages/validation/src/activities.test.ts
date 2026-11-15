import { describe, expect, it } from 'vitest';
import {
  activityExceptionInputSchema,
  activityInput,
  activityInputSchema,
  defaultActivities,
  defaultActivityExceptions,
  isRealDate,
  nzLocalToUtc,
  nzNow,
  occurrences,
  type ActivityInput,
} from './index.ts';

/*
 * Phase 3A: the saved activity rules shared by the API and the editor, and
 * the explicit New Zealand local-time conversion.
 */

const base = (): ActivityInput => ({
  kind: 'event',
  title: 'Community lunch',
  summary: '',
  leader: '',
  tag: '',
  locationId: 'manukau',
  venue: '',
  image: '',
  schedule: {
    repeat: 'once',
    date: '2026-12-06',
    until: '',
    days: [],
    monthWeek: 1,
    monthDay: 0,
    startTime: '12:00',
    endTime: '14:00',
  },
  joinMode: 'booking',
  capacity: 80,
  status: 'draft',
  publishAt: '',
});
const errors = (input: unknown) => {
  const result = activityInputSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join('.'),
          issue.message,
        ]),
      );
};
const withSchedule = (patch: Partial<ActivityInput['schedule']>) => {
  const input = base();
  return { ...input, schedule: { ...input.schedule, ...patch } };
};

describe('activity rules', () => {
  it('accepts every activity in the existing church schedule', () => {
    for (const activity of defaultActivities)
      expect(errors(activityInput(activity))).toEqual({});
    expect(defaultActivities.length).toBe(24);
    expect(defaultActivityExceptions.length).toBe(3);
  });

  it('needs real dates and times, with the end after the start', () => {
    expect(errors(withSchedule({ date: '2026-02-30' }))).toHaveProperty([
      'schedule.date',
    ]);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2027-02-29')).toBe(false);
    expect(errors(withSchedule({ startTime: '' }))).toHaveProperty([
      'schedule.startTime',
    ]);
    expect(errors(withSchedule({ endTime: '11:00' }))).toEqual({
      'schedule.endTime': 'The end time must be after the start time.',
    });
    expect(
      errors(withSchedule({ repeat: 'weekly', until: '2026-12-01' })),
    ).toHaveProperty(['schedule.until']);
  });

  it('refuses times in the daylight-saving hour (2:00–3:00am)', () => {
    expect(
      errors(withSchedule({ startTime: '02:30', endTime: '04:00' })),
    ).toHaveProperty(['schedule.startTime']);
    expect(
      errors(withSchedule({ startTime: '01:00', endTime: '02:00' })),
    ).toHaveProperty(['schedule.endTime']);
    expect(
      errors(withSchedule({ startTime: '01:00', endTime: '03:00' })),
    ).toEqual({});
    expect(
      activityExceptionInputSchema.safeParse({
        kind: 'changed',
        note: '',
        startTime: '02:15',
        endTime: '',
        venue: '',
      }).success,
    ).toBe(false);
  });

  it('needs weekdays for weekly repeats, and places only with sign-up', () => {
    expect(errors(withSchedule({ repeat: 'weekly', days: [] }))).toHaveProperty(
      ['schedule.days'],
    );
    expect(
      errors({ ...base(), joinMode: 'none', capacity: 10 }),
    ).toHaveProperty(['capacity']);
    expect(errors({ ...base(), joinMode: 'none', capacity: null })).toEqual({});
    expect(errors({ ...base(), capacity: 0 })).toHaveProperty(['capacity']);
  });

  it('allows a release time only on a published activity', () => {
    expect(errors({ ...base(), publishAt: '2026-12-01T09:00' })).toHaveProperty(
      ['publishAt'],
    );
    expect(
      errors({ ...base(), status: 'published', publishAt: '2026-12-01T09:00' }),
    ).toEqual({});
    expect(
      errors({ ...base(), status: 'published', publishAt: '2026-12-01' }),
    ).toHaveProperty(['publishAt']);
  });

  it('a changed date must change something', () => {
    expect(
      activityExceptionInputSchema.safeParse({
        kind: 'changed',
        note: '',
        startTime: '',
        endTime: '',
        venue: '',
      }).success,
    ).toBe(false);
    expect(
      activityExceptionInputSchema.safeParse({
        kind: 'cancelled',
        note: '',
        startTime: '',
        endTime: '',
        venue: '',
      }).success,
    ).toBe(true);
  });
});

describe('New Zealand local time', () => {
  it('converts local times to UTC with the right offset either side of daylight saving', () => {
    // NZDT (+13) in summer, NZST (+12) in winter.
    expect(nzLocalToUtc('2026-12-01', '09:00').toISOString()).toBe(
      '2026-11-30T20:00:00.000Z',
    );
    expect(nzLocalToUtc('2026-07-01', '10:00').toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    );
    // The days the clocks change (5 April and 27 September 2026).
    expect(nzLocalToUtc('2026-04-05', '10:00').toISOString()).toBe(
      '2026-04-04T22:00:00.000Z',
    );
    expect(nzLocalToUtc('2026-09-27', '10:00').toISOString()).toBe(
      '2026-09-26T21:00:00.000Z',
    );
    expect(nzNow(nzLocalToUtc('2026-09-27', '10:00')).stamp).toBe(
      '2026-09-27T10:00',
    );
  });

  it('keeps occurrence identity as activity + original date when a date changes', () => {
    const service = defaultActivities.find(
      (item) => item.id === 'service-manukau-sunday-service',
    )!;
    const [changed] = occurrences(
      [service],
      defaultActivityExceptions,
      '2026-12-27',
      '2026-12-27',
    );
    expect(changed).toMatchObject({
      key: 'service-manukau-sunday-service:2026-12-27',
      date: '2026-12-27',
      startTime: '10:30',
      changed: true,
    });
  });
});
