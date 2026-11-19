import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffSummary } from './staff-summary';

/*
 * Phase 4C: Home counts come from the server and link to their lists.
 * Admin never sees prayer counts; a role change or sign-out starts fresh
 * and a late answer for the previous identity is ignored.
 */

const session = vi.hoisted(() => ({
  id: 'staff' as string | undefined,
  role: 'pastor',
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id, role: session.role } } : null,
  }),
}));
const server = vi.hoisted(() => ({
  held: null as Promise<Response> | null,
  calls: 0,
}));
const summary = (role: string) => ({
  members: { active: 12, suspended: 1 },
  sermons: { published: 5, awaitingApproval: 2 },
  appointments: {
    requested: 3,
    proposed: 0,
    confirmed: 4,
    completed: 0,
    cancelled: 0,
    declined: 0,
  },
  ...(role === 'pastor' && {
    prayers: { submitted: 7, praying: 2, prayedFor: 9 },
  }),
});
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}
beforeEach(() => {
  session.id = 'staff';
  session.role = 'pastor';
  server.held = null;
  server.calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      server.calls++;
      if (server.held) return server.held;
      return Response.json({ data: summary(session.role) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const stat = (label: string) =>
  screen.getByText(label, { selector: 'span' }).closest('a')!;

describe('staff summary', () => {
  it('shows the Pastor real counts with links, prayer included', async () => {
    render(<StaffSummary />);
    await settle();
    expect(stat('Active members')).toHaveTextContent('12');
    expect(stat('Active members')).toHaveAttribute(
      'href',
      '/admin/users?role=member&status=active',
    );
    expect(stat('Suspended members')).toHaveAttribute(
      'href',
      '/admin/users?role=member&status=suspended',
    );
    expect(stat('Praying')).toHaveAttribute(
      'href',
      '/pastor/care?prayers=praying',
    );
    expect(stat('New prayer requests')).toHaveAttribute(
      'href',
      '/pastor/care?prayers=submitted',
    );
    // Video counts are plain numbers: no list filters them yet.
    expect(
      screen.getByText('Published videos', { selector: 'span' }).closest('a'),
    ).toBeNull();
    expect(
      screen.getByText('Published videos', { selector: 'span' }).closest('li'),
    ).toHaveTextContent('5');
    expect(stat('New prayer requests')).toHaveTextContent('7');
    expect(stat('Appointments needing a time')).toHaveAttribute(
      'href',
      '/pastor/care?appointments=requested',
    );
    expect(stat('Confirmed appointments')).toHaveAttribute(
      'href',
      '/pastor/care?appointments=upcoming',
    );
    expect(
      screen.getByText('Member counts don’t include staff accounts.'),
    ).toBeInTheDocument();
  });

  it('Admin sees appointment logistics counts and no prayer counts', async () => {
    session.role = 'admin';
    render(<StaffSummary />);
    await settle();
    expect(stat('Confirmed appointments')).toHaveAttribute(
      'href',
      '/admin/appointments?appointments=upcoming',
    );
    expect(screen.queryByText(/prayer|Praying/i)).toBeNull();
  });

  it('a late Pastor answer after switching to Admin shows no prayer counts', async () => {
    const late = later();
    server.held = late.promise;
    const page = render(<StaffSummary />);
    await settle();
    server.held = null;
    session.role = 'admin';
    page.rerender(<StaffSummary />);
    await settle();
    late.release(Response.json({ data: summary('pastor') }));
    await settle();
    expect(stat('Active members')).toBeInTheDocument();
    expect(screen.queryByText(/prayer|Praying/i)).toBeNull();
  });

  it('shows nothing and fetches nothing when signed out or not staff', async () => {
    session.id = undefined;
    const page = render(<StaffSummary />);
    await settle();
    session.id = 'member';
    session.role = 'member';
    page.rerender(<StaffSummary />);
    await settle();
    expect(server.calls).toBe(0);
    expect(screen.queryByText('At a glance')).toBeNull();
  });
});
