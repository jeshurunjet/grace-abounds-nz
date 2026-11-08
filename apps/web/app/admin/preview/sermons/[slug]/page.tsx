import Link from 'next/link';
import { AdminShell } from '../../../../components/admin-shell';
import { PreviewFrame } from '../../../../components/preview-frame';
import SermonDetail from '../../../../sermons/[slug]/page';

export default function DraftSermonPreview() {
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Unpublished preview</p>
        <h1>Draft sermon details</h1>
        <p>Shows this sermon as it will appear once the draft is approved.</p>
      </header>
      <nav className="cms-tabs">
        <Link
          className="button button-outline"
          href="/admin/preview?page=Sermons"
        >
          Back to sermons preview
        </Link>
      </nav>
      <PreviewFrame>
        <SermonDetail />
      </PreviewFrame>
    </AdminShell>
  );
}
