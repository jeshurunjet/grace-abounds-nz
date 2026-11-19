'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** The address with one query parameter removed (others kept). */
export function hrefWithout(
  pathname: string,
  params: URLSearchParams | null,
  key: string,
) {
  const query = new URLSearchParams(params?.toString() ?? '');
  query.delete(key);
  const rest = query.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

/**
 * A list filter kept in the address (?key=value), so a link such as a Home
 * count opens the list it counted, and a later link to the same page with a
 * different value switches the filter without a reload. Choosing a filter
 * on the page updates the address too (other parameters, such as an open
 * record's id, are kept). Unknown values fall back to the default.
 */
export function useUrlFilter<T extends string>(
  key: string,
  options: readonly T[],
  fallback: T,
) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const raw = params?.get(key) ?? '';
  const fromUrl = (options as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
  const [value, setValue] = useState<T>(fromUrl);
  useEffect(() => {
    setValue(fromUrl);
  }, [fromUrl]);
  function choose(next: T) {
    setValue(next);
    const query = new URLSearchParams(params?.toString() ?? '');
    if (next === fallback) query.delete(key);
    else query.set(key, next);
    const rest = query.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  }
  return [value, choose] as const;
}
