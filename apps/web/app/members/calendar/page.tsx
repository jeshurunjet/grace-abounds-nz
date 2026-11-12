'use client';
import { MemberShell } from '../../components/member-shell';
import { MemberCalendar } from '../../components/member-calendar';
import { SundayStatus } from '../../components/activity-ui';
import { MemberActivities } from '../../components/member-activities';

/**
 * Calendar inside the workspace, with joining and bookings. Old Home links
 * (?activity=, ?join=) arrive here. The public /events page is unchanged.
 */
export default function WorkspaceCalendarPage() {
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Church life</p>
        <h1>Calendar &amp; bookings</h1>
        <p>Services, groups and events, with the ones you have joined.</p>
      </header>
      <SundayStatus />
      <MemberCalendar />
      <MemberActivities />
    </MemberShell>
  );
}
