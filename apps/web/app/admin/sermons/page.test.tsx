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
import type { StaffSermon } from '@grace-abounds/validation';
import SermonsPage from './page';

const state = { role: 'admin' };
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: state.role } } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('../../components/admin-shell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/toast', () => ({
  useToast: () => ({ push: vi.fn() }),
}));

const base: StaffSermon = {
  id: 's1',
  slug: 'walking-in-the-spirit',
  title: 'Walking in the Spirit',
  series: 'Life in the Spirit',
  speaker: 'Pastor Example',
  date: '2026-10-04',
  duration: '42 min',
  image: '',
  summary: '',
  mediaUrl: 'https://media.example.org/walking.mp4',
  review: 'draft',
  reviewNote: '',
  archived: false,
  live: null,
  changedSinceApproval: false,
  everApproved: false,
  version: 1,
  updatedAt: '2026-11-13T00:00:00.000Z',
};
let rows: StaffSermon[] = [];
const calls: {
  method: string;
  url: string;
  version: string | null;
  body?: unknown;
}[] = [];
const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
function fakeApi(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET';
  if (method === 'GET') return json(200, { data: rows });
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({
    method,
    url: url.replace('/api/v1/staff/sermons', ''),
    version: new Headers(init?.headers).get('if-match'),
    body,
  });
  if (method === 'POST' && url.endsWith('/sermons')) {
    const created = { ...base, ...body, id: 'new', version: 1 };
    rows = [...rows, created];
    return json(201, { data: created, version: 1 });
  }
  const [, id, step] = url.match(/sermons\/([^/]+)(?:\/(\w+))?$/)!;
  const row = rows.find((item) => item.id === id)!;
  const next: StaffSermon = {
    ...row,
    ...(method === 'PATCH' && body),
    ...(step === 'submit' && { review: 'pending' }),
    ...(step === 'approve' && {
      review: 'approved',
      live: {
        version: row.version,
        approvedAt: '2026-11-13T00:00:00.000Z',
        title: row.title,
        mediaUrl: row.mediaUrl,
      },
      everApproved: true,
    }),
    ...(step === 'reject' && { review: 'rejected', reviewNote: body.note }),
    version: row.version + 1,
  };
  rows = rows.map((item) => (item.id === id ? next : item));
  return json(200, { data: next, version: next.version });
}

beforeEach(() => {
  state.role = 'admin';
  rows = [base];
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(fakeApi));
});
const panel = () => screen.getByRole('dialog');

describe('Sermons & videos', () => {
  it('Admin saves privately and can only ask the Pastor to approve', async () => {
    render(<SermonsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit Walking in the Spirit' }),
    );
    expect(within(panel()).getByText(/Not on the website/)).toBeInTheDocument();
    expect(
      within(panel()).queryByRole('button', { name: /Approve and publish/ }),
    ).not.toBeInTheDocument();
    // Unsaved edits must be saved before asking for approval.
    fireEvent.change(within(panel()).getByLabelText('Speaker'), {
      target: { value: 'Pastor Sarah' },
    });
    expect(
      within(panel()).getByRole('button', {
        name: /Ask the Pastor to approve/,
      }),
    ).toBeDisabled();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(calls.map((c) => c.method)).toEqual(['PATCH']));
    expect(calls[0]!.version).toBe('"1"');
    expect(calls[0]!.body).not.toHaveProperty('review');
    await act(async () => {
      fireEvent.click(
        within(panel()).getByRole('button', {
          name: /Ask the Pastor to approve/,
        }),
      );
    });
    await waitFor(() =>
      expect(calls.at(-1)).toMatchObject({
        method: 'POST',
        url: '/s1/submit',
        version: '"2"',
      }),
    );
    expect(
      within(panel()).getByText('Waiting for the Pastor'),
    ).toBeInTheDocument();
  });

  it('creates nothing until Save', async () => {
    render(<SermonsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Add sermon/ }));
    fireEvent.change(within(panel()).getByLabelText('Title'), {
      target: { value: 'For the City' },
    });
    expect(calls).toEqual([]);
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'POST', url: '' });
    expect(calls[0]!.body).toMatchObject({ title: 'For the City' });
  });

  it('the Pastor reviews pending sermons, approves the exact version or sends it back', async () => {
    state.role = 'pastor';
    rows = [
      { ...base, review: 'pending', version: 4 },
      {
        ...base,
        id: 's2',
        title: 'For the City',
        review: 'pending',
        version: 2,
      },
    ];
    render(<SermonsPage />);
    expect(
      await screen.findByText('Awaiting your approval'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review Walking in the Spirit' }),
    );
    expect(within(panel()).getByLabelText('Recording preview')).toHaveAttribute(
      'src',
      base.mediaUrl,
    );
    await act(async () => {
      fireEvent.click(
        within(panel()).getByRole('button', { name: /Approve and publish/ }),
      );
    });
    await waitFor(() =>
      expect(calls).toEqual([
        expect.objectContaining({
          method: 'POST',
          url: '/s1/approve',
          version: '"4"',
        }),
      ]),
    );
    expect(
      within(panel()).getByText('This is the version on the website.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Review For the City' }),
    );
    fireEvent.click(within(panel()).getByRole('button', { name: /Send back/ }));
    const send = within(panel())
      .getAllByRole('button', { name: 'Send back' })
      .at(-1)!;
    expect(send).toBeDisabled();
    fireEvent.change(within(panel()).getByLabelText('What needs to change?'), {
      target: { value: 'Audio drops at 12:30.' },
    });
    await act(async () => {
      fireEvent.click(send);
    });
    await waitFor(() =>
      expect(calls.at(-1)).toMatchObject({
        url: '/s2/reject',
        version: '"2"',
        body: { note: 'Audio drops at 12:30.' },
      }),
    );
  });

  it('a draft approved by the Pastor is first submitted, then approved', async () => {
    state.role = 'pastor';
    render(<SermonsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit Walking in the Spirit' }),
    );
    await act(async () => {
      fireEvent.click(
        within(panel()).getByRole('button', { name: /Approve and publish/ }),
      );
    });
    await waitFor(() =>
      expect(calls.map((c) => `${c.url} ${c.version}`)).toEqual([
        '/s1/submit "1"',
        '/s1/approve "2"',
      ]),
    );
  });

  it('a sermon without a recording cannot be sent or approved', async () => {
    rows = [{ ...base, mediaUrl: '' }];
    for (const [role, name] of [
      ['admin', /Ask the Pastor to approve/],
      ['pastor', /Approve and publish/],
    ] as const) {
      state.role = role;
      const view = render(<SermonsPage />);
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Edit Walking in the Spirit',
        }),
      );
      expect(within(panel()).getByRole('button', { name })).toBeDisabled();
      expect(
        within(panel()).getByText(/Add the recording link and Save/),
      ).toBeInTheDocument();
      view.unmount();
    }
    expect(calls).toEqual([]);
  });
});
