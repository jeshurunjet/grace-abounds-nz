'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AdminShell } from '../../components/admin-shell';
import { manageTiles } from '../../lib/manage-tiles';

export default function ManagePage() {
  const { data } = useSession();
  const role = data?.user?.role ?? 'admin';
  return (
    <AdminShell>
      <div className="kit-page kit-hub">
        <header className="kit-hub-head">
          <h1>Manage</h1>
          <p>Choose what you’d like to work on.</p>
        </header>
        <div className="kit-tiles">
          {manageTiles(role).map(
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
      </div>
    </AdminShell>
  );
}
