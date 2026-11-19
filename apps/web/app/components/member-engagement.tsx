'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  CalendarCheck,
  CalendarDays,
  FolderOpen,
  Heart,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useContent } from './content-provider';
import { useToast } from './toast';
import { useActivities } from './activity-ui';
import { SidePanel } from './editor-kit/side-panel';

export function MemberEngagement() {
  const { content, update, ready, storageError } = useContent();
  const { data: session } = useSession();
  const { push } = useToast();
  const [opportunity, setOpportunity] = useState('');
  const [panel, setPanel] = useState<null | 'step'>(null);
  const currentUser =
    content.users.find((user) => user.email === session?.user?.email) ??
    content.users.find((user) => user.role === 'member');
  const userId = currentUser?.id ?? session?.user?.id ?? 'anonymous-member';
  const opportunities = useMemo(
    () =>
      content.pages.steps
        .map((step) => ({
          name: decodeURIComponent(
            step.memberHref.split('join=')[1] ?? step.title,
          ),
          description: step.subtitle,
          href: '/next-steps',
        }))
        .filter(
          (item, index, items) =>
            items.findIndex((entry) => entry.name === item.name) === index,
        ),
    [content.pages],
  );
  const router = useRouter();
  const { live } = useActivities();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Older Next steps "appointment" links (?panel=appointment) now open
    // the Appointments page, where requests are real (Phase 4B).
    if (params.get('panel') === 'appointment') {
      router.replace('/members/appointments');
      return;
    }
    const requested = params.get('join');
    if (requested && opportunities.some((item) => item.name === requested)) {
      setOpportunity(requested);
      return;
    }
    // Older links that pointed at Home's former activity list now open the
    // Calendar page, which holds joining and bookings.
    if (
      params.get('activity') ||
      (requested && live.some((item) => item.title === requested))
    )
      router.replace(`/members/calendar?${params.toString()}#activities`);
  }, [opportunities, live, router]);
  const selected = opportunities.find((item) => item.name === opportunity);
  async function submitInterest() {
    if (!selected || !ready || storageError) return;
    const existing = content.participationApplications.some(
      (item) =>
        item.userId === userId &&
        item.opportunity === selected.name &&
        item.status !== 'declined',
    );
    if (existing) {
      push(
        'You already have an active application for this opportunity.',
        'info',
      );
      return;
    }
    const saved = await update((current) => ({
      ...current,
      participationApplications: [
        ...current.participationApplications,
        {
          id: crypto.randomUUID(),
          userId,
          opportunity: selected.name,
          status: 'submitted',
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    if (!saved) {
      push(
        'Your interest could not be saved in this browser. Please try again.',
        'error',
      );
      return;
    }
    push(
      `Interest in ${selected.name} added to this browser preview only. No application has been delivered.`,
      'info',
    );
  }
  useEffect(() => {
    if (opportunity && new URLSearchParams(window.location.search).get('join'))
      setPanel('step');
  }, [opportunity]);
  const close = () => setPanel(null);
  return (
    <div className="member-engagement">
      {storageError && (
        <p className="notice-box" role="alert">
          {storageError}
        </p>
      )}
      <nav className="member-modules" aria-label="Your church tools">
        <Link href="/members/calendar">
          <CalendarDays aria-hidden="true" size={18} />
          Calendar &amp; bookings
        </Link>
        <Link href="/members/prayer">
          <Heart aria-hidden="true" size={18} />
          Prayer
        </Link>
        <Link href="/members/appointments">
          <CalendarCheck aria-hidden="true" size={18} />
          Appointments
        </Link>
        <Link href="/members/gallery">
          <FolderOpen aria-hidden="true" size={18} />
          Gallery
        </Link>
      </nav>

      <SidePanel
        open={panel === 'step'}
        title="Take a next step"
        eyebrow="Next steps"
        onClose={close}
      >
        <div className="member-join-controls">
          <label>
            <span>Choose an opportunity</span>
            <select
              value={opportunity}
              onChange={(event) => setOpportunity(event.target.value)}
            >
              <option value="">Select a next step</option>
              {opportunities.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
          {selected && (
            <div className="member-opportunity-summary">
              <Users aria-hidden="true" />
              <span>
                <b>{selected.name}</b>
                <small>{selected.description}</small>
              </span>
              <div>
                <Link href={selected.href}>View details</Link>
                <button
                  className="button"
                  disabled={!ready || !!storageError}
                  onClick={submitInterest}
                >
                  Submit interest
                </button>
              </div>
            </div>
          )}
        </div>
      </SidePanel>
    </div>
  );
}
