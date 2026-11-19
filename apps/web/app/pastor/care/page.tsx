'use client';
import { MemberShell } from '../../components/member-shell';
import { useContent } from '../../components/content-provider';
import { PastorPrayers } from '../../components/pastor-prayers';
import type { AppointmentRequest } from '../../lib/content';
export default function PastoralCare() {
  const { content, update } = useContent();
  const name = (id: string) =>
    content.users.find((user) => user.id === id)?.name ?? 'Member';
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Pastoral care</p>
        <h1>Prayer &amp; appointments</h1>
        <p>
          Prayer requests from members, private to you. Appointments move here
          in the next update; until then they are a browser preview.
        </p>
      </header>
      <div className="dashboard-grid">
        <PastorPrayers />
        <section className="panel">
          <h2>Appointment requests</h2>
          {!content.appointmentRequests.length && (
            <p>No appointment requests yet.</p>
          )}
          {content.appointmentRequests.map((item) => (
            <div className="activity-record" key={item.id}>
              <span>
                <b>
                  {name(item.userId)} · {item.type}
                </b>
                <small>{item.preferredDate}</small>
                <p>{item.message}</p>
              </span>
              <label>
                Status
                <select
                  value={item.status}
                  onChange={(event) =>
                    update((state) => ({
                      ...state,
                      appointmentRequests: state.appointmentRequests.map(
                        (entry) =>
                          entry.id === item.id
                            ? {
                                ...entry,
                                status: event.target
                                  .value as AppointmentRequest['status'],
                              }
                            : entry,
                      ),
                    }))
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="declined">Declined</option>
                </select>
              </label>
            </div>
          ))}
        </section>
      </div>
    </MemberShell>
  );
}
