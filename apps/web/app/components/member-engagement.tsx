'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Clock, HandHeart, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useContent } from './content-provider';
import { useToast } from './toast';

type Attendance = 'attending' | 'not-attending' | 'undecided';

export function MemberEngagement() {
  const { content, update, ready, storageError } = useContent();
  const { data: session } = useSession();
  const { push } = useToast();
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [prayer, setPrayer] = useState('');
  const [prayerSent, setPrayerSent] = useState(false);
  const [opportunity, setOpportunity] = useState('');
  const currentUser =
    content.users.find((user) => user.email === session?.user?.email) ??
    content.users.find((user) => user.role === 'member');
  const userId = currentUser?.id ?? session?.user?.id ?? 'anonymous-member';
  const opportunities = useMemo(
    () =>
      content.site.memberOpportunities
        .split('\n')
        .map((line) => {
          const [name = '', description = '', href = '/next-steps'] = line
            .split('|')
            .map((value) => value.trim());
          return { name, description, href };
        })
        .filter((item) => item.name)
        .concat(
          content.pages.groups.map((group) => ({
            name: group[0]!,
            description: `${group[2]} · ${group[3]}`,
            href: '/location',
          })),
          content.pages.studies.map((study) => ({
            name: study[0]!,
            description: study[1]!,
            href: '/location',
          })),
          content.pages.steps.map((step) => ({
            name: decodeURIComponent(
              step.memberHref.split('join=')[1] ?? step.title,
            ),
            description: step.subtitle,
            href: '/next-steps',
          })),
        )
        .filter(
          (item, index, items) =>
            items.findIndex((entry) => entry.name === item.name) === index,
        ),
    [content.site.memberOpportunities, content.pages],
  );
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('join');
    if (requested && opportunities.some((item) => item.name === requested))
      setOpportunity(requested);
  }, [opportunities]);
  const selected = opportunities.find((item) => item.name === opportunity);
  function requestAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || storageError) return;
    const data = new FormData(event.currentTarget);
    update((current) => ({
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
    event.currentTarget.reset();
    setAppointmentOpen(false);
    push(
      'Appointment added to this browser preview only. It has not been delivered.',
      'info',
    );
  }
  function submitInterest() {
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
    update((current) => ({
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
    push(
      `Interest in ${selected.name} added to this browser preview only. No application has been delivered.`,
      'info',
    );
  }
  function updateAttendance(eventId: string, response: Attendance) {
    if (!ready || storageError) return;
    update((current) => {
      const existing = current.eventRsvps.find(
        (item) => item.userId === userId && item.eventId === eventId,
      );
      return {
        ...current,
        eventRsvps: existing
          ? current.eventRsvps.map((item) =>
              item.id === existing.id
                ? { ...item, response, updatedAt: new Date().toISOString() }
                : item,
            )
          : [
              ...current.eventRsvps,
              {
                id: crypto.randomUUID(),
                userId,
                eventId,
                response,
                updatedAt: new Date().toISOString(),
              },
            ],
      };
    });
  }
  function submitPrayer() {
    if (!prayer.trim() || !ready || storageError) return;
    update((current) => ({
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
    setPrayer('');
    setPrayerSent(true);
    push(
      'Prayer request added to this browser preview only. It has not been sent to the pastor.',
      'info',
    );
  }
  return (
    <div className="member-engagement">
      {storageError && (
        <p className="notice-box" role="alert">
          {storageError}
        </p>
      )}
      <section className="panel member-appointment-card">
        <div className="member-section-heading">
          <span>
            <Clock aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Pastoral care</p>
            <h2>Appointments</h2>
          </div>
          <button
            className="button button-outline"
            onClick={() => setAppointmentOpen((value) => !value)}
          >
            {appointmentOpen ? 'Cancel' : 'Request appointment'}
          </button>
        </div>
        {appointmentOpen ? (
          <form
            className="member-appointment-form"
            onSubmit={requestAppointment}
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
        ) : (
          <p>
            Prepare an appointment request for the pastoral team. This preview
            keeps requests in this browser and does not deliver them.
          </p>
        )}
        <div className="member-pastoral-prayer">
          <h3>Prayer request</h3>
          {prayerSent ? (
            <p className="member-prayer-success" role="status">
              Your request is in this browser preview only. It has not been sent
              to the pastor.
            </p>
          ) : (
            <>
              <textarea
                aria-label="Private prayer request"
                rows={3}
                value={prayer}
                onChange={(event) => setPrayer(event.target.value)}
                placeholder="How can we pray with you?"
              />
              <button
                className="button button-outline"
                disabled={!ready || !!storageError || !prayer.trim()}
                onClick={submitPrayer}
              >
                Save prayer preview
              </button>
            </>
          )}
        </div>
      </section>

      <section className="panel member-join-card">
        <div className="member-section-heading">
          <span>
            <HandHeart aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Get involved</p>
            <h2>Join a group or ministry</h2>
          </div>
        </div>
        <div className="member-join-controls">
          <label>
            <span>Choose an opportunity</span>
            <select
              value={opportunity}
              onChange={(event) => setOpportunity(event.target.value)}
            >
              <option value="">Select a group or ministry</option>
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
        <small>
          These options are managed in Website content → Next steps.
        </small>
      </section>

      <section className="panel member-rsvp" id="attendance">
        <div className="member-section-heading">
          <span>
            <Users aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Plan ahead</p>
            <h2>Events &amp; attendance</h2>
          </div>
        </div>
        <div className="member-rsvp-list">
          {content.events
            .filter((event) => event.status === 'published')
            .slice(0, 4)
            .map((event) => {
              const response =
                content.eventRsvps.find(
                  (item) => item.userId === userId && item.eventId === event.id,
                )?.response ?? 'undecided';
              return (
                <article key={event.id}>
                  <div>
                    <b>{event.title}</b>
                    <small>
                      {event.date} · {event.time} · {event.location}
                    </small>
                  </div>
                  <label>
                    <span className="sr-only">
                      Attendance for {event.title}
                    </span>
                    <select
                      disabled={!ready || !!storageError}
                      value={response}
                      onChange={(change) => {
                        const value = change.target.value as Attendance;
                        updateAttendance(event.id, value);
                        push(
                          `Attendance for ${event.title} updated in this browser preview only.`,
                          'info',
                        );
                      }}
                    >
                      <option value="undecided">Let us know</option>
                      <option value="attending">I’ll attend</option>
                      <option value="not-attending">Can’t attend</option>
                    </select>
                  </label>
                </article>
              );
            })}
        </div>
        <p className="form-note">
          Responses are saved in the frontend CMS store and appear on your admin
          user record.
        </p>
      </section>
    </div>
  );
}
