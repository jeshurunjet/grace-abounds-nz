'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { PageHero } from '../components/page-hero';
import { Reveal } from '../components/reveal';
import { useContent } from '../components/content-provider';
export default function Location() {
  const { content } = useContent();
  const { locations, groups, studies } = content.pages;
  const [tab, setTab] = useState<'locations' | 'groups' | 'studies'>(
    'locations',
  );
  const [selected, setSelected] = useState(0);
  const active = locations[selected] ?? locations[0]!;
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
          {tab === 'locations' && (
            <>
              <div className="location-pills">
                {locations.map((location, index) => (
                  <button
                    className={selected === index ? 'active' : ''}
                    key={location.name}
                    onClick={() => setSelected(index)}
                  >
                    {location.name.split(' — ')[1]}
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
                    {active.times.map((time) => (
                      <p className="service-time" key={time}>
                        <i />
                        {time}
                      </p>
                    ))}
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
                <Reveal direction="left" delay={100}>
                  <Image
                    src={active.image}
                    alt={active.name}
                    width={700}
                    height={400}
                    priority
                  />
                </Reveal>
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
              <div className="connect-group-grid">
                {groups.map(([name, leader, time, area], index) => (
                  <Reveal delay={index * 55} key={name}>
                    <article>
                      <span>{area}</span>
                      <h3>{name}</h3>
                      <p>Led by {leader}</p>
                      <b>{time}</b>
                      <Link href={`/members?join=${encodeURIComponent(name)}`}>
                        Join Group
                      </Link>
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
              <div className="study-grid">
                {studies.map(([title, description, schedule, venue], index) => (
                  <Reveal delay={index * 70} key={title}>
                    <article>
                      <h3>{title}</h3>
                      <p>{description}</p>
                      <b>{schedule}</b>
                      <small>{venue}</small>
                      <Link href={`/members?join=${encodeURIComponent(title)}`}>
                        Register Interest
                      </Link>
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
