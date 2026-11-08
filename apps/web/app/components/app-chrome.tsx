'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Footer } from './footer';
import { Header } from './header';

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const workspace = [
    '/admin',
    '/pastor',
    '/members',
    '/profile',
    '/help',
    '/settings',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));
  return (
    <>
      {!workspace && <Header />}
      {workspace ? (
        <div id="main-content">{children}</div>
      ) : (
        <main id="main-content">{children}</main>
      )}
      {!workspace && <Footer />}
    </>
  );
}
