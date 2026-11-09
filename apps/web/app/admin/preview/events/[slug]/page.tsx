import Link from 'next/link';
import { AdminShell } from '../../../../components/admin-shell';
import { PreviewFrame } from '../../../../components/preview-frame';
import EventDetail from '../../../../events/[slug]/page';

export default function DraftEventPreview() {
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Unpublished preview</p>
        <h1>Activity details</h1>
        <p>
          Activities are not part of the website draft, so this is the live
          version.
        </p>
      </header>
      <nav className="cms-tabs">
        <Link
          className="button button-outline"
          href="/admin/preview?page=Events"
        >
          Back to events preview
        </Link>
      </nav>
      <PreviewFrame>
        <EventDetail />
      </PreviewFrame>
    </AdminShell>
  );
}
