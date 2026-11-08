'use client';
import { ThemeProvider } from './theme-provider';
import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { ContentProvider } from './content-provider';
import { ToastProvider } from './toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ContentProvider>
          <ToastProvider>{children}</ToastProvider>
        </ContentProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
