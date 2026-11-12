'use client';
import Image from '../../components/site-image';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useContent } from '../../components/content-provider';
import { Breadcrumbs } from '../../components/breadcrumbs';
export default function SermonDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { status } = useSession();
  const { content, ready } = useContent();
  const item = content.sermons.find((sermon) => sermon.slug === slug);
  if (status === 'loading' || !ready)
    return (
      <main className="detail-page">
        <div className="container">
          <p>Loading sermon preview…</p>
        </div>
      </main>
    );
  if (!item || item.status !== 'published') notFound();
  return (
    <article className="detail-page sermon-detail">
      <div className="container">
        <Breadcrumbs
          items={[
            { label: 'Sermons', href: '/sermons' },
            { label: item.title },
          ]}
        />
        {item.mediaUrl?.startsWith('https://') ? (
          <video
            className="sermon-player"
            controls
            preload="metadata"
            poster={item.image}
            src={item.mediaUrl}
          >
            Your browser does not support this recording.
          </video>
        ) : (
          <div className="video-frame">
            <Image src={item.image} alt="" fill priority sizes="100vw" />
            <span className="media-unavailable">Recording coming soon</span>
          </div>
        )}
        <div className="sermon-copy">
          <p className="eyebrow">{item.series}</p>
          <h1>{item.title}</h1>
          <p className="detail-meta">
            {item.speaker} · {item.date} · {item.duration}
          </p>
          <p>{item.summary}</p>
          <Link className="button button-outline" href="/members/gallery">
            Open member resources
          </Link>
        </div>
      </div>
    </article>
  );
}
