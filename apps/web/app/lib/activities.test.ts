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
