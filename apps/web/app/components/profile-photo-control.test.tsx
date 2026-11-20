import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePhotoControl } from './profile-photo-control';

/*
 * Phase 5: the profile photo is saved by the server. While saving, the
 * cropped photo shows as "Saving…"; a failure keeps the current photo and
 * says why; removing asks first; success refreshes the session so avatars
 * agree. A different account or role drops anything in flight.
 */

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
vi.mock('./toast', () => ({ useToast: () => ({ push: toast.push }) }));
// The cropper itself is a separate, browser-only step.
vi.mock('./profile-photo-picker', () => ({
  ProfilePhotoPicker: ({ onApply }: { onApply: (photo: string) => void }) => (
    <button type="button" onClick={() => onApply('data:image/png;base64,AAAA')}>
      Choose photo
    </button>
  ),
}));

const server = vi.hoisted(() => ({
  fail: false,
  held: null as Promise<Response> | null,
  requests: [] as { method: string; body: unknown }[],
}));
const json = (data: unknown, status = 200) => Response.json(data, { status });
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}

beforeEach(() => {
  session.id = 'anna';
  session.role = 'member';
  session.update.mockReset();
  toast.push.mockClear();
  server.fail = false;
  server.held = null;
  server.requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      server.requests.push({
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (server.held) return server.held;
      if (server.fail)
        return json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Choose a JPEG or PNG photo.',
            },
          },
          422,
        );
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return json({ data: { image: '/api/v1/me/photo/new-id' } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const avatar = () => screen.getByRole('img', { name: 'Anna' });

describe('profile photo', () => {
  it('saves on the server; shows “Saving…” until confirmed, then refreshes the session', async () => {
    const held = later();
    server.held = held.promise;
    const onSaved = vi.fn();
    render(<ProfilePhotoControl image={null} name="Anna" onSaved={onSaved} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose photo' }));
    });
    expect(server.requests[0]).toEqual({
      method: 'PUT',
      body: { image: 'data:image/png;base64,AAAA' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saving your photo');
    expect(avatar()).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(onSaved).not.toHaveBeenCalled();
    held.release(json({ data: { image: '/api/v1/me/photo/new-id' } }));
    server.held = null;
    await settle();
    expect(onSaved).toHaveBeenCalledWith('/api/v1/me/photo/new-id');
    expect(session.update).toHaveBeenCalled();
    expect(toast.push).toHaveBeenCalledWith('Profile photo saved.', 'success');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a failed save keeps the current photo and says why', async () => {
    server.fail = true;
    const onSaved = vi.fn();
    render(
      <ProfilePhotoControl
        image="/api/v1/me/photo/current"
        name="Anna"
        onSaved={onSaved}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose photo' }));
    });
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your photo wasn’t saved. Choose a JPEG or PNG photo.',
    );
    expect(avatar()).toHaveAttribute('src', '/api/v1/me/photo/current');
    expect(onSaved).not.toHaveBeenCalled();
    expect(session.update).not.toHaveBeenCalled();
  });

  it('removing asks first, then removes on the server', async () => {
    const onSaved = vi.fn();
    render(
      <ProfilePhotoControl
        image="/api/v1/me/photo/current"
        name="Anna"
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(server.requests).toHaveLength(0);
    const ask = screen.getByRole('alertdialog', {
      name: 'Remove your profile photo?',
    });
    await act(async () => {
      fireEvent.click(
        within(ask).getByRole('button', { name: 'Remove photo' }),
      );
    });
    await settle();
    expect(server.requests).toEqual([{ method: 'DELETE', body: null }]);
    expect(onSaved).toHaveBeenCalledWith(null);
  });

  it('a different account or role drops a save in flight; its late answer changes nothing', async () => {
    for (const change of ['account', 'role'] as const) {
      session.id = 'anna';
      session.role = 'member';
      session.update.mockReset();
      toast.push.mockClear();
      const held = later();
      server.held = held.promise;
      const onSaved = vi.fn();
      const page = render(
        <ProfilePhotoControl image={null} name="Anna" onSaved={onSaved} />,
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Choose photo' }));
      });
      if (change === 'account') session.id = 'ben';
      else session.role = 'admin';
      page.rerender(
        <ProfilePhotoControl image={null} name="Anna" onSaved={onSaved} />,
      );
      await settle();
      expect(screen.queryByRole('status')).toBeNull();
      held.release(json({ data: { image: '/api/v1/me/photo/anna' } }));
      server.held = null;
      await settle();
      expect(onSaved).not.toHaveBeenCalled();
      expect(session.update).not.toHaveBeenCalled();
      expect(toast.push).not.toHaveBeenCalled();
      page.unmount();
    }
  });
});
