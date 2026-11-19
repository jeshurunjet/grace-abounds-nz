'use client';
import { AdminShell } from '../../components/admin-shell';
import { PeopleDirectory } from '../../components/people-directory';

/*
 * People (Phase 4C): real accounts from the server, for both staff roles.
 * Ordinary members can be suspended or reactivated here; staff accounts,
 * roles, deletion and export are not changed from this page.
 */
export default function PeoplePage() {
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Church operations</p>
        <h1>People</h1>
        <p>
          Find member accounts and suspend or reactivate access when needed.
        </p>
      </header>
      <PeopleDirectory />
    </AdminShell>
  );
}
