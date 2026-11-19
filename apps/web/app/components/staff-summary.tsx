'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import type { StaffSummary as Summary } from '@grace-abounds/validation';
import { api, errorMessage } from '../lib/api-client';

/*
 * Real counts for staff on Home (Phase 4C). Each link carries the filter
 * for exactly what it counts (People ?role=member&status=, appointments
 * ?appointments=, prayers ?prayers=). Video counts are plain numbers: the
 * Sermons page has no matching filter, so they don't pretend to link to one. Member accounts exclude the fixed staff accounts. The Pastor also
 * sees prayer counts; Admin receives none (the server leaves them out) and
 * this screen never shows them for Admin. Belongs to one signed-in staff
 * identity and role: a change starts fresh and late answers are ignored.
 */
export function StaffSummary() {
  const { data: session } = useSession();
  const user = session?.user?.id ?? '';
  const role = session?.user?.role ?? '';
  if (!user || (role !== 'pastor' && role !== 'admin')) return null;
  return <SummaryFor key={`${user}:${role}`} pastor={role === 'pastor'} />;
}

type Stat = { label: string; value: number; href?: string };

function SummaryFor({ pastor }: { pastor: boolean }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const latest = useRef(0);
  useEffect(() => {
    alive.current = true;
    // Every late answer checks this flag, so it alone fences the old screen.
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    const ticket = ++latest.current;
    try {
      const data = (await api<Summary>('/staff/summary')).data;
      if (alive.current && ticket === latest.current) {
        setSummary(data);
        setError('');
      }
    } catch (failure) {
      if (alive.current && ticket === latest.current)
        setError(errorMessage(failure));
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  const care = pastor ? '/pastor/care' : '/admin/appointments';
  const stats: Stat[] = summary
    ? [
        {
          label: 'Active members',
          value: summary.members.active,
          href: '/admin/users?role=member&status=active',
        },
        {
          label: 'Suspended members',
          value: summary.members.suspended,
          href: '/admin/users?role=member&status=suspended',
        },
        {
          label: 'Published videos',
          value: summary.sermons.published,
        },
        {
          label: 'Videos awaiting approval',
          value: summary.sermons.awaitingApproval,
        },
        {
          label: 'Appointments needing a time',
          value: summary.appointments.requested,
          href: `${care}?appointments=requested`,
        },
        {
          label: 'Confirmed appointments',
          value: summary.appointments.confirmed,
          href: `${care}?appointments=upcoming`,
        },
        ...(pastor && summary.prayers
          ? [
              {
                label: 'New prayer requests',
                value: summary.prayers.submitted,
                href: '/pastor/care?prayers=submitted',
              },
              {
                label: 'Praying',
                value: summary.prayers.praying,
                href: '/pastor/care?prayers=praying',
              },
            ]
          : []),
      ]
    : [];
  return (
    <section className="staff-summary" aria-labelledby="staff-summary-title">
      <h2 id="staff-summary-title">At a glance</h2>
      {error && (
        <p className="kit-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="button button-outline"
            onClick={() => void load()}
          >
            Try again
          </button>
        </p>
      )}
      {!summary && !error && <p className="care-note">Loading…</p>}
      {summary && (
        <>
          <ul className="staff-stats">
            {stats.map((stat) => (
              <li key={stat.label}>
                {stat.href ? (
                  <Link href={stat.href}>
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </Link>
                ) : (
                  <div>
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="care-note">
            Member counts don’t include staff accounts.
          </p>
        </>
      )}
    </section>
  );
}
