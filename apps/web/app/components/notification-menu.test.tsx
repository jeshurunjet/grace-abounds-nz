import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationMenu } from './notification-menu';
import { ToastProvider } from './toast';

/*
 * Phase 4A: the bell shows the server's own notifications with persisted
 * read state; marks one read before following its link (app paths only);
 * says so when marking read fails; never lets an older list undo a read;
 * loads a new person's list at once on a sign-in change; never navigates
 * for a previous person; and shows nothing when signed out.
 */

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
const session = vi.hoisted(() => ({ id: 'anna' as string | undefined }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id } } : null,
  }),
}));

type Item = {
  id: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
};
const server = vi.hoisted(() => ({
  items: [] as Item[],
  requests: [] as string[],
  override: null as
    null | ((url: string, init?: RequestInit) => Promise<Response> | null),
}));
const listOf = (items: Item[]) =>
  Response.json({
    data: {
      items: items.map((item) => ({
        ...item,
        kind: 'prayer.status',
        createdAt: new Date().toISOString(),
      })),
      unread: items.filter((item) => !item.read).length,
    },
  });
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}
const annaItems = (): Item[] => [
  {
    id: 'n1',
    title: 'Your prayer request was updated',
    body: 'The pastor is praying for your request.',
    href: '/members/prayer?request=p1',
    read: false,
  },
  {
    id: 'n2',
    title: 'Odd link',
    body: '',
    href: '//elsewhere.example/x',
    read: false,
  },
];

beforeEach(() => {
  session.id = 'anna';
  nav.push.mockClear();
  server.requests = [];
  server.override = null;
  server.items = annaItems();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      server.requests.push(`${init?.method ?? 'GET'} ${url}`);
      const special = server.override?.(url, init);
      if (special) return special;
      const read = url.match(/notifications\/(\w+)\/read$/);
      if (read)
        server.items = server.items.map((item) =>
          item.id === read[1] ? { ...item, read: true } : item,
        );
      if (url.endsWith('/read-all'))
        server.items = server.items.map((item) => ({ ...item, read: true }));
      return listOf(server.items);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
};
const show = () =>
  render(
    <ToastProvider>
      <NotificationMenu />
    </ToastProvider>,
  );
const bell = () => screen.getByRole('button', { name: /^Notifications/ });

describe('notification bell', () => {
  it('shows unread from the server, marks read, then follows the link', async () => {
    show();
    await settle();
    expect(bell()).toHaveAccessibleName('Notifications, 2 unread');
    await click(bell());
    await click(
      screen.getByRole('button', { name: /Your prayer request was updated/ }),
    );
    expect(server.requests).toContain('POST /api/v1/me/notifications/n1/read');
    expect(nav.push).toHaveBeenCalledWith('/members/prayer?request=p1');
    expect(bell()).toHaveAccessibleName('Notifications, 1 unread');
  });

  it('never follows a link outside the app', async () => {
    show();
    await settle();
    await click(bell());
    await click(screen.getByRole('button', { name: /Odd link/ }));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('a list fetched before marking read can’t make it unread again', async () => {
    show();
    await settle();
    const stale = later();
    let held = true;
    server.override = (_url, init) => {
      if (init?.method || !held) return null;
      held = false;
      return stale.promise;
    };
    await click(bell()); // opening asks for the list: held back (old state)
    await click(
      screen.getByRole('button', { name: /Your prayer request was updated/ }),
    );
    expect(bell()).toHaveAccessibleName('Notifications, 1 unread');
    stale.release(listOf(annaItems())); // both unread, from before
    await settle();
    expect(bell()).toHaveAccessibleName('Notifications, 1 unread');
  });

  it('says so when marking read fails, and keeps it unread', async () => {
    server.override = (url) =>
      url.includes('/read')
        ? Promise.resolve(
            Response.json(
              { error: { code: 'NETWORK', message: 'Offline.' } },
              { status: 503 },
            ),
          )
        : null;
    show();
    await settle();
    await click(bell());
    await click(
      screen.getByRole('button', { name: /Your prayer request was updated/ }),
    );
    expect(
      screen.getByText('Couldn’t mark that update as read. It stays unread.'),
    ).toBeInTheDocument();
    expect(bell()).toHaveAccessibleName('Notifications, 2 unread');

    await click(bell());
    await click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(screen.getByText(/Couldn’t mark them as read/)).toBeInTheDocument();
    expect(bell()).toHaveAccessibleName('Notifications, 2 unread');
  });

  it('a new sign-in loads at once, even with the old request still on its way', async () => {
    const annaList = later();
    server.override = () => annaList.promise;
    const view = show();
    await settle();
    session.id = 'ben';
    server.override = null;
    server.items = [
      {
        id: 'b1',
        title: 'New prayer request',
        body: '',
        href: '/pastor/care?prayer=x',
        read: false,
      },
    ];
    view.rerender(
      <ToastProvider>
        <NotificationMenu />
      </ToastProvider>,
    );
    await settle();
    expect(bell()).toHaveAccessibleName('Notifications, 1 unread');
    annaList.release(listOf(annaItems()));
    await settle();
    expect(bell()).toHaveAccessibleName('Notifications, 1 unread');
  });

  it('a click answered after a sign-in change doesn’t navigate', async () => {
    const view = show();
    await settle();
    const markRead = later();
    server.override = (url) =>
      url.endsWith('/read') ? markRead.promise : null;
    await click(bell());
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Your prayer request was updated/ }),
      );
    });
    session.id = 'ben';
    server.override = null;
    view.rerender(
      <ToastProvider>
        <NotificationMenu />
      </ToastProvider>,
    );
    await settle();
    markRead.release(listOf(annaItems()));
    await settle();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('shows nothing and asks nothing when signed out', async () => {
    session.id = undefined;
    const { container } = render(<NotificationMenu />);
    await settle();
    expect(container).toBeEmptyDOMElement();
    expect(server.requests).toEqual([]);
  });
});
