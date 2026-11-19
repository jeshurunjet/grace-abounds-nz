'use client';
import { MemberShell } from '../../components/member-shell';
import { PastorPrayers } from '../../components/pastor-prayers';
import { StaffAppointments } from '../../components/staff-appointments';
export default function PastoralCare() {
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Pastoral care</p>
        <h1>Prayer &amp; appointments</h1>
        <p>
          Prayer requests and appointments from members. Topics, messages and
          your notes are private to you.
        </p>
      </header>
      <div className="dashboard-grid">
        <PastorPrayers />
        <StaffAppointments />
      </div>
    </MemberShell>
  );
}
