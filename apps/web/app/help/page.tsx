'use client';
import Link from 'next/link';
import { MemberShell } from '../components/member-shell';
import { useContent } from '../components/content-provider';
export default function HelpPage() {
  const { content } = useContent();
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Support</p>
        <h1>How can we help?</h1>
        <p>Find your way around the church app or contact the church office.</p>
      </header>
      <section className="panel">
        <h2>Contact the team</h2>
        <p>
          {content.site.contactEmail}
          <br />
          {content.site.contactPhone}
        </p>
        <div className="form-actions">
          <a className="button" href={`mailto:${content.site.contactEmail}`}>
            Email the office
          </a>
        </div>
        <p className="form-note">
          Private messaging in the app is planned for a later update. For now,
          please use email or phone.
        </p>
      </section>
      <div className="reference-card-grid help-grid">
        <article className="panel">
          <h2>Appointments &amp; prayer</h2>
          <p>
            Request an appointment or share a private prayer request from Home.
            Prayer requests are reviewed in pastoral care.
          </p>
          <Link href="/members">Open home →</Link>
        </article>
        <article className="panel">
          <h2>Member resources</h2>
          <p>
            Search the resource gallery for church study notes and ministry
            files. Resources appear after the church publishes them.
          </p>
          <Link href="/members/gallery">Open resource gallery →</Link>
        </article>
        <article className="panel">
          <h2>Events &amp; attendance</h2>
          <p>
            Browse dates in the public calendar. Let the church know whether you
            can attend from the attendance section on Home.
          </p>
          <Link href="/events">Open events →</Link>
        </article>
      </div>
    </MemberShell>
  );
}
