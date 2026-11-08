import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './header';

const authState = vi.hoisted(() => ({
  session: null as null | {
    user: { role: 'member' | 'pastor' | 'admin'; profileId: string };
  },
  status: 'unauthenticated' as 'loading' | 'authenticated' | 'unauthenticated',
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authState.session, status: authState.status }),
  signOut: vi.fn(),
}));

describe('public Header account navigation', () => {
  beforeEach(() => {
    authState.session = null;
    authState.status = 'unauthenticated';
  });

  it('shows visitor actions only after authentication resolves', () => {
    const { rerender } = render(<Header />);
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign Up' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Return to workspace' }),
    ).not.toBeInTheDocument();

    authState.status = 'loading';
    rerender(<Header />);
    expect(
      screen.queryByRole('link', { name: 'Login' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Sign Up' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['member', 'member-michael-tane', 'Member Dashboard', '/members'],
    ['pastor', 'pastor-bartolome-sanchez', 'Pastor Workspace', '/pastor'],
    ['admin', 'admin-maria-santos', 'Admin Dashboard', '/admin'],
  ] as const)(
    'shows the correct %s workspace and account controls',
    (role, profileId, label, href) => {
      authState.status = 'authenticated';
      authState.session = { user: { role, profileId } };
      render(<Header />);
      expect(
        screen.getByRole('link', { name: 'Return to workspace' }),
      ).toHaveAttribute('href', href);
      fireEvent.click(
        screen.getByRole('button', { name: 'Open account menu' }),
      );
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'href',
        href,
      );
      expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
        'href',
        `/profile/${profileId}`,
      );
      expect(
        screen.getByRole('button', { name: 'Sign out' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Login' }),
      ).not.toBeInTheDocument();
    },
  );
});
