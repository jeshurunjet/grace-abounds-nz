'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useContent } from './content-provider';

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
  // While a public page stays open, compare the server's latest content
  // generation with the one this page is showing, once a minute.
  const { generation } = useContent();
  usePublishedChanges(pathname, generation, () => router.refresh());
  return null;
}

const STAMP_EVERY_MS = 60_000;
async function latestGeneration(): Promise<number | null> {
  try {
    const response = await fetch('/api/v1/public/content/stamp', {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: { generation?: unknown };
    };
    const value = body.data?.generation;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
/**
 * Calls onBehind whenever the server has a newer content generation than
 * the one rendered. Nothing is remembered between checks: the rendered
 * bundle's own generation is the reference, so a change saved before the
 * first check is caught, and a refresh that still gets stale (for example
 * cached) content is simply retried at the next check until the page shows
 * the latest generation.
 */
export function usePublishedChanges(
  pathname: string,
  rendered: number | null,
  onBehind: () => void,
  everyMs = STAMP_EVERY_MS,
) {
  const behind = useRef(onBehind);
  behind.current = onBehind;
  useEffect(() => {
    if (!isPublicPage(pathname) || rendered === null) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const latest = await latestGeneration();
      if (!stopped && latest !== null && latest > rendered) behind.current();
    };
    void check();
    const timer = window.setInterval(() => void check(), everyMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pathname, rendered, everyMs]);
}
