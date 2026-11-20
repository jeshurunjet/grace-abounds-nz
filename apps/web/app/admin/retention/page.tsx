'use client';
import { AdminShell } from '../../components/admin-shell';
import { RetentionPanel } from '../../components/retention-panel';

/** Records & retention (Phase 5C): due-only clean-up and records holds. */
export default function RetentionPage() {
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Church operations</p>
        <h1>Records &amp; retention</h1>
        <p>
          See which records are due for deletion, keep records that a legal
          obligation, investigation or claim needs, and delete only what is due.
        </p>
      </header>
      <RetentionPanel />
    </AdminShell>
  );
}
