'use client';

import {
  CalendarClock,
  CalendarDays,
  HandHeart,
  UserRound,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useState, type FormEvent } from 'react';
import { AdminShell } from '../../components/admin-shell';
import { Modal } from '../../components/modal';
import { useContent } from '../../components/content-provider';
import { useToast } from '../../components/toast';
import type {
  AppointmentRequest,
  MemberPrayerRequest,
  ParticipationApplication,
  ServiceAssignment,
  UserRecord,
} from '../../lib/content';

export default function UsersAdmin() {
  const { data: session } = useSession();
  const pastor = session?.user?.role === 'pastor';
  const { content, update } = useContent();
  const { push } = useToast();
  const [action, setAction] = useState<{
    user: UserRecord;
    kind: 'role' | 'suspend' | 'delete';
    role?: UserRecord['role'];
  } | null>(null);
  const [typedName, setTypedName] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const filtered = content.users.filter(
    (user) =>
      `${user.name} ${user.email}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (roleFilter === 'all' || user.role === roleFilter) &&
      (statusFilter === 'all' || user.status === statusFilter),
  );
  const protectedAccount = (user: UserRecord) =>
    user.email === session?.user?.email ||
    (user.role === 'pastor' &&
      user.status === 'active' &&
      content.users.filter(
        (entry) => entry.role === 'pastor' && entry.status === 'active',
      ).length <= 1);
  const [selectedKey, setSelectedId] = useState(content.users[0]?.id ?? '');
  const selected =
    filtered.find((user) => user.id === selectedKey) ?? filtered[0];
  const selectedId = selected?.id ?? '';
  const appointments = content.appointmentRequests.filter(
    (item) => item.userId === selectedId,
  );
  const applications = content.participationApplications.filter(
    (item) => item.userId === selectedId,
  );
  const rsvps = content.eventRsvps.filter((item) => item.userId === selectedId);
  const assignments = content.serviceAssignments.filter(
    (item) => item.userId === selectedId,
  );
  const prayers = content.memberPrayerRequests.filter(
    (item) => item.userId === selectedId,
  );

  function patchAppointment(id: string, status: AppointmentRequest['status']) {
    if (!pastor) return;
    update((state) => ({
      ...state,
      appointmentRequests: state.appointmentRequests.map((item) =>
        item.id === id ? { ...item, status } : item,
      ),
    }));
  }
  function patchApplication(
    id: string,
    status: ParticipationApplication['status'],
  ) {
    if (!pastor) return;
    update((state) => ({
      ...state,
      participationApplications: state.participationApplications.map((item) =>
        item.id === id ? { ...item, status } : item,
      ),
    }));
  }
  function patchPrayer(id: string, status: MemberPrayerRequest['status']) {
    if (!pastor) return;
    update((state) => ({
      ...state,
      memberPrayerRequests: state.memberPrayerRequests.map((item) =>
        item.id === id ? { ...item, status } : item,
      ),
    }));
  }
  function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const assignment: ServiceAssignment = {
      id: crypto.randomUUID(),
      userId: selectedId,
      title: String(data.get('title')),
      date: String(data.get('date')),
      time: String(data.get('time')),
      location: String(data.get('location')),
      status: 'assigned',
    };
    if (!pastor) return;
    update((state) => ({
      ...state,
      serviceAssignments: [...state.serviceAssignments, assignment],
    }));
    event.currentTarget.reset();
    push('Service assignment added to the member planner.');
  }

  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Access &amp; member activity</p>
        <h1>Member management</h1>
        <p>
          Search accounts and review member activity. Account changes require
          backend confirmation. Admin access is read-only.
        </p>
      </header>
      <div className="member-filters panel">
        <label>
          Search members
          <input
            type="search"
            placeholder="Search name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Role
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="all">All roles</option>
            <option value="pastor">Pastor</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </select>
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <span>{filtered.length} accounts</span>
      </div>
      {!pastor && (
        <p className="notice-box">
          Read-only access. Only the pastor can request account changes.
        </p>
      )}
      <div className="users-admin-layout">
        <section className="panel user-table">
          <div className="table-row table-head">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {!filtered.length && (
            <p className="empty-feature">
              No accounts match your search. Try another name or clear the
              filters.
            </p>
          )}
          {filtered.map((user) => (
            <div
              className={`table-row ${selectedId === user.id ? 'selected' : ''}`}
              key={user.id}
            >
              <button
                className="user-select"
                onClick={() => setSelectedId(user.id)}
              >
                <b>{user.name}</b>
                <small>{user.email}</small>
              </button>
              <select
                aria-label={`Role for ${user.name}`}
                disabled={!pastor || protectedAccount(user)}
                value={user.role}
                onChange={(event) => {
                  setAction({
                    user,
                    kind: 'role',
                    role: event.target.value as UserRecord['role'],
                  });
                }}
              >
                <option value="member">Member</option>
                <option value="pastor">Pastor</option>
                <option value="admin">Admin</option>
              </select>
              <em className={`status ${user.status}`}>{user.status}</em>
              <button
                disabled={!pastor || protectedAccount(user)}
                className="text-danger"
                onClick={() => setAction({ user, kind: 'suspend' })}
              >
                {user.status === 'active' ? 'Suspend' : 'Reactivate'}
              </button>
            </div>
          ))}
        </section>

        {selected && (
          <section className="user-activity-panel">
            <header className="panel user-activity-header">
              <UserRound aria-hidden="true" />
              <div>
                <p className="eyebrow">Member record</p>
                <h2>{selected.name}</h2>
                <p>
                  {selected.email} · {selected.role}
                </p>
              </div>
              <span>
                {appointments.length +
                  applications.length +
                  rsvps.length +
                  prayers.length}{' '}
                responses
              </span>
            </header>

            {pastor && (
              <section className="panel">
                <h3>Account details</h3>
                <p>
                  {selected.email} · {selected.role} · {selected.status}
                </p>
                <p className="form-note">
                  Account identity, suspension and deletion will remain
                  unchanged until secure account services confirm the request.
                </p>
                <button
                  className="text-danger"
                  disabled={protectedAccount(selected)}
                  onClick={() => {
                    setTypedName('');
                    setAction({ user: selected, kind: 'delete' });
                  }}
                >
                  Review account deletion
                </button>
                {protectedAccount(selected) && (
                  <p className="form-note">
                    Your own account and the final active pastor are protected
                    here.
                  </p>
                )}
              </section>
            )}
            <div className="user-activity-grid">
              <article className="panel">
                <h3>
                  <CalendarClock aria-hidden="true" /> Appointment requests
                </h3>
                {appointments.length ? (
                  appointments.map((item) => (
                    <div className="activity-record" key={item.id}>
                      <span>
                        <b>{item.type}</b>
                        <small>
                          {item.preferredDate} · {item.message || 'No message'}
                        </small>
                      </span>
                      <select
                        disabled={!pastor}
                        value={item.status}
                        onChange={(event) =>
                          patchAppointment(
                            item.id,
                            event.target.value as AppointmentRequest['status'],
                          )
                        }
                      >
                        <option>pending</option>
                        <option>confirmed</option>
                        <option>completed</option>
                        <option>declined</option>
                      </select>
                    </div>
                  ))
                ) : (
                  <p className="empty-record">No appointment requests.</p>
                )}
              </article>
              <article className="panel">
                <h3>
                  <HandHeart aria-hidden="true" /> Participation
                </h3>
                {applications.length ? (
                  applications.map((item) => (
                    <div className="activity-record" key={item.id}>
                      <span>
                        <b>{item.opportunity}</b>
                        <small>
                          {new Date(item.createdAt).toLocaleDateString('en-NZ')}
                        </small>
                      </span>
                      <select
                        disabled={!pastor}
                        value={item.status}
                        onChange={(event) =>
                          patchApplication(
                            item.id,
                            event.target
                              .value as ParticipationApplication['status'],
                          )
                        }
                      >
                        <option>submitted</option>
                        <option>reviewing</option>
                        <option>approved</option>
                        <option>declined</option>
                      </select>
                    </div>
                  ))
                ) : (
                  <p className="empty-record">No participation applications.</p>
                )}
              </article>
              <article className="panel">
                <h3>
                  <CalendarDays aria-hidden="true" /> Event responses
                </h3>
                {rsvps.length ? (
                  rsvps.map((item) => {
                    const event = content.events.find(
                      (entry) => entry.id === item.eventId,
                    );
                    return (
                      <div className="activity-record" key={item.id}>
                        <span>
                          <b>{event?.title ?? 'Unknown event'}</b>
                          <small>{event?.date ?? 'Date unavailable'}</small>
                        </span>
                        <em className={`status ${item.response}`}>
                          {item.response.replace('-', ' ')}
                        </em>
                      </div>
                    );
                  })
                ) : (
                  <p className="empty-record">No event responses.</p>
                )}
              </article>
              {pastor && (
                <article className="panel">
                  <h3>
                    <HandHeart aria-hidden="true" /> Prayer requests
                  </h3>
                  {prayers.length ? (
                    prayers.map((item) => (
                      <div
                        className="activity-record prayer-record"
                        key={item.id}
                      >
                        <span>
                          <b>{item.request}</b>
                          <small>
                            {new Date(item.createdAt).toLocaleDateString(
                              'en-NZ',
                            )}
                          </small>
                        </span>
                        <select
                          disabled={!pastor}
                          value={item.status}
                          onChange={(event) =>
                            patchPrayer(
                              item.id,
                              event.target
                                .value as MemberPrayerRequest['status'],
                            )
                          }
                        >
                          <option>new</option>
                          <option>praying</option>
                          <option>completed</option>
                        </select>
                      </div>
                    ))
                  ) : (
                    <p className="empty-record">No prayer requests.</p>
                  )}
                </article>
              )}
              <article className="panel">
                <h3>
                  <CalendarDays aria-hidden="true" /> Service assignments
                </h3>
                {assignments.map((item) => (
                  <div className="activity-record" key={item.id}>
                    <span>
                      <b>{item.title}</b>
                      <small>
                        {item.date} · {item.time} · {item.location}
                      </small>
                    </span>
                    <em className={`status ${item.status}`}>{item.status}</em>
                  </div>
                ))}
                <fieldset disabled={!pastor} className="cms-fields">
                  <form className="assignment-form" onSubmit={addAssignment}>
                    <input name="title" required placeholder="Assignment" />
                    <input name="date" required placeholder="Sun 25 Oct" />
                    <input name="time" required type="time" />
                    <input name="location" required placeholder="Location" />
                    <button className="button">Add assignment</button>
                  </form>
                </fieldset>
              </article>
            </div>
          </section>
        )}
      </div>
      <Modal
        open={Boolean(action)}
        title={
          action?.kind === 'delete'
            ? 'Review account deletion'
            : action?.kind === 'role'
              ? 'Review role change'
              : 'Review account access'
        }
        onClose={() => setAction(null)}
      >
        <p>
          <strong>{action?.user.name}</strong>
          <br />
          {action?.user.email}
        </p>
        <p>
          {action?.kind === 'role'
            ? `Requested role: ${action.role}. This would change the account’s app permissions.`
            : action?.kind === 'delete'
              ? 'Deletion would remove this person’s app access. Review record retention before deletion.'
              : action?.user.status === 'active'
                ? 'Suspension would prevent this account from accessing the app.'
                : 'Reactivation would restore this account’s access.'}
        </p>
        <p className="notice-box">
          Account services are not connected. This review cannot change or
          delete the account.
        </p>
        {action?.kind === 'delete' && (
          <label className="form">
            Type the member’s full name
            <input
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        <footer className="form-actions">
          <button
            className="button button-outline"
            onClick={() => setAction(null)}
          >
            Cancel
          </button>
          <button
            className="button"
            disabled={
              !pastor ||
              !action ||
              protectedAccount(action.user) ||
              (action.kind === 'delete' &&
                typedName.trim() !== action.user.name)
            }
            onClick={() => {
              setAction(null);
              push(
                'Account operation unavailable. No role, access or account data has changed.',
                'info',
              );
            }}
          >
            Review request
          </button>
        </footer>
      </Modal>
    </AdminShell>
  );
}
