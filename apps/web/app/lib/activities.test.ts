import { describe, expect, it } from 'vitest';
import {
  blankActivity,
  isLive,
  nzNow,
  occurrences,
  scheduleDates,
  spotsLeft,
  toIcs,
  type ActivityException,
  type Participation,
} from './activities';
function fixture() {
  const activity = blankActivity('service');
  return {
    ...activity,
    id: 'test-service',
    title: 'Test gathering',
    status: 'published' as const,
    capacity: 1,
    schedule: {
      ...activity.schedule,
      date: '2026-11-01',
      repeat: 'weekly' as const,
      days: [0],
      startTime: '10:00',
      endTime: '11:30',
    },
  };
}
describe('activity calendar and participation', () => {
  it('keeps weekly NZ wall-clock services at 10am across daylight saving', () => {
    const activity = fixture();
    activity.schedule.date = '2026-09-20';
    const dates = occurrences([activity], [], '2026-09-20', '2026-10-04');
    expect(dates.map((item) => [item.date, item.startTime])).toEqual([
      ['2026-09-20', '10:00'],
      ['2026-09-27', '10:00'],
      ['2026-10-04', '10:00'],
    ]);
    expect(nzNow(new Date('2026-09-19T22:00:00Z')).time).toBe('10:00');
    expect(nzNow(new Date('2026-10-03T21:00:00Z')).time).toBe('10:00');
  });
  it('applies per-date cancellations and changes without changing other dates', () => {
    const activity = fixture();
    const exceptions: ActivityException[] = [
      {
        id: 'x',
        activityId: activity.id,
        date: '2026-11-08',
        kind: 'cancelled',
        note: 'Closed',
        startTime: '',
        endTime: '',
        venue: '',
      },
      {
        id: 'y',
        activityId: activity.id,
        date: '2026-11-15',
        kind: 'changed',
        note: 'Later',
        startTime: '11:00',
        endTime: '12:30',
        venue: 'Hall B',
      },
    ];
    const dates = occurrences(
      [activity],
      exceptions,
      '2026-11-01',
      '2026-11-15',
    );
    expect(
      dates.map((item) => [item.date, item.cancelled, item.startTime]),
    ).toEqual([
      ['2026-11-01', false, '10:00'],
      ['2026-11-08', true, '10:00'],
      ['2026-11-15', false, '11:00'],
    ]);
    expect(dates[2]?.venue).toBe('Hall B');
  });
  it('anchors fortnightly and last-week monthly schedules correctly', () => {
    const schedule = fixture().schedule;
    expect(
      scheduleDates(
        { ...schedule, repeat: 'fortnightly' },
        '2026-11-01',
        '2026-11-30',
      ),
    ).toEqual(['2026-11-01', '2026-11-15', '2026-11-29']);
    expect(
      scheduleDates(
        { ...schedule, repeat: 'monthly', monthWeek: -1, monthDay: 0 },
        '2026-11-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-11-29', '2026-12-27']);
  });
  it('counts booking capacity separately for each occurrence', () => {
    const activity = fixture();
    const people: Participation[] = [
      {
        id: 'p',
        activityId: activity.id,
        userId: 'u',
        date: '2026-11-08',
        createdAt: '2026-11-01T00:00:00Z',
      },
    ];
    expect(spotsLeft(activity, people, '2026-11-08')).toBe(0);
    expect(spotsLeft(activity, people, '2026-11-15')).toBe(1);
  });
  it('releases a scheduled activity only after its NZ release time', () => {
    const activity = {
      ...fixture(),
      status: 'scheduled' as const,
      publishAt: '2026-11-10T09:00',
    };
    expect(isLive(activity, '2026-11-10T08:59')).toBe(false);
    expect(isLive(activity, '2026-11-10T09:00')).toBe(true);
  });
  it('exports an occurrence with its changed time', () => {
    const activity = fixture();
    const exceptions: ActivityException[] = [
      {
        id: 'x',
        activityId: activity.id,
        date: '2026-11-08',
        kind: 'changed',
        startTime: '11:00',
        endTime: '12:00',
        venue: 'Hall B',
        note: '',
      },
    ];
    const ics = toIcs(activity, {
      exceptions,
      date: '2026-11-08',
      location: 'Hall B',
    });
    expect(ics).toContain('DTSTART;TZID=Pacific/Auckland:20261108T110000');
    expect(ics).not.toContain('RRULE:FREQ=WEEKLY;BYDAY=SU');
    expect(ics).toContain('LOCATION:Hall B');
  });
});

