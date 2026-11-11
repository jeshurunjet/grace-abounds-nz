'use client';
import { MemberShell } from '../../components/member-shell';
import { MemberCalendar } from '../../components/member-calendar';
import { SundayStatus } from '../../components/activity-ui';

/**
 * Events & calendar inside the workspace, so the sidebar stays in place.
 * Reuses the Home calendar; the public /events page is unchanged.
 */
export default function WorkspaceCalendarPage() {
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Church life</p>
        <h1>Events &amp; calendar</h1>
        <p>Services, groups and events, with the ones you have joined.</p>
      </header>
      <SundayStatus />
      <MemberCalendar />
    </MemberShell>
  );
}
