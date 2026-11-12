'use client';

import Image from '../components/site-image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MemberShell } from '../components/member-shell';
import { MemberEngagement } from '../components/member-engagement';
import { MemberCalendar } from '../components/member-calendar';
import { SundayStatus } from '../components/activity-ui';
import { Reveal } from '../components/reveal';
import { useContent } from '../components/content-provider';
import { accountProfile } from '../lib/profiles';

export default function MembersPage() {
  const { content } = useContent();
  const { data } = useSession();
  const member = accountProfile(data?.user);
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
          <SundayStatus />
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
      <MemberEngagement />
    </MemberShell>
  );
}
