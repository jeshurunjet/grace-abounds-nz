import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import GalleryPage from './page';

const state = { role: 'member' };
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { role: state.role } },
    status: 'authenticated',
  }),
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

const folder = { id: 'f1', name: 'Study notes', parentId: null };
const romans = {
  id: 'r1',
  title: 'Romans study guide',
  description: 'Week one',
  type: 'PDF',
  url: 'https://example.org/romans.pdf',
  sermonId: null,
  folderId: 'f1',
  visibility: 'members',
};
const welcome = {
  id: 'r2',
  title: 'Welcome pack',
  description: '',
  type: 'Document',
  url: 'javascript:alert(1)',
  sermonId: null,
  folderId: null,
  visibility: 'public',
};
const approvedSermon = {
  id: 'sm1',
  title: 'Walking in the Spirit',
  speaker: 'Pastor Example',
  series: '',
  date: '2026-10-04',
  href: '/sermons/walking-in-the-spirit',
};
const uploadedAsset = {
  id: 'a1',
  fileName: 'Prayer guide.pdf',
  size: 9,
  contentType: 'application/pdf',
  purpose: 'library',
  inline: true,
  status: 'verified',
  rejectReason: '',
  href: '/api/v1/files/a1',
  createdAt: '2026-11-15T00:00:00.000Z',
};
/** Storage's side of a presigned part upload (no network in tests). */
class FakeUpload {
  status = 0;
  upload: { onprogress?: (event: { loaded: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  open(method: string, url: string) {
    storagePuts.push(`${method} ${url}`);
  }
  send(body: Blob) {
    setTimeout(() => {
      this.upload.onprogress?.({ loaded: body.size });
      this.status = 200;
      this.onload?.();
    });
  }
  getResponseHeader(name: string) {
    return name.toLowerCase() === 'etag' ? '"etag-1"' : null;
  }
  abort() {
    this.onabort?.();
  }
}
let storagePuts: string[] = [];
let library: Record<string, unknown> = {};
let staffData: Record<string, unknown[]> = {};
const calls: {
  method: string;
  url: string;
  version: string | null;
  body?: unknown;
}[] = [];
const json = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
const staffRow = (row: object, status = 'published') => ({
  ...row,
  status,
  position: 0,
  version: 3,
  updatedAt: '2026-11-13T00:00:00.000Z',
});
const sermonRow = (over: object) => ({
  id: 'sm1',
  slug: 'walking-in-the-spirit',
  title: 'Walking in the Spirit',
  series: '',
  speaker: 'Pastor Example',
  date: '2026-10-04',
  duration: '',
  image: '',
  summary: '',
  mediaUrl: 'https://media.example.org/a.mp4',
  review: 'approved',
  reviewNote: '',
  archived: false,
  live: {
    version: 2,
    approvedAt: '2026-11-13T00:00:00Z',
    title: '',
    mediaUrl: '',
  },
  changedSinceApproval: false,
  everApproved: true,
  version: 3,
  updatedAt: '2026-11-13T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  state.role = 'member';
  calls.length = 0;
  storagePuts = [];
  vi.stubGlobal('XMLHttpRequest', FakeUpload);
  library = {
    folders: [folder],
    resources: [
      { ...romans, href: romans.url },
      { ...welcome, href: welcome.url },
    ],
    sermons: [approvedSermon],
  };
  staffData = {
    folders: [staffRow({ id: 'f1', name: 'Study notes', parentId: null })],
    resources: [staffRow(romans), staffRow(welcome, 'draft')],
    sermons: [
      sermonRow({}),
      sermonRow({
        id: 'sm2',
        slug: 'for-the-city',
        title: 'For the City',
        review: 'pending',
        live: null,
        everApproved: false,
      }),
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({
          method,
          url,
          version: new Headers(init?.headers).get('if-match'),
          body,
        });
        if (url === '/api/v1/staff/uploads')
          return json({
            data: {
              asset: { ...uploadedAsset, status: 'pending' },
              partSize: 10 * 1024 * 1024,
              partCount: 1,
            },
          });
        if (url.endsWith('/parts'))
          return json({
            data: {
              urls: [{ partNumber: 1, url: 'https://storage.test/part-1' }],
            },
          });
        if (url.endsWith('/complete')) return json({ data: uploadedAsset });
        return json({ data: {} });
      }
      calls.push({ method, url, version: null });
      if (url.endsWith('/member/library')) return json({ data: library });
      const name = url.split('/staff/')[1]!;
      return json({ data: staffData[name] ?? [] });
    }),
  );
});

describe('Gallery file manager', () => {
  it('members browse folders with a breadcrumb and get no file-write actions', async () => {
    render(<GalleryPage />);
    // Root: the Videos & sermons section, the folder and the top-level file.
    expect(await screen.findByText('3 items')).toBeInTheDocument();
    // Unsafe links are never rendered as a destination.
    expect(screen.getByText('Welcome pack').closest('a')).toBeNull();
    const files = screen.getByRole('region', { name: 'Files' });
    fireEvent.click(within(files).getByRole('button', { name: 'Study notes' }));
    const crumbs = screen.getByRole('navigation', { name: 'Folder path' });
    expect(within(crumbs).getByText('Study notes')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Romans study guide' }),
    ).toHaveAttribute('href', romans.url);
    for (const name of ['New folder', 'Add link', 'Upload'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    // No file picker and no drop handling for members.
    expect(screen.queryByLabelText('Choose files to upload')).toBeNull();
    fireEvent.drop(files, {
      dataTransfer: { files: [new File(['x'], 'a.pdf')], types: ['Files'] },
    });
    expect(screen.queryByRole('list', { name: 'Files to upload' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull();
    expect(calls.some((call) => call.url.includes('/staff/'))).toBe(false);
    fireEvent.click(within(crumbs).getByRole('button', { name: 'Library' }));
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('a stored link a browser would send off-site is shown as text, not a link', async () => {
    library = {
      ...library,
      resources: [
        {
          ...welcome,
          title: 'Sneaky link',
          url: '/\\video.example/watch',
          href: '/\\video.example/watch',
        },
        {
          ...welcome,
          id: 'r3',
          title: 'Next steps',
          url: '/next-steps',
          href: '/next-steps',
        },
      ],
    };
    render(<GalleryPage />);
    expect(await screen.findByText('Sneaky link')).toBeInTheDocument();
    expect(screen.getByText('Sneaky link').closest('a')).toBeNull();
    const ok = screen.getByRole('link', { name: 'Next steps' });
    expect(ok).toHaveAttribute('href', '/next-steps');
    expect(ok).not.toHaveAttribute('target');
  });

  it('Videos & sermons is always there: approved recordings, or a helpful empty state', async () => {
    const view = render(<GalleryPage />);
    const nav = await screen.findByRole('navigation', {
      name: 'Library sections',
    });
    fireEvent.click(
      within(nav).getByRole('button', { name: 'Videos & sermons' }),
    );
    expect(
      screen.getByRole('link', { name: 'Walking in the Spirit' }),
    ).toHaveAttribute('href', '/sermons/walking-in-the-spirit');
    expect(screen.getByText('Pastor Example · 4 Oct 2026')).toBeInTheDocument();
    view.unmount();

    library = { ...library, sermons: [] };
    render(<GalleryPage />);
    const again = await screen.findByRole('navigation', {
      name: 'Library sections',
    });
    fireEvent.click(
      within(again).getByRole('button', { name: 'Videos & sermons' }),
    );
    expect(screen.getByText(/No sermon recordings yet/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Prepare a sermon' })).toBeNull();
  });

  it('staff manage the same records in place; Upload is unavailable until storage is set up', async () => {
    state.role = 'admin';
    staffData['uploads/status'] = {
      available: false,
      maxLibraryBytes: 500 * 1024 * 1024,
      maxSermonBytes: 5 * 1024 ** 3,
    } as never;
    render(<GalleryPage />);
    expect(
      await screen.findByRole('button', { name: /New folder/ }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /Add link/ })).toBeEnabled();
    await waitFor(() =>
      expect(
        screen.getByText(/File uploads aren’t set up on this server yet/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /^Upload$/ })).toBeDisabled();
    // The draft is visible to staff, with its state.
    expect(screen.getByText('Draft')).toBeInTheDocument();

    // Archive asks first, then saves the whole record with its version.
    fireEvent.click(
      screen.getByRole('button', { name: 'Actions for Welcome pack' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeEnabled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    });
    await waitFor(() =>
      expect(calls.filter((call) => call.method !== 'GET')).toEqual([
        expect.objectContaining({
          method: 'PATCH',
          url: '/api/v1/staff/resources/r2',
          version: '"3"',
          body: expect.objectContaining({
            title: 'Welcome pack',
            status: 'archived',
          }),
        }),
      ]),
    );
  });

  it('staff edit details in a side panel; nothing is saved before Save', async () => {
    state.role = 'pastor';
    render(<GalleryPage />);
    const files = await screen.findByRole('region', { name: 'Files' });
    await waitFor(() =>
      expect(
        within(files).getByRole('button', { name: 'Study notes' }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(within(files).getByRole('button', { name: 'Study notes' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Actions for Romans study guide' }),
    );
    // A published file is archived before it can be deleted.
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit details' }));
    const panel = screen.getByRole('dialog', { name: 'Edit details' });
    fireEvent.change(within(panel).getByLabelText('Name'), {
      target: { value: 'Romans guide' },
    });
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() =>
      expect(calls.filter((call) => call.method !== 'GET')).toEqual([
        expect.objectContaining({
          method: 'PATCH',
          url: '/api/v1/staff/resources/r1',
          version: '"3"',
          body: expect.objectContaining({
            title: 'Romans guide',
            folderId: 'f1',
          }),
        }),
      ]),
    );
  });

  it('staff see pending sermons as staff-only, with a route to the approval editor', async () => {
    state.role = 'admin';
    render(<GalleryPage />);
    const nav = await screen.findByRole('navigation', {
      name: 'Library sections',
    });
    fireEvent.click(
      within(nav).getByRole('button', { name: 'Videos & sermons' }),
    );
    expect(
      screen.getByRole('link', { name: /Manage sermons/ }),
    ).toHaveAttribute('href', '/admin/sermons');
    expect(screen.getByRole('link', { name: 'For the City' })).toHaveAttribute(
      'href',
      '/admin/sermons?sermon=sm2',
    );
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
    expect(screen.getByText('Staff only')).toBeInTheDocument();
    // No file actions on sermons, and no upload here.
    expect(
      screen.queryByRole('button', { name: /Actions for For the City/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Upload/ })).toBeNull();
  });
  it('staff upload files: checked as added, sent only on Upload, then listed in the open folder', async () => {
    state.role = 'admin';
    staffData['uploads/status'] = {
      available: true,
      maxLibraryBytes: 500 * 1024 * 1024,
      maxSermonBytes: 5 * 1024 ** 3,
    } as never;
    render(<GalleryPage />);
    const files = await screen.findByRole('region', { name: 'Files' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Upload$/ })).toBeEnabled(),
    );
    fireEvent.click(within(files).getByRole('button', { name: 'Study notes' }));

    // The picker (behind the Upload button) and drag and drop both queue.
    fireEvent.change(screen.getByLabelText('Choose files to upload'), {
      target: {
        files: [
          new File(['%PDF-1.7'], 'Prayer guide.pdf'),
          new File(['MZ'], 'setup.exe'),
        ],
      },
    });
    fireEvent.drop(files, {
      dataTransfer: {
        files: [new File(['x'], 'clip.mp4')],
        types: ['Files'],
      },
    });
    const queue = screen.getByRole('list', { name: 'Files to upload' });
    expect(within(queue).getByText('Ready to upload')).toBeInTheDocument();
    expect(
      within(queue).getByText(
        'Programs, scripts and web pages can’t be uploaded.',
      ),
    ).toBeInTheDocument();
    expect(
      within(queue).getByText(/Upload videos in Sermons & videos/),
    ).toBeInTheDocument();
    // Nothing is sent before Upload.
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    });
    await waitFor(() =>
      expect(within(queue).getByText('Uploaded')).toBeInTheDocument(),
    );
    expect(storagePuts).toEqual(['PUT https://storage.test/part-1']);
    expect(
      calls.filter((call) => call.method !== 'GET').map((call) => call.url),
    ).toEqual([
      '/api/v1/staff/uploads',
      '/api/v1/staff/uploads/a1/parts',
      '/api/v1/staff/uploads/a1/complete',
      '/api/v1/staff/resources',
    ]);
    expect(
      calls.find((call) => call.url === '/api/v1/staff/uploads')?.body,
    ).toEqual({ fileName: 'Prayer guide.pdf', size: 8, purpose: 'library' });
    // Then it becomes a library item in the folder that was open.
    expect(
      calls.find(
        (call) =>
          call.method === 'POST' && call.url === '/api/v1/staff/resources',
      )?.body,
    ).toEqual({
      title: 'Prayer guide',
      description: '',
      type: 'PDF',
      url: '',
      sermonId: null,
      assetId: 'a1',
      folderId: 'f1',
      visibility: 'members',
      status: 'published',
    });
  });
});
