import Link from 'next/link';
import { AdminShell } from '../../components/admin-shell';
import { PreviewFrame } from '../../components/preview-frame';
import Home from '../../page';
import About from '../../about/page';
import Location from '../../location/page';
import NextSteps from '../../next-steps/page';
import Give from '../../give/page';
import Events from '../../events/page';
import Sermons from '../../sermons/page';
const pages = {
  Home,
  About,
  Locations: Location,
  'Next steps': NextSteps,
  Giving: Give,
  Events,
  Sermons,
};
export default async function DraftPreview({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page = 'Home' } = await searchParams;
  const Page = pages[page as keyof typeof pages] ?? Home;
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Unpublished preview</p>
        <h1>Review website draft</h1>
        <p>
          Only staff can access this preview. Links between public pages and to
          event or sermon details stay in the draft; forms are disabled.
        </p>
      </header>
      <nav className="cms-tabs">
        {Object.keys(pages).map((name) => (
          <Link
            className="button button-outline"
            aria-current={name === page ? 'page' : undefined}
            href={`/admin/preview?page=${encodeURIComponent(name)}`}
            key={name}
          >
            {name}
          </Link>
        ))}
      </nav>
      <PreviewFrame>
        <Page />
      </PreviewFrame>
    </AdminShell>
  );
}
