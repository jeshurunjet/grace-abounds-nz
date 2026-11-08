'use client';
import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { profileById, profileByRole } from '../lib/profiles';
import { getRoleNavigation } from '../lib/role-navigation';
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const roleNav = getRoleNavigation(role);
  const profile = session?.user
    ? (profileById(session.user.profileId) ?? profileByRole(role))
    : undefined;
  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open && !accountOpen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setAccountOpen(false);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, accountOpen]);
  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [accountOpen]);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 40);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <nav className="nav nav-fluid" aria-label="Main navigation">
        <Logo />
        <button
          className="menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => {
            setOpen(!open);
            setAccountOpen(false);
          }}
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
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ))}
          </div>
          {status === 'unauthenticated' && (
            <div className="auth-links">
              <Link
                className="button button-outline"
                href="/login"
                onClick={() => setOpen(false)}
              >
                Login
              </Link>
              <Link
                className="button"
                href="/signup"
                onClick={() => setOpen(false)}
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
        {status === 'authenticated' && profile && (
          <div className="public-account" ref={accountRef}>
            <Link
              className="workspace-shortcut"
              href={roleNav.workspaceHref}
              aria-label="Return to workspace"
              title={`Return to ${roleNav.workspaceLabel}`}
              onClick={() => {
                setAccountOpen(false);
                setOpen(false);
              }}
            >
              <LayoutDashboard size={20} aria-hidden="true" />
              <span className="workspace-shortcut-tooltip" aria-hidden="true">
                Return to workspace
              </span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setAccountOpen((value) => !value);
                setOpen(false);
              }}
              aria-label="Open account menu"
              aria-expanded={accountOpen}
            >
              <Image src={profile.photo} alt="" width={36} height={36} />
            </button>
            {accountOpen && (
              <div className="public-account-menu">
                <div>
                  <strong>{profile.name}</strong>
                  <small>{profile.title}</small>
                </div>
                <Link
                  href={roleNav.workspaceHref}
                  onClick={() => {
                    setAccountOpen(false);
                    setOpen(false);
                  }}
                >
                  {roleNav.workspaceLabel}
                </Link>
                <Link
                  href={`/profile/${session.user.profileId}`}
                  onClick={() => {
                    setAccountOpen(false);
                    setOpen(false);
                  }}
                >
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
