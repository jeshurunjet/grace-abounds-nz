'use client';
import Link from 'next/link';
import Image from '../../components/site-image';
import { notFound, useParams } from 'next/navigation';
import { useContent } from '../../components/content-provider';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { AddToCalendar, useActivities } from '../../components/activity-ui';
import {
  describeSchedule,
  formatDate,
  formatTime,
  kindLabels,
  placesLeft,
  placesTaken,
  upcoming,
} from '../../lib/activities';
import { useAvailability } from '../../lib/participation';

/** Detail page for any activity: event, service, group, study or ministry. */
export default function ActivityDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { ready } = useContent();
  const { live, exceptions, place } = useActivities();
  // Places taken come from the server (counts only).
  const availability = useAvailability();
  const item = live.find((activity) => activity.slug === slug);
  if (!ready) return <p className="container">Loading…</p>;
  if (!item) notFound();
  const dates = upcoming(item, exceptions, 6);
  const next = dates.find((date) => !date.cancelled);
  const spots =
    item.joinMode === 'membership'
      ? placesLeft(item, availability)
      : next
        ? placesLeft(item, availability, next.date)
        : null;
  const going =
    item.joinMode === 'membership'
      ? placesTaken(availability, item.id)
      : next
        ? placesTaken(availability, item.id, next.date)
        : 0;
  const action =
    item.joinMode === 'membership'
      ? 'Join'
      : item.joinMode === 'booking'
        ? 'Book a place'
        : null;
  const finished = item.schedule.repeat === 'once' && !dates.length;
  return (
    <article className="detail-page">
      <div className="container">
        <Breadcrumbs
          items={[
            item.kind === 'event'
              ? { label: 'Events', href: '/events' }
              : { label: 'Locations & community', href: '/location' },
            { label: item.title },
          ]}
        />
        <div className="detail-grid">
          <div className="detail-image">
            <Image
              src={item.image}
              alt=""
              fill
              priority
              sizes="(max-width: 800px) 100vw, 55vw"
            />
          </div>
          <div>
            <p className="eyebrow">{item.tag || kindLabels[item.kind]}</p>
            <h1>{item.title}</h1>
            <p className="detail-meta">
              {describeSchedule(item.schedule)}
              <br />
              {place(item)}
              {item.leader && (
                <>
                  <br />
                  Led by {item.leader}
                </>
              )}
            </p>
            <p>{item.summary}</p>
            {finished && <p className="form-note">This event has finished.</p>}
            {!finished &&
              dates.length > 0 &&
              item.schedule.repeat !== 'once' && (
                <>
                  <h2 className="detail-subheading">Coming up</h2>
                  <ul className="activity-dates">
                    {dates.map((date) => (
                      <li
                        key={date.key}
                        className={date.cancelled ? 'cancelled' : ''}
                      >
                        <b>{formatDate(date.date, true)}</b>{' '}
                        {date.cancelled
                          ? 'Cancelled'
                          : `${formatTime(date.startTime)}${date.changed && date.venue ? ` · ${date.venue}` : ''}`}
                        {date.note && <small> — {date.note}</small>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            {!finished && action && (
              <p className="form-note">
                {spots === 0
                  ? 'Currently full.'
                  : spots != null
                    ? `${spots} of ${item.capacity} places left${item.joinMode === 'booking' && next ? ` for ${formatDate(next.date)}` : ''}.`
                    : going
                      ? `${going} ${item.joinMode === 'membership' ? 'members' : 'people going'}.`
                      : ''}
              </p>
            )}
            <div className="form-actions">
              {!finished && action && (
                <Link
                  className="button"
                  href={`/members?activity=${encodeURIComponent(item.id)}#activities`}
                >
                  {spots === 0 ? 'View in member area' : action}
                </Link>
              )}
              {next && item.schedule.repeat === 'once' && (
                <AddToCalendar activity={item} date={next.date} />
              )}
              {next && item.schedule.repeat !== 'once' && (
                <AddToCalendar activity={item} />
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
