import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Footer } from './components/footer';
import { Header } from './components/header';
import './styles.css';

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
export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${lora.variable} ${rosario.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
