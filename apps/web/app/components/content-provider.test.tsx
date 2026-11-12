import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultPages,
  defaultSiteSettings,
  type PublicContentBundle,
} from '@grace-abounds/validation';
import { ContentProvider, useContent } from './content-provider';
const published: PublicContentBundle = {
  site: defaultSiteSettings,
  pages: defaultPages,
};
const state = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: state.role } } }),
}));
let context: ReturnType<typeof useContent>;
function Probe() {
  context = useContent();
  return <span>{context.content.site.heroTitle}</span>;
}
const renderProvider = (initial: PublicContentBundle | null = published) =>
  render(
    <ContentProvider initialContent={initial}>
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
  it('renders the published content from the server', async () => {
    renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    expect(screen.getByText('Grace')).toBeInTheDocument();
    expect(context.content.site.givingBank).toBe(
      defaultSiteSettings.giving.bank,
    );
    expect(context.content.pages.values[0]).toEqual([
      '01',
      'Scripture',
      defaultPages.about.values[0]!.body,
    ]);
    expect(context.contentUnavailable).toBe(false);
  });
  it('never lets browser storage override published content', async () => {
    localStorage.setItem(
      'grace-abounds-content-v4',
      JSON.stringify({ site: { heroTitle: 'Stale local title' } }),
    );
    renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    expect(context.content.site.heroTitle).toBe('Grace');
  });
  it('keeps browser-only collections after reloading the provider', async () => {
    state.role = 'pastor';
    const view = renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    await act(() =>
      context.update((current) => ({
        ...current,
        pages: { ...current.pages, locations: [] },
      })),
    );
    view.unmount();
    renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    expect(context.content.pages.locations).toEqual([]);
    expect(context.content.site.heroTitle).toBe('Grace');
  });
  it('shows no demo content when published content is unavailable', async () => {
    renderProvider(null);
    await waitFor(() => expect(context.ready).toBe(true));
    expect(context.contentUnavailable).toBe(true);
    expect(context.content.site.heroTitle).toBe('');
    expect(context.content.site.givingNumber).toBe('');
  });
  it('takes newer published content from the server without losing browser-only collections', async () => {
    state.role = 'pastor';
    const view = renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    await act(() =>
      context.update((current) => ({
        ...current,
        pages: { ...current.pages, locations: [] },
      })),
    );
    // Another browser publishes; router.refresh() delivers bundle B.
    const bundleB: PublicContentBundle = {
      site: {
        ...defaultSiteSettings,
        giving: { ...defaultSiteSettings.giving, bank: 'Bank B' },
      },
      pages: {
        ...defaultPages,
        home: {
          ...defaultPages.home,
          hero: { ...defaultPages.home.hero, title: 'Title B' },
        },
        events: {
          hero: { ...defaultPages.events.hero, title: 'Events B' },
        },
      },
    };
    view.rerender(
      <ContentProvider initialContent={bundleB}>
        <Probe />
      </ContentProvider>,
    );
    await waitFor(() => expect(context.content.site.heroTitle).toBe('Title B'));
    expect(context.content.site.givingBank).toBe('Bank B');
    expect(context.content.pages.heroes['/events'].title).toBe('Events B');
    expect(context.content.pages.locations).toEqual([]);
  });
  it('recovers when content becomes available, and keeps it if a later refresh fails', async () => {
    const view = renderProvider(null);
    await waitFor(() => expect(context.ready).toBe(true));
    expect(context.contentUnavailable).toBe(true);
    view.rerender(
      <ContentProvider initialContent={published}>
        <Probe />
      </ContentProvider>,
    );
    await waitFor(() => expect(context.content.site.heroTitle).toBe('Grace'));
    expect(context.contentUnavailable).toBe(false);
    expect(context.content.site.givingBank).toBe(
      defaultSiteSettings.giving.bank,
    );
    view.rerender(
      <ContentProvider initialContent={null}>
        <Probe />
      </ContentProvider>,
    );
    await act(async () => {});
    expect(context.content.site.heroTitle).toBe('Grace');
    expect(context.contentUnavailable).toBe(false);
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
