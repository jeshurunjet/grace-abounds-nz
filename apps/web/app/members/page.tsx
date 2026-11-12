'use client';

import Image from '../components/site-image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MemberShell } from '../components/member-shell';
import { MemberEngagement } from '../components/member-engagement';
import { MemberCalendar } from '../components/member-calendar';
import { StaffTools } from '../components/staff-tools';
import { accountProfile } from '../lib/profiles';

/**
 * Workspace Home for every role: a welcome with the member tools beside it,
 * the shared calendar at full width, then staff tools for Pastor/Admin.
 */
export default function MembersPage() {
  const { data } = useSession();
  const member = accountProfile(data?.user);
  const role = data?.user?.role ?? 'member';
  return (
    <MemberShell>
      <header className="member-welcome member-home-head">
        <div className="member-home-greeting">
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
        </div>
        <MemberEngagement />
      </header>
      <MemberCalendar />
      {(role === 'pastor' || role === 'admin') && <StaffTools role={role} />}
    </MemberShell>
  );
}
