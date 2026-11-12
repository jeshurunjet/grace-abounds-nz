import Image, { type ImageProps } from 'next/image';

/** Hosts the site's image server may fetch from (see next.config.ts). */
const OPTIMIZED_HOSTS = ['images.unsplash.com', 'lh3.googleusercontent.com'];

export function canOptimize(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return true;
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
export default function SiteImage({ unoptimized, ...props }: ImageProps) {
  return (
    <Image {...props} unoptimized={unoptimized || !canOptimize(props.src)} />
  );
}
