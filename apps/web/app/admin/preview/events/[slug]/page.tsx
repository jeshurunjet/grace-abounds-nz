import Link from 'next/link';
import { AdminShell } from '../../../../components/admin-shell';
import { PreviewFrame } from '../../../../components/preview-frame';
import EventDetail from '../../../../events/[slug]/page';

export default function DraftEventPreview() {
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Unpublished preview</p>
        <h1>Draft event details</h1>
        <p>Shows this event as it will appear once the draft is approved.</p>
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
