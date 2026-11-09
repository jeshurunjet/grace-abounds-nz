'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { useContent } from './content-provider';
export function NotificationMenu() {
  const { content } = useContent();
  const { data } = useSession();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pastor = data?.user?.role === 'pastor';
  const user = content.users.find((item) => item.email === data?.user?.email);
  const notices = content.appointmentRequests
    .filter((item) => item.userId === user?.id)
    .map((item) => ({
      title: `${item.type}: ${item.status}`,
      detail: item.preferredDate,
      href: '/members',
    }));
  if (
    pastor &&
    content.memberPrayerRequests.some((item) => item.status === 'new')
  )
    notices.push({
      title: 'New prayer requests',
      detail: 'Open pastoral care to review.',
      href: '/pastor/care',
    });
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <div className="notification-menu" ref={root}>
      <button
        className="notification-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-label={`${notices.length} notifications`}
        aria-expanded={open}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {notices.length > 0 && <i>{notices.length}</i>}
      </button>
      {open && (
        <div className="notification-popover">
          <header>
            <strong>Notifications</strong>
          </header>
          {!notices.length && <p>No updates yet.</p>}
          {notices.map((item, index) => (
            <Link
              className="notification-item"
              key={`${item.title}-${index}`}
              href={item.href}
              onClick={() => setOpen(false)}
            >
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
