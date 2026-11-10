import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blankActivity } from '../lib/activities';
import { useActivities } from './activity-ui';

const fixture = vi.hoisted(() => ({ content: {} }));
vi.mock('./content-provider', () => ({
  useContent: () => fixture,
}));

afterEach(() => vi.useRealTimers());

describe('useActivities scheduled releases', () => {
  it('makes a scheduled activity live without a content edit or page reload', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T19:59:50Z'));
    const activity = {
      ...blankActivity('event'),
      status: 'scheduled',
      publishAt: '2026-11-10T09:00',
    };
    fixture.content = {
      activities: [activity],
      pages: { locations: [] },
      activityExceptions: [],
      participations: [],
    };
    const { result } = renderHook(() => useActivities());
    expect(result.current.live).toHaveLength(0);
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.live).toEqual([activity]);
  });
});
