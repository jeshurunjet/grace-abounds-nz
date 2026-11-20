// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('../../../../auth', () => ({ auth: async () => null }));
vi.mock('../../../../lib/server/assertion', () => ({
  signIdentityAssertion: vi.fn(),
}));
import { GET } from './route';
afterEach(() => vi.unstubAllGlobals());
it('preserves the private image type and nosniff header through the gateway', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: {
            'content-type': 'image/png',
            'x-content-type-options': 'nosniff',
            'cache-control': 'private, no-store',
          },
        }),
    ),
  );
  const response = await GET(
    new NextRequest('http://localhost:3000/api/v1/me/photo/photo-id'),
    {
      params: Promise.resolve({ path: ['me', 'photo', 'photo-id'] }),
    },
  );
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new Uint8Array([137, 80, 78, 71]),
  );
});
