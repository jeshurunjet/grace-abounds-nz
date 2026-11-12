import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import GalleryPage from './page';

const state = { role: 'member' };
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: state.role } } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('../../components/member-shell', () => ({
  MemberShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/toast', () => ({
  useToast: () => ({ push: vi.fn() }),
}));

const library = {
  folders: [{ id: 'f1', name: 'Study notes', parentId: null }],
  resources: [
    {
      id: 'r1',
      title: 'Romans study guide',
      description: 'Week one',
      type: 'PDF',
      url: 'https://example.org/romans.pdf',
      folderId: 'f1',
      visibility: 'members',
    },
    {
      id: 'r2',
      title: 'Welcome pack',
      description: '',
      type: 'Document',
      url: 'javascript:alert(1)',
      folderId: null,
      visibility: 'public',
    },
  ],
  sermons: [
    {
      id: 'sm1',
      title: 'Walking in the Spirit',
      speaker: 'Pastor Example',
      series: 'Life in the Spirit',
      date: '2026-10-04',
      href: '/sermons/walking-in-the-spirit',
    },
  ],
};
const calls: string[] = [];
const json = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

beforeEach(() => {
  calls.length = 0;
  state.role = 'member';
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(url);
      return url.endsWith('/member/library')
        ? json({ data: library })
        : json({ data: [] });
    }),
  );
});

describe('Gallery reads the library from the server', () => {
  it('members browse published resources by folder and never see management', async () => {
    render(<GalleryPage />);
    expect(await screen.findByText('Romans study guide')).toBeInTheDocument();
    expect(screen.getByText('3 files')).toBeInTheDocument();
    expect(screen.getByText('Romans study guide').closest('a')).toHaveAttribute(
      'href',
      'https://example.org/romans.pdf',
    );
    // Unsafe links are never rendered as a destination.
    expect(screen.getByText('Welcome pack').closest('a')).not.toHaveAttribute(
      'href',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Study notes' }));
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(screen.queryByText('Welcome pack')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage the library')).not.toBeInTheDocument();
    expect(calls.some((url) => url.includes('/staff/'))).toBe(false);
  });

  it('every approved sermon appears in a built-in Sermons section', async () => {
    render(<GalleryPage />);
    const card = (await screen.findByText('Walking in the Spirit')).closest(
      'a',
    );
    expect(card).toHaveAttribute('href', '/sermons/walking-in-the-spirit');
    expect(card).not.toHaveAttribute('target');
    expect(screen.getByText('Pastor Example · 4 Oct 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sermons' }));
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(screen.queryByText('Romans study guide')).not.toBeInTheDocument();
  });

  it('Pastor and Admin also manage folders and resources in the same place', async () => {
    state.role = 'admin';
    render(<GalleryPage />);
    expect(await screen.findByText('Manage the library')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls).toEqual(
        expect.arrayContaining([
          '/api/v1/staff/folders',
          '/api/v1/staff/resources',
        ]),
      ),
    );
    expect(
      screen.getByRole('button', { name: /Add resource/ }),
    ).toBeInTheDocument();
  });
});
