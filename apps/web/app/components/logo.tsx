import Image from 'next/image';
import Link from 'next/link';
export function Logo({
  light = false,
  href = '/',
}: {
  light?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="brand"
      aria-label={
        href === '/' ? 'Grace Abounds NZ home' : 'Grace Abounds workspace home'
      }
    >
      <Image src="/brand/logo.png" alt="" width={44} height={40} priority />
      <span>
        <strong className={light ? 'light' : ''}>Grace Abounds</strong>
        <small>International</small>
      </span>
    </Link>
  );
}
