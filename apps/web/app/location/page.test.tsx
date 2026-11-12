import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedContent, type ContentState } from '../lib/content';
import { NextStepsExplorer } from '../components/next-steps-explorer';
import Location from './page';

const state: { content: ContentState } = { content: seedContent };
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/location',
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('../components/content-provider', () => ({
  useContent: () => ({ content: state.content, ready: true }),
}));

const campus = (id: string, name: string) => ({
  id,
  name,
  address: `1 ${id} Road`,
  type: 'Campus',
  image: '',
});
const withPages = (patch: Partial<ContentState['pages']>): ContentState => ({
  ...seedContent,
  activities: [],
  pages: { ...seedContent.pages, ...patch },
});

beforeEach(() => {
  state.content = withPages({ locations: [] });
});

describe('public pages with no published records (Codex 2B review)', () => {
  it('Locations shows a truthful empty state and keeps groups and studies usable', () => {
    render(<Location />);
    expect(
      screen.getByText(/Campus details will be published here soon/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Get Directions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Groups' }));
    expect(
      screen.getByText(/New connect groups are coming soon/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bible Studies' }));
    expect(
      screen.getByText(/New Bible studies are coming soon/),
    ).toBeInTheDocument();
  });

  it('copes with the selected campus being removed, and with campuses returning', () => {
    state.content = withPages({
      locations: [
        campus('manukau', 'Grace Abounds — Manukau'),
        campus('botany', 'Grace Abounds — Botany'),
      ],
    });
    const view = render(<Location />);
    fireEvent.click(screen.getByRole('button', { name: 'Botany' }));
    expect(
      screen.getByRole('heading', { name: 'Grace Abounds — Botany' }),
    ).toBeInTheDocument();
    // Botany is archived: the page falls back to the first published campus.
    state.content = withPages({
      locations: [campus('manukau', 'Grace Abounds — Manukau')],
    });
    view.rerender(<Location />);
    expect(
      screen.getByRole('heading', { name: 'Grace Abounds — Manukau' }),
    ).toBeInTheDocument();
    // The last one is archived too.
    state.content = withPages({ locations: [] });
    view.rerender(<Location />);
    expect(
      screen.getByText(/Campus details will be published here soon/),
    ).toBeInTheDocument();
    // Published again.
    state.content = withPages({
      locations: [campus('henderson', 'Grace Abounds — Henderson')],
    });
    view.rerender(<Location />);
    expect(
      screen.getByRole('heading', { name: 'Grace Abounds — Henderson' }),
    ).toBeInTheDocument();
  });

  it('Next steps shows a truthful empty state with no published journeys', () => {
    state.content = withPages({ steps: [] });
    render(<NextStepsExplorer />);
    expect(
      screen.getByText(/Next steps will be published here soon/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
