'use client';
import Image from '../components/site-image';
import Link from 'next/link';
import { useState } from 'react';
import { PageHero } from '../components/page-hero';
import { Reveal } from '../components/reveal';
import { useContent } from '../components/content-provider';
import { SundayStatus, useActivities } from '../components/activity-ui';
import { describeSchedule, spotsLeft, type Activity } from '../lib/activities';
import { campusLabel } from '../lib/campus';
export default function Location() {
  const { content } = useContent();
  const { locations } = content.pages;
  const { live, participations, place } = useActivities();
  const groups = live.filter((item) => item.kind === 'group');
  const studies = live.filter((item) => item.kind === 'study');
  const [tab, setTab] = useState<'locations' | 'groups' | 'studies'>(
    'locations',
  );
  const [selected, setSelected] = useState(0);
  // No published campus is a valid state (before the first is published, or
  // after the last is archived): show that truthfully, never a fallback.
  const active = locations[selected] ?? locations[0];
  const services = active
    ? live.filter(
        (item) => item.kind === 'service' && item.locationId === active.id,
      )
    : [];
  /** One spaced action group per card: primary Join, secondary See dates. */
  const join = (item: Activity) => {
    const spots = spotsLeft(item, participations);
    return (
      <div className="activity-card-actions">
        {spots != null && (
          <small>{spots ? `${spots} places left` : 'Currently full'}</small>
        )}
        <Link
          className="button"
          href={`/members/calendar?activity=${encodeURIComponent(item.id)}#activities`}
        >
          {spots === 0
            ? 'View details'
            : item.kind === 'group'
              ? 'Join Group'
              : 'Join Study'}
        </Link>
        <Link className="button button-outline" href={`/events/${item.slug}`}>
          See dates
        </Link>
      </div>
    );
  };
  return (
    <>
      <PageHero
        eyebrow="Find Your Place"
        title="Locations &"
        accent="Community"
      >
        Three campuses across Auckland, plus connect groups and Bible studies
        throughout the week.
      </PageHero>
      <div className="reference-tabs">
        <div className="container">
          {(
            [
              ['locations', 'Service Locations'],
              ['groups', 'Connect Groups'],
              ['studies', 'Bible Studies'],
            ] as const
          ).map(([key, label]) => (
            <button
              className={tab === key ? 'active' : ''}
              key={key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <section className="reference-section location-content">
        <div className="container">
          {tab === 'locations' && !active && (
            <p className="tab-intro">
              Campus details will be published here soon. Contact the church
              office for service times and directions.
            </p>
          )}
          {tab === 'locations' && active && (
            <>
              <div className="location-pills">
                {locations.map((location, index) => (
                  <button
                    className={location === active ? 'active' : ''}
                    key={location.id}
                    onClick={() => setSelected(index)}
                  >
                    {campusLabel(location.name)}
                  </button>
                ))}
              </div>
              <div className="location-detail">
                <Reveal direction="right">
                  <div>
                    <span className="location-type">{active.type}</span>
                    <h2>{active.name}</h2>
                    <p>{active.address}</p>
                    <h3>Service Times</h3>
                    {!services.length && (
                      <p className="service-time">
                        <i />
                        Service times coming soon
                      </p>
                    )}
                    {services.map((item) => (
                      <p className="service-time" key={item.id}>
                        <i />
                        {describeSchedule(item.schedule)} ·{' '}
                        {item.title.split(' — ')[0]}
                      </p>
                    ))}
                    <SundayStatus locationId={active.id} />
                    <div className="location-actions">
                      <a
                        className="button"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(active.address)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get Directions
                      </a>
                      <Link
                        className="button button-outline"
                        href="/about#contact"
                      >
                        Contact Campus
                      </Link>
                    </div>
                  </div>
                </Reveal>
                {active.image && (
                  <Reveal direction="left" delay={100}>
                    <Image
                      src={active.image}
                      alt={active.name}
                      width={700}
                      height={400}
                      priority
                    />
                  </Reveal>
                )}
              </div>
            </>
          )}
          {tab === 'groups' && (
            <>
              <Reveal>
                <p className="tab-intro">
                  Connect Groups are the heartbeat of our church — small
                  communities meeting across Auckland to share life, study
                  Scripture, and pray together.
                </p>
              </Reveal>
              {!groups.length && (
                <p className="tab-intro">
                  New connect groups are coming soon. Contact the church office
                  to find a group near you.
                </p>
              )}
              <div className="connect-group-grid">
                {groups.map((item, index) => (
                  <Reveal delay={index * 55} key={item.id}>
                    <article>
                      <span>{item.venue || place(item)}</span>
                      <h3>{item.title}</h3>
                      {item.leader && <p>Led by {item.leader}</p>}
                      <b>{describeSchedule(item.schedule)}</b>
                      {join(item)}
                    </article>
                  </Reveal>
                ))}
              </div>
            </>
          )}
          {tab === 'studies' && (
            <>
              <Reveal>
                <p className="tab-intro">
                  Go deeper in the Word. Our Bible Studies are open to everyone,
                  from new believers to seasoned students of Scripture.
                </p>
              </Reveal>
              {!studies.length && (
                <p className="tab-intro">
                  New Bible studies are coming soon. Contact the church office
                  for details.
                </p>
              )}
              <div className="study-grid">
                {studies.map((item, index) => (
                  <Reveal delay={index * 70} key={item.id}>
                    <article>
                      <h3>{item.title}</h3>
                      <p>{item.summary}</p>
                      <b>{describeSchedule(item.schedule)}</b>
                      <small>{place(item)}</small>
                      {join(item)}
                    </article>
                  </Reveal>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
