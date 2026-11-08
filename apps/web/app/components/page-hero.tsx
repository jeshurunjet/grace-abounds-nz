'use client';
import { usePathname } from 'next/navigation';
import { useContent } from './content-provider';
export function PageHero({
  eyebrow,
  title,
  accent,
  children,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  children: string;
}) {
  const { content } = useContent();
  const pathname = usePathname();
  const route = pathname.startsWith('/admin')
    ? (
        {
          'Find Your Place': '/location',
          'Take a Step': '/next-steps',
          Generosity: '/give',
          "What's On": '/events',
          'The Word': '/sermons',
        } as Record<string, string>
      )[eyebrow]
    : pathname;
  const managed =
    content.pages.heroes[route as keyof typeof content.pages.heroes];
  return (
    <section
      className={`page-hero ${eyebrow === 'Generosity' ? 'page-hero--give' : eyebrow === 'Take a Step' ? 'page-hero--next-steps' : 'page-hero--location'}`}
    >
      <div className="container">
        <Reveal>
          <p className="eyebrow">{managed?.eyebrow ?? eyebrow}</p>
        </Reveal>
        <Reveal delay={70}>
          <h1 className="page-hero-title">
            {managed?.title ?? title}
            <br />
            <span>{managed?.accent ?? accent}</span>
          </h1>
        </Reveal>
        <Reveal delay={140}>
          <p>{managed?.copy ?? children}</p>
        </Reveal>
      </div>
    </section>
  );
}
import { Reveal } from './reveal';
