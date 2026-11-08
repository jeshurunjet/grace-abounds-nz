'use client';
import { useRouter } from 'next/navigation';
import { useState, type MouseEvent, type ReactNode } from 'react';

const pageNames: Record<string, string> = {
  '/': 'Home',
  '/about': 'About',
  '/location': 'Locations',
  '/next-steps': 'Next steps',
  '/give': 'Giving',
  '/events': 'Events',
  '/sermons': 'Sermons',
};

/** Maps a public URL to its staff-only draft-preview equivalent, if any. */
export function previewHref(href: string): string | null {
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin) return null;
  const page = pageNames[url.pathname];
  if (page) return `/admin/preview?page=${encodeURIComponent(page)}${url.hash}`;
  const detail = url.pathname.match(/^\/(events|sermons)\/([^/]+)$/);
  if (detail) return `/admin/preview/${detail[1]}/${detail[2]}`;
  return null;
}

/**
 * Keeps internal navigation inside the draft preview. Links to public pages
 * and event/sermon details stay in preview; anything else (member area,
 * sign-in, forms) is blocked so staff cannot act on draft content.
 */
export function PreviewFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [notice, setNotice] = useState('');
  function onClick(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor || anchor.target === '_blank') return;
    const href = anchor.getAttribute('href') ?? '';
    if (!href || href.startsWith('#')) return;
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    const next = previewHref(href);
    if (next) {
      setNotice('');
      router.push(next);
    } else
      setNotice(
        `“${anchor.textContent?.trim() || href}” leads outside the website preview and is disabled here.`,
      );
  }
  return (
    <div
      className="draft-preview"
      onClickCapture={onClick}
      onSubmitCapture={(event) => {
        event.preventDefault();
        setNotice('Forms are disabled in the draft preview. Nothing was sent.');
      }}
    >
      {notice && (
        <p className="form-note" role="status">
          {notice}
        </p>
      )}
      {children}
    </div>
  );
}
