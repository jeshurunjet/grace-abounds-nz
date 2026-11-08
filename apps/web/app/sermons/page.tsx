import type { Metadata } from 'next';
import { SermonGrid } from '../components/content-cards';
import { PageHero } from '../components/page-hero';
export const metadata: Metadata = { title: 'Sermons' };
export default function SermonsPage() {
  return (
    <>
      <PageHero eyebrow="The Word" title="Sermons &" accent="Messages">
        Watch recent messages and explore teaching from Grace Abounds.
      </PageHero>
      <section className="section">
        <div className="container">
          <SermonGrid />
        </div>
      </section>
    </>
  );
}
