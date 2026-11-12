import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentFreshness, isPublicPage } from './content-freshness';

const nav = vi.hoisted(() => ({ path: '/', refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ refresh: nav.refresh }),
}));
beforeEach(() => {
  nav.path = '/';
  nav.refresh.mockClear();
});
describe('published content freshness', () => {
  it('asks the server again when moving to another public page', () => {
    const view = render(<ContentFreshness />);
    expect(nav.refresh).not.toHaveBeenCalled();
    nav.path = '/about';
    view.rerender(<ContentFreshness />);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    // Staff and member workspaces manage their own data.
    nav.path = '/admin/cms';
    view.rerender(<ContentFreshness />);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });
  it('asks the server again when the visitor returns to the tab', () => {
    render(<ContentFreshness />);
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });
  it('treats only public routes as public pages', () => {
    expect(isPublicPage('/sermons/grace-for-today')).toBe(true);
    expect(isPublicPage('/members')).toBe(false);
  });
});