describe('calendar export semantics (Phase 3C)', () => {
  const exceptions = (activityId: string): ActivityException[] => [
    {
      id: 'cancel',
      activityId,
      date: '2026-11-15',
      kind: 'cancelled',
      startTime: '',
      endTime: '',
      venue: '',
      note: 'Combined service',
    },
    {
      id: 'change',
      activityId,
      date: '2026-11-22',
      kind: 'changed',
      startTime: '11:00',
      endTime: '',
      venue: 'Hall B',
      note: 'Later start',
    },
  ];

  it('a series has one UID, excluded and overridden dates, and a sequence', () => {
    const activity = fixture();
    const ics = toIcs(activity, {
      exceptions: exceptions(activity.id),
      location: 'Main hall',
      placeFor: (venue) => `${venue}, Manukau`,
      sequence: 7,
      stamp: new Date('2026-11-01T00:00:00Z'),
    });
    const uid = `UID:${activity.id}@graceaboundsnz.org`;
    expect(ics.split(uid).length - 1).toBe(2); // series + one override
    expect(ics).toContain('EXDATE;TZID=Pacific/Auckland:20261115T100000');
    expect(ics).toContain(
      'RECURRENCE-ID;TZID=Pacific/Auckland:20261122T100000',
    );
    expect(ics).toContain('DTSTART;TZID=Pacific/Auckland:20261122T110000');
    expect(ics).toContain('LOCATION:Hall B\\, Manukau');
    expect(ics).toContain('Later start');
    expect(ics.match(/SEQUENCE:7/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('a one-off applies its own change or cancellation without a date', () => {
    const activity = {
      ...fixture(),
      schedule: { ...fixture().schedule, repeat: 'once' as const },
    };
    const changed: ActivityException[] = [
      {
        id: 'change',
        activityId: activity.id,
        date: '2026-11-01',
        kind: 'changed',
        startTime: '11:00',
        endTime: '12:30',
        venue: 'Hall B',
        note: 'Moved to the hall',
      },
    ];
    const moved = toIcs(activity, {
      exceptions: changed,
      location: 'Main hall',
      placeFor: (venue) => venue,
      sequence: 3,
    });
    expect(moved).toContain('DTSTART;TZID=Pacific/Auckland:20261101T110000');
    expect(moved).toContain('DTEND;TZID=Pacific/Auckland:20261101T123000');
    expect(moved).toContain('LOCATION:Hall B');
    expect(moved).toContain('Moved to the hall');
    expect(moved).toContain(`UID:${activity.id}@graceaboundsnz.org`);
    expect(moved).toContain('SEQUENCE:3');
    // The time zone block has its own yearly rules; the event has none.
    expect(moved.slice(moved.indexOf('BEGIN:VEVENT'))).not.toContain('RRULE');
    expect(moved.match(/BEGIN:VEVENT/g)).toHaveLength(1);

    const cancelled = toIcs(activity, {
      exceptions: [
        {
          ...changed[0]!,
          kind: 'cancelled',
          startTime: '',
          endTime: '',
          venue: '',
        },
      ],
      location: 'Main hall',
    });
    expect(cancelled).toContain('STATUS:CANCELLED');
    expect(cancelled).toContain(`UID:${activity.id}@graceaboundsnz.org`);
  });

  it('one cancelled date is exported as cancelled', () => {
    const activity = fixture();
    const ics = toIcs(activity, {
      exceptions: exceptions(activity.id),
      location: 'Main hall',
      date: '2026-11-15',
    });
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain(`UID:${activity.id}-2026-11-15@graceaboundsnz.org`);
  });
});
