// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { accountRoute, HttpError, ok, readBodyLimited } from './http';

process.env.AUTH_URL ??= 'http://localhost:3000';

/** A chunked body (no Content-Length) that records how many chunks were pulled. */
function chunkedRequest(chunkCount: number, chunkBytes: number) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunkCount) return controller.close();
      pulled += 1;
      controller.enqueue(new Uint8Array(chunkBytes).fill(97));
    },
  });
  const request = new Request('http://localhost:3000/x', {
    method: 'POST',
    body: stream,
    // @ts-expect-error Node's fetch requires duplex for streamed bodies.
    duplex: 'half',
  });
  return { request, pulled: () => pulled };
}

describe('readBodyLimited', () => {
  it('reads a body within the limit', async () => {
    const request = new Request('http://x/', { method: 'POST', body: 'hello' });
    expect(await readBodyLimited(request, 5)).toBe('hello');
  });

  it('counts bytes, not characters', async () => {
    const request = new Request('http://x/', {
      method: 'POST',
      body: 'ā'.repeat(3),
    }); // 6 bytes
    await expect(readBodyLimited(request, 5)).rejects.toMatchObject({
      status: 413,
    });
  });

  it('refuses an oversized or malformed Content-Length before reading', async () => {
    for (const declared of ['100000', 'abc']) {
      const request = new Request('http://x/', {
        method: 'POST',
        body: 'small',
        headers: { 'content-length': declared },
      });
      await expect(readBodyLimited(request, 1024)).rejects.toBeInstanceOf(
        HttpError,
      );
    }
  });

  it('stops reading a chunked body as soon as it passes the limit', async () => {
    const { request, pulled } = chunkedRequest(1000, 1024);
    await expect(readBodyLimited(request, 4096)).rejects.toMatchObject({
      status: 413,
    });
    expect(pulled()).toBeLessThan(10);
  });
});

describe('accountRoute', () => {
  const route = accountRoute(
    z.object({ name: z.string() }).strict(),
    async (input) => ok(input),
  );
  const call = (body: BodyInit, origin = 'http://localhost:3000') =>
    route(
      new Request('http://localhost:3000/api/account/x', {
        method: 'POST',
        headers: { origin },
        body,
      }),
    );

  it('returns 413 for an oversized body and 400 for malformed JSON', async () => {
    expect(
      (await call(JSON.stringify({ name: 'a'.repeat(20_000) }))).status,
    ).toBe(413);
    expect((await call('{not json')).status).toBe(400);
  });

  it('refuses cross-site and missing origins', async () => {
    expect((await call('{}', 'https://evil.example')).status).toBe(403);
    expect((await call('{}', 'null')).status).toBe(403);
  });

  it('returns field errors and private no-store responses', async () => {
    const bad = await call(JSON.stringify({ name: 1 }));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.fieldErrors.name).toBeTruthy();
    const good = await call(JSON.stringify({ name: 'Ana' }));
    expect(good.status).toBe(200);
    expect(good.headers.get('cache-control')).toBe('no-store');
  });
});
