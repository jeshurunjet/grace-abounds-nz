'use client';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSafeAppPath,
  type AppNotification,
  type NotificationList,
} from '@grace-abounds/validation';
import { api } from '../lib/api-client';
import { useToast } from './toast';

/*
 * The bell (Phase 4A): the signed-in person's own durable notifications
 * from the server, with persisted read state. Refreshes when opened, when
 * the tab returns and every minute while visible, so a new update shows up
 * without reloading. Opening one marks it read, then follows its link
 * (only ever a path inside this app; the page checks access again).
 *
 * - A new sign-in clears the list and loads that person's at once, even if
 *   a request for the previous person is still on its way; answers for
 *   anyone else are dropped.
 * - Only the newest answer is used, and marking read counts as newest, so
 *   a list fetched before it can't make an item unread again.
 * - If marking read fails, the person is told and the item stays unread.
 * - A click whose answer arrives after a sign-in change doesn't navigate.
 */

const REFRESH_MS = 60_000;
const empty: NotificationList = { items: [], unread: 0 };

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(iso).toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
  });
};

export function NotificationMenu() {
  const { data } = useSession();
  const router = useRouter();
  const { push } = useToast();
  const userId = data?.user?.id ?? '';
  const [list, setList] = useState<NotificationList>(empty);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const owner = useRef(userId);
  owner.current = userId;
  // Request order: marking read beats any list fetched before or during it.
  const seq = useRef(0);
  const latestGet = useRef(0);
  const latestMark = useRef(0);
  const marking = useRef(0);

  /** Runs a request; its answer is used only if still newest and theirs. */
  const request = useCallback(
    async (path: string, method: 'GET' | 'POST' = 'GET') => {
      const forUser = owner.current;
      const mark = method === 'POST';
      const ticket = ++seq.current;
      if (mark) {
        latestMark.current = ticket;
        latestGet.current = ticket; // lists already on their way are stale
        marking.current++;
      } else latestGet.current = ticket;
      const markingAtStart = marking.current;
      try {
        const value = (
          await api<NotificationList>(path, mark ? { method } : {})
        ).data;
        const current =
          forUser === owner.current &&
          Array.isArray(value?.items) &&
          (mark
            ? ticket === latestMark.current
            : ticket === latestGet.current &&
              markingAtStart === 0 &&
              marking.current === 0);
        if (current) setList(value);
        return current;
      } finally {
        // A previous person's request doesn't hold up the new person's.
        if (mark && forUser === owner.current)
          marking.current = Math.max(0, marking.current - 1);
      }
    },
    [],
  );

  const load = useCallback(async () => {
    if (!owner.current) return;
    try {
      await request('/me/notifications');
    } catch {
      // Keep what is shown; the next refresh tries again.
    }
  }, [request]);

  useEffect(() => {
    latestGet.current = ++seq.current;
    latestMark.current = seq.current;
    marking.current = 0;
    setList(empty);
    setProblem('');
    setOpen(false);
    if (!userId) return;
    void load();
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void load();
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [userId, load]);

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

  async function openItem(item: AppNotification) {
    const forUser = owner.current;
    setOpen(false);
    if (!item.read)
      try {
        await request(`/me/notifications/${item.id}/read`, 'POST');
      } catch {
        if (forUser === owner.current)
          push('Couldn’t mark that update as read. It stays unread.', 'error');
      }
    // Signed out or switched while waiting: don't take them anywhere.
    if (forUser !== owner.current) return;
    if (item.href && isSafeAppPath(item.href)) router.push(item.href);
  }

  async function readAll() {
    setProblem('');
    try {
      await request('/me/notifications/read-all', 'POST');
    } catch {
      setProblem('Couldn’t mark them as read. Check your connection.');
    }
  }

  if (!userId) return null;
  return (
    <div className="notification-menu" ref={root}>
      <button
        className="notification-trigger"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
        aria-label={
          list.unread ? `Notifications, ${list.unread} unread` : 'Notifications'
        }
        aria-expanded={open}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {list.unread > 0 && <i>{list.unread > 99 ? '99+' : list.unread}</i>}
      </button>
      {open && (
        <div
          className="notification-popover"
          role="region"
          aria-label="Notifications"
        >
          <header>
            <span>
              <strong>Notifications</strong>
              {list.unread > 0 && <small>{list.unread} unread</small>}
            </span>
            {list.unread > 0 && (
              <button type="button" onClick={() => void readAll()}>
                Mark all read
              </button>
            )}
          </header>
          {problem && (
            <p className="notification-problem" role="alert">
              {problem}{' '}
              <button type="button" onClick={() => void readAll()}>
                Try again
              </button>
            </p>
          )}
          {!list.items.length && <p>No updates yet.</p>}
          {list.items.map((item) => (
            <button
              type="button"
              className="notification-item"
              key={item.id}
              onClick={() => void openItem(item)}
            >
              <i className={item.read ? '' : 'unread'} aria-hidden="true" />
              <span>
                <strong>
                  {item.title}
                  {!item.read && <span className="sr-only"> (unread)</span>}
                </strong>
                {item.body && <small>{item.body}</small>}
              </span>
              <time dateTime={item.createdAt}>{ago(item.createdAt)}</time>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
