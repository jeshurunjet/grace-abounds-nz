import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentProvider, useContent } from './content-provider';
const state = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: state.role } } }),
}));
let context: ReturnType<typeof useContent>;
function Probe() {
  context = useContent();
  return <span>{context.content.site.heroTitle}</span>;
}
const renderProvider = () =>
  render(
    <ContentProvider>
      <Probe />
    </ContentProvider>,
  );
beforeEach(() => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  state.role = 'admin';
});
describe('live website content', () => {
  it('applies staff edits to the live site immediately', async () => {
    renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    let saved = false;
    await act(async () => {
      saved = await context.update((current) => ({
        ...current,
        site: { ...current.site, heroTitle: 'Live title' },
      }));
    });
    expect(saved).toBe(true);
    expect(screen.getByText('Live title')).toBeInTheDocument();
  });
  it('keeps edits after reloading the provider', async () => {
    state.role = 'pastor';
    const view = renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    await act(() =>
      context.update((current) => ({
        ...current,
        site: { ...current.site, heroTitle: 'Saved title' },
      })),
    );
    view.unmount();
    renderProvider();
    await waitFor(() =>
      expect(screen.getByText('Saved title')).toBeInTheDocument(),
    );
  });
  it('ignores member attempts to alter public content or activities', async () => {
    state.role = 'member';
    renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    await act(() =>
      context.update((current) => ({
        ...current,
        site: { ...current.site, heroTitle: 'Unauthorized' },
        activities: [],
      })),
    );
    expect(context.content.site.heroTitle).toBe('Grace');
    expect(context.content.activities.length).toBeGreaterThan(0);
  });
  it('reports a storage failure and supports retry', async () => {
    const setter = vi.fn(() => {
      throw new Error('quota');
    });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: setter });
    renderProvider();
    await waitFor(() =>
      expect(context.storageError).toContain('could not save'),
    );
    let saved = true;
    await act(async () => {
      saved = await context.update((current) => current);
    });
    expect(saved).toBe(false);
    setter.mockImplementation(() => undefined as never);
    act(() => context.retrySave());
    await waitFor(() => expect(context.storageError).toBe(''));
  });
});
