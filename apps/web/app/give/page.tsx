'use client';
import { useContent } from '../components/content-provider';
import { PageHero } from '../components/page-hero';
import {
  GiveOptions,
  ManagedGiving,
  ManagedVerse,
} from '../components/managed-content';
import { Reveal } from '../components/reveal';
export default function Give() {
  const { content } = useContent();
  return (
    <>
      <PageHero eyebrow="Generosity" title="Give" accent="Generously.">
        We believe giving is an act of worship and an expression of trust in
        God. Every gift supports our mission to reach New Zealand and the
        Pacific with the hope of Jesus.
      </PageHero>
      <section className="section linen give-impact">
        <div className="container">
          <Reveal>
            <p className="eyebrow">Impact</p>
            <h2>Where Your Giving Goes</h2>
          </Reveal>
          <div className="impact-grid">
            {content.pages.givingImpact.map(([amount, title, copy], index) => (
              <Reveal delay={index * 70} key={title}>
                <article className="impact-card">
                  <strong>{amount}</strong>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <div className="two-col give-grid">
            <Reveal direction="right">
              <article className="card">
                <h3>Donations &amp; Offerings</h3>
                <p>
                  Give your donation or offering by direct bank transfer. No
                  platform fees.
                </p>
                <ManagedGiving />
                <p className="form-note">
                  Placeholder details only—please do not attempt a transfer
                  until official details are published.
                </p>
              </article>
            </Reveal>
            <Reveal direction="left" delay={100}>
              <GiveOptions />
            </Reveal>
          </div>
        </div>
      </section>
      <section className="scripture">
        <Reveal direction="scale">
          <ManagedVerse placement="giving" />
        </Reveal>
      </section>
    </>
  );
}
