import { PublicEventCalendar } from '../components/public-event-calendar';
import type { Metadata } from 'next';
import { EventGrid } from '../components/content-cards';
import { PageHero } from '../components/page-hero';
export const metadata: Metadata = { title: 'Events' };
export default function EventsPage() {
  return (
    <>
      <PageHero eyebrow="What's On" title="Events &" accent="Calendar">
        Gather, grow, and find your place in the life of our community.
      </PageHero>
      <section className="section">
        <div className="container">
          <PublicEventCalendar />
          <h2>Upcoming gatherings</h2>
          <EventGrid />
        </div>
      </section>
    </>
  );
}
