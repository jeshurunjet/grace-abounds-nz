'use client';
import { ThemeProvider } from './theme-provider';
import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import type { PublicContentBundle } from '@grace-abounds/validation';
import { ContentProvider } from './content-provider';
import { ToastProvider } from './toast';
import { ProfileSync } from './profile-sync';

export function Providers({
  children,
  initialContent,
}: {
  children: ReactNode;
  initialContent: PublicContentBundle | null;
}) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ContentProvider initialContent={initialContent}>
          <ToastProvider>
            <ProfileSync />
            {children}
          </ToastProvider>
        </ContentProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
