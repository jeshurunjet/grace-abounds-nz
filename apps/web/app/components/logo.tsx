import Image from 'next/image';
import Link from 'next/link';
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Grace Abounds NZ home">
      <Image src="/brand/logo.png" alt="" width={44} height={40} priority />
      <span>
        <strong className={light ? 'light' : ''}>Grace Abounds</strong>
        <small>International</small>
      </span>
    </Link>
  );
}
