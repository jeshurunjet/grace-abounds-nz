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
  // Explicit browser-storage fixture: some Node runtimes expose a partial
  // localStorage global that shadows jsdom's implementation.
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size;
      },
    },
  });
  delete document.documentElement.dataset.sidebar;
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
    // No saved preference: starts collapsed to the icon rail.
    expect(document.documentElement.dataset.sidebar).toBe('collapsed');
    expect(container.firstChild).toHaveClass('workspace-collapsed');
    const toggle = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'workspace-navigation');
    expect(toggle).toHaveAttribute('title', 'Expand sidebar');
    expect(toggle.closest('aside')).not.toBeNull();
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.sidebar).toBe('expanded');
    expect(container.firstChild).not.toHaveClass('workspace-collapsed');
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Open messages' })).toHaveAttribute(
      'href',
      '/members/messages',
    );
    expect(
      screen.queryByRole('link', { name: 'Messages' }),
    ).not.toBeInTheDocument();
  });
  it('remembers an explicit choice across visits', () => {
    const first = render(
      <WorkspaceShell kind="Pastor" links={links}>
        Page
      </WorkspaceShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(window.localStorage.getItem('grace-sidebar-collapsed')).toBe(
      'false',
    );
    first.unmount();
    // A later page load: the pre-paint script reads the saved choice.
    delete document.documentElement.dataset.sidebar;
    const again = render(
      <WorkspaceShell kind="Pastor" links={links}>
        Page
      </WorkspaceShell>,
    );
    expect(document.documentElement.dataset.sidebar).toBe('expanded');
    expect(again.container.firstChild).not.toHaveClass('workspace-collapsed');
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeInTheDocument();
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
