'use client';

import Image from 'next/image';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Home, Images, LayoutDashboard, Menu } from 'lucide-react';
import { profileById, profileByRole } from '../lib/profiles';
import { isRouteActive } from '../lib/role-navigation';
import { Logo } from './logo';
import { NotificationMenu } from './notification-menu';

export function MemberNav() {
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { data } = useSession();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const profile = profileById(data?.user?.profileId) ?? profileByRole('member');
  useEffect(() => { setOpen(false); setNavOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open && !navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); setNavOpen(false); } };
    const onPointerDown = (event: PointerEvent) => !menuRef.current?.contains(event.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => { window.removeEventListener('keydown', onKeyDown); document.removeEventListener('pointerdown', onPointerDown); };
  }, [open, navOpen]);
  const links = [{ href: '/', label: 'Main website', active: false, icon: Home }, { href: '/members', label: 'Dashboard', active: pathname === '/members', icon: LayoutDashboard }, { href: '/members/gallery', label: 'Resource Gallery', active: isRouteActive(pathname, '/members/gallery'), icon: Images }];
  return <header className="member-nav"><div className="member-nav-inner"><div className="member-brand"><Logo /><b>Members</b></div><button className="member-nav-toggle" onClick={() => setNavOpen((value) => !value)} aria-label="Open member navigation" aria-expanded={navOpen}><Menu aria-hidden="true" /></button><nav className={navOpen ? 'open' : ''}>{links.map((link) => { const Icon = link.icon; return <Link className="member-nav-icon" key={link.href} href={link.href} aria-label={link.label} data-tooltip={link.label} aria-current={link.active ? 'page' : undefined} onClick={() => { setOpen(false); setNavOpen(false); }}><Icon aria-hidden="true" /><span className="member-nav-label">{link.label}</span></Link>; })}</nav><div className="member-account"><Link className="member-help" href="/help" onClick={() => setOpen(false)}>Help</Link><NotificationMenu /><div className="member-menu" ref={menuRef}><button className="profile-avatar-button" onClick={() => setOpen((value) => !value)} aria-label="Open account menu" aria-expanded={open}><Image src={profile.photo} alt="" width={38} height={38} /></button>{open && <div className="member-menu-popover"><div><strong>{profile.name}</strong><small>{profile.title}</small></div><Link href={`/profile/${data?.user?.profileId ?? profile.id}`} onClick={() => setOpen(false)}>Profile</Link><Link href="/help" onClick={() => setOpen(false)}>Help & admin support</Link><button onClick={() => signOut({ callbackUrl: '/' })}>Sign out</button></div>}</div></div></div></header>;
}
