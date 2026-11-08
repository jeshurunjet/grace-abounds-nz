import Link from 'next/link';
export type BreadcrumbItem = { label: string; href?: string };
export function Breadcrumbs({ items, onDark = false }: { items: BreadcrumbItem[]; onDark?: boolean }) { return <nav className={`breadcrumbs ${onDark ? 'on-dark' : ''}`} aria-label="Breadcrumb">{items.map((item, index) => <span key={`${item.label}-${index}`}>{index > 0 && <i>/</i>}{item.href ? <Link href={item.href}>{item.label}</Link> : <b>{item.label}</b>}</span>)}</nav>; }
