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
import {
  defaultPages,
  defaultSiteSettings,
  pageSchemas,
  siteSettingsSchema,
  type PageKey,
  type PublicContentBundle,
} from '@grace-abounds/validation';
import CmsPage from './page';
import { ContentProvider, useContent } from '../../components/content-provider';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'admin' } } }),
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

const published: PublicContentBundle = {
  site: defaultSiteSettings,
  pages: defaultPages,
};
/** Resources the fake API rejects on save. */
let failing = new Set<string>();
const patches: string[] = [];
const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
type Row = Record<string, unknown> & { id: string; version: number };
/** Database-backed collections (campuses, journeys, leadership). */
let collections: Record<string, Row[]> = {};
const collectionCalls: string[] = [];
let staleSaves = false;
function collectionApi(url: string, init?: RequestInit) {
  const [name, id] = url.replace('/api/v1/staff/', '').split('/');
  const rows = (collections[name!] ??= []);
  const method = init?.method ?? 'GET';
  if (method === 'GET') return json(200, { data: rows });
  collectionCalls.push(`${method} ${name}${id ? `/${id}` : ''}`);
  const body = JSON.parse(String(init?.body ?? '{}'));
  if (method === 'POST') {
    const row = { ...body, id: `new-${rows.length}`, version: 1 };
    rows.push(row);
    return json(201, { data: row, version: 1 });
  }
  const index = rows.findIndex((row) => row.id === id);
  const sent = new Headers(init?.headers).get('if-match');
  if (staleSaves || sent !== `"${rows[index]!.version}"`) {
    rows[index] = { ...rows[index]!, name: 'Saved elsewhere', version: 9 };
    return json(412, {
      error: { code: 'VERSION_CONFLICT', message: 'Changed by someone else.' },
    });
  }
  rows[index] = { ...body, id, version: rows[index]!.version + 1 };
  return json(200, { data: rows[index], version: rows[index]!.version });
}

// The fake API answers like the real one: canonical (schema-parsed) data.
function fakeApi(url: string, init?: RequestInit) {
  if (/\/staff\/(locations|team|next-steps)/.test(url))
    return collectionApi(url, init);
  const resource = url.replace('/api/v1/staff/', '').replace('pages/', '');
  const schema =
    resource === 'site' ? siteSettingsSchema : pageSchemas[resource as PageKey];
  const current =
    resource === 'site'
      ? defaultSiteSettings
      : defaultPages[resource as PageKey];
  if (init?.method !== 'PATCH') return json(200, { data: current, version: 1 });
  patches.push(resource);
  if (failing.has(resource))
    return json(422, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Check the highlighted fields.',
        fieldErrors: { 'giving.bank': 'Rejected for this test.' },
      },
    });
  return json(200, {
    data: schema.parse(JSON.parse(String(init.body))),
    version: 2,
  });
}

let context: ReturnType<typeof useContent>;
function Probe() {
  context = useContent();
  return null;
}
async function renderCms() {
  render(
    <ContentProvider initialContent={published}>
      <CmsPage />
      <Probe />
    </ContentProvider>,
  );
  await screen.findByText('All changes published');
}
const edit = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const tab = (name: string) =>
  screen.getByRole('tab', { name: new RegExp(`^${name}( •)?$`) });

beforeEach(() => {
  failing = new Set();
  patches.length = 0;
  collectionCalls.length = 0;
  staleSaves = false;
  collections = {
    team: [
      {
        id: 't1',
        name: 'Ana Example',
        role: 'Senior Pastor',
        bio: '',
        image: '',
        status: 'published',
        version: 1,
      },
    ],
  };
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  vi.stubGlobal('fetch', vi.fn(fakeApi));
});

