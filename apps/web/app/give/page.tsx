import { PageHero } from '../components/page-hero';
export default function Give() {
  return (
    <>
      <PageHero eyebrow="Generosity" title="Give" accent="Generously.">
        Giving is an act of worship that supports ministry, community care, and
        mission.
      </PageHero>
      <section className="section linen give-impact">
        <div className="container">
          <p className="eyebrow">Impact</p>
          <h2>Where Your Giving Goes</h2>
          <div className="impact-grid">
            {[
              [
                '40%',
                'Local Ministry',
                'Sunday gatherings, groups, youth, and pastoral care.',
              ],
              [
                '30%',
                'Missions & Outreach',
                'Community outreach and mission partnerships.',
              ],
              [
                '30%',
                'Facilities & Operations',
                'Creating welcoming spaces and reaching more people.',
              ],
            ].map(([amount, title, copy]) => (
              <article className="impact-card" key={title}>
                <strong>{amount}</strong>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <div className="two-col give-grid">
            <article className="card">
              <h3>Bank Transfer (NZ)</h3>
              <p>
                Direct bank transfer is the supported giving method. No payment
                gateway is connected.
              </p>
              <dl>
                <div>
                  <dt>Account name</dt>
                  <dd>To be confirmed</dd>
                </div>
                <div>
                  <dt>Bank</dt>
                  <dd>To be confirmed</dd>
                </div>
                <div>
                  <dt>Account number</dt>
                  <dd>To be confirmed</dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd>Your full name</dd>
                </div>
              </dl>
              <p className="form-note">
                Placeholder details only—please do not attempt a transfer until
                official details are published.
              </p>
            </article>
            <div className="giving-note">
              <p className="eyebrow">A secure first step</p>
              <h3>Why We Give</h3>
              <p>
                Your generosity helps sustain local ministry, care for people,
                equip the next generation, and participate in mission.
              </p>
              <p>
                We do not accept cards or online payments through this website.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="scripture">
        <blockquote>“God loves a cheerful giver.”</blockquote>
        <p>2 Corinthians 9:7</p>
      </section>
    </>
  );
}
