import { NextStepsExplorer } from '../components/next-steps-explorer';
import { PageHero } from '../components/page-hero';
import { Reveal } from '../components/reveal';
export default function NextSteps() {
  return (
    <>
      <PageHero eyebrow="Take a Step" title="Next" accent="Steps">
        Wherever you are on your journey with God, there is always a meaningful
        next step. We are here to help you find it.
      </PageHero>
      <section className="section linen">
        <Reveal>
          <div className="container">
            <NextStepsExplorer />
          </div>
        </Reveal>
      </section>
      <section className="section contact">
        <div className="container">
          <h2>Have Questions?</h2>
          <p>
            Our team would love to chat. Reach out and someone will get back to
            you within 24 hours.
          </p>
          <div className="next-contact-actions">
            <a className="button" href="/about#contact">
              Contact a Pastor
            </a>
            <a className="button button-outline" href="/about">
              Learn More About Us
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
