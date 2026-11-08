'use client';

import Link from 'next/link';
import type { ReactNode, SVGProps } from 'react';
import type { SocialPlatform } from '../lib/social-links';
import { Logo } from './logo';
import { useContent } from './content-provider';
import { FloatingControls } from './floating-controls';

const socialIconPaths: Record<SocialPlatform, ReactNode> = {
  facebook: (
    <path d="M14 8.6V6.5c0-.9.6-1.1 1-1.1h2.5V1.6L14.1 1.5C10.4 1.5 9.5 4.3 9.5 6v2.6H7v4.3h2.5v9.6H14v-9.6h3.2l.6-4.3H14Z" />
  ),
  instagram: (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.7" cy="6.4" r="1" className="social-icon-dot" />
    </>
  ),
  youtube: (
    <>
      <path d="M21.4 7.1a2.8 2.8 0 0 0-2-2C17.7 4.6 12 4.6 12 4.6s-5.7 0-7.4.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2.1 12a29 29 0 0 0 .5 4.9 2.8 2.8 0 0 0 2 2c1.7.5 7.4.5 7.4.5s5.7 0 7.4-.5a2.8 2.8 0 0 0 2-2 29 29 0 0 0 .5-4.9 29 29 0 0 0-.5-4.9Z" />
      <path d="m9.9 15.3 5.3-3.3-5.3-3.3v6.6Z" className="social-icon-play" />
    </>
  ),
};

function SocialIcon({ platform, ...props }: SVGProps<SVGSVGElement> & { platform: SocialPlatform }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      {socialIconPaths[platform]}
    </svg>
  );
}

export function Footer() {
  const { content } = useContent();
  const socialLinks = [
    { platform: 'facebook' as const, label: 'Facebook', href: content.site.facebookUrl },
    { platform: 'instagram' as const, label: 'Instagram', href: content.site.instagramUrl },
    { platform: 'youtube' as const, label: 'YouTube', href: content.site.youtubeUrl },
  ].filter((item) => item.href);
  return (
    <footer className="footer">
      <div className="footer-fluid footer-grid">
        <div>
          <Logo light />
          <p>
            A community of faith rooted in love, growing in grace, and sharing
            the hope of Jesus Christ.
          </p>
          <b>Sundays · 10:00am · Auckland</b>
          <address>{content.site.footerAddress}</address>
          <div className="footer-socials" aria-label="Follow us on social media">
            {socialLinks.map(({ platform, label, href }) => (
              <a
                key={platform}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${label} (opens in a new tab)`}
                title={label}
              >
                <SocialIcon platform={platform} />
              </a>
            ))}
          </div>
        </div>
        <div>
          <h2>Explore</h2>
          {(
            [
              ['Home', '/'],
              ['About', '/about'],
              ['Location', '/location'],
              ['Next Steps', '/next-steps'],
              ['Give', '/give'],
              ['Events', '/events'],
              ['Sermons', '/sermons'],
            ] as const
          ).map(([l, h]) => (
            <Link key={h} href={h}>
              {l}
            </Link>
          ))}
        </div>
        <div>
          <h2>Connect</h2>
          <Link href="/#prayer">Prayer Request</Link>
          <Link href="/location">Connect Groups</Link>
          <Link href="/next-steps">Baptism</Link>
          <Link href="/about#contact">Contact Us</Link>
        </div>
      </div>
      <div className="footer-fluid footer-bottom">
        <span>
          © {new Date().getFullYear()} Grace Abounds International · All rights
          reserved
        </span>
        <div className="footer-legal" aria-label="Legal links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Use</Link>
        </div>
      </div>
      <FloatingControls />
    </footer>
  );
}
