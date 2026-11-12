import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { AppChrome } from './components/app-chrome';
import { Providers } from './components/providers';
import { fetchPublicContent } from '../lib/server/public-content';
import './theme.css';
import './styles.css';
import './workspace-navigation.css';
import './workspace-theme.css';

const lora = localFont({
  variable: '--font-display',
  display: 'swap',
  src: [
    { path: './fonts/lora-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/lora-500.ttf', weight: '500', style: 'normal' },
    { path: './fonts/lora-600.ttf', weight: '600', style: 'normal' },
    { path: './fonts/lora-700.ttf', weight: '700', style: 'normal' },
    { path: './fonts/lora-italic-400.ttf', weight: '400', style: 'italic' },
    { path: './fonts/lora-italic-600.ttf', weight: '600', style: 'italic' },
  ],
});
const rosario = localFont({
  variable: '--font-body',
  display: 'swap',
  src: [
    { path: './fonts/rosario-300.ttf', weight: '300', style: 'normal' },
    { path: './fonts/rosario-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/rosario-500.ttf', weight: '500', style: 'normal' },
    { path: './fonts/rosario-600.ttf', weight: '600', style: 'normal' },
    { path: './fonts/rosario-700.ttf', weight: '700', style: 'normal' },
    { path: './fonts/rosario-italic-400.ttf', weight: '400', style: 'italic' },
  ],
});

export const metadata: Metadata = {
  title: { default: 'Grace Abounds NZ', template: '%s | Grace Abounds NZ' },
  description:
    'A community of faith rooted in love, growing in grace, and sharing the hope of Jesus.',
};
export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${lora.variable} ${rosario.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;d.dataset.sidebar='collapsed';try{if(localStorage.getItem('grace-sidebar-collapsed')==='false')d.dataset.sidebar='expanded'}catch(e){}try{var t=localStorage.getItem('grace-theme');d.dataset.theme=(t==='light'||t==='dark')?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers initialContent={await fetchPublicContent()}>
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
