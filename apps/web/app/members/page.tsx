'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MemberShell } from '../components/member-shell';
import { MemberEngagement } from '../components/member-engagement';
import { MemberCalendar } from '../components/member-calendar';
import { Reveal } from '../components/reveal';
import { useContent } from '../components/content-provider';
import { profileById, profileByRole } from '../lib/profiles';

export default function MembersPage() {
  const { content } = useContent();
  const { data } = useSession();
  const member = profileById(data?.user?.profileId) ?? profileByRole('member');
  const role = data?.user?.role ?? 'member';
  const notices = content.appointmentRequests
    .filter(
      (item) =>
        content.users.find((user) => user.email === data?.user?.email)?.id ===
        item.userId,
    )
    .map((item) => ({
      title: item.type,
      detail: `${item.preferredDate} · ${item.status}`,
    }));
  const latest = content.sermons.find((item) => item.status === 'published');
  return (
    <MemberShell>
      <Reveal>
        <header className="member-welcome">
          <Link href={`/profile/${data?.user?.profileId ?? member.id}`}>
            <Image
              src={member.photo}
              alt={member.name}
              width={66}
              height={66}
              priority
            />
          </Link>
          <div>
            <p className="eyebrow">Church home</p>
            <h1>Kia ora, {member.shortName.split(' ')[0]}</h1>
          </div>
        </header>
      </Reveal>
      <div className="member-overview-grid">
        <Reveal direction="right">
          <MemberCalendar />
        </Reveal>
        <div className="member-overview-side">
          <Reveal direction="left">
            <section className="panel member-updates">
              <div className="panel-heading">
                <h2>Your updates</h2>
                <span>{notices.length} updates</span>
              </div>
              {!notices.length && (
                <p>Your appointment updates will appear here.</p>
              )}
              {notices.map((notice) => (
                <div className="member-update" key={notice.title}>
                  <i>+</i>
                  <span>
                    <b>{notice.title}</b>
                    <small>{notice.detail}</small>
                  </span>
                </div>
              ))}
            </section>
          </Reveal>
          {latest && (
            <Reveal direction="left" delay={80}>
              <Link
                className="member-sermon-feature member-sermon-compact"
                href={`/sermons/${latest.slug}`}
              >
                <span className="member-sermon-image">
                  <Image
                    src={latest.image}
                    alt=""
                    width={900}
                    height={500}
                    sizes="(max-width: 800px) 100vw, 35vw"
                  />
                </span>
                <span>
                  <small>Latest sermon</small>
                  <h2>{latest.title}</h2>
                </span>
              </Link>
            </Reveal>
          )}
        </div>
      </div>
      {role !== 'member' && (
        <section className="panel staff-shortcuts">
          <h2>{role === 'pastor' ? 'Pastor tools' : 'Admin tools'}</h2>
          <p>
            {role === 'pastor'
              ? 'Review website changes and publish approved content.'
              : 'Prepare content and submit it for pastor approval.'}
          </p>
          <div className="form-actions">
            <Link className="button" href="/admin/cms">
              Website content
            </Link>
            <Link className="button button-outline" href="/admin/users">
              Member activity
            </Link>
            {role === 'pastor' && (
              <Link className="button button-outline" href="/pastor/care">
                Prayer & appointments
              </Link>
            )}
          </div>
        </section>
      )}
      <MemberEngagement />
      <div className="member-feature-grid member-feature-single">
        <Reveal>
          <Link className="member-resource-feature" href="/members/gallery">
            <span>Member files</span>
            <h2>Resource Gallery</h2>
            <p>
              Browse sermon notes, group guides, bulletins, audio, and ministry
              files.
            </p>
            <b>Open gallery →</b>
          </Link>
        </Reveal>
      </div>
    </MemberShell>
  );
}
