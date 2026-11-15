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
 * page or comes back to the tab, and when the change stamp moves on: either
 * the generation (written by every save or restore through the outbox) or the
 * latest scheduled release that has passed (which needs no save). No
 * realtime service needed.
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
  // While a public page stays open, compare the server's latest stamp with
  // the bundle this page is showing, once a minute.
  const { generation, released } = useContent();
  usePublishedChanges(
    pathname,
    generation === null ? null : { generation, released },
    () => router.refresh(),
  );
  return null;
}

const STAMP_EVERY_MS = 60_000;
/** What a bundle (or the server's stamp) says about its freshness. */
export type ContentStamp = { generation: number; released: number };
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
async function latestStamp(): Promise<ContentStamp | null> {
  try {
    const response = await fetch('/api/v1/public/content/stamp', {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: { generation?: unknown; released?: unknown };
    };
    const { generation, released } = body.data ?? {};
    if (!isNumber(generation)) return null;
    return { generation, released: isNumber(released) ? released : 0 };
  } catch {
    return null;
  }
}
/**
 * Calls onBehind whenever the server has a newer content generation, or a
 * later scheduled release has passed, than the bundle rendered. Nothing is
 * remembered between checks: the rendered bundle is the reference, so a
 * change saved (or a release passed) before the first check is caught, and a
 * refresh that still gets stale (for example cached) content is simply
 * retried at the next check until the page shows the latest content.
 */
export function usePublishedChanges(
  pathname: string,
  rendered: ContentStamp | null,
  onBehind: () => void,
  everyMs = STAMP_EVERY_MS,
) {
  const behind = useRef(onBehind);
  behind.current = onBehind;
  const generation = rendered?.generation ?? null;
  const released = rendered?.released ?? 0;
  useEffect(() => {
    if (!isPublicPage(pathname) || generation === null) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const latest = await latestStamp();
      if (
        !stopped &&
        latest !== null &&
        (latest.generation > generation || latest.released > released)
      )
        behind.current();
    };
    void check();
    const timer = window.setInterval(() => void check(), everyMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pathname, generation, released, everyMs]);
}
