'use client';
import Link from 'next/link';
import Image from 'next/image';
import { notFound, useParams } from 'next/navigation';
import { useContent } from '../../components/content-provider';
import { Breadcrumbs } from '../../components/breadcrumbs';
export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { content, ready } = useContent();
  const item = content.events.find(
    (event) => event.slug === slug && event.status === 'published',
  );
  if (!ready) return <p className="container">Loading event…</p>;
  if (!item) notFound();
  return (
    <article className="detail-page">
      <div className="container">
        <Breadcrumbs
          items={[{ label: 'Events', href: '/events' }, { label: item.title }]}
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
            <p className="eyebrow">{item.tag}</p>
            <h1>{item.title}</h1>
            <p className="detail-meta">
              {item.date} · {item.time}
              <br />
              {item.location}
            </p>
            <p>{item.summary}</p>
            <Link className="button" href="/members#attendance">
              Respond to this event
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
