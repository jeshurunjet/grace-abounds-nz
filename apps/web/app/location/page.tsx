import Link from 'next/link';
import { PageHero } from '../components/page-hero';
export default function Location() {
  return (
    <>
      <PageHero
        eyebrow="Come as you are"
        title="Locations &"
        accent="Community"
      >
        Find a Sunday gathering, a connect group, or a place to study Scripture.
      </PageHero>
      <section className="section">
        <div className="container two-col">
          <div>
            <p className="eyebrow">Sunday gathering</p>
            <h2>Auckland</h2>
            <p className="large">Sundays at 10:00am</p>
            <p>
              The final venue address is awaiting approval and is intentionally
              not published in this preview.
            </p>
            <a
              className="button"
              href="https://maps.google.com"
              target="_blank"
              rel="noreferrer"
            >
              Open Google Maps
            </a>
          </div>
          <div className="map-placeholder" aria-label="Map placeholder">
            <span>Location map</span>
            <p>Approved address coming soon</p>
          </div>
        </div>
      </section>
      <section className="section linen">
        <div className="container">
          <p className="eyebrow">Find your people</p>
          <h2>Connect Groups</h2>
          <div className="cards">
            {[
              ['Central Auckland', 'Weeknight home gatherings'],
              ['North Auckland', 'Fortnightly community group'],
              ['South Auckland', 'Family-friendly gathering'],
            ].map(([t, d]) => (
              <article className="card" key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
                <Link className="text-link" href="/next-steps">
                  Learn more →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Go deeper</p>
          <h2>Bible Studies</h2>
          <div className="cards">
            {[
              ['Foundations Class', 'Monthly · Saturdays'],
              ['Men’s Bible Study', 'Fortnightly · Saturdays'],
              ['Women’s Word & Worship', 'Monthly · Friday evenings'],
            ].map(([t, d]) => (
              <article className="card" key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
                <p>Venue details available at a Sunday gathering.</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
