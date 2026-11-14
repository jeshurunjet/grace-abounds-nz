import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  describe('content generation checks', () => {
    let latest = 0;
    const fetchMock = vi.fn(async () =>
      Response.json({ data: { generation: latest } }),
    );
    const onBehind = vi.fn();
    function Probe({
      path,
      rendered,
    }: {
      path: string;
      rendered: number | null;
    }) {
      usePublishedChanges(path, rendered, onBehind, 1000);
      return null;
    }
    const tick = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal('fetch', fetchMock);
      fetchMock.mockClear();
      onBehind.mockClear();
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('a change saved before the first check is still caught', async () => {
      latest = 6; // saved after the page rendered generation 5
      render(<Probe path="/about" rendered={5} />);
      await tick(0);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/public/content/stamp',
        expect.objectContaining({ cache: 'no-store' }),
      );
      expect(onBehind).toHaveBeenCalledTimes(1);
    });

    it('a page showing the latest generation does nothing', async () => {
      latest = 5;
      render(<Probe path="/about" rendered={5} />);
      await tick(3000);
      expect(onBehind).not.toHaveBeenCalled();
    });

    it('a refresh that still gets stale content is retried until the page catches up', async () => {
      latest = 6;
      const view = render(<Probe path="/" rendered={5} />);
      await tick(0);
      expect(onBehind).toHaveBeenCalledTimes(1);
      // The refresh returned cached generation 5 (revalidation delayed).
      await tick(1000);
      expect(onBehind).toHaveBeenCalledTimes(2);
      // Generation 6 finally rendered: no more refreshes.
      view.rerender(<Probe path="/" rendered={6} />);
      onBehind.mockClear();
      await tick(3000);
      expect(onBehind).not.toHaveBeenCalled();
    });

    it('does not poll workspaces or pages without a loaded bundle', async () => {
      latest = 9;
      const view = render(<Probe path="/admin/cms" rendered={1} />);
      await tick(3000);
      view.rerender(<Probe path="/about" rendered={null} />);
      await tick(3000);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(onBehind).not.toHaveBeenCalled();
    });
  });
});
