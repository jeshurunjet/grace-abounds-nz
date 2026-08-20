import Image from 'next/image';
import Link from 'next/link';
import { HeroGallery } from './components/hero-gallery';
import { PrayerForm } from './components/forms';
import { Reveal } from './components/reveal';

const events = [
  {
    date: '17 Aug',
    title: 'Connect Group Kickoff',
    location: 'Multiple Locations',
    time: '7:00pm',
    tag: 'Community',
  },
  {
    date: '24 Aug',
    title: 'Water Baptism Sunday',
    location: 'Main Gathering',
    time: '10:00am',
    tag: 'Milestone',
  },
  {
    date: '31 Aug',
    title: 'Youth & Young Adults Night',
    location: 'Grace Centre',
    time: '6:30pm',
    tag: 'Youth',
  },
  {
    date: '7 Sep',
    title: 'Women’s Conference',
    location: 'Grace Centre',
    time: '9:00am',
    tag: 'Women',
  },
];
const sermons = [
  {
    title: 'Walking in the Spirit',
    series: 'Life in the Spirit',
    date: '4 Aug 2026',
    duration: '42 min',
    image: '/images/hero-6.jpg',
    pastor: 'Pastor Bartolome R. Sanchez',
  },
  {
    title: 'The Grace of Giving',
    series: 'Generosity',
    date: '28 Jul 2026',
    duration: '38 min',
    image: '/images/hero-2.jpg',
    pastor: 'Pastor Sarah Keil',
  },
  {
    title: 'Rooted and Built Up',
    series: 'Foundations',
    date: '21 Jul 2026',
    duration: '45 min',
    image: '/images/hero-3.jpg',
    pastor: 'Pastor Bartolome R. Sanchez',
  },
];
const gallery = [
  '/images/hero-1.jpg',
  '/images/hero-6.jpg',
  '/images/hero-2.jpg',
  '/images/hero-3.jpg',
  '/images/hero-4.jpg',
  '/images/hero-5.jpg',
];

export default function Home() {
  return (
    <>
      <section className="home-hero">
        <HeroGallery />
        <div className="hero-content">
          <Reveal direction="fade">
            <p className="service-pill">
              <span />
              Auckland, New Zealand · Sundays 10:00am
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1>
              <span>Grace</span>
              <span className="hero-gold">Abounds.</span>
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
            <p className="hero-tagline">
              A community of faith rooted in love, growing in grace,
              <br /> and reaching the world with the hope of Jesus Christ.
            </p>
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
            <span>Scroll</span>
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
            <Link className="calendar-link" href="/location">
              Full Calendar →
            </Link>
          </div>
          <div className="event-grid">
            {events.map((event, index) => (
              <Reveal key={event.title} delay={index * 80}>
                <article className="event-card">
                  <strong>{event.date}</strong>
                  <h3>{event.title}</h3>
                  <p>{event.location}</p>
                  <p>{event.time}</p>
                  <span>{event.tag}</span>
                </article>
              </Reveal>
            ))}
          </div>
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
            <article className="featured-sermon">
              <div className="sermon-image">
                <Image
                  src="/images/hero-6.jpg"
                  alt="Latest sermon"
                  fill
                  sizes="(max-width: 768px) 100vw, 60vw"
                />
                <span className="latest">Latest</span>
                <button
                  className="play-large"
                  type="button"
                  aria-label="Play Walking in the Spirit"
                >
                  ▶
                </button>
              </div>
              <div className="featured-copy">
                <p className="eyebrow gold">Life in the Spirit</p>
                <h3>Walking in the Spirit</h3>
                <p>Pastor Bartolome R. Sanchez · 4 Aug 2026 · 42 min</p>
                <button className="button" type="button">
                  Watch Now
                </button>
              </div>
            </article>
          </Reveal>
          <div className="sermon-grid">
            {sermons.map((sermon, index) => (
              <Reveal key={sermon.title} delay={index * 90}>
                <article className="sermon-card">
                  <div className="sermon-thumb">
                    <Image
                      src={sermon.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                    <button type="button" aria-label={`Play ${sermon.title}`}>
                      ▶
                    </button>
                    <span>{sermon.duration}</span>
                  </div>
                  <div>
                    <p>{sermon.series}</p>
                    <h3>{sermon.title}</h3>
                    <small>
                      {sermon.pastor} · {sermon.date}
                    </small>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
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
            {[
              [
                '📖',
                'Study Bible',
                'Weekly reading plans and devotionals for all ages.',
                'Scripture',
              ],
              [
                '🎧',
                'Sermon Podcast',
                'All messages available wherever you listen.',
                'Media',
              ],
              [
                '📋',
                'Life Group Guides',
                'Discussion guides aligned with the current series.',
                'Community',
              ],
            ].map(([icon, title, desc, tag]) => (
              <article className="resource-card" key={title}>
                <span>{icon}</span>
                <div>
                  <small>{tag}</small>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
                <b>→</b>
              </article>
            ))}
          </div>
        </div>
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
