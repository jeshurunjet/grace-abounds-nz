import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContentFreshness,
  isPublicPage,
  usePublishedChanges,
} from './content-freshness';

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

  it('refetches when the published-content stamp changes, and only then', async () => {
    vi.useFakeTimers();
    const stamps = ['5', '5', '6'];
    const fetchMock = vi.fn(async () =>
      Response.json({ data: { stamp: stamps.shift() ?? '6' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    const onChange = vi.fn();
    function Probe({ path }: { path: string }) {
      usePublishedChanges(path, onChange, 1000);
      return null;
    }
    const view = render(<Probe path="/about" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/public/content/stamp',
      expect.objectContaining({ cache: 'no-store' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    // Workspaces are not polled.
    fetchMock.mockClear();
    view.rerender(<Probe path="/admin/cms" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
