'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { CalendarCheck, Footprints, Heart, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useContent } from './content-provider';
import { useToast } from './toast';
import { MemberActivities } from './member-activities';
import { SidePanel } from './editor-kit/side-panel';

export function MemberEngagement() {
  const { content, update, ready, storageError } = useContent();
  const { data: session } = useSession();
  const { push } = useToast();
  const [prayer, setPrayer] = useState('');
  const [prayerSent, setPrayerSent] = useState(false);
  const [opportunity, setOpportunity] = useState('');
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
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('join');
    if (requested && opportunities.some((item) => item.name === requested))
      setOpportunity(requested);
  }, [opportunities]);
  const selected = opportunities.find((item) => item.name === opportunity);
  async function requestAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || storageError) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await update((current) => ({
      ...current,
      appointmentRequests: [
        ...current.appointmentRequests,
        {
          id: crypto.randomUUID(),
          userId,
          type: String(data.get('type')),
          preferredDate: String(data.get('date')),
          message: String(data.get('message') ?? ''),
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    if (!saved) {
      push(
        'This could not be saved in this browser. Your entry is still here — please try again.',
        'error',
      );
      return;
    }
    form.reset();
    setAppointmentDirty(false);
    setPanel(null);
    push(
      'Appointment added to this browser preview only. It has not been delivered.',
      'info',
    );
  }
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
  async function submitPrayer() {
    if (!prayer.trim() || !ready || storageError) return;
    const saved = await update((current) => ({
      ...current,
      memberPrayerRequests: [
        ...current.memberPrayerRequests,
        {
          id: crypto.randomUUID(),
          userId,
          request: prayer.trim(),
          status: 'new',
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    if (!saved) {
      push(
        'This could not be saved in this browser. Your entry is still here — please try again.',
        'error',
      );
      return;
    }
    setPrayer('');
    setPrayerSent(true);
    push(
      'Prayer request added to this browser preview only. It has not been sent to the pastor.',
      'info',
    );
  }
  const [panel, setPanel] = useState<null | 'appointment' | 'prayer' | 'step'>(
    null,
  );
  const [appointmentDirty, setAppointmentDirty] = useState(false);
  useEffect(() => {
    if (opportunity && new URLSearchParams(window.location.search).get('join'))
      setPanel('step');
  }, [opportunity]);
  const close = () => {
    setPanel(null);
    setAppointmentDirty(false);
    setPrayerSent(false);
  };
  const cards = [
    {
      key: 'appointment' as const,
      icon: CalendarCheck,
      tone: 'activities',
      title: 'Request an appointment',
      body: 'Pastoral care, prayer, baptism interview or marriage support.',
    },
    {
      key: 'prayer' as const,
      icon: Heart,
      tone: 'care',
      title: 'Prayer request',
      body: 'Share privately with the pastoral team.',
    },
    {
      key: 'step' as const,
      icon: Footprints,
      tone: 'members',
      title: 'Take a next step',
      body: 'Join a group, a class or a ministry team.',
    },
  ];
  return (
    <div className="member-engagement">
      {storageError && (
        <p className="notice-box" role="alert">
          {storageError}
        </p>
      )}
      <section className="member-for-you" aria-labelledby="member-for-you">
        <h2 id="member-for-you">For you</h2>
        <div className="member-for-you-grid">
          {cards.map(({ key, icon: Icon, tone, title, body }) => (
            <button
              key={key}
              type="button"
              className={`member-action-card kit-tile-${tone}`}
              onClick={() => setPanel(key)}
            >
              <span className="member-action-icon" aria-hidden="true">
                <Icon size={26} strokeWidth={1.7} />
              </span>
              <strong>{title}</strong>
              <small>{body}</small>
            </button>
          ))}
        </div>
      </section>

      <SidePanel
        open={panel === 'appointment'}
        title="Appointments"
        eyebrow="Pastoral care"
        dirty={appointmentDirty}
        onClose={close}
      >
        <p>
          Prepare an appointment request for the pastoral team. This preview
          keeps requests in this browser and does not deliver them.
        </p>
        <form
          className="member-appointment-form"
          onSubmit={requestAppointment}
          onChange={() => setAppointmentDirty(true)}
        >
          <label>
            Appointment type
            <select name="type" required defaultValue="">
              <option value="" disabled>
                Choose a reason
              </option>
              <option>Pastoral care</option>
              <option>Prayer</option>
              <option>Baptism interview</option>
              <option>Marriage support</option>
            </select>
          </label>
          <label>
            Preferred date
            <input name="date" type="date" required />
          </label>
          <label>
            Message
            <textarea
              name="message"
              rows={3}
              placeholder="Anything you would like the pastoral team to know?"
            />
          </label>
          <button className="button" disabled={!ready || !!storageError}>
            Save appointment preview
          </button>
        </form>
      </SidePanel>

      <SidePanel
        open={panel === 'prayer'}
        title="Prayer request"
        eyebrow="Pastoral care"
        dirty={!!prayer.trim()}
        onClose={close}
      >
        {prayerSent ? (
          <p className="member-prayer-success" role="status">
            Your request is in this browser preview only. It has not been sent
            to the pastor.
          </p>
        ) : (
          <>
            <textarea
              aria-label="Private prayer request"
              rows={5}
              value={prayer}
              onChange={(event) => setPrayer(event.target.value)}
              placeholder="How can we pray with you?"
            />
            <button
              className="button"
              disabled={!ready || !!storageError || !prayer.trim()}
              onClick={submitPrayer}
            >
              Save prayer preview
            </button>
          </>
        )}
      </SidePanel>

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

      <MemberActivities />
    </div>
  );
}
