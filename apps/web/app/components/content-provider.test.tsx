import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentProvider, useContent } from './content-provider';
const state = vi.hoisted(() => ({ role: 'admin', path: '/admin/cms' }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: state.role } } }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => state.path }));
let context: ReturnType<typeof useContent>;
function Probe() {
  context = useContent();
  return <span>{context.content.site.heroTitle}</span>;
}
beforeEach(() => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  state.role = 'admin';
  state.path = '/admin/cms';
});
describe('public content approval', () => {
  it('keeps admin edits off the live website and prevents admin publication', async () => {
    const view = render(
      <ContentProvider>
        <Probe />
      </ContentProvider>,
    );
    await waitFor(() => expect(context.ready).toBe(true));
    await act(() =>
      context.update((current) => ({
        ...current,
        site: { ...current.site, heroTitle: 'Draft title' },
      })),
    );
    expect(screen.getByText('Draft title')).toBeInTheDocument();
    act(() => context.submit());
    expect(context.editorial.status).toBe('pending');
    act(() => context.publish());
    expect(context.editorial.status).toBe('pending');
    state.path = '/';
    view.rerender(
      <ContentProvider>
        <Probe />
      </ContentProvider>,
    );
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });
  it('publishes only through the pastor approval action and preserves live content while revising', async () => {
    state.role = 'pastor';
    const view = render(
      <ContentProvider>
        <Probe />
      </ContentProvider>,
    );
    await waitFor(() => expect(context.ready).toBe(true));
    await act(() =>
      context.update((current) => ({
        ...current,
        site: { ...current.site, heroTitle: 'Approved title' },
      })),
    );
    act(() => context.publish());
    expect(context.editorial.status).toBe('published');
    await act(() =>
      context.update((current) => ({
        ...current,
        site: { ...current.site, heroTitle: 'Next revision' },
      })),
    );
    state.path = '/';
    view.rerender(
      <ContentProvider>
        <Probe />
      </ContentProvider>,
    );
    expect(screen.getByText('Approved title')).toBeInTheDocument();
  });
  it('ignores member attempts to alter public content', async () => {
    state.role = 'member';
    state.path = '/members';
    render(
      <ContentProvider>
        <Probe />
      </ContentProvider>,
    );
    await waitFor(() => expect(context.ready).toBe(true));
    await act(() =>
      context.update((current) => ({
        ...current,
        site: { ...current.site, heroTitle: 'Unauthorized' },
      })),
    );
    expect(context.content.site.heroTitle).toBe('Grace');
    act(() => context.submit());
    expect(context.editorial.status).toBe('published');
  });
  it('blocks submission after a storage failure and supports retry', async () => {
    const setter = vi.fn(() => {
      throw new Error('quota');
    });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: setter });
    render(
      <ContentProvider>
        <Probe />
      </ContentProvider>,
    );
    await waitFor(() =>
      expect(context.storageError).toContain('could not save'),
    );
    act(() => context.submit());
    expect(context.editorial.status).toBe('published');
    setter.mockImplementation(() => undefined as never);
    act(() => context.retrySave());
    await waitFor(() => expect(context.storageError).toBe(''));
    act(() => context.submit());
    expect(context.editorial.status).toBe('pending');
  });
});
