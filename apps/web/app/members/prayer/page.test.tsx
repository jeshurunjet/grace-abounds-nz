import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRAYER_PRIVACY_NOTE } from '@grace-abounds/validation';
import PrayerPage from './page';

/*
 * Phase 4A: the member prayer page shows the privacy and retention wording
 * before sending; a send's key is tied to its exact words (same words reuse
 * it, edited words get a new one, a conflict never clears the draft); it
 * follows the address for the request to show; and everything belongs to
 * the signed-in person: a switch clears it, and late or older answers for
 * anyone else (or older than the newest) are ignored.
 */

vi.mock('../../components/member-shell', () => ({
  MemberShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const route = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(route.search),
}));
const session = vi.hoisted(() => ({ id: 'anna' as string | undefined }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id } } : null,
  }),
}));

const server = vi.hoisted(() => ({
  handler: null as unknown as (
    url: string,
    init?: RequestInit,
  ) => Promise<Response> | Response,
  posts: [] as { text: string; clientKey: string }[],
}));
const prayer = (id: string, text: string) => ({
  id,
  text,
  status: 'submitted',
  createdAt: '2026-11-19T01:00:00.000Z',
  closedAt: '',
  deleteAfter: '',
  history: [{ status: 'submitted', at: '2026-11-19T01:00:00.000Z' }],
});
const ok = (data: unknown, status = 200) => Response.json({ data }, { status });
const refuse = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });
/** A reply held back until the test releases it. */
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}

beforeEach(() => {
  session.id = 'anna';
  route.search = '';
  server.posts = [];
  let mine: ReturnType<typeof prayer>[] = [];
  server.handler = (_url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      server.posts.push(body);
      const created = prayer(`p${server.posts.length}`, body.text);
      mine = [created, ...mine];
      return ok(created, 201);
    }
    return ok(mine);
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => server.handler(url, init)),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Lets pending requests and their follow-ups finish. */
const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Your prayer request'), {
    target: { value },
  });
const sendNow = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send to the pastor' }));
  });
  await settle();
};

describe('member prayer page', () => {
  it('shows who can read it and for how long, before sending', async () => {
    render(<PrayerPage />);
    await settle();
    expect(screen.getByText(PRAYER_PRIVACY_NOTE)).toBeInTheDocument();
    expect(
      screen.getByText('You haven’t sent a prayer request yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send to the pastor' }),
    ).toBeDisabled();
  });

  it('same words reuse the key; edited words after a failure get a new one', async () => {
    const normal = server.handler;
    let failures = 2;
    server.handler = (url, init) => {
      if (init?.method === 'POST' && failures-- > 0) {
        server.posts.push(JSON.parse(String(init.body)));
        return refuse(503, 'NETWORK', 'Couldn’t reach the server.');
      }
      return normal(url, init);
    };
    render(<PrayerPage />);
    await settle();
    type('For my family');
    await sendNow();
    await sendNow(); // the same words again
    expect(server.posts[1]!.clientKey).toBe(server.posts[0]!.clientKey);
    expect(screen.getByLabelText('Your prayer request')).toHaveValue(
      'For my family',
    );

    type('For my family and friends'); // changed after a failure
    await sendNow();
    expect(server.posts[2]!.clientKey).not.toBe(server.posts[0]!.clientKey);
    expect(server.posts[2]!.text).toBe('For my family and friends');
    expect(screen.getByLabelText('Your prayer request')).toHaveValue('');
    expect(screen.getByText('For my family and friends')).toBeInTheDocument();
  });

  it('a key conflict keeps the draft, and the next send is a new request', async () => {
    const normal = server.handler;
    let conflicted = false;
    server.handler = (url, init) => {
      if (init?.method === 'POST' && !conflicted) {
        conflicted = true;
        server.posts.push(JSON.parse(String(init.body)));
        return refuse(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Sent with different words.',
        );
      }
      return normal(url, init);
    };
    render(<PrayerPage />);
    await settle();
    type('Words');
    await sendNow();
    expect(screen.getByLabelText('Your prayer request')).toHaveValue('Words');
    await sendNow();
    expect(server.posts[1]!.clientKey).not.toBe(server.posts[0]!.clientKey);
  });

  it('a different sign-in clears everything; the previous person’s late answers are ignored', async () => {
    const annaList = later();
    server.handler = () => annaList.promise;
    const view = render(<PrayerPage />);
    await settle();
    type('Anna’s private words');

    session.id = 'ben';
    server.handler = () => ok([prayer('b1', 'Ben’s request')]);
    view.rerender(<PrayerPage />);
    await settle();
    expect(screen.getByLabelText('Your prayer request')).toHaveValue('');
    expect(screen.getByText('Ben’s request')).toBeInTheDocument();

    // Anna's list arrives late: not shown to Ben.
    annaList.release(ok([prayer('a1', 'Anna’s request')]));
    await settle();
    expect(screen.queryByText('Anna’s request')).toBeNull();
    expect(screen.getByText('Ben’s request')).toBeInTheDocument();
  });

  it('a send that finishes after a sign-in change touches nothing of the new person', async () => {
    const annaPost = later();
    server.handler = (_url, init) =>
      init?.method === 'POST' ? annaPost.promise : ok([]);
    const view = render(<PrayerPage />);
    await settle();
    type('Anna’s words');
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Send to the pastor' }),
      );
    });
    session.id = 'ben';
    server.handler = () => ok([]);
    view.rerender(<PrayerPage />);
    await settle();
    type('Ben is typing');
    annaPost.release(ok(prayer('a1', 'Anna’s words'), 201));
    await settle();
    expect(screen.getByLabelText('Your prayer request')).toHaveValue(
      'Ben is typing',
    );
    expect(screen.queryByText('Anna’s words')).toBeNull();
  });

  it('an older list answer arriving last can’t replace the newest', async () => {
    const first = later();
    let calls = 0;
    server.handler = () =>
      ++calls === 1 ? first.promise : ok([prayer('p2', 'Newest state')]);
    render(<PrayerPage />);
    await settle();
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(screen.getByText('Newest state')).toBeInTheDocument();
    first.release(ok([prayer('p1', 'Older state')]));
    await settle();
    expect(screen.queryByText('Older state')).toBeNull();
    expect(screen.getByText('Newest state')).toBeInTheDocument();
  });

  it('follows the address, including a second notification on the same page', async () => {
    server.handler = () => ok([prayer('a', 'First'), prayer('b', 'Second')]);
    route.search = 'request=a';
    const view = render(<PrayerPage />);
    await settle();
    const card = (text: string) => screen.getByText(text).closest('article')!;
    expect(card('First')).toHaveAttribute('aria-current', 'true');
    route.search = 'request=b';
    view.rerender(<PrayerPage />);
    expect(card('Second')).toHaveAttribute('aria-current', 'true');
    expect(card('First')).not.toHaveAttribute('aria-current');

    route.search = 'request=gone';
    view.rerender(<PrayerPage />);
    expect(
      screen.getByText('That request isn’t available any more.'),
    ).toBeInTheDocument();
  });
});
