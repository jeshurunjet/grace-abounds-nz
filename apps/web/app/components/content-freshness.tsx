'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const PUBLIC_PAGES = new Set([
  '/',
  '/about',
  '/location',
  '/next-steps',
  '/give',
  '/events',
  '/sermons',
]);
export const isPublicPage = (path: string) =>
  PUBLIC_PAGES.has(path) ||
  path.startsWith('/events/') ||
  path.startsWith('/sermons/');

/**
 * Keeps published website content fresh in an already-open browser. The root
 * layout fetches the content bundle, but it persists across client
 * navigation, so ask the server again when a visitor moves to another public
 * page or comes back to the tab, and when the change stamp (written by every
 * save or restore through the outbox) moves on. No realtime service needed.
 */
export function ContentFreshness() {
  const router = useRouter();
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (isPublicPage(pathname)) router.refresh();
  }, [pathname, router]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [router]);
  // While a public page stays open, check a tiny change stamp once a
  // minute and refetch only when published content has changed.
  usePublishedChanges(pathname, () => router.refresh());
  return null;
}

const STAMP_EVERY_MS = 60_000;
async function readStamp(): Promise<string | null> {
  try {
    const response = await fetch('/api/v1/public/content/stamp', {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { stamp?: string } };
    return body.data?.stamp ?? null;
  } catch {
    return null;
  }
}
/** Calls onChange when the server's content-change stamp moves on. */
export function usePublishedChanges(
  pathname: string,
  onChange: () => void,
  everyMs = STAMP_EVERY_MS,
) {
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    if (!isPublicPage(pathname)) return;
    let last: string | null = null;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const stamp = await readStamp();
      if (stopped || stamp === null) return;
      if (last !== null && stamp !== last) changed.current();
      last = stamp;
    };
    void check();
    const timer = window.setInterval(() => void check(), everyMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pathname, everyMs]);
}
