import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from './workspace-shell';
import { WorkspaceReturn } from './workspace-return';

const state = vi.hoisted(() => ({ role: 'pastor', path: '/admin/events' }));
vi.mock('next/navigation', () => ({ usePathname: () => state.path }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { role: state.role, id: 'account', name: 'Test' } },
  }),
  signOut: vi.fn(),
}));
vi.mock('./notification-menu', () => ({ NotificationMenu: () => null }));
const links = [
  { href: '/members', label: 'Home' },
  { href: '/members/messages', label: 'Messages' },
  { href: '/admin/events', label: 'Activities & calendar' },
];
beforeEach(() => {
  state.role = 'pastor';
  state.path = '/admin/events';
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
describe('workspace navigation trial', () => {
  it.each([
    ['pastor', '/pastor'],
    ['admin', '/admin'],
    ['member', '/members'],
  ])('keeps %s home reachable and collapses reversibly', (role, href) => {
    state.role = role;
    const { container } = render(
      <WorkspaceShell kind="Pastor" links={links}>
        Page
      </WorkspaceShell>,
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      href,
    );
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      href,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(container.firstChild).toHaveClass('workspace-collapsed');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(container.firstChild).not.toHaveClass('workspace-collapsed');
    expect(screen.getByRole('link', { name: 'Open messages' })).toHaveAttribute(
      'href',
      '/members/messages',
    );
    expect(
      screen.queryByRole('link', { name: 'Messages' }),
    ).not.toBeInTheDocument();
  });
  it('does not show a redundant floating shortcut on Messages', () => {
    state.path = '/members/messages';
    render(
      <WorkspaceShell kind="Members" links={links}>
        Messages
      </WorkspaceShell>,
    );
    expect(
      screen.queryByRole('link', { name: 'Open messages' }),
    ).not.toBeInTheDocument();
  });
  it('returns from the public calendar to the role home', () => {
    render(<WorkspaceReturn />);
    expect(
      screen.getByRole('link', { name: 'Back to workspace home' }),
    ).toHaveAttribute('href', '/pastor');
  });
});
