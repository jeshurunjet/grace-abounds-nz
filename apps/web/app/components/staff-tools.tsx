'use client';
import Link from 'next/link';
import { staffTools } from '../lib/staff-tools';

/** Compact links to the staff editors, shown on Home for Pastor and Admin. */
export function StaffTools({ role }: { role: string }) {
  return (
    <section
      className="staff-tools"
      id="staff-tools"
      aria-labelledby="staff-tools-title"
    >
      <h2 id="staff-tools-title">Staff tools</h2>
      <ul>
        {staffTools(role).map(({ href, title, icon: Icon, tone }) => (
          <li key={href}>
            <Link href={href} className={`kit-tile-${tone}`}>
              <span className="member-action-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
