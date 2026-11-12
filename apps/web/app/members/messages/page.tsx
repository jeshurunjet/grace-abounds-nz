'use client';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { MemberShell } from '../../components/member-shell';
import { useContent } from '../../components/content-provider';

/**
 * Messaging is a future feature (Future F2). Until the real service exists,
 * this route says so plainly and offers the church contact details; the
 * earlier browser-only chat prototype is not shown or used.
 */
export default function MessagesPage() {
  const { content } = useContent();
  const { contactEmail, contactPhone } = content.site;
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Messages</p>
        <h1>Messaging isn’t available yet</h1>
        <p>
          Private messages with the church team are planned for a later update.
        </p>
      </header>
      <section className="panel messages-unavailable" role="status">
        <MessageCircle aria-hidden="true" size={28} />
        <div>
          <h2>Contact the church office</h2>
          {contactEmail || contactPhone ? (
            <p>
              {contactEmail && (
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              )}
              {contactEmail && contactPhone && <br />}
              {contactPhone && (
                <a href={`tel:${contactPhone.replace(/\s+/g, '')}`}>
                  {contactPhone}
                </a>
              )}
            </p>
          ) : (
            <p>Contact details will appear here once they are published.</p>
          )}
          <Link className="button button-outline" href="/members">
            Back to Home
          </Link>
        </div>
      </section>
    </MemberShell>
  );
}
