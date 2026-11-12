'use client';
import Link from 'next/link';
import { staffTools } from '../lib/staff-tools';

/** Staff editors as large tiles, shown on Home under the calendar. */
export function StaffTools({ role }: { role: string }) {
  return (
    <section
      className="staff-tools"
      id="staff-tools"
      aria-labelledby="staff-tools-title"
    >
      <h2 id="staff-tools-title">Staff tools</h2>
      <div className="kit-tiles">
        {staffTools(role).map(
          ({ href, title, description, icon: Icon, tone }) => (
            <Link
              key={href}
              href={href}
              className={`kit-tile kit-tile-${tone}`}
            >
              <span className="kit-tile-art" aria-hidden="true">
                <span>
                  <Icon size={40} strokeWidth={1.6} />
                </span>
              </span>
              <span className="kit-tile-body">
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </Link>
          ),
        )}
      </div>
    </section>
  );
}
