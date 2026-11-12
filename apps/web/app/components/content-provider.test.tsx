import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultLocations,
  defaultNextSteps,
  defaultPages,
  defaultSiteSettings,
  defaultTeam,
  type PublicCollections,
  type PublicContentBundle,
} from '@grace-abounds/validation';
import { ContentProvider, useContent } from './content-provider';
const collections = {
  locations: defaultLocations.map(({ status: _s, ...item }, i) => {
    void _s;
    return { ...item, id: `loc-${i}` };
  }),
  steps: defaultNextSteps.map(({ status: _s, ...item }, i) => {
    void _s;
    return { ...item, id: `step-${i}` };
  }),
  team: defaultTeam.map(({ status: _s, ...item }, i) => {
    void _s;
    return { ...item, id: `team-${i}` };
  }),
  sermons: [
    {
      id: 'sermon-1',
      slug: 'walking-in-the-spirit',
      title: 'Walking in the Spirit',
      series: 'Life in the Spirit',
      speaker: 'Pastor Example',
      date: '2026-10-04',
      duration: '42 min',
      image: '',
      summary: 'A practical message.',
      mediaUrl: '',
    },
  ],
} satisfies PublicCollections;
const published: PublicContentBundle = {
  site: defaultSiteSettings,
  pages: defaultPages,
  collections,
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
  it('campuses, journeys, leadership and sermons come from the server, never browser storage', async () => {
    localStorage.setItem(
      'grace-abounds-content-v4',
      JSON.stringify({
        pages: { locations: [], steps: [] },
        team: [{ id: 'old', name: 'Stale person' }],
        sermons: [{ id: 'old', slug: 'stale', status: 'published' }],
      }),
    );
    renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    expect(context.content.pages.locations.map((l) => l.id)).toEqual([
      'manukau',
      'botany',
      'henderson',
    ]);
    expect(context.content.pages.steps[0]!.memberHref).toBe(
      '/members?join=New%20to%20Faith',
    );
    expect(context.content.team.map((t) => t.name)).toEqual(
      defaultTeam.map((t) => t.name),
    );
    // Only Pastor-approved sermons from the server, shown with a fallback
    // photo and a readable date.
    expect(context.content.sermons).toEqual([
      expect.objectContaining({
        slug: 'walking-in-the-spirit',
        date: '4 Oct 2026',
        image: '/images/hero-6.jpg',
        status: 'published',
      }),
    ]);
    // Nothing migrated is written back to browser storage.
    const stored = JSON.parse(
      localStorage.getItem('grace-abounds-content-v4') ?? '{}',
    );
    expect(stored).not.toHaveProperty('pages');
    expect(stored).not.toHaveProperty('team');
    expect(stored).not.toHaveProperty('sermons');
  });
  it('shows no demo content when published content is unavailable', async () => {
    renderProvider(null);
    await waitFor(() => expect(context.ready).toBe(true));
    expect(context.contentUnavailable).toBe(true);
    expect(context.content.site.heroTitle).toBe('');
    expect(context.content.site.givingNumber).toBe('');
  });
  it('takes newer published content from the server without losing browser-only data', async () => {
    state.role = 'pastor';
    const view = renderProvider();
    await waitFor(() => expect(context.ready).toBe(true));
    await act(() =>
      context.update((current) => ({ ...current, activities: [] })),
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
      collections: { ...collections, team: collections.team.slice(0, 1) },
    };
    view.rerender(
      <ContentProvider initialContent={bundleB}>
        <Probe />
      </ContentProvider>,
    );
    await waitFor(() => expect(context.content.site.heroTitle).toBe('Title B'));
    expect(context.content.site.givingBank).toBe('Bank B');
    expect(context.content.pages.heroes['/events'].title).toBe('Events B');
    expect(context.content.team).toHaveLength(1);
    expect(context.content.activities).toEqual([]);
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
