'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useContent } from './content-provider';
import { Reveal } from './reveal';

export function EventGrid({ limit }: { limit?: number }) {
  const { content } = useContent(); const events = content.events.filter(item => item.status === 'published').slice(0, limit);
  return <div className="reference-card-grid">{events.map((item, index) => <Reveal direction="up" delay={index * 65} key={item.id}><Link className="reference-card media-card" href={`/events/${item.slug}`}><div><Image src={item.image} alt="" fill sizes="(max-width: 700px) 100vw, 33vw" /></div><span>{item.tag}</span><h2>{item.title}</h2><p>{item.date} · {item.time}<br />{item.location}</p><small>View details →</small></Link></Reveal>)}</div>;
}
export function SermonGrid({ limit }: { limit?: number }) {
  const { content } = useContent(); const sermons = content.sermons.filter(item => item.status === 'published').slice(0, limit);
  return <div className="reference-card-grid">{sermons.map((item, index) => <Reveal direction="up" delay={index * 65} key={item.id}><Link className="reference-card media-card" href={`/sermons/${item.slug}`}><div><Image src={item.image} alt="" fill sizes="(max-width: 700px) 100vw, 33vw" /><i>▶</i></div><span>{item.series}</span><h2>{item.title}</h2><p>{item.speaker} · {item.date} · {item.duration}</p><small>Watch message →</small></Link></Reveal>)}</div>;
}
