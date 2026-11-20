import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ProfileView } from './profile-view';

/*
 * Phase 5: the profile screen belongs to one signed-in account and role.
 * A photo save changes only the photo (unsaved edits stay). A different
 * account, a role change or signing out starts fresh; late profile loads
 * and saves for anyone else, or answers about another account, are ignored.
 */

vi.mock('../../components/member-shell', () => ({
  MemberShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/breadcrumbs', () => ({ Breadcrumbs: () => null }));
const session = vi.hoisted(() => ({
  id: 'anna' as string | undefined,
  role: 'member',
  update: vi.fn(),
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id, role: session.role } } : null,
    update: session.update,
  }),
}));
const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../../components/toast', () => ({
  useToast: () => ({ push: toast.push }),
}));
vi.mock('../../components/profile-photo-picker', () => ({
  ProfilePhotoPicker: ({ onApply }: { onApply: (photo: string) => void }) => (
    <button type="button" onClick={() => onApply('data:image/png;base64,AAAA')}>
      Choose photo
    </button>
  ),
}));

const profile = (id: string, name: string) => ({
  id,
  email: `${id}@example.org`,
  name,
  image: null,
  bio: '',
  phone: '',
  role: 'MEMBER',
});
const server = vi.hoisted(() => ({
  requests: [] as { url: string; method: string }[],
  heldGet: null as Promise<Response> | null,
  heldPatch: null as Promise<Response> | null,
}));
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}
const json = (data: unknown) => Response.json(data);

beforeEach(() => {
  session.id = 'anna';
  session.role = 'member';
  session.update.mockReset();
  toast.push.mockClear();
  server.requests = [];
  server.heldGet = null;
  server.heldPatch = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      server.requests.push({ url, method });
      const who = session.id!;
      if (url.endsWith('/me/photo'))
        return json({ data: { image: '/api/v1/me/photo/new-id' } });
      if (method === 'PATCH') {
        if (server.heldPatch) return server.heldPatch;
        return json({ data: profile(who, 'Saved Name'), version: 4 });
      }
      if (server.heldGet) return server.heldGet;
      return json({
        data: profile(who, who === 'anna' ? 'Anna Example' : 'Ben Example'),
        version: 3,
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const view = () => (
  <ProfileView
    workspace={{ role: 'member', workspaceHref: '/members' } as never}
  />
);
const nameField = () => screen.getByLabelText('Full name');

describe('profile page', () => {
  it('a photo save keeps unsaved profile edits', async () => {
    render(view());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(nameField(), { target: { value: 'Anna Typed' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose photo' }));
    });
    await settle();
    expect(nameField()).toHaveValue('Anna Typed');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(server.requests.filter((item) => item.method === 'PATCH')).toEqual(
      [],
    );
    expect(screen.getByRole('img', { name: 'Anna Typed' })).toHaveAttribute(
      'src',
      '/api/v1/me/photo/new-id',
    );
  });

  it('a late profile load for the previous account never fills the new one', async () => {
    const annaLoad = later();
    server.heldGet = annaLoad.promise;
    const page = render(view());
    await settle();
    server.heldGet = null;
    session.id = 'ben';
    page.rerender(view());
    await settle();
    expect(nameField()).toHaveValue('Ben Example');
    annaLoad.release(
      json({ data: profile('anna', 'Anna Example'), version: 3 }),
    );
    await settle();
    expect(nameField()).toHaveValue('Ben Example');
  });

  it('an answer about another account is ignored', async () => {
    server.heldGet = Promise.resolve(
      json({ data: profile('someone-else', 'Wrong Person'), version: 1 }),
    );
    render(view());
    await settle();
    expect(screen.queryByDisplayValue('Wrong Person')).toBeNull();
  });

  it('a role change on the same account starts fresh, keeping no old drafts', async () => {
    const page = render(view());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(nameField(), { target: { value: 'Draft as member' } });
    const held = later();
    server.heldGet = held.promise;
    session.role = 'admin';
    page.rerender(view());
    await settle();
    // The old screen (and its draft) is gone; the new one loads afresh.
    expect(screen.queryByDisplayValue('Draft as member')).toBeNull();
    server.heldGet = null;
    held.release(json({ data: profile('anna', 'Anna Example'), version: 3 }));
    await settle();
    expect(nameField()).toHaveValue('Anna Example');
    expect(nameField()).toBeDisabled();
  });

  it('a save finishing after another person signs in changes nothing for them', async () => {
    const held = later();
    server.heldPatch = held.promise;
    const page = render(view());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(nameField(), { target: { value: 'Anna New' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    session.id = 'ben';
    page.rerender(view());
    await settle();
    held.release(json({ data: profile('anna', 'Anna New'), version: 4 }));
    await settle();
    expect(nameField()).toHaveValue('Ben Example');
    expect(toast.push).not.toHaveBeenCalled();
    expect(session.update).not.toHaveBeenCalled();
  });

  it('shows nothing once signed out', async () => {
    const page = render(view());
    await settle();
    session.id = undefined;
    page.rerender(view());
    await settle();
    expect(screen.queryByLabelText('Full name')).toBeNull();
  });
});
