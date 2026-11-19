'use client';
import { AdminShell } from '../../components/admin-shell';
import { StaffAppointments } from '../../components/staff-appointments';

/*
 * Appointment scheduling for Admin (Phase 4B). The server sends Admin only
 * who, contact, time, place and status; topics, messages and the pastor's
 * notes never reach this page.
 */
export default function AdminAppointments() {
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Scheduling</p>
        <h1>Appointments</h1>
        <p>
          Suggest and confirm times for members’ appointments with the pastor.
        </p>
      </header>
      <StaffAppointments />
    </AdminShell>
  );
}
