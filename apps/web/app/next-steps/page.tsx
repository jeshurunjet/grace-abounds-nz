import { NextStepsExplorer } from '../components/next-steps-explorer';
import { PageHero } from '../components/page-hero';
export default function NextSteps() {
  return (
    <>
      <PageHero eyebrow="Your journey" title="Next" accent="Steps">
        Wherever you are in faith, there is a meaningful next step for you.
      </PageHero>
      <section className="section linen">
        <div className="container">
          <NextStepsExplorer />
        </div>
      </section>
      <section className="section contact">
        <div className="container">
          <h2>Have Questions?</h2>
          <p>
            Meet the team at a Sunday gathering. Approved digital contact
            details will be added in a future update.
          </p>
        </div>
      </section>
    </>
  );
}
