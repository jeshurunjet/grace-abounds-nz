'use client';
import Image from 'next/image';
import { useContent } from './content-provider';
import { useToast } from './toast';
export function ManagedTeam() {
  const { content } = useContent();
  return (
    <div className="about-team-grid">
      {content.team
        .filter((x) => x.status === 'published')
        .map((person) => (
          <article className="about-team-card" key={person.id}>
            <div>
              <Image
                src={person.image}
                alt={person.name}
                width={500}
                height={500}
              />
            </div>
            <section>
              <h3>{person.name}</h3>
              <b>{person.role}</b>
              <p>{person.bio}</p>
            </section>
          </article>
        ))}
    </div>
  );
}
export function ManagedStory() {
  const { content } = useContent();
  return (
    <>
      {content.site.story
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
    </>
  );
}
export function ManagedContact() {
  const { content } = useContent();
  return (
    <div className="managed-contact">
      <p>
        <b>Email</b>
        {content.site.contactEmail}
      </p>
      <p>
        <b>Phone</b>
        {content.site.contactPhone}
      </p>
      <p>
        <b>Address</b>
        {content.site.contactAddress}
      </p>
    </div>
  );
}
export function ManagedGiving() {
  const { content } = useContent();
  return (
    <dl>
      <div>
        <dt>Account name</dt>
        <dd>{content.site.givingAccount}</dd>
      </div>
      <div>
        <dt>Bank</dt>
        <dd>{content.site.givingBank}</dd>
      </div>
      <div>
        <dt>Account number</dt>
        <dd>{content.site.givingNumber}</dd>
      </div>
      <div>
        <dt>Reference</dt>
        <dd>Your full name</dd>
      </div>
    </dl>
  );
}
export function ManagedVerse({ placement }: { placement: 'home' | 'giving' }) {
  const { content } = useContent();
  const text =
    placement === 'home'
      ? content.site.homeVerseText
      : content.site.givingVerseText;
  const reference =
    placement === 'home'
      ? content.site.homeVerseReference
      : content.site.givingVerseReference;
  return (
    <>
      <span className="scripture-quote">“</span>
      <blockquote>{text}</blockquote>
      <p>{reference}</p>
    </>
  );
}
export function ContactForm() {
  const { push } = useToast();
  return (
    <form
      className="about-contact-form"
      onSubmit={(event) => {
        event.preventDefault();
        event.currentTarget.reset();
        push(
          'This preview cannot deliver messages yet. Please contact the church using the email or phone shown.',
          'info',
        );
      }}
    >
      {[
        ['Name', 'Your full name', 'text'],
        ['Email', 'your@email.com', 'email'],
        ['Subject', 'How can we help?', 'text'],
      ].map(([label, placeholder, type]) => (
        <label key={label}>
          <span>{label}</span>
          <input type={type} placeholder={placeholder} required />
        </label>
      ))}
      <label>
        <span>Message</span>
        <textarea rows={4} placeholder="Your message…" required />
      </label>
      <button className="button" type="submit">
        Send Message
      </button>
    </form>
  );
}
export function GiveOptions() {
  return (
    <section className="online-giving">
      <h3>Give by bank transfer</h3>
      <p>
        Use the church bank details shown on this page. For help with giving or
        receipts, contact the church office.
      </p>
      <a className="button" href="/about#contact">
        Ask about giving
      </a>
    </section>
  );
}
