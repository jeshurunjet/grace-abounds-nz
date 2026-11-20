import Image, { type ImageProps } from 'next/image';

/** Hosts the site's image server may fetch from (see next.config.ts). */
const OPTIMIZED_HOSTS = ['images.unsplash.com', 'lh3.googleusercontent.com'];

export function canOptimize(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return true;
  // Private files (such as a profile photo) need the visitor's own sign-in:
  // the browser loads them directly, never the site's image server.
  if (src.startsWith('/api/')) return false;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && OPTIMIZED_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Content photos. Links to other websites load straight from that website in
 * the visitor's browser; the site's own image server only fetches from the
 * trusted hosts above, so it can't be used to fetch arbitrary addresses.
 */
export default function SiteImage({ alt, unoptimized, ...props }: ImageProps) {
  return (
    <Image
      {...props}
      alt={alt}
      unoptimized={unoptimized || !canOptimize(props.src)}
    />
  );
}
