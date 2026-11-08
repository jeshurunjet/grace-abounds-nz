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
  it('exposes appointment, participation, planner, and attendance controls', () => {
    render(<MemberEngagement />);
    expect(
      screen.getByRole('heading', { name: 'Appointments' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Join a group or ministry' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Events & attendance' }),
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
