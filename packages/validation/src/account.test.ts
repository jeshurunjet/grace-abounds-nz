import { describe, expect, it } from 'vitest';
import {
  auditCutoff,
  auditEligibleFrom,
  nzYear,
  reviewDateAllowed,
} from './account.ts';

/*
 * Phase 5C: activity (audit/security) records follow calendar-year
 * retention in New Zealand time. A record is kept for the year it was made
 * in and the whole next year, eligible from 00:00 NZ on 1 January after
 * that: at least one year and one minute (a record from 23:59 on 31
 * December), at most two years (00:00 on 1 January), never removed days
 * later just because a year ended.
 */

const iso = (value: Date) => value.toISOString();

describe('calendar-year activity retention', () => {
  it('a record from the last minute of a year is kept one year and one minute', () => {
    // 31 Dec 2025 23:59 NZDT (UTC+13).
    const late = new Date('2025-12-31T10:59:00.000Z');
    expect(nzYear(late)).toBe(2025);
    // Eligible 1 Jan 2027 00:00 NZDT = 31 Dec 2026 11:00 UTC.
    expect(iso(auditEligibleFrom(late))).toBe('2026-12-31T11:00:00.000Z');
    const kept = auditEligibleFrom(late).getTime() - late.getTime();
    expect(kept).toBe(365 * 86_400_000 + 60_000);
  });

  it('one minute later is the next year (NZ, not UTC, decides the year)', () => {
    // 1 Jan 2026 00:00 NZDT, still 31 December in UTC.
    const early = new Date('2025-12-31T11:00:00.000Z');
    expect(nzYear(early)).toBe(2026);
    expect(iso(auditEligibleFrom(early))).toBe('2027-12-31T11:00:00.000Z');
    // The longest keep: exactly two calendar years (2026 and 2027).
    expect(auditEligibleFrom(early).getTime() - early.getTime()).toBe(
      730 * 86_400_000,
    );
  });

  it('the cutoff moves only at New Zealand midnight on 1 January', () => {
    // 31 Dec 2026 23:59:59 NZDT: still 2026, so only 2024 and earlier.
    expect(iso(auditCutoff(new Date('2026-12-31T10:59:59.000Z')))).toBe(
      '2024-12-31T11:00:00.000Z',
    );
    // 1 Jan 2027 00:00 NZDT: records from 2025 become eligible.
    expect(iso(auditCutoff(new Date('2026-12-31T11:00:00.000Z')))).toBe(
      '2025-12-31T11:00:00.000Z',
    );
    // Mid-year, in winter time (NZST, UTC+12): unchanged rule.
    expect(iso(auditCutoff(new Date('2026-06-30T11:59:59.000Z')))).toBe(
      '2024-12-31T11:00:00.000Z',
    );
  });

  it('records made around daylight saving changes fall in the right year', () => {
    // 5 Apr 2026 02:30 NZST (after clocks went back) and 27 Sep 2026 03:30
    // NZDT (after clocks went forward): both 2026.
    expect(nzYear(new Date('2026-04-04T14:30:00.000Z'))).toBe(2026);
    expect(nzYear(new Date('2026-09-26T14:30:00.000Z'))).toBe(2026);
    expect(iso(auditEligibleFrom(new Date('2026-09-26T14:30:00.000Z')))).toBe(
      '2027-12-31T11:00:00.000Z',
    );
  });
});

describe('records hold review dates', () => {
  it('must be after today and at most a year ahead (NZ dates)', () => {
    const now = new Date('2026-11-21T00:00:00.000Z'); // 21 Nov 2026 13:00 NZDT
    expect(reviewDateAllowed('2026-11-21', now)).toBe(false);
    expect(reviewDateAllowed('2026-11-22', now)).toBe(true);
    expect(reviewDateAllowed('2027-11-21', now)).toBe(true);
    expect(reviewDateAllowed('2027-11-22', now)).toBe(false);
  });
});