describe('CMS publishing updates the live content only from confirmed saves', () => {
  it('keeps unsaved edits on other tabs out of the published content', async () => {
    await renderCms();
    edit('Verse text', 'An unsaved verse.');
    fireEvent.click(tab('About'));
    edit('History', '  A new story.  ');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }));
    });
    await waitFor(() => expect(patches).toEqual(['about']));
    // The published snapshot holds the server's canonical About data…
    await waitFor(() =>
      expect(context.content.site.story).toBe('A new story.'),
    );
    // …and not the Home draft, which stays unsaved.
    expect(context.content.site.homeVerseText).toBe(
      defaultPages.home.verse.text,
    );
    expect(tab('Home')).toHaveTextContent('Home •');
    expect(tab('About')).toHaveTextContent(/^About$/);
  });

  it('publishes only the resource that succeeded when another fails', async () => {
    failing = new Set(['site']);
    await renderCms();
    fireEvent.click(tab('Giving'));
    edit('Verse text', 'A confirmed verse.');
    edit('Bank', 'Rejected Bank');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }));
    });
    await waitFor(() => expect(patches).toEqual(['give', 'site']));
    await waitFor(() =>
      expect(context.content.site.givingVerseText).toBe('A confirmed verse.'),
    );
    expect(context.content.site.givingBank).toBe(
      defaultSiteSettings.giving.bank,
    );
    expect(
      screen.getByText(/Giving published, but the rest was not/),
    ).toBeInTheDocument();
    // The rejected bank details remain an unsaved edit.
    expect(screen.getByLabelText('Bank')).toHaveValue('Rejected Bank');
    expect(tab('Giving')).toHaveTextContent('Giving •');
  });

  it('shows no page-heading fields and keeps the Events and Sermons tools reachable', async () => {
    await renderCms();
    for (const name of ['Events', 'Sermons'])
      expect(screen.queryByRole('tab', { name })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/hero|heading|tagline/i)).toBeNull();
    fireEvent.click(tab('Locations'));
    expect(
      screen.getByRole('link', { name: /Manage services, groups and events/ }),
    ).toHaveAttribute('href', '/admin/events');
  });

  it('list panels apply to the page draft and only the page Save publishes', async () => {
    await renderCms();
    fireEvent.click(tab('About'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Community' }));
    const panel = screen.getByRole('dialog', { name: 'Edit value' });
    expect(panel).toBeInTheDocument();
    edit('Value', 'Belonging');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to page' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(patches).toEqual([]);
    expect(context.content.pages.values[1]![1]).toBe('Community');
    expect(tab('About')).toHaveTextContent('About •');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }));
    });
    await waitFor(() => expect(patches).toEqual(['about']));
    await waitFor(() =>
      expect(context.content.pages.values[1]![1]).toBe('Belonging'),
    );
  });

  it('asks before closing a panel with unapplied edits; Escape closes the topmost layer first', async () => {
    await renderCms();
    fireEvent.click(tab('About'));
    const trigger = screen.getByRole('button', { name: 'Edit Mission' });
    trigger.focus();
    fireEvent.click(trigger);
    edit('Value', 'Changed');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.getByRole('alertdialog', { name: 'Discard your changes?' }),
    ).toBeInTheDocument();
    // Escape closes the confirmation (Keep editing), not the panel.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Value')).toHaveValue('Changed');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(tab('About')).toHaveTextContent(/^About$/);
  });

  it('removing an item asks first and keeps at least one required photo', async () => {
    await renderCms();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Slideshow photo 1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Remove this slideshow photo?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1)!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tab('Home')).toHaveTextContent('Home •');
    expect(context.content.pages.heroImages).toHaveLength(
      defaultPages.home.heroImages.length,
    );
  });
});

describe('campuses, journeys and leadership save one record at a time', () => {
  it('creates nothing until Save, then creates the record on the server', async () => {
    await renderCms();
    fireEvent.click(tab('About'));
    fireEvent.click(await screen.findByRole('button', { name: /Add person/ }));
    const panel = screen.getByRole('dialog', { name: 'Add person' });
    fireEvent.change(within(panel).getByLabelText('Name'), {
      target: { value: 'Mere Example' },
    });
    fireEvent.change(within(panel).getByLabelText('Role'), {
      target: { value: 'Youth Pastor' },
    });
    expect(collectionCalls).toEqual([]);
    expect(patches).toEqual([]);
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(collectionCalls).toEqual(['POST team']));
    expect(collections.team!.at(-1)).toMatchObject({
      name: 'Mere Example',
      role: 'Youth Pastor',
      status: 'draft',
    });
    // The page itself has no unsaved changes: the record saved on its own.
    expect(tab('About')).toHaveTextContent(/^About$/);
  });

  it('a stale save keeps what was typed and offers the latest version', async () => {
    staleSaves = true;
    await renderCms();
    fireEvent.click(tab('About'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit Ana Example' }),
    );
    const panel = screen.getByRole('dialog', { name: 'Edit person' });
    fireEvent.change(within(panel).getByLabelText('Role'), {
      target: { value: 'Lead Pastor' },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(collectionCalls).toEqual(['PATCH team/t1']));
    expect(within(panel).getByRole('alert')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Role')).toHaveValue('Lead Pastor');
    expect(
      within(panel).getByRole('button', { name: 'Load latest version' }),
    ).toBeInTheDocument();
  });

  it('published records cannot be deleted from the panel', async () => {
    await renderCms();
    fireEvent.click(tab('About'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit Ana Example' }),
    );
    const panel = screen.getByRole('dialog', { name: 'Edit person' });
    expect(
      within(panel).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled();
  });
});
