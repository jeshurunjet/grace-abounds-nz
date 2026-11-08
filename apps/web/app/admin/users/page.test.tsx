import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import UsersAdmin from './page';
import { seedContent } from '../../lib/content';
const state = vi.hoisted(() => ({ role: 'admin', update: vi.fn() }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { role: state.role, email: `${state.role}@example.org` } },
  }),
}));
vi.mock('../../components/admin-shell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/content-provider', () => ({
  useContent: () => ({ content: seedContent, update: state.update }),
}));
beforeEach(() => {
  state.role = 'admin';
  state.update.mockClear();
});
describe('member account controls', () => {
  it('keeps admin member management read-only', () => {
    render(<UsersAdmin />);
    expect(
      screen.getByRole('combobox', { name: 'Role for Michael Example' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Review account deletion' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search members'), {
      target: { value: 'no matching person' },
    });
    expect(screen.getByText(/No accounts match/)).toBeInTheDocument();
  });
  it('requires pastor review and does not simulate a successful identity change', () => {
    state.role = 'pastor';
    render(<UsersAdmin />);
    const role = screen.getByRole('combobox', {
      name: 'Role for Michael Example',
    });
    expect(role).toBeEnabled();
    expect(
      screen.getByRole('combobox', { name: 'Role for Pastor Example' }),
    ).toBeDisabled();
    fireEvent.change(role, { target: { value: 'admin' } });
    expect(
      screen.getByRole('dialog', { name: 'Review role change' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    expect(state.update).not.toHaveBeenCalled();
    expect(role).toHaveValue('member');
  });
});
