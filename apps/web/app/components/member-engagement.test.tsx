import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberEngagement } from './member-engagement';
import { JoinActivities, MyPlans } from './member-activities';
import { resetParticipationStore } from '../lib/participation';
import { MemberCalendar } from './member-calendar';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'member-1', email: 'member@example.org' } },
  }),
}));
beforeEach(() => {
  resetParticipationStore();
  // Bookings come from the server (Phase 3B): none yet, no places taken.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ data: [] })),
  );
  nav.replace.mockClear();
  window.history.replaceState({}, '', '/members');
});

afterEach(() => vi.unstubAllGlobals());

describe('Home member tools', () => {
  it('keeps the four member destinations one click away', () => {
    render(<MemberEngagement />);
    const tools = screen.getByRole('navigation', {
      name: 'Your church tools',
    });
    expect(tools).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Calendar & bookings/ }),
    ).toHaveAttribute('href', '/members/calendar');
    expect(screen.getByRole('link', { name: /Gallery/ })).toHaveAttribute(
      'href',
      '/members/gallery',
    );
    // Prayer is its own page now, backed by the server (Phase 4A).
    expect(screen.getByRole('link', { name: /Prayer/ })).toHaveAttribute(
      'href',
      '/members/prayer',
    );
    fireEvent.click(screen.getByRole('button', { name: /Appointments/ }));
    expect(
      screen.getByRole('dialog', { name: 'Appointments' }),
    ).toBeInTheDocument();
  });

  it('public Next steps links still open the next-step request', () => {
    window.history.replaceState(
      {},
      '',
      '/members?join=Worship%20%26%20Music%20Ministry',
    );
    render(<MemberEngagement />);
    expect(
      screen.getByRole('dialog', { name: 'Take a next step' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      '/next-steps',
    );
    expect(
      screen.getByRole('button', { name: 'Submit interest' }),
    ).toBeInTheDocument();
  });

  it('old activity links go to the Calendar page, which holds joining', () => {
    window.history.replaceState({}, '', '/members?activity=group-1');
    render(<MemberEngagement />);
    expect(nav.replace).toHaveBeenCalledWith(
      '/members/calendar?activity=group-1#activities',
    );
  });

  it('joining and bookings stay available with the calendar', async () => {
    const onFind = vi.fn();
    render(<MyPlans onFind={onFind} />);
    expect(await screen.findByText('Nothing planned yet.')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Find something to join' }),
    );
    expect(onFind).toHaveBeenCalled();
    render(<JoinActivities />);
    expect(
      screen.getByRole('searchbox', { name: 'Search activities' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Join$/ }).length,
    ).toBeGreaterThan(0);
    render(<MemberCalendar />);
    expect(
      screen.getByRole('heading', {
        name: new Date().toLocaleDateString('en-NZ', {
          month: 'long',
          year: 'numeric',
        }),
      }),
    ).toBeInTheDocument();
  });
});
