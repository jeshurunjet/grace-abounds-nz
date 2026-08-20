import Image from 'next/image';
import { PageHero } from '../components/page-hero';
const values = [
  [
    '01',
    'Scripture',
    'The Bible is our foundation—authoritative for faith and life.',
  ],
  [
    '02',
    'Community',
    'We pursue authentic relationships marked by love and commitment.',
  ],
  [
    '03',
    'Mission',
    'We share the hope of Jesus with our neighbours and our world.',
  ],
  ['04', 'Generosity', 'We give freely of our time, resources, and gifts.'],
];
export default function About() {
  return (
    <>
      <PageHero eyebrow="Who we are" title="About" accent="Us">
        A diverse church family discovering the depth of God’s grace together.
      </PageHero>
      <section className="section">
        <div className="container two-col">
          <Image
            className="rounded-image"
            src="/images/hero-1.jpg"
            alt="Members of the Grace Abounds community"
            width={900}
            height={896}
          />
          <div>
            <p className="eyebrow">Our story</p>
            <h2>Grace for every season.</h2>
            <p>
              Grace Abounds began with a simple conviction: everyone deserves a
              place to encounter Jesus, belong in community, and grow in
              purpose.
            </p>
            <p>
              Today we are a multi-generational, multicultural church family
              serving Auckland and looking beyond ourselves to New Zealand and
              the Pacific.
            </p>
          </div>
        </div>
      </section>
      <section className="section linen">
        <div className="container">
          <p className="eyebrow">What shapes us</p>
          <h2>Our Values</h2>
          <div className="cards values">
            {values.map(([n, t, d]) => (
              <article className="card" key={t}>
                <b>{n}</b>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Leadership</p>
          <h2>Meet the Team</h2>
          <div className="cards">
            <article className="card">
              <h3>Pastor Bartolome R. Sanchez</h3>
              <p>Lead Pastor</p>
            </article>
            <article className="card">
              <h3>Ministry Team</h3>
              <p>Pastoral care and community leadership</p>
            </article>
            <article className="card">
              <h3>Volunteer Leaders</h3>
              <p>Serving every generation</p>
            </article>
          </div>
        </div>
      </section>
      <section className="section contact" id="contact">
        <div className="container">
          <p className="eyebrow">Contact</p>
          <h2>We would love to hear from you.</h2>
          <p>
            Official contact details will be added once approved. Until then,
            please connect with the team in person at a Sunday gathering.
          </p>
        </div>
      </section>
    </>
  );
}
