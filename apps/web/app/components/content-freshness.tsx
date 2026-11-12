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
 * page or comes back to the tab. No realtime service is needed.
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
  return null;
}
