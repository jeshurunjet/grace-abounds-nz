'use client';
import Image from './components/site-image';
import Link from 'next/link';
import { BookOpen, Headphones, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useContent } from './components/content-provider';
import { HeroGallery } from './components/hero-gallery';
import { PrayerForm } from './components/forms';
import { Reveal } from './components/reveal';
import { EventGrid, SermonGrid } from './components/content-cards';
import { ManagedVerse } from './components/managed-content';

const resources: {
  icon: LucideIcon;
  title: string;
  description: string;
  tag: string;
}[] = [
  {
    icon: BookOpen,
    title: 'Study Bible',
    description: 'Weekly reading plans and devotionals for all ages.',
    tag: 'Scripture',
  },
  {
    icon: Headphones,
    title: 'Sermon Podcast',
    description: 'All messages available wherever you listen.',
    tag: 'Media',
  },
  {
    icon: UsersRound,
    title: 'Life Group Guides',
    description: 'Discussion guides aligned with the current series.',
    tag: 'Community',
  },
];

export default function Home() {
  const { content } = useContent();
  const { gallery } = content.pages;
  const latest = content.sermons.find((item) => item.status === 'published');
  return (
    <>
      <section className="home-hero">
        <HeroGallery />
        <div className="hero-content">
          <p className="eyebrow gold">{content.site.heroEyebrow}</p>
          <Reveal delay={80}>
            <h1>
              <span>{content.site.heroTitle}</span>
              <span className="hero-gold">{content.site.heroAccent}</span>
            </h1>
          </Reveal>
          <Reveal direction="fade" delay={220}>
            <div className="international">
              <i />
              International
              <i />
            </div>
          </Reveal>
          <Reveal delay={280}>
            <p className="hero-tagline">{content.site.heroCopy}</p>
          </Reveal>
          <Reveal delay={360}>
            <div className="actions">
              <Link className="button hero-primary" href="/next-steps">
                I&apos;m New Here
              </Link>
              <Link className="button button-light" href="/about">
                Our Story
              </Link>
              <Link className="button button-light" href="/location">
                Find Us
              </Link>
            </div>
          </Reveal>
          <div className="scroll-cue">
            <i />
          </div>
        </div>
      </section>
      <section className="home-section events-section">
        <div className="container">
          <div className="home-heading">
            <Reveal>
              <div>
                <p className="eyebrow olive">What&apos;s On</p>
                <h2>
                  Events &<br />
                  Announcements
                </h2>
              </div>
            </Reveal>
            <Link className="calendar-link" href="/events">
              Full Calendar →
            </Link>
          </div>
          <EventGrid limit={4} />
        </div>
      </section>
      <section className="home-section sermons-section">
        <div className="container">
          <p className="eyebrow">The Word</p>
          <h2>
            Sermons &<br />
            Messages
          </h2>
          <Reveal delay={60}>
            {latest && (
              <article className="featured-sermon">
                <div className="sermon-image">
                  <Image
                    src={latest.image}
                    alt="Latest sermon"
                    fill
                    sizes="(max-width: 768px) 100vw, 60vw"
                  />
                  <span className="latest">Latest</span>
                  <Link
                    className="play-large"
                    href={`/sermons/${latest.slug}`}
                    aria-label={`View ${latest.title}`}
                  >
                    ▶
                  </Link>
                </div>
                <div className="featured-copy">
                  <p className="eyebrow gold">{latest.series}</p>
                  <h3>{latest.title}</h3>
                  <p>
                    {latest.speaker} · {latest.date} · {latest.duration}
                  </p>
                  <Link className="button" href={`/sermons/${latest.slug}`}>
                    Watch Now
                  </Link>
                </div>
              </article>
            )}
          </Reveal>
          <SermonGrid limit={3} />
        </div>
      </section>
      <section className="home-section gallery-section">
        <div className="container">
          <p className="eyebrow olive">Our Community</p>
          <h2>Life Together</h2>
          <div className="reference-gallery">
            {gallery.map((src, index) => (
              <Reveal
                direction="scale"
                delay={index * 60}
                key={`${src}-${index}`}
              >
                <Image
                  src={src}
                  alt="Church community life"
                  width={600}
                  height={400}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="home-section prayer-section" id="prayer">
        <div className="container two-col">
          <Reveal direction="right">
            <div>
              <p className="eyebrow">We&apos;re With You</p>
              <h2>
                Submit a<br />
                Prayer Request
              </h2>
              <p>
                Our pastoral team prays over every request we receive. Nothing
                is too big or too small. We believe in the power of prayer and
                we&apos;re honoured to stand with you.
              </p>
            </div>
          </Reveal>
          <Reveal direction="left" delay={120}>
            <PrayerForm />
          </Reveal>
        </div>
      </section>
      <section className="home-section resources-section">
        <div className="container">
          <p className="eyebrow olive">Grow Deeper</p>
          <h2>Resources</h2>
          <div className="resource-grid">
            {resources.map(({ icon: Icon, title, description, tag }) => (
              <Link
                href="/members/gallery"
                className="resource-card"
                key={title}
              >
                <span>
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <small>{tag}</small>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <b>→</b>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="scripture home-scripture">
        <Reveal direction="scale">
          <ManagedVerse placement="home" />
        </Reveal>
      </section>
      <section className="home-cta">
        <div className="container">
          <p className="eyebrow gold">Your Next Step</p>
          <h2>There&apos;s a place for you here.</h2>
          <p>
            Whether you&apos;re exploring faith or looking for a church to call
            home, we&apos;d love to meet you.
          </p>
          <Link className="button" href="/next-steps">
            Get Connected
          </Link>
        </div>
      </section>
    </>
  );
}
