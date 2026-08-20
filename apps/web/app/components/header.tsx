'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from './logo';
const links = [
  ['Home', '/'],
  ['About', '/about'],
  ['Location', '/location'],
  ['Next Steps', '/next-steps'],
  ['Give', '/give'],
] as const;
export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 40);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <nav className="nav container" aria-label="Main navigation">
        <Logo />
        <button
          className="menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(!open)}
        >
          <span className="sr-only">{open ? 'Close' : 'Open'} menu</span>
          <span className="menu-line line-one" />
          <span className="menu-line line-two" />
          <span className="menu-line line-three" />
        </button>
        <div id="mobile-menu" className={`nav-panel ${open ? 'open' : ''}`}>
          <div className="nav-links">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="auth-links">
            <Link className="button button-outline" href="/login">
              Login
            </Link>
            <Link className="button" href="/signup">
              Sign Up
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
