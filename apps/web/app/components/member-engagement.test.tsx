import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberEngagement } from './member-engagement';
import { MemberCalendar } from './member-calendar';

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'member-1', email: 'member@example.org' } },
  }),
}));

describe('MemberEngagement', () => {
  it('exposes appointments, next steps, activities and the shared planner', () => {
    render(<MemberEngagement />);
    expect(
      screen.getByRole('heading', { name: 'Appointments' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Take a next step' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Activities & bookings' }),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Choose an opportunity' }),
      { target: { value: 'Worship & Music Ministry' } },
    );
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      '/next-steps',
    );
    expect(
      screen.getByRole('button', { name: 'Submit interest' }),
    ).toBeInTheDocument();

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
