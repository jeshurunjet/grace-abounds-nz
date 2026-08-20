import Link from 'next/link';
import { Logo } from './logo';
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Logo light />
          <p>
            A community of faith rooted in love, growing in grace, and sharing
            the hope of Jesus Christ.
          </p>
          <b>Sundays · 10:00am · Auckland</b>
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
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} Grace Abounds International · All rights
          reserved
        </span>
        <div className="footer-legal" aria-label="Legal placeholders">
          <span>Privacy Policy</span>
          <span>Terms of Use</span>
        </div>
      </div>
    </footer>
  );
}
