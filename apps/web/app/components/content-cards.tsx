'use client';
import Image from './site-image';
import Link from 'next/link';
import { useContent } from './content-provider';
import { Reveal } from './reveal';
import { useActivities } from './activity-ui';
import {
  addDays,
  formatDate,
  formatTime,
  occurrences,
} from '../lib/activities';

export function EventGrid({ limit }: { limit?: number }) {
  const { live, exceptions, place, now } = useActivities();
  const events = occurrences(
    live.filter((item) => item.kind === 'event'),
    exceptions,
    now.date,
    addDays(now.date, 730),
  ).slice(0, limit);
  if (!events.length)
    return <p>No upcoming events right now. Check back soon.</p>;
  return (
    <div className="reference-card-grid">
      {events.map(({ activity: item, ...occurrence }, index) => (
        <Reveal direction="up" delay={index * 65} key={occurrence.key}>
          <Link
            className="reference-card media-card"
            href={`/events/${item.slug}`}
          >
            <div>
              <Image
                src={item.image}
                alt=""
                fill
                sizes="(max-width: 700px) 100vw, 33vw"
              />
            </div>
            <span>{occurrence.cancelled ? 'Cancelled' : item.tag}</span>
            <h2>{item.title}</h2>
            <p>
              {formatDate(occurrence.date, true)} ·{' '}
              {formatTime(occurrence.startTime)}
              <br />
              {place(item, occurrence.venue)}
            </p>
            <small>View details →</small>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}
export function SermonGrid({ limit }: { limit?: number }) {
  const { content } = useContent();
  const sermons = content.sermons
    .filter((item) => item.status === 'published')
    .slice(0, limit);
  if (!sermons.length)
    return <p className="form-note">New messages will appear here soon.</p>;
  return (
    <div className="reference-card-grid">
      {sermons.map((item, index) => (
        <Reveal direction="up" delay={index * 65} key={item.id}>
          <Link
            className="reference-card media-card"
            href={`/sermons/${item.slug}`}
          >
            <div>
              <Image
                src={item.image}
                alt=""
                fill
                sizes="(max-width: 700px) 100vw, 33vw"
              />
              <i>▶</i>
            </div>
            <span>{item.series}</span>
            <h2>{item.title}</h2>
            <p>
              {item.speaker} · {item.date} · {item.duration}
            </p>
            <small>Watch message →</small>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}
