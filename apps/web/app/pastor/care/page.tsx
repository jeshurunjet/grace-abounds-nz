'use client';
import { MemberShell } from '../../components/member-shell';
import { useContent } from '../../components/content-provider';
import type {
  AppointmentRequest,
  MemberPrayerRequest,
} from '../../lib/content';
export default function PastoralCare() {
  const { content, update } = useContent();
  const name = (id: string) =>
    content.users.find((user) => user.id === id)?.name ?? 'Member';
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Pastoral care</p>
        <h1>Prayer &amp; appointments</h1>
        <p>Requests submitted through the member home appear here.</p>
      </header>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>Prayer requests</h2>
          {!content.memberPrayerRequests.length && (
            <p>No prayer requests yet.</p>
          )}
          {content.memberPrayerRequests.map((item) => (
            <div className="activity-record prayer-record" key={item.id}>
              <span>
                <b>{name(item.userId)}</b>
                <p>{item.request}</p>
                <small>
                  {new Date(item.createdAt).toLocaleDateString('en-NZ')}
                </small>
              </span>
              <label>
                Status
                <select
                  value={item.status}
                  onChange={(event) =>
                    update((state) => ({
                      ...state,
                      memberPrayerRequests: state.memberPrayerRequests.map(
                        (entry) =>
                          entry.id === item.id
                            ? {
                                ...entry,
                                status: event.target
                                  .value as MemberPrayerRequest['status'],
                              }
                            : entry,
                      ),
                    }))
                  }
                >
                  <option value="new">New</option>
                  <option value="praying">Praying</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>
          ))}
        </section>
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
